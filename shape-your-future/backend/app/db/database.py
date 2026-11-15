from sqlalchemy import text
from sqlmodel import SQLModel, Session, create_engine

from app.core.config import settings

connect_args = (
    {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
)
engine = create_engine(settings.database_url, connect_args=connect_args)

# Columns added to `User` after the table may already have been created
# on disk. This project has no real migration tool (Alembic etc.): `create_all()` (which only creates *missing
# tables*, never alters existing ones) plus these tiny manual patch lists is enough for two tables.
# Each entry: (column_name, DDL fragment to add it).
#
# The app never DROPs a table by itself. Tables left over from the old multi-feature app are handled by the
# opt-in script backend/scripts/legacy_tables.py (report / drop with JSON backup / restore).
_USER_COLUMN_MIGRATIONS = [
    ("display_name", "ALTER TABLE user ADD COLUMN display_name TEXT"),
    ("bio", "ALTER TABLE user ADD COLUMN bio TEXT"),
    ("avatar_kind", "ALTER TABLE user ADD COLUMN avatar_kind TEXT NOT NULL DEFAULT 'preset'"),
    ("avatar_value", "ALTER TABLE user ADD COLUMN avatar_value TEXT NOT NULL DEFAULT 'fox'"),
]

# Coach: the confirmed tactic of the day on `dailyentry`. Nullable, no DEFAULT: old rows have none.
_DAILY_ENTRY_COLUMN_MIGRATIONS = [
    ("coach_tactic_id", "ALTER TABLE dailyentry ADD COLUMN coach_tactic_id INTEGER"),
    ("coach_blocker_type", "ALTER TABLE dailyentry ADD COLUMN coach_blocker_type TEXT"),
    ("coach_tactic_applied", "ALTER TABLE dailyentry ADD COLUMN coach_tactic_applied BOOLEAN"),
]


def _apply_column_migrations(conn, table_name: str, migrations) -> None:
    existing = {
        row[1]  # PRAGMA table_info columns: (cid, name, type, notnull, dflt_value, pk)
        for row in conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
    }
    if not existing:
        return  # table doesn't exist yet - create_all() below will make it fresh, already correct
    for column_name, ddl in migrations:
        if column_name not in existing:
            conn.execute(text(ddl))


def _migrate_existing_tables() -> None:
    if not settings.database_url.startswith("sqlite"):
        return
    with engine.begin() as conn:
        _apply_column_migrations(conn, "user", _USER_COLUMN_MIGRATIONS)
        _apply_column_migrations(conn, "dailyentry", _DAILY_ENTRY_COLUMN_MIGRATIONS)


def init_db() -> None:
    # Import models so their tables are registered on SQLModel.metadata
    from app.db import models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _migrate_existing_tables()


def get_db():
    with Session(engine) as session:
        yield session
