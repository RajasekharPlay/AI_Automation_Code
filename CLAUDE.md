# CLAUDE.md — AI Test Automation Platform
> This file is read by Claude Code at the start of every session.
> It contains the full project context, architecture, all fixes applied, and how to start services.

---

## 📌 Project Overview

**Name:** AI Test Automation Platform
**Location:** `C:\Users\RajasekharUdumula\Desktop\AI_Automation_Code\`
**Purpose:** Upload Excel test cases → AI generates Playwright/TypeScript scripts → Execute tests locally or via GitHub Actions → View results
**Framework targets:**
- `RajasekharPlay/QA_Automation_Banorte` — Banorte (`skye-e2e-tests/`)
- `RajasekharPlay/AI_Automation_MGA` — MGA (`skye-e2e-tests/`)

---

## 🗂 Project Structure

```
AI_Automation_Code/
├── backend/                         # FastAPI Python backend
│   ├── main.py                      # All API routes
│   ├── config.py                    # Settings loaded from .env (absolute path)
│   ├── database.py                  # SQLAlchemy async + AsyncSessionLocal
│   ├── models.py                    # TestCase, GeneratedScript, ExecutionRun, UserPrompt, Project, DomSnapshot
│   ├── excel_parser.py              # Parses .xlsx → TestCase objects
│   ├── framework_loader.py          # GitHub API → fetches skye-e2e-tests/ files → Redis cache
│   ├── llm_orchestrator.py          # Multi-provider: Anthropic Claude + Google Gemini + fix mode
│   ├── dom_crawler.py               # Playwright DOM crawler (subprocess, Redis cache, auth support)
│   ├── dom_chunker.py               # DOM → concise LLM context (max 15K chars, keyword scoring)
│   ├── _crawl_worker.py             # Standalone Playwright subprocess (auto-login support)
│   ├── script_validator.py          # tsc --noEmit validation + self-correction
│   ├── execution_engine.py          # Local npx playwright test + Allure + run_test_locally()
│   ├── github_actions_runner.py     # GitHub Actions orchestration for MGA + Banorte
│   ├── websocket_manager.py         # WebSocket + Redis pub/sub bridge
│   ├── requirements.txt             # Python dependencies
│   ├── .env                         # Real secrets (NOT committed)
│   ├── .env.example                 # Template
│   └── venv/                        # Python virtual environment (use venv/ NOT .venv/)
│
├── frontend/                        # React + TypeScript + Ant Design + Vite
│   ├── src/
│   │   ├── App.tsx                  # 4-tab layout with dark/light toggle: Dashboard / AI Phase / Run Testcase / Projects
│   │   ├── api/client.ts            # All API calls (relative URLs via Vite proxy)
│   │   ├── types/index.ts           # TypeScript interfaces (incl. Project)
│   │   ├── theme.ts                 # Centralized design tokens — CSS variable refs + mode-aware Ant tokens
│   │   ├── context/
│   │   │   ├── ProjectContext.tsx   # React context for global project selection
│   │   │   └── ThemeContext.tsx     # React context for dark/light mode (localStorage persisted)
│   │   └── components/
│   │       ├── AIPhaseTab.tsx       # LLM provider toggle + upload + generate + Monaco editor
│   │       ├── RunTab.tsx           # Spec select + env/browser config + live logs + drag splitter
│   │       ├── Dashboard.tsx        # Stats, pie chart, run history, Allure embed
│   │       ├── ProjectsTab.tsx      # Project CRUD — two-panel with list + collapsible form
│   │       └── ProjectSelector.tsx  # Header dropdown to switch active project
│   ├── vite.config.ts               # Port 5174 (strictPort), proxy /api → :8000, /ws → ws://:8000
│   └── package.json
│
├── CLAUDE.md                        # ← THIS FILE (Claude reads on session start)
├── memory.md                        # Full changelog of all changes made
├── README.md                        # Setup guide
│
├── Dockerfile.backend               # Python 3.11 + Node.js 20 + Playwright Chromium
├── Dockerfile.frontend              # Multi-stage: Node build → Nginx serve
├── docker-compose.yml               # 4 services: postgres, redis, backend, frontend
├── nginx.conf                       # Reverse proxy /api + /ws → backend
├── .env.docker.example              # Docker env vars template
└── .dockerignore                    # Build context exclusions
```

---

## 🐳 Docker Compose (Recommended)

```bash
# First time
cp .env.docker.example .env.docker    # Fill in API keys
docker compose up --build -d           # Build + start all 4 services
docker compose exec backend python seed_projects_docker.py  # Seed projects

