# memory.md — Full Changelog
> Chronological record of every change made to the AI Test Automation Platform.
> Updated automatically during Claude Code sessions.

---

## Session 1 — Initial Platform Build

### What was built from scratch:

#### Backend (`backend/`)
| File | Description |
|------|-------------|
| `main.py` | FastAPI app with all 12 routes (parse-excel, generate-script SSE, run-test, runs, scripts, reports, framework/refresh, WebSocket, health) |
| `config.py` | Pydantic Settings — reads from `.env` |
| `database.py` | SQLAlchemy async engine + `AsyncSessionLocal` + `get_db` dependency |
| `models.py` | 4 ORM models: `TestCase`, `GeneratedScript`, `ExecutionRun`, `UserPrompt` + enums |
| `excel_parser.py` | Parses `.xlsx` with openpyxl — maps columns: Test Script Num, Module, Test Case, Description, Step, Expected Results |
| `framework_loader.py` | Fetches framework files from GitHub API → stores in Redis (24h TTL) → returns concatenated context |
| `claude_orchestrator.py` | Original Claude-only orchestrator (later superseded) |
| `llm_orchestrator.py` | Multi-provider orchestrator (Anthropic + Gemini) — current active file |
| `script_validator.py` | `tsc --noEmit` TypeScript validation + self-correction retry loop |
| `execution_engine.py` | `npx playwright test` subprocess + Allure report generation |
| `websocket_manager.py` | WebSocket connection manager + Redis pub/sub subscriber |
| `requirements.txt` | All Python dependencies |
| `.env.example` | Template for secrets |
| `alembic.ini` + `alembic/` | DB migrations setup |

#### Frontend (`frontend/`)
| File | Description |
|------|-------------|
| `src/App.tsx` | Dark-themed Ant Design layout with 3 tabs |
| `src/api/client.ts` | Axios + fetch SSE + WebSocket helpers |
| `src/types/index.ts` | TypeScript interfaces (TestCase, Script, Run, RunParams) |
| `src/components/AIPhaseTab.tsx` | Upload → Select → Generate workflow with Monaco editor |
| `src/components/RunTab.tsx` | Test execution UI with live logs terminal |
| `src/components/Dashboard.tsx` | Run history, pie chart, Allure report embed |
| `vite.config.ts` | Vite dev server with proxy config |
| `package.json` | React + Ant Design + Monaco + Recharts dependencies |

#### Framework Integration
| File | Description |
|------|-------------|
| `skye-e2e-tests/playwright.config.ts` | Added 5 ai-* projects without auth dependencies |
| `skye-e2e-tests/tests/generated/` | Created directory for AI-generated test files |

---

## Session 2 — Bug Fixes & Port Issues

### Fix 1: Vite Port Conflict (5173 → 5174)
- **Problem:** Port 5173 was occupied by another application
- **Fix:** Updated `vite.config.ts`: `port: 5174, strictPort: true`
- **Fix:** Updated `backend/.env`: `FRONTEND_URL=http://localhost:5174`
- **Fix:** Updated `backend/main.py` CORS: added `http://localhost:5174` to `allow_origins`

### Fix 2: Excel Upload CORS Error
- **Problem:** `api/client.ts` used `BASE_URL = 'http://localhost:8000'` — absolute URLs bypassed the Vite proxy, hitting CORS restrictions
- **Fix:** Changed to `BASE_URL = ''` — all `/api` and `/ws` requests now use relative URLs routed through Vite's proxy
- **Fix:** WebSocket URL changed to `${proto}//${window.location.host}/ws/run/${runId}` (was hardcoded `ws://localhost:8000`)
- **Fix:** Improved error handling in `handleUpload` — shows actual backend `detail` message instead of generic error

### Fix 3: Upload Button Placeholder Text
- **Change:** Button text changed from `'Upload Pet_LandingPage.xlsx'` → `'Upload file.xlsx'`

### Fix 4: Remove Browser Version Dropdown
- **Change:** Removed `VERSIONS` constant and entire Browser Version `<Select>` from `RunTab.tsx`
- **Change:** Made `browser_version?: string` optional in `types/index.ts` with `always 'stable'` comment

---

## Session 3 — Anthropic API Authentication Fix

### Problem
Error: `"Could not resolve authentication method. Expected either api_key or auth_token to be set"`

### Root Causes
1. API key was shared publicly in conversation → likely auto-revoked by Anthropic
2. `thinking={"type": "enabled", "budget_tokens": 10000}` requires `betas=["interleaved-thinking-2025-05-14"]` header — not supported without it in SDK v0.84.0

### Fixes Applied
- **`config.py`:** Changed `.env` loading to absolute path:
  ```python
  _ENV_FILE = Path(__file__).resolve().parent / ".env"
  class Settings(BaseSettings):
      model_config = SettingsConfigDict(env_file=str(_ENV_FILE), ...)
  ```
- **`claude_orchestrator.py`:** Removed `thinking` param entirely, changed model to `claude-opus-4-5`, reduced `max_tokens=8000`
- **User action:** Regenerate API key at `https://console.anthropic.com/account/keys`

---

## Session 4 — Framework Path Corrections

