#!/usr/bin/env python3
"""Opt-in cleanup of the tables left behind by the old multi-feature app.

The app now uses exactly four tables: `user`, `dailyentry`, `chatconversation` and `chatmessage`. An older database file can still contain ~20 more
(goal, task, nextaction, dailylog, focussession, ...). The app never touches or drops them by itself - this project has
no Alembic - so nothing is lost until YOU run this script.

    python scripts/legacy_tables.py report  [--db app.db]
    python scripts/legacy_tables.py drop    [--db app.db] [--backup legacy-backup.json] [--yes]
    python scripts/legacy_tables.py restore --backup legacy-backup.json [--db app.db]

report   read-only: every table that is not one of the four live tables, with its row count. Tables with rows may hold
         user content (goal titles, tasks, notes, ...) and are marked.
drop     FIRST writes ALL rows and the CREATE statements (tables + indexes) of every legacy table to a JSON backup
         file and re-reads it to check the row counts, THEN drops the tables in one transaction. Without --yes it
         asks you to type DROP. The four live tables are never dropped.
restore  re-creates the tables from a backup file and inserts every row back. Refuses to touch a table that already
         exists.

Standard library only; SQLite only (the app's default and the only database the app's own column patches support).
Stop the app and copy the .db file before you run `drop`: that copy is your second safety net.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone

LIVE_TABLES = frozenset({"user", "dailyentry", "chatconversation", "chatmessage"})
BACKUP_FORMAT = 1


def _q(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _default_db() -> str:
    url = os.environ.get("DATABASE_URL", "sqlite:///./app.db")
    if not url.startswith("sqlite:///"):
        sys.exit(f"DATABASE_URL is not a SQLite URL ({url!r}). This script only supports SQLite; pass --db PATH.")
    return url[len("sqlite:///"):]


def _connect(path: str) -> sqlite3.Connection:
    if not os.path.isfile(path):
        sys.exit(f"database file not found: {path}")
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA foreign_keys=OFF")  # DROP/INSERT order must not matter between legacy tables
    return conn


def legacy_tables(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).fetchall()
    return [r[0] for r in rows if r[0] not in LIVE_TABLES]


def _count(conn: sqlite3.Connection, table: str) -> int:
    return conn.execute(f"SELECT COUNT(*) FROM {_q(table)}").fetchone()[0]


def _enc(v):
    return {"__b64__": base64.b64encode(v).decode("ascii")} if isinstance(v, (bytes, bytearray)) else v


def _dec(v):
    return base64.b64decode(v["__b64__"]) if isinstance(v, dict) and "__b64__" in v else v


def build_backup(conn: sqlite3.Connection, tables: list[str], source: str) -> dict:
    out: dict = {
        "format": BACKUP_FORMAT,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source": os.path.abspath(source),
        "tables": {},
    }
    for t in tables:
        create_sql = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (t,)).fetchone()[0]
        index_sql = [
            r[0]
            for r in conn.execute(
                "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL ORDER BY name", (t,)
            ).fetchall()
        ]
        cur = conn.execute(f"SELECT * FROM {_q(t)}")
        cols = [d[0] for d in cur.description]
        out["tables"][t] = {
            "create": create_sql,
            "indexes": index_sql,
            "columns": cols,
            "rows": [[_enc(v) for v in row] for row in cur.fetchall()],
        }
    return out


def cmd_report(args) -> int:
    conn = _connect(args.db)
    tables = legacy_tables(conn)
    if not tables:
        print("No legacy tables: the database only contains the live tables (or nothing).")
        return 0
    total = 0
    print(f"{'table':28s} rows")
    for t in tables:
        n = _count(conn, t)
        total += n
        print(f"{t:28s} {n:5d}{'   <- has rows: may hold user content' if n else ''}")
    print(f"\n{len(tables)} legacy tables, {total} rows in total. `drop` backs all of it up to JSON before dropping.")
    return 0


def cmd_drop(args) -> int:
    conn = _connect(args.db)
    tables = legacy_tables(conn)
    if not tables:
        print("Nothing to drop.")
        return 0
    counts = {t: _count(conn, t) for t in tables}
    backup_path = args.backup or f"legacy-backup-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}.json"
    if os.path.exists(backup_path):
        sys.exit(f"refusing to overwrite an existing backup: {backup_path}")

    backup = build_backup(conn, tables, args.db)
    with open(backup_path, "w", encoding="utf-8") as f:
        json.dump(backup, f, ensure_ascii=False)
    with open(backup_path, encoding="utf-8") as f:  # read it back: never drop on the strength of an unread file
        check = json.load(f)
    for t in tables:
        if len(check["tables"][t]["rows"]) != counts[t]:
            os.remove(backup_path)
            sys.exit(f"backup verification failed for {t}; nothing was dropped")
    print(f"Backup written and verified: {backup_path} ({sum(counts.values())} rows in {len(tables)} tables)")

    if not args.yes:
        if input("Type DROP to drop these tables from the database: ").strip() != "DROP":
            print("Aborted. Nothing was dropped (the backup file stays).")
            return 1
    with conn:  # one transaction: all or nothing
        for t in tables:
            conn.execute(f"DROP TABLE {_q(t)}")
    print(f"Dropped {len(tables)} tables. Undo with: python scripts/legacy_tables.py restore --backup {backup_path}")
    return 0


def cmd_restore(args) -> int:
    with open(args.backup, encoding="utf-8") as f:
        data = json.load(f)
    if data.get("format") != BACKUP_FORMAT:
        sys.exit("unknown backup format")
    conn = _connect(args.db)
    existing = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    clash = sorted(set(data["tables"]) & existing)
    if clash:
        sys.exit(f"refusing to restore: these tables already exist: {', '.join(clash)}")
    with conn:
        for t, spec in data["tables"].items():
            conn.execute(spec["create"])
            cols = ", ".join(_q(c) for c in spec["columns"])
            marks = ", ".join("?" for _ in spec["columns"])
            conn.executemany(
                f"INSERT INTO {_q(t)} ({cols}) VALUES ({marks})",
                [[_dec(v) for v in row] for row in spec["rows"]],
            )
            for ddl in spec["indexes"]:
                conn.execute(ddl)
    print(f"Restored {len(data['tables'])} tables, {sum(len(s['rows']) for s in data['tables'].values())} rows.")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("report", "drop", "restore"):
        s = sub.add_parser(name)
        s.add_argument("--db", default=None, help="path to the SQLite file (default: from DATABASE_URL, else ./app.db)")
        if name != "report":
            s.add_argument("--backup", default=None, required=(name == "restore"), help="JSON backup file")
        if name == "drop":
            s.add_argument("--yes", action="store_true", help="do not ask for confirmation")
    args = p.parse_args(argv)
    args.db = args.db or _default_db()
    return {"report": cmd_report, "drop": cmd_drop, "restore": cmd_restore}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
