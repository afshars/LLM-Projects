"""backend/scripts/legacy_tables.py: report / drop (with JSON backup) / restore of the pre-simplification tables.

Standard library only: the script and this test need neither the app nor a database server."""
import importlib.util
import json
import sqlite3
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "legacy_tables.py"
_spec = importlib.util.spec_from_file_location("legacy_tables", _SCRIPT)
lt = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(lt)


@pytest.fixture()
def old_db(tmp_path):
    path = tmp_path / "old.db"
    c = sqlite3.connect(path)
    c.executescript(
        """
        CREATE TABLE user (id INTEGER PRIMARY KEY, username TEXT);
        CREATE TABLE dailyentry (id INTEGER PRIMARY KEY, user_id INTEGER, highlight TEXT);
        INSERT INTO user VALUES (1, 'ali');
        INSERT INTO dailyentry VALUES (1, 1, 'write');
        CREATE TABLE goal (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES user(id), title TEXT NOT NULL, b BLOB);
        CREATE INDEX ix_goal_user ON goal(user_id);
        CREATE TABLE focussession (id INTEGER PRIMARY KEY, note TEXT);
        INSERT INTO goal VALUES (1, 1, 'Learn "quoted" \u0641\u0627\u0631\u0633\u06cc', x'00ff10');
        INSERT INTO goal VALUES (2, 1, 'second', NULL);
        """
    )
    c.commit()
    c.close()
    return path


def _dump(path):
    c = sqlite3.connect(path)
    names = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
    data = {n: c.execute(f'SELECT * FROM "{n}" ORDER BY 1').fetchall() for n in names}
    idx = sorted(r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL"))
    c.close()
    return data, idx


def test_report_never_lists_the_live_tables(old_db):
    conn = sqlite3.connect(old_db)
    assert lt.legacy_tables(conn) == ["focussession", "goal"]


def test_drop_writes_a_verified_backup_then_drops_only_legacy_tables(old_db, tmp_path):
    backup = tmp_path / "b.json"
    assert lt.main(["drop", "--db", str(old_db), "--backup", str(backup), "--yes"]) == 0
    saved = json.loads(backup.read_text(encoding="utf-8"))
    assert len(saved["tables"]["goal"]["rows"]) == 2
    data, _ = _dump(old_db)
    assert sorted(data) == ["dailyentry", "user"]
    assert data["user"] == [(1, "ali")] and data["dailyentry"] == [(1, 1, "write")]


def test_drop_without_confirmation_keeps_the_tables(old_db, tmp_path, monkeypatch):
    monkeypatch.setattr("builtins.input", lambda _prompt="": "no")
    assert lt.main(["drop", "--db", str(old_db), "--backup", str(tmp_path / "b.json")]) == 1
    assert sorted(_dump(old_db)[0]) == ["dailyentry", "focussession", "goal", "user"]


def test_restore_brings_back_every_row_index_and_blob(old_db, tmp_path):
    before = _dump(old_db)
    backup = tmp_path / "b.json"
    lt.main(["drop", "--db", str(old_db), "--backup", str(backup), "--yes"])
    assert lt.main(["restore", "--db", str(old_db), "--backup", str(backup)]) == 0
    assert _dump(old_db) == before


def test_restore_refuses_when_a_table_already_exists(old_db, tmp_path):
    backup = tmp_path / "b.json"
    lt.main(["drop", "--db", str(old_db), "--backup", str(backup), "--yes"])
    lt.main(["restore", "--db", str(old_db), "--backup", str(backup)])
    with pytest.raises(SystemExit):
        lt.main(["restore", "--db", str(old_db), "--backup", str(backup)])


def test_an_existing_backup_file_is_never_overwritten(old_db, tmp_path):
    backup = tmp_path / "b.json"
    backup.write_text("keep me")
    with pytest.raises(SystemExit):
        lt.main(["drop", "--db", str(old_db), "--backup", str(backup), "--yes"])
    assert backup.read_text() == "keep me"