### Fix 1: Wrong `FETCH_PATHS` in `framework_loader.py`
- **Problem:** Was fetching `src/fixtures`, `src/pages` — paths don't exist in repo
- **Fix:** Updated to correct paths with `skye-e2e-tests/` prefix:
  - `skye-e2e-tests/fixtures/`
  - `skye-e2e-tests/pages/`
  - `skye-e2e-tests/custom/`
  - `skye-e2e-tests/utils/`

### Fix 2: Wrong `PROJECT_MAP` in `execution_engine.py`
- **Problem:** Used invented names (`mobile-safari`, `tablet-safari`)
- **Fix:** Corrected to match `playwright.config.ts` ai-* projects:
  - `ai-chromium`, `ai-firefox`, `ai-webkit`, `ai-mobile-safari`, `ai-mobile-chrome`

### Fix 3: Wrong `PLAYWRIGHT_PROJECT_PATH`
- **Problem:** Path pointed to repo root instead of `skye-e2e-tests/` subfolder
- **Fix:** Updated `.env`: `PLAYWRIGHT_PROJECT_PATH=C:/Users/RajasekharUdumula/Desktop/QA_Automation_Banorte/skye-e2e-tests`

### Fix 4: `GENERATED_TESTS_DIR` Location
- **Problem:** `tests/generated/` directory didn't exist
- **Fix:** Created `C:\Users\RajasekharUdumula\Desktop\QA_Automation_Banorte\skye-e2e-tests\tests\generated\`

---

## Session 5 — Multi-LLM Provider Feature

### Feature: Switch between Anthropic Claude and Google Gemini

#### New File: `backend/llm_orchestrator.py`
- **Routes:** `stream_script()` → `_stream_anthropic()` or `_stream_gemini()` based on `provider` param
- **Shared:** Same `SYSTEM_PROMPT` and `FEW_SHOTS` for both providers
- **Anthropic format:** `role: "assistant"`, `content: "text"`
- **Gemini format:** `role: "model"`, `parts: ["text"]`
- **Lazy init:** `_get_anthropic()` and `_ensure_gemini()` — no crash if a key is missing
- **Usage tracking:** `stream_script.last_usage` stores provider, model, token counts
- **`active_provider_info()`** → returns config status for UI

#### Updated: `backend/config.py`
```python
LLM_PROVIDER: str = "anthropic"       # "anthropic" | "gemini"
ANTHROPIC_API_KEY: str = ""           # now optional
ANTHROPIC_MODEL: str = "claude-opus-4-5"
GEMINI_API_KEY: str = ""
GEMINI_MODEL: str = "gemini-2.5-pro"
```

#### Updated: `backend/requirements.txt`
```
anthropic>=0.49.0          # was ==0.34.0
google-generativeai>=0.8.0  # NEW
```
- Installed: `anthropic==0.84.0`, `google-generativeai==0.8.6`

#### Bug Fix (same session): Duplicate `TextArea` Declaration
- **Problem:** `const { TextArea } = Input;` declared twice on lines 34 and 36
- **Fix:** Removed duplicate line (kept line 34)

---

## Session 6 — Backend Restart with New Keys

### Actions
- User updated both `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` in `backend/.env`
- Killed old Python/uvicorn processes
- Restarted backend
- Health check confirmed: `{"status": "ok"}`
- Created `CLAUDE.md` (project memory for Claude Code)
- Created `memory.md` (this file — full changelog)

---

## Session 7 — Remove Validation Gate from Run Tab

### Fix Applied
- **`RunTab.tsx`**: Removed the `.filter()` — all generated scripts shown
- TypeScript validation (`tsc --noEmit`) is **informational only** — never blocks running
- Dropdown tag colour: green = `valid`, orange = other statuses

---

## Session 8 — Live Logs & GitHub Actions Fix

### Problems
1. No live logs visible in Run Testcase tab
2. No GitHub Actions workflow in the repo
3. Race condition: background task published Redis messages before WebSocket connected
4. No fallback if WebSocket missed logs

### Fixes
- Added `await asyncio.sleep(2)` before first `pub()` call
- Changed `pub()` to also `RPUSH` every log line to Redis list `run:{run_id}:log_history`
- `websocket_manager.py`: subscribe first → replay history → listen for new messages
- Added `GET /api/runs/{run_id}/logs` HTTP fallback endpoint
- Frontend: HTTP polling fallback if WebSocket delivers 0 lines in 6s
- Created `.github/workflows/playwright.yml` in QA_Automation_Banorte repo

---

## Session 9 — Critical DB Session Bug Fix (generate-script)

### Root Cause — FastAPI StreamingResponse + dependency lifecycle mismatch
`generate_script_endpoint` returns `StreamingResponse` immediately — the `get_db` session was committed/closed BEFORE the generator ran.

### Fix
Inside `event_stream()` generator — replaced `await db.flush()` with dedicated `async with AsyncSessionLocal() as save_db:` block with explicit `await save_db.commit()`.

**Rule: Never use the request `db` inside a StreamingResponse generator.**

---

## Session 10 — Multiple Stale Uvicorn Processes + Dropdown Filter Fix

### Problem
4 processes LISTENING on port 8000 — old processes handling requests instead of the fixed one.

### Fix 1
Kill all Python processes, start ONE clean uvicorn instance.

### Fix 2 — `RunTab.tsx` dropdown filter
Only show scripts where `file_path != null` — hides stale scripts that were never fully saved.

---

## Session 11 — Race Condition #2 Fix: `asyncio.create_task()` before DB commit

### Root Cause
`run_test_endpoint` called `asyncio.create_task()` before `get_db` committed the run record. Background task's `db.get(run_id)` returned `None` → silent exit.

### Fix
Added explicit `await db.commit()` before `asyncio.create_task()`.

**Rule: Always `await db.commit()` before `create_task()` when using `get_db`.**

---

## Session 12 — GHA "Project ai-chromium not found" Fix

### Fix
- Committed `playwright.config.ts` with ai-* projects to `main` branch on GitHub
- Workflow YAML: added step to sync `playwright.config.ts` from `main` into `ai-tests-staging`
- Changed trigger ref from staging branch to `"main"`

---

## Session 13 — Push-Trigger Re-Triggers Old Workflow + Log Streaming Fix

### Fix 1
Copied updated `playwright.yml` to `ai-tests-staging` — both branches have same YAML.

### Fix 2
Refactored `_wait_for_run()` to accept `pub` parameter — all status updates go through `pub()` (writes to both pub/sub AND Redis history list).

### Fix 3
Added `{ waitUntil: 'networkidle' }` to `page.goto()` in SYSTEM_PROMPT and all existing specs.

---

## Session 14 — Spec Files Dropdown + GitHub Actions Integration

### Feature: Run spec files from GitHub branch via dropdown

#### New: `backend/github_actions_runner.py`
- `list_spec_files_from_branch(branch)` — GitHub recursive tree API
- `ensure_ai_tests_branch()` — creates `ai-playwright-tests` if needed
- `commit_spec_to_ai_branch(spec_filename, code)` — commits spec to AI tests branch
- `run_existing_spec_via_gha(run_id, spec_path, branch, ...)` — triggers GHA for existing files

#### New endpoints
- `GET /api/spec-files` — lists .spec.ts from GitHub branch
- `POST /api/run-spec` — runs existing spec via GitHub Actions
- `POST /api/ensure-branch` — creates branch if missing

#### New DB columns
- `spec_file_path VARCHAR(500)` — GitHub path of spec
- `spec_branch VARCHAR(200)` — branch the spec was run from
- `script_id` → nullable

#### Frontend: `RunTab.tsx` rewritten
- Old: selected scripts from DB
- New: selects spec files from GitHub branch via `/api/spec-files`

---

## Session 15 — MGA Repo Integration + GitHub Actions Self-Hosted Runner

### Context
New test repo `RajasekharPlay/AI_Automation_MGA` added. MGA spec file `MGA_Validate.spec.ts` already committed in repo. Tests run against internal app `skye1.dev.mga.innoveo-skye.net` (private network — not reachable from GitHub cloud runners).

### Problem 1: `NotImplementedError` running MGA specs locally
Windows `SelectorEventLoop` doesn't support asyncio subprocess transport. Attempted fixes with `asyncio.to_thread`, `threading.Thread`, and `asyncio.Queue` all raised `NotImplementedError`.

**Fix:** Switched MGA execution entirely to **GitHub Actions** — removed local runner.

### Problem 2: Private network not accessible from GitHub cloud runners
GitHub's `ubuntu-latest` cannot reach `skye1.dev.mga.innoveo-skye.net`.

**Fix: Self-hosted runner installed on user's machine**
```
Location: C:\actions-runner\
Name:      RajasekharUdumula-PC
Labels:    self-hosted, Windows, X64
Status:    online
```
Setup steps performed:
1. Downloaded runner v2.332.0 from GitHub
2. Extracted to `C:\actions-runner`
3. Configured: `.\config.cmd --url https://github.com/RajasekharPlay/AI_Automation_MGA --token ... --unattended`
4. Started: `Start-Process C:\actions-runner\run.cmd`
5. Verified: `Status: online` via GitHub API

