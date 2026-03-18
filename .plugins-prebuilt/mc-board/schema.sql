-- mc-board schema — single source of truth
-- Used by: db.ts (runtime), install.sh (seed), web/src/lib/data.ts (queries)

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cards (
    id               TEXT PRIMARY KEY,
    title            TEXT NOT NULL,
    col              TEXT NOT NULL DEFAULT 'backlog',
    priority         TEXT NOT NULL DEFAULT 'medium',
    tags             TEXT NOT NULL DEFAULT '[]',
    project_id       TEXT,
    work_type        TEXT,
    linked_card_id   TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    problem_description  TEXT NOT NULL DEFAULT '',
    implementation_plan  TEXT NOT NULL DEFAULT '',
    acceptance_criteria  TEXT NOT NULL DEFAULT '',
    notes            TEXT NOT NULL DEFAULT '',
    review_notes     TEXT NOT NULL DEFAULT '',
    research         TEXT NOT NULL DEFAULT '',
    work_log         TEXT NOT NULL DEFAULT '[]',
    depends_on       TEXT NOT NULL DEFAULT '[]',
    verify_url       TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS card_history (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id  TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    col      TEXT NOT NULL,
    moved_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    slug          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'active',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    work_dir      TEXT NOT NULL DEFAULT '',
    github_repo   TEXT NOT NULL DEFAULT '',
    build_command TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS active_work (
    card_id      TEXT PRIMARY KEY,
    project_id   TEXT,
    title        TEXT NOT NULL,
    worker       TEXT NOT NULL,
    col          TEXT NOT NULL,
    picked_up_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pickup_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id    TEXT NOT NULL,
    project_id TEXT,
    title      TEXT NOT NULL DEFAULT '',
    worker     TEXT NOT NULL,
    col        TEXT NOT NULL DEFAULT '',
    action     TEXT NOT NULL,
    at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cards_col     ON cards(col);
CREATE INDEX IF NOT EXISTS idx_cards_project ON cards(project_id);
CREATE INDEX IF NOT EXISTS idx_history_card  ON card_history(card_id);
CREATE INDEX IF NOT EXISTS idx_pickup_log_at ON pickup_log(at);