# Access
# UI:        http://localhost
# API docs:  http://localhost/api/docs
# Health:    http://localhost/api/health

# Manage
docker compose logs -f backend         # Stream backend logs
docker compose ps                      # Check health status
docker compose down                    # Stop all
docker compose down -v                 # Full reset (delete DB data)

# (Optional) For local test execution
mkdir -p framework-repos
git clone https://github.com/RajasekharPlay/AI_Automation_MGA.git framework-repos/mga
git clone https://github.com/RajasekharPlay/QA_Automation_Banorte.git framework-repos/banorte
docker compose exec backend bash -c "cd /workspace/mga/skye-e2e-tests && npm ci"
```

### Docker Services
| Service | Image | Port | Healthcheck |
|---------|-------|------|-------------|
| `postgres` | `postgres:15-alpine` | 5432 (internal) | `pg_isready` |
| `redis` | `redis:7-alpine` | 6379 (internal) | `redis-cli ping` |
| `backend` | Custom (Python 3.11 + Node.js 20) | 8000 (internal) | `curl /health` |
| `frontend` | Custom (Nginx) | **80 (exposed)** | — |

---

## 🚀 How to Start Services (Local / Non-Docker)

### Backend (FastAPI on port 8000)
```powershell
# Kill any old processes first
Get-Process -Name 'python','uvicorn' -ErrorAction SilentlyContinue | Stop-Process -Force

# Start fresh
Start-Process -FilePath 'C:\Users\RajasekharUdumula\Desktop\AI_Automation_Code\backend\venv\Scripts\python.exe' `
  -ArgumentList '-m','uvicorn','main:app','--host','127.0.0.1','--port','8000','--reload' `
  -WorkingDirectory 'C:\Users\RajasekharUdumula\Desktop\AI_Automation_Code\backend' `
  -WindowStyle Normal
```

### Frontend (Vite on port 5174)
```bash
cd C:\Users\RajasekharUdumula\Desktop\AI_Automation_Code\frontend
npm run dev
```

### Self-Hosted GitHub Actions Runner (REQUIRED for MGA tests)
```powershell
# Runner lives at C:\actions-runner
# Start it (must stay open while running CI jobs)
Start-Process -FilePath 'C:\actions-runner\run.cmd' -WorkingDirectory 'C:\actions-runner' -WindowStyle Normal

# To install as a Windows service (run PowerShell as Administrator)
cd C:\actions-runner
.\svc.cmd install
.\svc.cmd start
```

> ⚠️ The runner must be **online** before triggering MGA test runs.
> Check status: GitHub → `RajasekharPlay/AI_Automation_MGA` → Settings → Actions → Runners

### Health check
```
GET http://127.0.0.1:8000/health  → {"status": "ok"}
UI: http://localhost:5174
API docs: http://127.0.0.1:8000/docs
```

---

## ⚙️ Environment Variables (.env)

File: `C:\Users\RajasekharUdumula\Desktop\AI_Automation_Code\backend\.env`

