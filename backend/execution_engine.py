"""
Execution Engine
================
Provides two execution paths:
  1. GitHub Actions — via github_actions_runner.py (existing)
  2. Local subprocess — npx playwright test in a background thread (new)

The local execution uses a thread + stdlib Queue pattern to avoid
Windows SelectorEventLoop issues with asyncio subprocess spawning.
"""
import asyncio
import logging
import os
import queue as _stdlib_queue
import subprocess
import threading
from pathlib import Path

import redis.asyncio as aioredis

from config import settings
from github_actions_runner import run_test_via_github_actions, RESULTS_BRANCH

logger = logging.getLogger(__name__)

FRAMEWORK_PATH = Path(settings.PLAYWRIGHT_PROJECT_PATH)

# Mapping from browser name → Playwright project name used in playwright.config.ts
_BROWSER_PROJECT_MAP = {
    "chromium": "ai-chromium",
    "firefox":  "ai-firefox",
    "webkit":   "ai-webkit",
}


def _resolve_playwright_project(browser: str) -> str:
    """Map browser dropdown value to the Playwright --project= name."""
    return _BROWSER_PROJECT_MAP.get(browser.lower(), f"ai-{browser.lower()}")


# ── GitHub Actions execution (existing) ─────────────────────────────────────────

async def run_test(
    run_id: str,
    spec_file: str,       # relative path, e.g. tests/generated/RB001_Module.spec.ts
    script_code: str,     # TypeScript source (needed to stage to GitHub)
    environment: str,
    browser: str,
    device: str,
    execution_mode: str,
    browser_version: str,
    tags: list[str],
) -> tuple[int, str, str | None]:
    """
    Executes the Playwright test via GitHub Actions.
    Returns (exit_code, github_run_url, committed_branch | None).
    """
    spec_filename = Path(spec_file).name   # "RB001_Module.spec.ts"
    exit_code, github_run_url, committed_branch = await run_test_via_github_actions(
        run_id=run_id,
        script_code=script_code,
        spec_filename=spec_filename,
        browser=browser,
        environment=environment,
        device=device,
        execution_mode=execution_mode,
    )
    return exit_code, github_run_url, committed_branch


# ── Local execution (new) ───────────────────────────────────────────────────────

def _local_sync_worker(
    spec_path: str,
    project_dir: str,
    browser: str,
    environment: str,
    device: str,
    execution_mode: str,
    env_vars: dict[str, str],
    msg_q: "_stdlib_queue.Queue",
    playwright_project: str | None = None,
) -> None:
    """
    Synchronous worker that runs in a background thread.
    Uses subprocess.Popen to execute npx playwright test, streams output
    line-by-line via the queue. Same pattern as _mga_sync_worker in
    github_actions_runner.py.
    """
    def log(msg: str) -> None:
        msg_q.put(("log", msg))

    try:
        # Verify project directory exists
        project = Path(project_dir)
        if not project.exists():
            log(f"[ERROR] Playwright project directory not found: {project_dir}")
            msg_q.put(("done", 1, ""))
            return

        # Resolve spec file path — could be absolute or relative
        spec = Path(spec_path)
        if not spec.is_absolute():
            spec = project / spec_path
        if not spec.exists():
            # Try stripping the skye-e2e-tests/ prefix if present
            alt = project / spec_path.removeprefix("skye-e2e-tests/")
            if alt.exists():
                spec = alt
            else:
                log(f"[ERROR] Spec file not found: {spec}")
                log(f"  Tried: {spec_path}")
                log(f"  In directory: {project_dir}")
                msg_q.put(("done", 1, ""))
                return

        # Build the npx command
        pw_project = playwright_project or _resolve_playwright_project(browser)
        rel_spec = str(spec.relative_to(project)).replace("\\", "/")

        cmd_parts = ["npx", "playwright", "test", rel_spec, f"--project={pw_project}"]
        if execution_mode == "headed":
            cmd_parts.append("--headed")

        cmd_str = " ".join(cmd_parts)

        # Merge environment variables — only set pw_* if non-empty so that
        # the framework's own .env (loaded by dotenv in playwright.config.ts)
        # is NOT overridden with blank values.
        merged_env = os.environ.copy()
        merged_env["CI"] = "true"
        _pw_map = {
            "pw_HOST":     env_vars.get("pw_host", ""),
            "pw_TESTUSER": env_vars.get("pw_testuser", ""),
            "pw_PASSWORD": env_vars.get("pw_password", ""),
            "pw_EMAIL":    env_vars.get("pw_email", ""),
        }
        for k, v in _pw_map.items():
            if v:  # only override if backend provides a non-empty value
                merged_env[k] = v
        # Any extra env_vars (non-empty)
        for k, v in env_vars.items():
            if v:
                merged_env[k] = v

        mode_icon = "🖥️" if execution_mode == "headed" else "👻"
        log(f"💻 Running LOCALLY: {cmd_str}")
        log(f"  Directory : {project_dir}")
        log(f"  Spec      : {rel_spec}")
        log(f"  Project   : {pw_project}")
        log(f"  Mode      : {mode_icon} {execution_mode.upper()}")
        log(f"  Env       : {environment.upper()}")
        log("─" * 60)

        # Launch subprocess
        proc = subprocess.Popen(
            cmd_str,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            cwd=str(project),
            env=merged_env,
            shell=True,
            text=True,
            bufsize=1,
        )

        # Stream stdout line by line
        for line in proc.stdout:  # type: ignore[union-attr]
            stripped = line.rstrip("\n\r")
            if stripped:
                log(stripped)

        proc.wait()
        exit_code = proc.returncode

        log("─" * 60)
        if exit_code == 0:
            log("✅ LOCAL TEST PASSED")
        else:
            log(f"❌ LOCAL TEST FAILED (exit code {exit_code})")

        msg_q.put(("done", exit_code, ""))

    except FileNotFoundError:
        log("[ERROR] 'npx' not found — ensure Node.js is installed and in PATH")
        msg_q.put(("done", 1, ""))
    except Exception as exc:
        logger.exception("_local_sync_worker error")
        msg_q.put(("error", f"{type(exc).__name__}: {exc}"))