**To make permanent (run PowerShell as Administrator):**
```powershell
cd C:\actions-runner
.\svc.cmd install
.\svc.cmd start
```

### New: `backend/github_actions_runner.py` additions
- `MGA_WORKFLOW_PATH = ".github/workflows/mga-tests.yml"`
- `MGA_WORKFLOW_YAML` — full workflow definition (runs-on: self-hosted, headless/headed support)
- `run_mga_via_gha()` — ensures workflow → triggers → polls → returns (exit_code, gha_url)
- `_find_workflow_by_path()` — checks existing workflows by file path
- `_ensure_mga_workflow()` — creates YAML if missing

### New routing in `main.py`
- `POST /api/run-spec` with `branch == "local-mga"` → `_execute_mga_gha_and_update()`
- Removed `_execute_mga_local_and_update` entirely

### Frontend change
- MGA badge: `🏢 MGA — local run` → `🏢 MGA — GitHub Actions`

### Config additions
- `config.py`: `MGA_PLAYWRIGHT_PROJECT_PATH: str = ""`
- `.env`: `GITHUB_FRAMEWORK_REPO=RajasekharPlay/AI_Automation_MGA`

---

## Session 16 — MGA Workflow Fixes + "No Tests Found" + UI Improvements

### Fix 1: Headed mode on CI crashed (no X server)
**Problem:** `runs-on: ubuntu-latest` with `--headed` flag → no X server → browser crash.
**Fix:** Changed workflow to `runs-on: self-hosted` (Windows machine has display natively).

