CREATE TABLE status_pages (
  user_id    TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  slug       TEXT UNIQUE NOT NULL,
  title      TEXT NOT NULL,
  published  INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
