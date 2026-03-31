"""
MCP Session Manager
====================
Manages Playwright MCP server subprocesses for AI Browser exploration.

Uses the thread + queue pattern (same as execution_engine.py) to avoid
Windows SelectorEventLoop issues with asyncio subprocess spawning.

Each MCPSession wraps a subprocess running `npx @playwright/mcp` in stdio mode,
communicates via JSON-RPC over stdin/stdout.
"""
import asyncio
import base64
import json
import logging
import os
import queue as _stdlib_queue
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import redis.asyncio as aioredis

from config import settings

logger = logging.getLogger(__name__)

# Path to the MCP server npm package
MCP_SERVER_DIR = Path(__file__).resolve().parent.parent / "mcp-server"
NPX_PATH = getattr(settings, "MCP_NPX_PATH", "npx")
DEFAULT_VIEWPORT_W = getattr(settings, "MCP_DEFAULT_VIEWPORT_WIDTH", 1280)
DEFAULT_VIEWPORT_H = getattr(settings, "MCP_DEFAULT_VIEWPORT_HEIGHT", 720)

MAX_SESSIONS = 3
IDLE_TIMEOUT = 1800  # 30 minutes
COMMAND_TIMEOUT = 30  # seconds


@dataclass
class MCPStep:
    """A single action taken during an MCP browser session."""
    step_number: int
    action: str  # navigate, click, fill, select, hover, screenshot, snapshot
    ref: str = ""
    value: str = ""
    reasoning: str = ""
    screenshot: str = ""  # base64 PNG (not stored in DB, only streamed)
    snapshot_preview: str = ""  # first 500 chars of accessibility tree
    url: str = ""
    timestamp: str = ""

    def to_dict(self) -> dict:
        return {
            "step_number": self.step_number,
            "action": self.action,
            "ref": self.ref,
            "value": self.value,
            "reasoning": self.reasoning,
            "screenshot": self.screenshot,
            "snapshot_preview": self.snapshot_preview,
            "url": self.url,
            "timestamp": self.timestamp,
        }