### Fix 2: "No tests found" — wrong branch checkout
**Problem:** Generated specs live on `ai-playwright-tests` branch. Workflow checkout had no `ref` — always checked out `main`. File not present → "No tests found".
**Fix:**
- Added `branch` input to `MGA_WORKFLOW_YAML`:
  ```yaml
  branch:
    description: 'Git branch that contains the spec file'
    default: 'main'
  ```
- Checkout step now uses:
  ```yaml
  - uses: actions/checkout@v4
    with:
      ref: ${{ github.event.inputs.branch || 'main' }}
      fetch-depth: 0
  ```
- `run_existing_spec_via_gha()` now passes `"branch": branch` in workflow dispatch inputs
- Updated YAML pushed to GitHub repo (commit `3468453d`)

### Fix 3: npm cache 583MB upload hang
**Problem:** `actions/setup-node@v4` with `cache: 'npm'` tried to upload 583MB node_modules to GitHub's cache service. Stuck at 0% for 18+ minutes.
**Fix:** Removed `cache: 'npm'` and `cache-dependency-path` from `actions/setup-node`. Self-hosted runner has `node_modules` persisted on disk between runs anyway.

### Fix 4: Default tags removed — `RunTab.tsx`
- `tags: ['regression']` → `tags: []`
- Tags section now starts empty

### Feature: Drag-to-resize splitter in Run Testcase tab
**File:** `frontend/src/components/RunTab.tsx`

- Added `splitPct` state (default 55 = 55% for logs, 45% for history)
- Added `isDragging` ref + `useLayoutEffect` with global mousemove/mouseup listeners
- Right panel is now a flex column with two panes:
  - **Top pane:** Live Logs card at `height: ${splitPct}%` — terminal fills pane with `flex: 1`
  - **Drag handle:** 8px div with violet pill indicator, cursor `row-resize`
  - **Bottom pane:** Execution History card with `flex: 1, minHeight: 0`
- Removed hardcoded `height: 340` from terminal div — now fully dynamic
- Execution History `Table` has `scroll={{ x: 900 }}` only (no fixed `y`) — scrolls within its pane
- Clamp range: 20%–80%

---

## 📊 Current State

| Service | Status | Port |
|---------|--------|------|
| Backend (FastAPI/uvicorn) | ✅ Running | 8000 |
| Frontend (Vite/React) | ✅ Running | 5174 |
| PostgreSQL | ✅ Running | 5432 |
| Redis | ✅ Running | 6379 |
| Self-hosted GH Actions runner | ✅ Online | — |

| Package | Version |
|---------|---------|
| anthropic | 0.84.0 |
| google-generativeai | 0.8.6 |
| fastapi | 0.111.0 |
| uvicorn | 0.30.1 |

---

## Session 17 — Multi-Project Support (Generic Platform)

### Overview
Transformed the platform from a single-project (MGA-only) tool into a generic multi-project platform. Users can now create multiple projects (each with its own GitHub repo, credentials, workflow config) and switch between them globally.

### Backend Changes

#### `backend/models.py` — New Project model
- Added `Project` SQLAlchemy model with 20+ fields: name, slug, description, icon_color, github_repo, github_token, ai_tests_branch, workflow_path, playwright_project_path, generated_tests_dir, runner_label, pw_host/testuser/password/email, framework_fetch_paths (JSON), system_prompt_override, jira_url, is_active, timestamps
- Added nullable `project_id` FK (UUID, indexed) to `TestCase`, `GeneratedScript`, `ExecutionRun`
- Database migration via direct SQL: `CREATE TABLE projects(...)` + `ALTER TABLE ... ADD COLUMN project_id`

#### `backend/main.py` — Project CRUD + project-aware routes
- New helper functions: `_slugify()`, `_project_to_dict()` (masks secrets), `get_project_config()` (falls back to global .env)
- New endpoints: `GET/POST /api/projects`, `GET/PUT/DELETE /api/projects/{project_id}`
- Modified endpoints with optional `project_id` param: `parse-excel`, `test-cases`, `generate-script`, `scripts`, `runs`, `spec-files`, `run-spec`
- All queries filter by `project_id` when provided; return all data when omitted

#### `backend/seed_projects.py` — Default project seeder
- Creates MGA and Banorte projects with correct repos, paths, and colors
- Idempotent: skips if project slug already exists

### Frontend Changes

#### New Files
| File | Description |
|------|-------------|
| `frontend/src/context/ProjectContext.tsx` | React context + provider for global project state. Uses `@tanstack/react-query` with 30s refetch. Persists selection in localStorage. |
| `frontend/src/components/ProjectSelector.tsx` | Header dropdown to switch projects. Shows colored dots, project names, repo badges. "All Projects" option for unfiltered view. |
| `frontend/src/components/ProjectsTab.tsx` | Full project management tab. Two-panel layout: project list (left) + collapsible form (right). Sections: General, GitHub, Playwright, Credentials, Advanced. |

