"""Make an 'older version' SQLite file: current tables minus the columns added later.

Usage (from backend/, venv active):  python ../scripts/seed-old-db.py /tmp/old.db
Then copy it into the Docker volume (see docs/growth-os/11-verification-runbook.md, B2).
This SIMULATES the previous release. A real DB file from the previous release is better; use it if you have one.
"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/old.db"
if os.path.exists(path):
    os.remove(path)
os.environ["DATABASE_URL"] = f"sqlite:///{path}"
os.environ.setdefault("APP_ENV", "development")
from datetime import date
from sqlmodel import Session
from app.db.database import engine, init_db
from app.db.models import DailyEntry, User
from app.core.security import hash_password
from sqlalchemy import text

init_db()
with Session(engine) as s:
    u = User(username="olduser", hashed_password=hash_password("Old-Pass1!"))
    s.add(u); s.commit(); s.refresh(u)
    s.add(DailyEntry(user_id=u.id, entry_date=date(2026, 11, 1), highlight="written by the old version"))
    s.commit()
with engine.begin() as c:  # needs SQLite >= 3.35
    for col in ("display_name", "bio", "avatar_kind", "avatar_value"):
        c.execute(text(f"ALTER TABLE user DROP COLUMN {col}"))
    for col in ("coach_tactic_id", "coach_blocker_type", "coach_tactic_applied"):
        c.execute(text(f"ALTER TABLE dailyentry DROP COLUMN {col}"))
print("old-schema DB written to", path, "(user: olduser / Old-Pass1!)")