```env
# LLM Provider — "anthropic" or "gemini"
LLM_PROVIDER=anthropic

# Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx          # Get from console.anthropic.com
ANTHROPIC_MODEL=claude-opus-4-5

# Google Gemini
GEMINI_API_KEY=AIzaSyxxxxx                     # Get from aistudio.google.com
GEMINI_MODEL=gemini-2.5-pro

# GitHub (for fetching framework context + triggering GHA)
GITHUB_TOKEN=ghp_xxxxx
GITHUB_FRAMEWORK_REPO=RajasekharPlay/AI_Automation_MGA   # MGA repo

# PostgreSQL
DATABASE_URL=postgresql+asyncpg://postgres:Sreeram@localhost:5432/ai_test_platform
SYNC_DATABASE_URL=postgresql://postgres:Sreeram@localhost:5432/ai_test_platform

# Redis
REDIS_URL=redis://localhost:6379/0

# Framework Playwright project paths
PLAYWRIGHT_PROJECT_PATH=C:/Users/RajasekharUdumula/Desktop/QA_Automation_Banorte/skye-e2e-tests
MGA_PLAYWRIGHT_PROJECT_PATH=C:/Users/RajasekharUdumula/Desktop/AI_Automation_Code/AI_Automation_MGA/skye-e2e-tests
GENERATED_TESTS_DIR=tests/generated

# Branch for AI-generated specs
AI_TESTS_BRANCH=ai-playwright-tests

# App
FRONTEND_URL=http://localhost:5174
SECRET_KEY=banorte-ai-platform-secret-2024
```

> ⚠️ CRITICAL: `config.py` uses `Path(__file__).resolve().parent / ".env"` — absolute path, no CWD dependency.
> ⚠️ CRITICAL: `env_ignore_empty=True` in `model_config` — prevents empty OS env vars from overriding `.env`.

---

## 🤖 LLM Orchestrator — Multi-Provider

**File:** `backend/llm_orchestrator.py`

- **Anthropic Claude**: `claude-opus-4-5`, max_tokens=8000, SSE streaming via `messages.stream()`
- **Google Gemini**: `gemini-2.5-pro`, streaming via `send_message_async(stream=True)`
- Both share the same `SYSTEM_PROMPT` and `FEW_SHOTS` examples
- Per-request provider override via `llm_provider` Form field → overrides `.env` default
- Lazy client init: `_get_anthropic()` and `_ensure_gemini()` — safe to have only one key configured
- `active_provider_info()` → used by `GET /api/llm-provider` endpoint

---

## 🌐 API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/parse-excel` | Upload .xlsx → returns test_cases[] |
| GET | `/api/test-cases` | List all test cases from DB |
| GET | `/api/llm-provider` | Returns provider config & which keys are set |
| POST | `/api/generate-script` | SSE stream: generates TypeScript from test case |
| GET | `/api/scripts` | List all generated scripts |
| GET | `/api/scripts/{id}` | Single script detail |
| GET | `/api/spec-files` | List .spec.ts files from GitHub branch |
| POST | `/api/run-spec` | Run spec locally or via GitHub Actions (run_target param) |
| POST | `/api/ensure-branch` | Create AI tests branch if missing |
| GET | `/api/runs` | List all execution runs |
| GET | `/api/runs/{id}` | Single run detail |
| GET | `/api/runs/{id}/logs` | HTTP fallback log fetch from Redis |
| GET | `/api/reports/{id}` | Serve Allure HTML report |
| POST | `/api/framework/refresh` | Re-fetch framework from GitHub |
| WS | `/ws/run/{run_id}` | Live log stream |
| GET | `/api/projects` | List all active projects |
| POST | `/api/projects` | Create a new project (JSON body) |
| GET | `/api/projects/{id}` | Get single project |
| PUT | `/api/projects/{id}` | Update project (JSON body) |
| DELETE | `/api/projects/{id}` | Soft-delete (sets is_active=false) |
| POST | `/api/crawl-page` | Crawl URL → extract DOM elements, screenshot, auto-login |
| GET | `/api/dom-snapshots` | List DOM snapshots (project/url filter) |
| GET | `/api/dom-snapshots/{id}` | Full snapshot detail (elements, screenshot, dom_context) |
| GET | `/api/dom-snapshots/{id}/compare/{other_id}` | Diff two snapshots (added/removed/changed) |
| POST | `/api/fix-script` | SSE stream: auto-fix failed test using error analysis |