#### Modified Files
| File | Changes |
|------|---------|
| `App.tsx` | Wrapped in `ProjectProvider`. Added `ProjectSelector` in header. Added 4th "Projects" tab with `AppstoreOutlined` icon. |
| `AIPhaseTab.tsx` | Reads `selectedProjectId` from context. Passes to `uploadExcel()` and `createScriptStream()`. Shows active project indicator badge. |
| `RunTab.tsx` | Reads `selectedProjectId` from context. Passes to `fetchSpecFiles()`, `fetchRuns()`, `runSpec()`. Dynamic project labels instead of hardcoded "MGA". |
| `Dashboard.tsx` | Reads `selectedProjectId` from context. Passes to `fetchRuns()` and `fetchScripts()`. Stats/charts filter by selected project. |
| `api/client.ts` | All fetch functions accept optional `projectId` param. New CRUD functions: `fetchProjects`, `createProject`, `updateProject`, `deleteProject`. |
| `types/index.ts` | Added `Project` interface. Added `project_id?` to `TestCase`, `GeneratedScript`, `ExecutionRun`, `SpecFile`. |

### Seeded Projects
| Project | Slug | Repo | Color |
|---------|------|------|-------|
| MGA | mga | RajasekharPlay/AI_Automation_MGA | #f59e0b (amber) |
| Banorte | banorte | RajasekharPlay/QA_Automation_Banorte | #6366f1 (indigo) |

### Key Design Decisions
1. **Backward compatible**: All `project_id` fields are nullable — existing data works without migration
2. **"All Projects" view**: When no project selected, all data is shown (no filtering)
3. **Per-project config fallback**: If a project doesn't set a field (e.g., github_token), the global `.env` value is used
4. **Soft delete**: "Delete" sets `is_active=false`, preserving data
5. **Dark theme**: All new UI matches existing design tokens from `theme.ts`

---

## Session 18 — Local + GitHub Actions Run Target Feature

### Overview
Added the ability to run tests **locally** via `npx playwright test` subprocess OR via **GitHub Actions**, selectable via a dropdown in the Run Testcase tab.

### Backend Changes

#### `backend/models.py`
- Added `run_target` column to `ExecutionRun`: `mapped_column(String(20), default="github_actions")`
- Values: `"local"` or `"github_actions"`

#### `backend/_migrate_run_target.py` (NEW)
- One-time migration: `ALTER TABLE execution_runs ADD COLUMN IF NOT EXISTS run_target VARCHAR(20) DEFAULT 'github_actions' NOT NULL`

#### `backend/execution_engine.py` — Local execution support
- `_resolve_playwright_project(browser)` — maps browser to Playwright `--project=` name (e.g., `chromium` → `ai-chromium`)
- `_local_sync_worker(spec_path, project_dir, browser, env, device, execution_mode, env_vars, msg_q)` — sync background thread:
  - `subprocess.Popen(npx playwright test ...)` with streaming stdout → queue
  - Sets env vars: `pw_HOST`, `pw_TESTUSER`, `pw_PASSWORD`, `pw_EMAIL`, `CI=true`
  - Posts `("log", line)`, `("done", exit_code)`, or `("error", msg)` to queue
- `run_test_locally(run_id, spec_file_path, project_dir, ...)` — async wrapper:
  - Creates Redis pub/sub channel, spawns worker thread, drains queue in async loop
  - Same log streaming pattern as GitHub Actions (Redis pub/sub + history list)

#### `backend/main.py` — Run target routing
- `run_spec_endpoint()` now accepts `run_target: str = Form(default="github_actions")`
- Routing logic:
  ```python
  if run_target == "local":       → _execute_local_and_update()
  elif branch == "local-mga":     → _execute_mga_gha_and_update()
  else:                           → _execute_spec_and_update()
  ```
- Added `_execute_local_and_update()` helper function
- Added `"run_target": r.run_target` to all run serialization dicts

### Frontend Changes

#### `frontend/src/types/index.ts`
- Added `run_target?: string` to `RunParams` and `ExecutionRun` interfaces

#### `frontend/src/api/client.ts`
- Added `run_target` to `runSpec()` params type

#### `frontend/src/components/RunTab.tsx`
- Added **Run Target** dropdown (`Local Machine` / `GitHub Actions`) in Execution Parameters card
- Removed "Will run in headless/headed mode" confirmation badge
- Updated `handleRun` payload to include `run_target`
- Added **Target** column to execution history table

---

## Session 19 — Spec Files Not Found Fix

### Problem
RunTab showed "No spec files found" for MGA project. `list_spec_files_from_branch()` was called with `repo` and `token` kwargs but didn't accept them.

### Fix
Updated `github_actions_runner.py` → `list_spec_files_from_branch()` signature:
```python
async def list_spec_files_from_branch(
    branch: str | None = None,
    *,
    repo: str | None = None,
    token: str | None = None,
) -> list[dict]:
```
Falls back to `_repo()` and `_headers()` when params are `None`.

---

## Session 20 — Dark Mode / Light Mode Toggle

### Overview
Added a dark/light theme toggle to the UI. Click the sun/moon icon in the header to switch themes. Preference is persisted in `localStorage`.

### Approach: CSS Variables + React Context + Ant Design Algorithm
All colors flow through CSS custom properties. Components import `colors` from `theme.ts` which now returns `var(--xxx)` references — **zero changes needed in component files**.

