-- Connexion par code à 6 chiffres (remplace le lien magique).
-- Le code n'est jamais stocké en clair : seule son empreinte (SHA-256 avec sel par ligne et secret serveur) l'est.
DROP TABLE IF EXISTS magic_tokens;

CREATE TABLE login_codes (
  id TEXT PRIMARY KEY,                 -- identifiant aléatoire, sert aussi de sel
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, -- essais faux ; bloqué à 5
  used_at INTEGER                      -- rempli quand le code a servi, a été remplacé ou bloqué
);
CREATE INDEX idx_login_codes_email ON login_codes (email, created_at);