class MCPSession:
    """Wraps a single MCP server subprocess and provides browser control methods."""

    def __init__(
        self,
        session_id: str,
        browser: str = "chromium",
        headless: bool = True,
        project_id: str | None = None,
    ):
        self.session_id = session_id
        self.browser = browser
        self.headless = headless
        self.project_id = project_id
        self.status = "initializing"
        self.steps: list[MCPStep] = []
        self.start_url = ""
        self.current_url = ""
        self._process: subprocess.Popen | None = None
        self._request_id = 0
        self._responses: dict[int, Any] = {}
        self._response_events: dict[int, threading.Event] = {}
        self._reader_thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self._alive = False
        self.created_at = time.time()
        self.last_activity = time.time()

        # Pause/resume mechanism
        self.pause_event = asyncio.Event()
        self.pause_event.set()  # not paused by default

    def start(self) -> None:
        """Launch the MCP server subprocess."""
        cmd_parts = [NPX_PATH, "@playwright/mcp@latest"]
        if self.headless:
            cmd_parts.append("--headless")
        cmd_parts.extend(["--browser", self.browser])

        env = os.environ.copy()
        env["NODE_PATH"] = str(MCP_SERVER_DIR / "node_modules")

        logger.info("Starting MCP session %s: %s", self.session_id, " ".join(cmd_parts))

        self._process = subprocess.Popen(
            " ".join(cmd_parts),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=str(MCP_SERVER_DIR),
            env=env,
            shell=True,
            bufsize=0,
        )
        self._alive = True

        # Start reader threads
        self._reader_thread = threading.Thread(
            target=self._read_stdout, daemon=True
        )
        self._reader_thread.start()

        self._stderr_thread = threading.Thread(
            target=self._read_stderr, daemon=True
        )
        self._stderr_thread.start()

        # Wait briefly for server to be ready
        time.sleep(2)

        # Initialize the MCP connection
        try:
            self._send_initialize()
            self.status = "active"
            logger.info("MCP session %s started successfully", self.session_id)
        except Exception as e:
            logger.error("MCP session %s init failed: %s", self.session_id, e)
            self.status = "error"
            self.stop()
            raise

    def _read_stdout(self) -> None:
        """Background thread: read JSON-RPC responses from MCP server stdout."""
        assert self._process and self._process.stdout
        buffer = b""
        while self._alive:
            try:
                chunk = self._process.stdout.read(1)
                if not chunk:
                    break
                buffer += chunk
                # Try to parse complete JSON messages
                # MCP uses Content-Length header format or newline-delimited JSON
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        msg = json.loads(line.decode("utf-8"))
                        req_id = msg.get("id")
                        if req_id is not None and req_id in self._response_events:
                            self._responses[req_id] = msg
                            self._response_events[req_id].set()
                    except (json.JSONDecodeError, UnicodeDecodeError):
                        pass
            except Exception:
                break

    def _read_stderr(self) -> None:
        """Background thread: read and log MCP server stderr."""
        assert self._process and self._process.stderr
        while self._alive:
            try:
                line = self._process.stderr.readline()
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace").strip()
                if decoded:
                    logger.debug("MCP stderr [%s]: %s", self.session_id, decoded)
            except Exception:
                break

    def _send_initialize(self) -> dict:
        """Send the MCP initialize handshake."""
        result = self.send_command_sync("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "ai-test-platform", "version": "1.0.0"}
        })
        # Send initialized notification
        self._write_message({"jsonrpc": "2.0", "method": "notifications/initialized"})
        return result

    def _write_message(self, msg: dict) -> None:
        """Write a JSON-RPC message to the MCP server stdin."""
        assert self._process and self._process.stdin
        data = json.dumps(msg) + "\n"
        self._process.stdin.write(data.encode("utf-8"))
        self._process.stdin.flush()

    def send_command_sync(self, method: str, params: dict | None = None, timeout: float = COMMAND_TIMEOUT) -> dict:
        """Send a JSON-RPC request and wait for the response (thread-safe)."""
        with self._lock:
            self._request_id += 1
            req_id = self._request_id

        event = threading.Event()
        self._response_events[req_id] = event

        msg = {"jsonrpc": "2.0", "id": req_id, "method": method}
        if params is not None:
            msg["params"] = params

        self._write_message(msg)
        self.last_activity = time.time()

        if not event.wait(timeout=timeout):
            self._response_events.pop(req_id, None)
            raise TimeoutError(f"MCP command {method} timed out after {timeout}s")

        result = self._responses.pop(req_id, {})
        self._response_events.pop(req_id, None)

        if "error" in result:
            raise RuntimeError(f"MCP error: {result['error']}")

        return result.get("result", {})

    def call_tool(self, tool_name: str, arguments: dict | None = None) -> dict:
        """Call an MCP tool (e.g., browser_navigate, browser_click)."""
        params = {"name": tool_name}
        if arguments:
            params["arguments"] = arguments
        return self.send_command_sync("tools/call", params)

    # ── High-level browser control methods ──────────────────────────────────

    def navigate(self, url: str) -> dict:
        """Navigate the browser to a URL."""
        result = self.call_tool("browser_navigate", {"url": url})
        self.current_url = url
        return result

    def screenshot(self) -> str:
        """Take a screenshot, return base64 PNG string."""
        result = self.call_tool("browser_screenshot")
        # Extract base64 image from MCP response
        content = result.get("content", [])
        for item in content:
            if item.get("type") == "image":
                return item.get("data", "")
        return ""

    def snapshot(self) -> str:
        """Get accessibility tree snapshot, return text."""
        result = self.call_tool("browser_snapshot")
        content = result.get("content", [])
        for item in content:
            if item.get("type") == "text":
                return item.get("text", "")
        return ""

    def click(self, element: str, ref: str = "") -> dict:
        """Click an element by description or ref."""
        args = {"element": element}
        if ref:
            args["ref"] = ref
        return self.call_tool("browser_click", args)

    def fill(self, element: str, value: str, ref: str = "") -> dict:
        """Fill a form field."""
        args = {"element": element, "value": value}
        if ref:
            args["ref"] = ref
        return self.call_tool("browser_type", args)

    def select_option(self, element: str, values: list[str], ref: str = "") -> dict:
        """Select option(s) from a dropdown."""
        args = {"element": element, "values": values}
        if ref:
            args["ref"] = ref
        return self.call_tool("browser_select_option", args)

    def hover(self, element: str, ref: str = "") -> dict:
        """Hover over an element."""
        args = {"element": element}
        if ref:
            args["ref"] = ref
        return self.call_tool("browser_hover", args)

    def press_key(self, key: str) -> dict:
        """Press a keyboard key."""
        return self.call_tool("browser_press_key", {"key": key})

    def wait(self, time_ms: int = 2000) -> dict:
        """Wait for a specified time."""
        return self.call_tool("browser_wait", {"time": time_ms})

    def go_back(self) -> dict:
        """Navigate back."""
        return self.call_tool("browser_navigate_back")

    def stop(self) -> None:
        """Stop the MCP session and kill the subprocess."""
        self._alive = False
        self.status = "completed"
        if self._process:
            try:
                self._process.terminate()
                self._process.wait(timeout=5)
            except Exception:
                try:
                    self._process.kill()
                except Exception:
                    pass
            self._process = None
        logger.info("MCP session %s stopped", self.session_id)

    @property
    def is_alive(self) -> bool:
        return self._alive and self._process is not None and self._process.poll() is None