### New Files

#### `frontend/src/context/ThemeContext.tsx`
- React context: `mode` (`'dark'` | `'light'`), `isDark`, `toggleTheme()`
- Persists to `localStorage` key `ai-sdet-theme`
- Sets `data-theme` attribute on `<html>` element
- Default: `'dark'`

### Modified Files

#### `frontend/src/theme.ts` — Rewritten
- `colors` object: all background/border/text values now use CSS variable references (`var(--bg-card)`, `var(--text-primary)`, etc.)
- Accent/status colors remain static (work on both backgrounds)
- `gradients.header` and `gradients.surface` now use CSS vars
- New exports: `getAntThemeTokens(mode)` and `getAntComponentTokens(mode)` — return mode-appropriate Ant Design v5 tokens
- Legacy exports `antThemeTokens`/`antComponentTokens` kept for backward compat

#### `frontend/src/index.css` — Rewritten
- **40+ CSS custom properties** defined in two blocks:
  - `:root, [data-theme="dark"]` — deep navy dark palette (existing look preserved)
  - `[data-theme="light"]` — clean white/light gray palette
- All hardcoded hex values replaced with `var(--xxx)` references
- Added smooth transitions: `transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease`
- Added `.theme-toggle-btn` class with hover glow effect
- Added `[data-theme="light"]` overrides for header, table headers, popovers

#### `frontend/src/App.tsx`
- Imported `ThemeProvider` and `useThemeContext` from `context/ThemeContext`
- Extracted inner `AppContent` component that reads `useThemeContext()` for current mode
- `<ConfigProvider>` now conditionally uses `theme.darkAlgorithm` or `theme.defaultAlgorithm`
- Theme tokens passed via `getAntThemeTokens(mode)` and `getAntComponentTokens(mode)`
- Added **theme toggle button** (sun/moon icon) in header, next to version pill
- Wrapper order: `QueryClientProvider > ThemeProvider > ProjectProvider > AppContent`

### Key Design Decisions
1. **CSS variable approach** — component files (`Dashboard.tsx`, `AIPhaseTab.tsx`, `RunTab.tsx`, `ProjectsTab.tsx`, `ProjectSelector.tsx`) needed **zero changes**
2. **Terminal stays dark** in both modes for readability (`--terminal-bg: #1e293b` in light mode)
3. **Accent colors static** — indigo, violet, emerald, amber work on both backgrounds
4. **Ant Design algorithm** — properly switches all built-in component styles (tables, selects, buttons, tags, cards)

### Verification
- Dark mode: loads exactly as before (preserved existing look)
- Light mode: all backgrounds white/light gray, text dark, cards clean
- Toggle: instant switch via CSS variables + Ant Design algorithm
- Persistence: refreshing page preserves theme choice
- All 4 tabs tested in both modes via Chrome preview

---

## 📊 Current State

| Service | Status | Port |
|---------|--------|------|
| Backend (FastAPI/uvicorn) | Running | 8000 |
| Frontend (Vite/React) | Running | 5174 |
| PostgreSQL | Running | 5432 |
| Redis | Running | 6379 |
| Self-hosted GH Actions runner | Online | — |

| Package | Version |
|---------|---------|
| anthropic | 0.84.0 |
| google-generativeai | 0.8.6 |
| fastapi | 0.111.0 |
| uvicorn | 0.30.1 |

---

## Session 21 — Hybrid Playwright MCP Architecture Planning

### Overview
Discussed and planned the next major feature: integrating **Playwright MCP** (Model Context Protocol) into the platform for AI-driven browser exploration and smarter script generation.

### Decision: Hybrid Approach (Playwright MCP + Existing LLM Pipeline)

The hybrid pipeline combines:
1. **Playwright MCP** (`@playwright/mcp`) → AI browses the live app, observes DOM structure, extracts locators
2. **LLM Platform** (existing `llm_orchestrator.py`) → Applies `skye-e2e-tests` framework conventions (fixtures, steps, assertions)
3. **Playwright CLI** (`npx playwright codegen`) → Used only to quickly grab tricky locators when needed
4. **Script Validator** (existing `script_validator.py`) → `tsc --noEmit` confirms TypeScript validity
5. **Execution Engine** (existing) → Runs the final spec locally or via GitHub Actions

### Why Playwright MCP over Playwright CLI?
- **CLI (`codegen`)**: Records manual actions → raw code without framework conventions. Needs manual refactoring.
- **MCP**: AI sees live DOM → generates convention-compliant scripts with `fixtures`, `test.step()`, `skye`/`banorte` objects automatically.

### Tools Required
| Tool | Package | Purpose | Status |
|------|---------|---------|--------|
| Playwright MCP | `@playwright/mcp` (npm) | Browser automation via MCP protocol | 🆕 To install |
| Playwright Python | `playwright` (pip) | Backend browser control | 🆕 To install |
| New API routes | `/api/mcp-browse`, `/api/mcp-snapshot` | Orchestrate browser sessions | 🆕 To build |
| AI Browser Tab | `AIBrowserTab.tsx` | Frontend UI for browser exploration | 🆕 To build |
| LLM Orchestrator | `llm_orchestrator.py` | Enhanced to accept MCP context | ✅ To enhance |

