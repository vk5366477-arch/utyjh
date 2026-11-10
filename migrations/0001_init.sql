-- Quantica Digital — D1 schema (replaces Prisma SQLite)
-- Run with: wrangler d1 execute quantica-digital --file=migrations/0001_init.sql

CREATE TABLE IF NOT EXISTS WatchHistory (
  id           TEXT PRIMARY KEY,
  userId       TEXT NOT NULL DEFAULT 'local',
  batchId      TEXT NOT NULL,
  batchName    TEXT NOT NULL DEFAULT '',
  batchImage   TEXT,
  subjectId    TEXT NOT NULL DEFAULT '',
  subjectName  TEXT NOT NULL DEFAULT '',
  subjectSlug  TEXT NOT NULL,
  topicId      TEXT,
  topicName    TEXT,
  contentId    TEXT NOT NULL,
  lectureTitle TEXT NOT NULL,
  videoId      TEXT,
  videoType    TEXT NOT NULL DEFAULT 'youtube',
  thumbnail    TEXT,
  duration     TEXT,
  positionSec  INTEGER NOT NULL DEFAULT 0,
  watchedAt    TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(userId, contentId)
);
CREATE INDEX IF NOT EXISTS idx_history_user_watched ON WatchHistory(userId, watchedAt);

CREATE TABLE IF NOT EXISTS Bookmark (
  id           TEXT PRIMARY KEY,
  userId       TEXT NOT NULL DEFAULT 'local',
  kind         TEXT NOT NULL DEFAULT 'lecture',
  batchId      TEXT NOT NULL,
  batchName    TEXT NOT NULL DEFAULT '',
  subjectName  TEXT,
  contentId    TEXT NOT NULL,
  title        TEXT NOT NULL,
  subtitle     TEXT,
  url          TEXT,
  urlType      TEXT,
  thumbnail    TEXT,
  createdAt    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(userId, kind, contentId)
);
CREATE INDEX IF NOT EXISTS idx_bookmark_user_created ON Bookmark(userId, createdAt);

CREATE TABLE IF NOT EXISTS CatalogCache (
  id        TEXT PRIMARY KEY DEFAULT 'batches',
  payload   TEXT NOT NULL,
  fetchedAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS VideoNote (
  id          TEXT PRIMARY KEY,
  userId      TEXT NOT NULL DEFAULT 'local',
  contentId   TEXT NOT NULL,
  batchId     TEXT NOT NULL,
  subjectSlug TEXT NOT NULL DEFAULT '',
  timestamp   INTEGER NOT NULL DEFAULT 0,
  text        TEXT NOT NULL,
  createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vnote_user_content ON VideoNote(userId, contentId);
CREATE INDEX IF NOT EXISTS idx_vnote_user_content_ts ON VideoNote(userId, contentId, timestamp);

CREATE TABLE IF NOT EXISTS Doubt (
  id          TEXT PRIMARY KEY,
  userId      TEXT NOT NULL DEFAULT 'local',
  userName    TEXT NOT NULL DEFAULT 'Learner',
  contentId   TEXT NOT NULL,
  batchId     TEXT NOT NULL,
  subjectSlug TEXT NOT NULL DEFAULT '',
  timestamp   INTEGER NOT NULL DEFAULT 0,
  text        TEXT NOT NULL,
  replyToId   TEXT,
  createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_doubt_content_created ON Doubt(contentId, createdAt);
CREATE INDEX IF NOT EXISTS idx_doubt_reply ON Doubt(replyToId);

CREATE TABLE IF NOT EXISTS PracticeAttempt (
  id        TEXT PRIMARY KEY,
  userId    TEXT NOT NULL DEFAULT 'local',
  contentId TEXT NOT NULL,
  batchId   TEXT NOT NULL,
  questions TEXT NOT NULL DEFAULT '[]',
  score     INTEGER NOT NULL DEFAULT 0,
  total     INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_practice_user_content ON PracticeAttempt(userId, contentId);

CREATE TABLE IF NOT EXISTS DownloadCache (
  id           TEXT PRIMARY KEY,
  userId       TEXT NOT NULL DEFAULT 'local',
  contentId    TEXT NOT NULL,
  batchId      TEXT NOT NULL,
  lectureTitle TEXT NOT NULL DEFAULT '',
  kind         TEXT NOT NULL,
  url          TEXT NOT NULL DEFAULT '',
  fileSize     INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending',
  filePath     TEXT,
  createdAt    TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(userId, contentId, kind)
);
CREATE INDEX IF NOT EXISTS idx_download_user_status ON DownloadCache(userId, status);
