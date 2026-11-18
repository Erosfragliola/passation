-- Pièces du dossier (dépôt type Drive) : fichiers fournis par le dirigeant pour l'audit d'acquisition, rangés par
-- élément de la liste des pièces. Fichiers dans R2 sous dossiers/<id>/pieces/, effacés avec le dossier.
CREATE TABLE pieces (
  id TEXT PRIMARY KEY,
  dossier_id TEXT NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX pieces_dossier ON pieces (dossier_id, item_key);
