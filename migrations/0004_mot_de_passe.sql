-- Account with a password (24/11/2026). The 6-digit code now verifies the address (sign-up, forgotten password,
-- first sign-in of an account created with a code only); the password opens the session.
-- Nothing is stored in clear: password = PBKDF2-SHA256 hash with a per-account salt; tickets and counters = SHA-256.

-- "pbkdf2-sha256$<iterations>$<salt base64>$<hash base64>"; NULL for accounts created before this migration
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN password_set_at INTEGER;

-- One-time ticket issued after a verified code, used to choose the password (15 min).
CREATE TABLE password_tickets (
  id_hash TEXT PRIMARY KEY,            -- SHA-256 of the ticket given to the browser
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX idx_password_tickets_email ON password_tickets (email);

-- Failed sign-ins: one row per account (email hash) and per IP hash. 5 failures → blocked for 15 minutes.
CREATE TABLE login_failures (
  cle TEXT PRIMARY KEY,                -- "compte:<hash>" or "ip:<hash>", never the address or the IP in clear
  echecs INTEGER NOT NULL DEFAULT 0,
  bloque_jusqua INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
