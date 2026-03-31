import sys, json, asyncio
sys.path.insert(0, r"C:\Users\RajasekharUdumula\Desktop\AI_Automation_Code\backend")

from database import AsyncSessionLocal
from models import GeneratedScript
from sqlalchemy import select, desc

async def main():
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(GeneratedScript).order_by(desc(GeneratedScript.created_at)).limit(5)
        )
        scripts = result.scalars().all()
        if not scripts:
            print("No scripts found in DB")
            return
        for s in scripts:
            print(f"ID: {s.id}")
            print(f"Name: {s.test_case_name}")
            print(f"Status: {s.validation_status}")
            print(f"Error: {s.validation_errors}")
            print(f"Script (first 300 chars): {(s.script_content or '')[:300]}")
            print("-" * 60)

asyncio.run(main())
