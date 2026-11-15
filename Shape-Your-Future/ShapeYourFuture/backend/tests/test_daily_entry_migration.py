"""The manual column patch for `dailyentry` (app/db/database.py - _apply_column_migrations / _DAILY_ENTRY_COLUMN_MIGRATIONS):
a `dailyentry` table created BEFORE the coach columns existed must survive with its rows intact and the new columns NULL.

Builds its own old-shaped table (the `test_db` fixture always creates the new shape, so it never exercises this path)."""
from sqlalchemy import text
from sqlmodel import create_engine

from app.db.database import _DAILY_ENTRY_COLUMN_MIGRATIONS, _apply_column_migrations


def _old_engine():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE TABLE dailyentry (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, entry_date DATE NOT NULL, "
            "highlight TEXT, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL)"
        ))
        conn.execute(text(
            "INSERT INTO dailyentry (id, user_id, entry_date, highlight, created_at, updated_at) "
            "VALUES (1, 1, '2026-11-01', 'write', '2026-11-01 08:00:00', '2026-11-01 08:00:00')"
        ))
    return engine


def _columns(conn):
    return {row[1] for row in conn.execute(text("PRAGMA table_info(dailyentry)")).fetchall()}


def test_old_dailyentry_gets_the_coach_columns_and_keeps_its_rows():
    engine = _old_engine()
    with engine.begin() as conn:
        _apply_column_migrations(conn, "dailyentry", _DAILY_ENTRY_COLUMN_MIGRATIONS)
        assert {"coach_tactic_id", "coach_blocker_type", "coach_tactic_applied"} <= _columns(conn)
        row = conn.execute(text("SELECT highlight, coach_tactic_id, coach_blocker_type, coach_tactic_applied FROM dailyentry")).one()
        assert tuple(row) == ("write", None, None, None)


def test_running_the_patch_twice_does_not_raise():
    engine = _old_engine()
    with engine.begin() as conn:
        _apply_column_migrations(conn, "dailyentry", _DAILY_ENTRY_COLUMN_MIGRATIONS)
        _apply_column_migrations(conn, "dailyentry", _DAILY_ENTRY_COLUMN_MIGRATIONS)


def test_a_missing_table_is_left_to_create_all():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        _apply_column_migrations(conn, "dailyentry", _DAILY_ENTRY_COLUMN_MIGRATIONS)  # must not raise
