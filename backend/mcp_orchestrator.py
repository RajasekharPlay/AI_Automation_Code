"""
MCP Browser Orchestrator
========================
AI-driven exploration loop that uses LLM to decide browser actions,
executes them via MCP, captures screenshots/snapshots, and ultimately
generates a framework-compliant Playwright script.

The orchestrator works in two phases:
  1. EXPLORE — AI navigates the app, building a step log
  2. GENERATE — AI produces a .spec.ts from the recorded steps + framework context
"""
import asyncio
import json
import logging
import time
from typing import AsyncGenerator, Callable, Any

import anthropic
import redis.asyncio as aioredis

from config import settings
from mcp_manager import MCPSession, MCPStep
from llm_orchestrator import (
    _get_anthropic,
    _ensure_gemini,
    SYSTEM_PROMPT,
    FEW_SHOTS,
    LLMProvider,
    stream_script,
)
from framework_loader import get_framework_context

logger = logging.getLogger(__name__)

MAX_EXPLORE_STEPS = 30
SNAPSHOT_TRUNCATE = 10000  # chars sent to LLM

# ════════════════════════════════════════════════════════════════════════════════
# ACTION-DECISION SYSTEM PROMPT  (separate from code-gen SYSTEM_PROMPT)
# ════════════════════════════════════════════════════════════════════════════════
EXPLORE_SYSTEM_PROMPT = """You are a browser automation agent. You are testing a web application by following test case steps.

You are given:
1. The TEST CASE describing what to verify
2. The current page's ACCESSIBILITY TREE (structured DOM)
3. Your ACTION HISTORY (steps you've already taken)
4. AVAILABLE ACTIONS you can perform

Your job: Decide the SINGLE next action to take to progress through the test case.

AVAILABLE ACTIONS:
- navigate: Go to a URL. Params: {"url": "https://..."}
- click: Click an element. Params: {"element": "description", "ref": "element_ref"}
- fill: Type text into a field. Params: {"element": "description", "ref": "element_ref", "value": "text"}
- select: Select dropdown option. Params: {"element": "description", "ref": "element_ref", "value": "option_text"}
- hover: Hover over element. Params: {"element": "description", "ref": "element_ref"}
- press_key: Press keyboard key. Params: {"key": "Enter"}
- wait: Wait for content to load. Params: {"time_ms": 2000}
- go_back: Navigate back. Params: {}
- done: All test steps are covered. Params: {}

RULES:
1. Return ONLY valid JSON — no markdown, no explanations outside JSON.
2. Use element references (ref) from the accessibility tree when available.
3. Be specific about which element to interact with.
4. Set "done": true ONLY when ALL test case steps are covered.
5. If a page is still loading, use "wait" action.
6. Maximum one action per response.

RESPONSE FORMAT:
{
  "action": "click",
  "element": "Login button",
  "ref": "s12",
  "value": "",
  "reasoning": "Need to click the login button to submit credentials",
  "done": false
}
"""


def _build_explore_prompt(
    test_case_description: str,
    snapshot: str,
    action_history: list[dict],
    current_url: str,
) -> str:
    """Build the user message for the action-decision LLM call."""
    truncated_snapshot = snapshot[:SNAPSHOT_TRUNCATE]
    if len(snapshot) > SNAPSHOT_TRUNCATE:
        truncated_snapshot += "\n... [truncated]"

    history_text = "None yet — this is the first action."
    if action_history:
        lines = []
        for h in action_history[-10:]:  # last 10 steps
            lines.append(
                f"  Step {h['step_number']}: {h['action']}({h.get('element', h.get('ref', ''))}) "
                f"→ {h.get('reasoning', '')}"
            )
        history_text = "\n".join(lines)

    return f"""TEST CASE:
{test_case_description}

CURRENT PAGE URL: {current_url}

ACCESSIBILITY TREE:
{truncated_snapshot}

ACTION HISTORY:
{history_text}

What is the single next action to take? Return JSON only."""