async def run_test_locally(
    run_id: str,
    spec_file_path: str,
    project_dir: str,
    browser: str,
    environment: str,
    device: str,
    execution_mode: str,
    env_vars: dict[str, str],
    playwright_project: str | None = None,
) -> tuple[int, str]:
    """
    Async wrapper for local test execution.
    Spawns a background thread, drains its message queue,
    and publishes all log lines to Redis pub/sub + history list
    (same pattern as GHA execution).
    Returns (exit_code, "").
    """
    r = aioredis.from_url(settings.REDIS_URL)
    channel = f"run:{run_id}:logs"
    history_key = f"run:{run_id}:log_history"

    async def pub(msg: str) -> None:
        await r.publish(channel, msg)
        await r.rpush(history_key, msg)
        await r.expire(history_key, 86400)

    # Brief delay so WebSocket client can subscribe before we start publishing
    await asyncio.sleep(1)

    await pub(f"▶ Starting LOCAL test run [{run_id}]")

    msg_q: _stdlib_queue.Queue = _stdlib_queue.Queue()

    t = threading.Thread(
        target=_local_sync_worker,
        args=(spec_file_path, project_dir, browser, environment, device,
              execution_mode, env_vars, msg_q, playwright_project),
        daemon=True,
    )
    t.start()

    # Async drain loop
    exit_code = 1
    done = False

    while not done:
        try:
            while True:
                item = msg_q.get_nowait()
                if item[0] == "log":
                    await pub(item[1])
                elif item[0] == "done":
                    exit_code = item[1]
                    done = True
                    break
                elif item[0] == "error":
                    await pub(f"❌ Error: {item[1]}")
                    done = True
                    break
        except _stdlib_queue.Empty:
            pass

        if not done:
            await asyncio.sleep(0.3)

    await pub("__DONE__")
    await r.aclose()

    return exit_code, ""


# ── Save script to local framework directory ─────────────────────────────────────

async def save_script_to_framework(
    typescript_code: str,
    test_script_num: str,
    module: str,
) -> str:
    """
    Writes the generated .spec.ts file into the framework repo's generated dir.
    Each generation creates a NEW file with a timestamp suffix so previous
    versions are never overwritten.
    Returns the relative file path (e.g. tests/generated/DASH_001_General_20240316_143022.spec.ts).
    """
    from datetime import datetime
    target_dir = FRAMEWORK_PATH / settings.GENERATED_TESTS_DIR
    target_dir.mkdir(parents=True, exist_ok=True)

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_module = module.replace(" ", "_").replace("/", "_")
    filename  = f"{test_script_num}_{safe_module}_{ts}.spec.ts"
    file_path = target_dir / filename
    file_path.write_text(typescript_code, encoding="utf-8")
    logger.info("Script saved: %s", file_path)

    return str(Path(settings.GENERATED_TESTS_DIR) / filename)