> **Multi-project filtering**: Routes that accept `project_id` (query param or Form field):
> `parse-excel`, `test-cases`, `generate-script`, `scripts`, `runs`, `spec-files`, `run-spec`, `crawl-page`, `dom-snapshots`.
> When `project_id` is provided, results are filtered. When omitted, all data is returned.

---

## 🏗 Multi-Project Architecture

The platform is **generic** — not tied to any single project. Each project has its own:
- GitHub repo, token, branch, workflow path
- Playwright project path, generated tests directory
- Runner label, app credentials (host/user/password/email)
- Optional custom LLM system prompt override

**DB Model:** `projects` table with UUID PK. `TestCase`, `GeneratedScript`, `ExecutionRun` each have nullable `project_id` FK.

**Frontend:** `ProjectContext` (React Context) provides `selectedProjectId` globally. `ProjectSelector` in header switches projects. All tabs read from context and pass `project_id` to API calls.

**Config fallback:** `get_project_config()` in `main.py` loads project-specific settings. If a field is empty, falls back to global `.env` values.

**Seeded projects:** MGA (#f59e0b) and Banorte (#6366f1) — run `python seed_projects.py` from backend/.

---

## 🎭 Framework — skye-e2e-tests Conventions

**CRITICAL** — The LLM is instructed to follow these EXACT patterns:

```typescript
// Imports — ALWAYS these exact paths
import { test }   from '../fixtures/Fixtures';
import { expect } from '@playwright/test';
import { PetsPage } from '../pages/PetsPage';  // only if used
import { MainPage } from '../pages/MainPage';   // only if used

// Fixture destructuring — ALWAYS exactly this
async ({ page, skye, banorte }) => {
  // page    → Playwright Page
  // skye    → SkyeAttributeCommands
  // banorte → BanorteCommands

// Page object constructors
new PetsPage(page, skye)   // TWO args
new MainPage(page)          // ONE arg

// Navigation — ALWAYS with networkidle
await page.goto(process.env.pw_HOST!, { waitUntil: 'networkidle' });

// Steps — every logical step wrapped
await test.step('Step 1: Navigate', async () => { ... });

// Assertions
await expect(locator).toBeVisible();

// No allure imports, no markdown fences in output
```

---

## 🎯 GitHub Actions — MGA Tests (`github_actions_runner.py`)

**Workflow file:** `.github/workflows/mga-tests.yml` on `main` branch of `RajasekharPlay/AI_Automation_MGA`
**Runs on:** `self-hosted` runner (user's Windows machine at `C:\actions-runner`)

### Why self-hosted?
The MGA test app (`skye1.dev.mga.innoveo-skye.net`) is on a private/internal network — not accessible from GitHub's cloud runners.

### Workflow inputs
| Input | Description |
|-------|-------------|
| `test_file` | Spec file path relative to `skye-e2e-tests/` |
| `branch` | Git branch that contains the spec file |
| `browser` | chromium/firefox/webkit |
| `environment` | dev/sit/uat |
| `execution_mode` | headless/headed |
| `pw_host` | App URL |
| `pw_testuser` | Login username |
| `pw_password` | Login password |
| `pw_email` | Login email |

### Key constants in `github_actions_runner.py`
```python
AI_TESTS_BRANCH  = settings.AI_TESTS_BRANCH   # "ai-playwright-tests"
TRIGGER_BRANCH   = "main"                       # workflow YAML lives on main
MGA_WORKFLOW_PATH = ".github/workflows/mga-tests.yml"
```

### Flow
1. User selects spec from Run tab → `POST /api/run-spec` with `branch=local-mga`
2. Backend routes to `_execute_mga_gha_and_update()`
3. `run_mga_via_gha()` ensures workflow exists → triggers `workflow_dispatch` on `main`
4. Workflow checkouts the **spec's branch** (via `branch` input) — this is how generated specs on `ai-playwright-tests` are found
5. Polls GHA every 5s → streams status to live logs via Redis pub/sub
6. On completion: updates DB run record with exit_code + GHA URL

### ⚠️ Branch checkout fix (critical)
Generated specs live on `ai-playwright-tests` branch, NOT `main`. The workflow YAML uses:
```yaml
- uses: actions/checkout@v4
  with:
    ref: ${{ github.event.inputs.branch || 'main' }}
    fetch-depth: 0
```
This allows running any spec from any branch.

---

## 🎯 Local + GitHub Actions Run Target

**Feature:** Users choose where to run tests — locally or via GitHub Actions — via a dropdown in the Run Testcase tab.

### How it works
- **`run_target`** field on `ExecutionRun` model: `"local"` or `"github_actions"`
- **Local execution** (`execution_engine.py`):
  - `_local_sync_worker()` — background thread runs `npx playwright test` via `subprocess.Popen`
  - `run_test_locally()` — async wrapper: Redis pub/sub, spawn thread, drain queue
  - Thread+Queue pattern avoids Windows `SelectorEventLoop` limitation
  - Playwright project name resolved per-project (MGA uses `mga-chromium`, Banorte uses `ai-chromium`)
- **GitHub Actions** — existing flow via `github_actions_runner.py` (unchanged)
- **Routing** in `main.py run_spec_endpoint()`:
  ```
  run_target == "local"     → _execute_local_and_update()
  branch == "local-mga"     → _execute_mga_gha_and_update()
  else                      → _execute_spec_and_update()
  ```
- **Frontend**: Run Target dropdown in Execution Parameters card. Target column in execution history table.

### DB migration
```sql
ALTER TABLE execution_runs ADD COLUMN run_target VARCHAR(20) DEFAULT 'github_actions' NOT NULL;
```

---

## 🌓 Dark Mode / Light Mode Toggle

**Feature:** Users toggle between dark and light themes via a sun/moon button in the header.

### Architecture
- **CSS Custom Properties**: 40+ variables defined in `index.css` for both `[data-theme="dark"]` and `[data-theme="light"]`
- **ThemeContext** (`context/ThemeContext.tsx`): React context providing `mode`, `isDark`, `toggleTheme()`
- **Persistence**: `localStorage` key `ai-sdet-theme` — remembers preference across sessions
- **Ant Design**: Switches between `theme.darkAlgorithm` and `theme.defaultAlgorithm`

### Key design decisions
1. **CSS variable approach** means **zero changes** in component files — they import `colors` from `theme.ts` which now returns `var(--xxx)` references
2. **Terminal stays dark** in both modes for readability
3. **Accent colors** (indigo, violet, emerald, amber) are static — work on both backgrounds
4. **Smooth transitions** via `transition: background-color 0.3s ease` on key elements
5. **Mode-aware Ant tokens**: `getAntThemeTokens(mode)` and `getAntComponentTokens(mode)` in `theme.ts`

### Files
| File | Role |
|------|------|
| `context/ThemeContext.tsx` | State management + localStorage + `data-theme` attribute |
| `theme.ts` | `colors` object (CSS var refs) + `getAntThemeTokens(mode)` + `getAntComponentTokens(mode)` |
| `index.css` | CSS variable definitions (dark + light) + all selectors use `var(--xxx)` |
| `App.tsx` | `<ThemeProvider>` wrapper + toggle button in header |

---

## 🖥️ RunTab UI — Drag-to-Resize Splitter

The right panel of Run Testcase tab has two sections separated by a draggable divider:
- **Top:** Live Logs terminal (default 55% height)
- **Bottom:** Execution History table (default 45% height)

Drag the **violet pill handle** between them to resize. Clamped 20%–80%.
Default tags are **empty** (no pre-selected regression tag).

---

## 🐛 Known Fixes Applied

See `memory.md` for full chronological changelog.

Quick reference:
1. Excel upload CORS error → `BASE_URL = ''` (relative URLs)
2. Vite port conflict → `strictPort: true`, port 5174
3. Anthropic auth error → absolute `.env` path, removed `thinking` param
4. Wrong framework paths → fixed to `skye-e2e-tests/` prefix
5. Wrong playwright projects → fixed to `ai-chromium`, `ai-firefox`, etc.
6. Duplicate `TextArea` declaration → removed duplicate
7. Multi-LLM provider → `llm_orchestrator.py` with Anthropic + Gemini routing
8. DB session bug in generate-script → use `AsyncSessionLocal()` inside generator
9. Race condition in run-test → `await db.commit()` before `asyncio.create_task()`
10. `ai-chromium not found` → push `playwright.config.ts` to GitHub + sync step in workflow
11. Live logs missing → `pub()` writes to both Redis pub/sub AND history list
12. MGA `NotImplementedError` (local subprocess on Windows) → switched to GitHub Actions
13. MGA private network not reachable from GH cloud → self-hosted runner at `C:\actions-runner`
14. `No tests found` in GHA → added `branch` input + `ref:` in checkout step
15. npm cache causing 583MB upload hang → removed `cache: 'npm'` from `actions/setup-node`
16. Multi-project support → `Project` model, CRUD endpoints, `ProjectContext`, per-project config fallback
17. Spec files "not found" → `list_spec_files_from_branch()` updated to accept per-project `repo`/`token` kwargs
18. Local run target → `run_test_locally()` via thread+queue pattern, `run_target` field on `ExecutionRun`
19. MGA `ai-chromium not found` locally → per-project Playwright project mapping (MGA=`mga-chromium`, Banorte=`ai-chromium`)
20. Dark/Light mode toggle → CSS variables + ThemeContext + Ant Design algorithm switching

---

## 🕷️ DOM Crawler + AI Script Enhancement Pipeline (Sessions 23-25)

### Full Pipeline (Built & Working)
```
User enters URL in AI Phase tab → POST /api/crawl-page
       ↓
Playwright crawls page (headless, auto-login if project creds set)
       ↓
Extracts: interactive elements + accessibility tree + screenshot
       ↓
Saves to PostgreSQL (DomSnapshot) + Redis cache (1hr)
       ↓
dom_chunker builds concise context (max 15K chars, keyword-scored)
       ↓
LLM sees: framework context + REAL DOM selectors + test case
       ↓
Generates .spec.ts with ACTUAL selectors (not invented)
       ↓
Safety nets → tsc validate → save → commit to GitHub
       ↓
If test FAILS → Auto-Fix: error + code → Claude → fixed script
```

### Key Components
| Component | File | Purpose |
|-----------|------|---------|
| DOM Crawler | `backend/dom_crawler.py` | Orchestrates subprocess crawl, Redis cache |
| Crawl Worker | `backend/_crawl_worker.py` | Standalone Playwright process (auto-login support) |
| DOM Chunker | `backend/dom_chunker.py` | DOM → LLM context string (keyword relevance scoring) |
| Fix Mode | `backend/llm_orchestrator.py` | `stream_fix_script()` — auto-fix with error analysis |
| DOM Snapshots | `backend/models.py` | `DomSnapshot` PostgreSQL model for history tracking |

### Auth Crawling
When a project has `pw_email` + `pw_password` configured, the crawler auto-logs in via:
1. Navigate to `pw_host` (login page)
2. Fill `Enter username` placeholder with `pw_email`
3. Fill `Password here` placeholder with `pw_password`
4. Click `Log in` button
5. Wait for redirect → then navigate to target URL

### Important Notes
- Backend must start **without `--reload`** flag for Playwright subprocess to work on Windows
- Authenticated crawls skip Redis cache (session-specific)
- DOM snapshots stored permanently in PostgreSQL (compare with `/api/dom-snapshots/{id}/compare/{other_id}`)
- Auto-fix limited to 2 retries per failed run