async def _ask_llm_for_action(
    prompt: str,
    provider: LLMProvider | None = None,
) -> dict:
    """Ask the LLM what action to take next. Returns parsed JSON."""
    active: LLMProvider = provider or settings.LLM_PROVIDER  # type: ignore[assignment]

    try:
        if active == "gemini":
            import google.generativeai as genai
            _ensure_gemini()
            model = genai.GenerativeModel(
                model_name=settings.GEMINI_MODEL,
                system_instruction=EXPLORE_SYSTEM_PROMPT,
            )
            response = await model.generate_content_async(prompt)
            text = response.text.strip()
        else:
            client = _get_anthropic()
            response = await client.messages.create(
                model=settings.ANTHROPIC_MODEL,
                max_tokens=1000,
                system=EXPLORE_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.content[0].text.strip()

        # Clean up potential markdown fencing
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
        text = text.strip()

        return json.loads(text)

    except json.JSONDecodeError as e:
        logger.warning("LLM returned non-JSON for action: %s — text: %s", e, text[:200])
        return {"action": "wait", "reasoning": "LLM response was not valid JSON, waiting", "done": False}
    except Exception as e:
        logger.error("LLM action request failed: %s", e)
        return {"action": "wait", "reasoning": f"LLM error: {e}", "done": False}


def _execute_action(session: MCPSession, action_data: dict) -> dict:
    """Execute a single MCP action based on LLM decision. Returns result dict."""
    action = action_data.get("action", "wait")
    element = action_data.get("element", "")
    ref = action_data.get("ref", "")
    value = action_data.get("value", "")

    try:
        if action == "navigate":
            url = action_data.get("url", value)
            return session.navigate(url)
        elif action == "click":
            return session.click(element, ref)
        elif action == "fill":
            return session.fill(element, value, ref)
        elif action == "select":
            return session.select_option(element, [value], ref)
        elif action == "hover":
            return session.hover(element, ref)
        elif action == "press_key":
            key = action_data.get("key", value or "Enter")
            return session.press_key(key)
        elif action == "wait":
            ms = action_data.get("time_ms", 2000)
            return session.wait(int(ms))
        elif action == "go_back":
            return session.go_back()
        elif action == "done":
            return {"status": "done"}
        else:
            logger.warning("Unknown action: %s", action)
            return {"status": "unknown_action"}
    except Exception as e:
        logger.error("Action execution failed: %s — %s", action, e)
        return {"error": str(e)}


async def auto_explore(
    session: MCPSession,
    test_case_description: str,
    start_url: str,
    provider: LLMProvider | None = None,
    max_steps: int = MAX_EXPLORE_STEPS,
) -> AsyncGenerator[dict, None]:
    """
    Semi-automated AI exploration loop.
    Yields MCP events (step data + screenshots) as they happen.

    Events yielded:
    - {"type": "step", "step": {...}, "screenshot": "base64..."}
    - {"type": "status", "message": "..."}
    - {"type": "error", "message": "..."}
    - {"type": "done", "total_steps": N}
    """
    session.start_url = start_url
    step_num = 0

    yield {"type": "status", "message": f"Navigating to {start_url}..."}

    # Step 0: Navigate to start URL
    try:
        session.navigate(start_url)
        session.current_url = start_url
        # Brief wait for page to load
        session.wait(2000)
    except Exception as e:
        yield {"type": "error", "message": f"Failed to navigate: {e}"}
        return

    for step_idx in range(max_steps):
        # Check pause
        await session.pause_event.wait()

        # Check if session is still alive
        if not session.is_alive or session.status in ("completed", "error"):
            yield {"type": "status", "message": "Session ended"}
            break

        step_num = step_idx + 1

        yield {"type": "status", "message": f"Step {step_num}: Analyzing page..."}

        # Take snapshot
        try:
            snapshot_text = session.snapshot()
        except Exception as e:
            snapshot_text = f"[Snapshot failed: {e}]"

        # Take screenshot
        try:
            screenshot_b64 = session.screenshot()
        except Exception:
            screenshot_b64 = ""

        # Build action history for context
        action_history = [s.to_dict() for s in session.steps]

        # Ask LLM for next action
        prompt = _build_explore_prompt(
            test_case_description, snapshot_text, action_history, session.current_url
        )
        action_data = await _ask_llm_for_action(prompt, provider)

        # Check if done
        if action_data.get("done", False):
            yield {
                "type": "status",
                "message": "AI determined all test steps are covered.",
            }
            yield {"type": "done", "total_steps": step_num - 1}
            return

        # Execute the action
        action_name = action_data.get("action", "unknown")
        reasoning = action_data.get("reasoning", "")

        yield {
            "type": "status",
            "message": f"Step {step_num}: {action_name} — {reasoning}",
        }

        _execute_action(session, action_data)

        # Brief wait after action
        await asyncio.sleep(0.5)

        # Capture post-action state
        try:
            post_screenshot = session.screenshot()
        except Exception:
            post_screenshot = screenshot_b64  # fallback to pre-action

        try:
            post_snapshot = session.snapshot()
        except Exception:
            post_snapshot = ""

        # Record step
        step = MCPStep(
            step_number=step_num,
            action=action_name,
            ref=action_data.get("ref", ""),
            value=action_data.get("value", ""),
            reasoning=reasoning,
            screenshot=post_screenshot,
            snapshot_preview=post_snapshot[:500],
            url=session.current_url,
            timestamp=time.strftime("%Y-%m-%dT%H:%M:%S"),
        )
        session.steps.append(step)

        # Yield step event
        yield {
            "type": "step",
            "step": step.to_dict(),
            "screenshot": post_screenshot,
        }

    yield {"type": "done", "total_steps": step_num}


async def generate_script_from_steps(
    session: MCPSession,
    test_case_description: str,
    provider: LLMProvider | None = None,
    project_id: str | None = None,
) -> AsyncGenerator[str, None]:
    """
    Generate a Playwright .spec.ts script from the recorded MCP exploration steps.
    Uses the existing framework SYSTEM_PROMPT and conventions.
    Yields TypeScript code chunks (same pattern as stream_script).
    """
    # Get framework context
    framework_context, _ctx_hash = get_framework_context()

    # Build a synthetic test case JSON from the exploration steps
    steps_data = []
    for s in session.steps:
        steps_data.append({
            "step_no": s.step_number,
            "action": f"{s.action}: {s.reasoning}",
            "input_data": s.value or s.ref or "",
            "element": s.ref,
            "url": s.url,
        })

    test_case_json = {
        "test_script_num": "MCP_001",
        "module": "AI_Browser",
        "test_case_name": test_case_description[:100],
        "description": test_case_description,
        "start_url": session.start_url,
        "steps": steps_data,
        "expected_results": "All steps complete successfully as described",
        "source": "mcp_browser_exploration",
        "browser_actions_log": [
            {
                "step": s.step_number,
                "action": s.action,
                "element": s.ref,
                "value": s.value,
                "reasoning": s.reasoning,
                "page_url": s.url,
            }
            for s in session.steps
        ],
    }

    # Add extra context about what the AI observed
    extra_instruction = (
        f"This test was generated by an AI that BROWSED the application at {session.start_url}. "
        f"The 'browser_actions_log' contains the EXACT actions taken during exploration. "
        f"Generate the Playwright test following EXACTLY the steps in the log. "
        f"Use the correct selectors based on what was observed. "
        f"The test should replicate the exploration flow."
    )

    # Use the existing stream_script to generate code
    async for chunk in stream_script(
        test_case_json=test_case_json,
        user_instruction=extra_instruction,
        framework_context=framework_context,
        provider=provider,
    ):
        yield chunk
