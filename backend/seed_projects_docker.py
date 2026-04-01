"""
Seed default projects (MGA + Banorte) into the database — Docker version.
Uses Linux container paths instead of Windows paths.

Run inside the container:
  docker compose exec backend python seed_projects_docker.py
"""
import asyncio
import sys
from pathlib import Path

# Ensure we can import from the backend package
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sqlalchemy import select
from database import AsyncSessionLocal
from models import Project


DEFAULTS = [
    {
        "name": "MGA",
        "slug": "mga",
        "description": "MGA Insurance Platform — Innoveo Skye",
        "icon_color": "#f59e0b",
        "github_repo": "RajasekharPlay/AI_Automation_MGA",
        "ai_tests_branch": "ai-playwright-tests",
        "workflow_path": ".github/workflows/mga-tests.yml",
        "playwright_project_path": "/workspace/mga/skye-e2e-tests",
        "generated_tests_dir": "tests/generated",
        "runner_label": "self-hosted",
        "pw_host": "https://skye1.dev.mga.innoveo-skye.net",
        "pw_testuser": "",
        "pw_password": "",
        "pw_email": "",
        "is_active": True,
    },
    {
        "name": "Banorte",
        "slug": "banorte",
        "description": "Banorte Banking Platform — Innoveo Skye",
        "icon_color": "#6366f1",
        "github_repo": "RajasekharPlay/QA_Automation_Banorte",
        "ai_tests_branch": "ai-playwright-tests",
        "workflow_path": "",
        "playwright_project_path": "/workspace/banorte/skye-e2e-tests",
        "generated_tests_dir": "tests/generated",
        "runner_label": "self-hosted",
        "pw_host": "",
        "pw_testuser": "",
        "pw_password": "",
        "pw_email": "",
        "is_active": True,
    },
]


async def seed():
    async with AsyncSessionLocal() as db:
        for proj_data in DEFAULTS:
            slug = proj_data["slug"]
            # Check if already exists
            result = await db.execute(
                select(Project).where(Project.slug == slug)
            )
            existing = result.scalar_one_or_none()
            if existing:
                print(f"  [SKIP]  Project '{slug}' already exists (id={existing.id}), skipping.")
                continue

            project = Project(**proj_data)
            db.add(project)
            await db.flush()
            print(f"  [OK] Created project '{proj_data['name']}' (id={project.id})")

        await db.commit()
    print("\nDone!")


if __name__ == "__main__":
    print("Seeding default projects (Docker paths)...\n")
    asyncio.run(seed())