### Architecture
```
┌─────────────────────────────────────────────┐
│           HYBRID PIPELINE                   │
├─────────────────────────────────────────────┤
│  🆕 Playwright MCP (@playwright/mcp)        │  ← NEW
│       ↓ browses app, extracts DOM           │
│  🆕 AI Browser Tab (frontend)               │  ← NEW
│       ↓ shows snapshots + locators          │
│  🆕 MCP Backend Routes (main.py)            │  ← NEW
│       ↓ orchestrates browser session        │
│  ✅ LLM Orchestrator (existing)             │  ← ENHANCED
│       ↓ generates .spec.ts                  │
│  ✅ Script Validator (existing)             │  ← NO CHANGE
│  ✅ Execution Engine (existing)             │  ← NO CHANGE
└─────────────────────────────────────────────┘
```

### Implementation Status
- [x] Architecture decided (hybrid MCP + LLM)
- [x] Tools identified (`@playwright/mcp`, `playwright` Python)
- [ ] Detailed implementation plan (pending approval)
- [ ] Backend: MCP browser session management
- [ ] Backend: New API routes for browse/snapshot/generate
- [ ] Frontend: AI Browser tab with live snapshot viewer
- [ ] LLM prompt enhancement with MCP context
- [ ] Integration testing

---

## Session 22 — Docker Compose Setup

### Overview
Created a full Docker Compose configuration to containerize the entire platform. `docker compose up` brings all 4 services online with zero manual setup.

### Files Created (7 new, 0 modified)
| File | Purpose |
|------|---------|
| `Dockerfile.backend` | Python 3.11 slim + Node.js 20 + Playwright Chromium, serves FastAPI on :8000 |
| `Dockerfile.frontend` | Multi-stage: Node 20 build → Nginx 1.25 serve (~25MB image) |
| `nginx.conf` | Reverse proxy: `/api/` + `/ws/` → backend, SPA fallback, SSE buffering off |
| `docker-compose.yml` | 4 services (postgres, redis, backend, frontend) + healthchecks + named volumes |
| `.env.docker.example` | Template for API keys & secrets (LLM, GitHub, Postgres) |
| `.dockerignore` | Excludes venv, node_modules, .git, framework-repos from build context |
| `backend/seed_projects_docker.py` | Docker-compatible project seeder with Linux paths (`/workspace/...`) |

### Architecture
```
http://localhost:80 → Nginx (frontend) → /api /ws → FastAPI (backend) → PostgreSQL + Redis
```
- Only port 80 exposed to host
- All services on `ai-platform-net` bridge network
- Credentials via `.env.docker` file (never baked into images)
- Framework repos optional — mounted as volumes for `run_target=local`

### Key Decisions
1. **Backend image includes Node.js** — required for `npx playwright test` and `npx tsc --noEmit`
2. **Only Chromium installed** — saves ~800MB vs all browsers
3. **Nginx production serve** — Vite dev server not suitable for production
4. **SSE support** — `proxy_buffering off` in nginx.conf for streaming endpoints
5. **WebSocket support** — upgrade headers + 24h read timeout
6. **Zero code changes** — all 7 files are new additions, existing code untouched

### Usage
```bash
cp .env.docker.example .env.docker    # Fill in API keys
docker compose up --build -d           # Build + start
docker compose exec backend python seed_projects_docker.py  # Seed projects (first time)
# Access: http://localhost
```

---

## Session 23 — Day 1: DOM Crawler + Enhanced Script Generation

### Overview
Added Playwright-based DOM crawler that crawls live app pages, extracts interactive elements + accessibility tree + screenshots, and injects real DOM selectors into the LLM prompt for more accurate Playwright/TypeScript script generation.

### Files Created (3 new)
| File | Purpose |
|------|---------|
| `backend/dom_crawler.py` | Async crawler using subprocess worker, Redis cache (1hr TTL) |
| `backend/dom_chunker.py` | Transforms DOM elements → concise LLM context (max 15K chars), keyword relevance scoring |
| `backend/_crawl_worker.py` | Standalone Playwright subprocess (avoids Windows SelectorEventLoop issue) |

### Files Modified (5)
| File | Changes |
|------|---------|
| `backend/llm_orchestrator.py` | Added `dom_context` param to `stream_script()`, `_main_user_content()`, builders. Added SYSTEM_PROMPT rule 12 (use real DOM selectors) |
| `backend/main.py` | New `POST /api/crawl-page` endpoint + `page_url` Form param in `generate_script_endpoint()` |
| `backend/requirements.txt` | Added `playwright>=1.44.0` |
| `frontend/src/api/client.ts` | New `crawlPage()` function + `pageUrl` param in `createScriptStream()` |
| `frontend/src/components/AIPhaseTab.tsx` | New "3. Page URL" card with crawl button, screenshot preview, element count |

### Key Technical Decisions
- **Subprocess approach**: Playwright sync API uses its own event loop → can't run inside FastAPI's asyncio. Solution: `_crawl_worker.py` runs as a separate process, communicates via stdin JSON / stdout JSON.
- **Windows `NotImplementedError`**: Solved by subprocess isolation (not threads, not `run_in_executor`).
- **Backend `--reload` flag breaks Playwright**: Must start uvicorn WITHOUT `--reload` for crawl to work.
- **DOM context injected between framework context and test case JSON** in LLM prompt.

