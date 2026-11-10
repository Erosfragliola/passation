-- Schéma initial de Passation (voir PLAN.md §3).
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE magic_tokens (
  token_hash TEXT PRIMARY KEY,         -- SHA-256 du jeton, jamais le jeton en clair
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE dossiers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  siren TEXT,
  company_json TEXT,
  code_name TEXT,
  status TEXT NOT NULL DEFAULT 'en_cours',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_dossiers_user ON dossiers(user_id);

CREATE TABLE answers (
  dossier_id TEXT NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  data_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (dossier_id, step)
);

CREATE TABLE financials (
  dossier_id TEXT NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  field TEXT NOT NULL,
  value REAL,
  source TEXT NOT NULL CHECK (source IN ('inpi', 'dirigeant', 'liasse')),
  validated INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dossier_id, year, field)
);

CREATE TABLE adjustments (
  id TEXT PRIMARY KEY,
  dossier_id TEXT NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                   -- retraitement_ebe | decote | prime
  label TEXT NOT NULL,
  amount REAL,
  justification TEXT
);

CREATE TABLE valuations (
  id TEXT PRIMARY KEY,
  dossier_id TEXT REFERENCES dossiers(id) ON DELETE CASCADE,  -- NULL pour l'express anonyme
  kind TEXT NOT NULL CHECK (kind IN ('express', 'approfondie')),
  inputs_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  commentary TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  dossier_id TEXT NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  extracted_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  dossier_id TEXT NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('datapack', 'teaser', 'memo')),
  version INTEGER NOT NULL DEFAULT 1,
  r2_key TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE document_sections (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  content_md TEXT NOT NULL,
  edited_by_user INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_id, section_key)
);

CREATE TABLE checklist (
  dossier_id TEXT NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (dossier_id, item_key)
);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  dossier_id TEXT NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  tokens_in INTEGER,
  tokens_out INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_chat_dossier ON chat_messages(dossier_id, created_at);

CREATE TABLE usage_daily (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  messages INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE api_cache (
  key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);

CREATE TABLE rate_limits (
  bucket TEXT PRIMARY KEY,              -- ex. express:<empreinte IP>:<heure>
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
