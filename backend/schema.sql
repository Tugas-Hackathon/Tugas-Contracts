PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS users (
    address TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    google_tokens_ref TEXT
);

CREATE TABLE IF NOT EXISTS nonces (
    address TEXT NOT NULL,
    nonce TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (address)
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(address),
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(address),
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL REFERENCES subjects(id),
    user_id TEXT NOT NULL REFERENCES users(address),
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    mime TEXT NOT NULL,
    text TEXT,
    page_count INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL REFERENCES subjects(id),
    user_id TEXT NOT NULL REFERENCES users(address),
    kind TEXT NOT NULL CHECK(kind IN ('assignment','exam','project')),
    title TEXT NOT NULL,
    due_at INTEGER,
    targeted_topics TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    user_id TEXT NOT NULL REFERENCES users(address),
    title TEXT NOT NULL,
    draft_text TEXT,
    work_hash TEXT,
    context_hash TEXT,
    ai_assist_level INTEGER,
    chain_commit_id INTEGER,
    tx_hash TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    user_id TEXT NOT NULL REFERENCES users(address),
    answers TEXT NOT NULL,
    score REAL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS topic_mastery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    user_id TEXT NOT NULL REFERENCES users(address),
    topic TEXT NOT NULL,
    mastery REAL NOT NULL DEFAULT 0.0,
    interval INTEGER NOT NULL DEFAULT 1,
    ease REAL NOT NULL DEFAULT 2.5,
    due_at INTEGER,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(address),
    title TEXT NOT NULL,
    starts_at INTEGER NOT NULL,
    ends_at INTEGER,
    kind TEXT NOT NULL DEFAULT 'event'
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(address),
    raw TEXT NOT NULL,
    sender TEXT,
    sent_at INTEGER,
    kind TEXT,
    subject_guess TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(address),
    branch_id INTEGER REFERENCES branches(id),
    kind TEXT NOT NULL,
    to_channel TEXT NOT NULL DEFAULT 'inapp',
    payload TEXT NOT NULL,
    scheduled_for INTEGER NOT NULL,
    sent_at INTEGER,
    UNIQUE(branch_id, kind, scheduled_for)
);

CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(address),
    task TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    result TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS wa_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(address),
    subject_id INTEGER NOT NULL REFERENCES subjects(id),
    chat_id TEXT NOT NULL,
    chat_name TEXT NOT NULL,
    focus_sender TEXT,
    focus_sender_name TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(user_id, subject_id)
);

CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    user_id TEXT NOT NULL REFERENCES users(address),
    questions TEXT NOT NULL,
    study_plan TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(address),
    expires_at INTEGER NOT NULL
);