---

## Session 24 — Day 2: Failure Feedback Loop + POM Generation + UI Enhancements

### Overview
Added self-healing tests (auto-fix failed scripts via Claude), page object model file generation, and UI improvements.

### Feature 1: Failure Feedback Loop (Self-Healing Tests)
**Flow:** Failed run → "Auto-Fix" button → fetch logs from Redis → extract error → Claude generates fix → tsc validates → save as new script

| File | Changes |
|------|---------|
| `backend/llm_orchestrator.py` | `FIX_SYSTEM_PROMPT` constant + `stream_fix_script()` function |
| `backend/main.py` | `_extract_error_from_logs()` helper + `POST /api/fix-script` SSE endpoint |
| `frontend/src/api/client.ts` | `createFixStream()` SSE consumer |
| `frontend/src/components/RunTab.tsx` | Auto-Fix button (ThunderboltOutlined) on failed runs + Drawer with Monaco editor + validation status + Re-Run |

**Key fix:** `test_case_id` FK violation when run has no `script_id` → fallback to first test case in project.

### Feature 2: POM File Generation
**Flow:** User asks "create PetsPage class" → LLM outputs with markers `// === PAGE_CLASS: PetsPage.ts ===` and `// === SPEC_FILE ===` → backend splits → saves page class to `pages/` + spec to `tests/generated/`

| File | Changes |
|------|---------|
| `backend/llm_orchestrator.py` | SYSTEM_PROMPT rule 10 rewritten for dual-mode output (single file or page class + spec) |
| `backend/main.py` | `_extract_and_save_page_class()` function + integrated in `generate_script_endpoint()` |

### Feature 3: UI Enhancements
- **RunTab**: Auto-Fix Drawer with streaming Monaco editor, validation badge, Re-Run button
- **AIPhaseTab**: Collapsible elements list after crawl preview (`<details>` with monospace element list)
- **Extra Instructions fix**: `_strip_markdown_fences()` safety net strips markdown when LLM ignores SYSTEM_PROMPT

### Bug Fixes Applied
- `_strip_markdown_fences()` — extracts spec code from markdown-fenced multi-file output
- SYSTEM_PROMPT rule 10 — tells LLM to never output markdown fences or multi-file headers
- AIPhaseTab JSX — fixed missing `<>` fragment wrapper for crawlResult conditional
- Fix endpoint — added `try/except` around UUID parsing, better error messages

---

## Session 25 — Persistent DOM Snapshots + Authenticated Crawling

### Overview
Added PostgreSQL storage for DOM crawl results (track history, compare changes) and auto-login support for crawling authenticated pages using project credentials.

### Persistent DOM Snapshots
| File | Changes |
|------|---------|
| `backend/models.py` | New `DomSnapshot` model (url, url_hash, title, elements JSON, accessibility_tree, screenshot_b64, dom_context, created_at) |
| `backend/main.py` | Updated `POST /api/crawl-page` to save DomSnapshot to DB |
| `backend/main.py` | New `GET /api/dom-snapshots` — list with project/url filters |
| `backend/main.py` | New `GET /api/dom-snapshots/{id}` — full detail |
| `backend/main.py` | New `GET /api/dom-snapshots/{id}/compare/{other_id}` — diff two snapshots (added/removed/changed elements) |

### Authenticated Crawling
| File | Changes |
|------|---------|
| `backend/_crawl_worker.py` | Reads auth from stdin JSON, auto-login via Innoveo Skye flow (fill username/password, click Log in) |
| `backend/dom_crawler.py` | `crawl_page()` accepts `auth` dict, passes to subprocess via stdin, skips Redis cache for authenticated crawls |
| `backend/main.py` | `crawl_page_endpoint()` loads project credentials (pw_email, pw_password) from DB when project_id provided |

**Login flow:** Navigate to `pw_host` → fill `Enter username` with `pw_email` → fill `Password here` with `pw_password` → click `Log in` → wait → navigate to target URL.

---

## 📊 Current State (Session 25)

| Service | Status | Port |
|---------|--------|------|
| Backend (FastAPI/uvicorn) | Running | 8000 |
| Frontend (Vite/React) | Running | 5174 |
| PostgreSQL | Running | 5432 |
| Redis | Running | 6379 |
| Docker Desktop | Installed | — |

### DB Models (7)
Project, TestCase, GeneratedScript, ExecutionRun, UserPrompt, DomSnapshot

### API Endpoints (30+)
All original + `POST /api/crawl-page`, `GET /api/dom-snapshots`, `GET /api/dom-snapshots/{id}`, `GET /api/dom-snapshots/{id}/compare/{other_id}`, `POST /api/fix-script`

---

## 🔜 Future Improvements (Not Yet Done)

- [ ] Dashboard: real-time run status polling
- [ ] Support multiple Excel sheets in one upload
- [ ] Token usage tracking dashboard (compare Anthropic vs Gemini cost)
- [ ] Install self-hosted runner as Windows service
- [ ] DOM snapshot diff visualization in frontend UI
- [ ] Auto-fix retry counter visible in Dashboard stats