class MCPSessionManager:
    """Singleton manager for all MCP sessions."""

    def __init__(self):
        self._sessions: dict[str, MCPSession] = {}
        self._lock = threading.Lock()

    def create_session(
        self,
        browser: str = "chromium",
        headless: bool = True,
        project_id: str | None = None,
    ) -> MCPSession:
        """Create and start a new MCP session."""
        # Cleanup idle sessions first
        self._cleanup_idle()

        with self._lock:
            if len(self._sessions) >= MAX_SESSIONS:
                raise RuntimeError(
                    f"Maximum {MAX_SESSIONS} concurrent MCP sessions reached. "
                    "Stop an existing session first."
                )

        session_id = str(uuid.uuid4())
        session = MCPSession(
            session_id=session_id,
            browser=browser,
            headless=headless,
            project_id=project_id,
        )

        try:
            session.start()
        except Exception as e:
            logger.error("Failed to start MCP session: %s", e)
            raise

        with self._lock:
            self._sessions[session_id] = session

        return session

    def get_session(self, session_id: str) -> MCPSession | None:
        """Get an existing session by ID."""
        return self._sessions.get(session_id)

    def destroy_session(self, session_id: str) -> None:
        """Stop and remove a session."""
        with self._lock:
            session = self._sessions.pop(session_id, None)
        if session:
            session.stop()

    def list_sessions(self) -> list[dict]:
        """List all active sessions."""
        result = []
        for sid, s in self._sessions.items():
            result.append({
                "session_id": sid,
                "status": s.status,
                "browser": s.browser,
                "headless": s.headless,
                "start_url": s.start_url,
                "current_url": s.current_url,
                "total_steps": len(s.steps),
                "project_id": s.project_id,
                "created_at": s.created_at,
            })
        return result

    def _cleanup_idle(self) -> None:
        """Remove sessions that have been idle too long."""
        now = time.time()
        to_remove = []
        for sid, session in self._sessions.items():
            if now - session.last_activity > IDLE_TIMEOUT:
                to_remove.append(sid)
            elif not session.is_alive:
                to_remove.append(sid)

        for sid in to_remove:
            logger.info("Auto-cleaning idle MCP session %s", sid)
            self.destroy_session(sid)


# Singleton instance
mcp_session_manager = MCPSessionManager()
