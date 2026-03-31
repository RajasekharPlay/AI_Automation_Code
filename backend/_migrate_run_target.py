"""One-time migration: add run_target column to execution_runs."""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from database import AsyncSessionLocal
from sqlalchemy import text

async def migrate():
    async with AsyncSessionLocal() as db:
        await db.execute(text(
            "ALTER TABLE execution_runs ADD COLUMN IF NOT EXISTS "
            "run_target VARCHAR(20) DEFAULT 'github_actions' NOT NULL"
        ))
        await db.commit()
        print("OK: run_target column added")

if __name__ == "__main__":
    asyncio.run(migrate())
