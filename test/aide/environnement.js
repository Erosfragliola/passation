// Environnement de test : base D1 imitée par SQLite en mémoire (node:sqlite) avec la vraie migration,
// et faux bucket R2. Aucun service externe n'est appelé.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";

export function d1Memoire() {
  const db = new DatabaseSync(":memory:");
  const dossier = new URL("../../migrations/", import.meta.url);
  for (const f of readdirSync(dossier).filter((x) => x.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(f, dossier), "utf8"));
  const prepare = (sql) => {
    let params = [];
    const st = {
      bind: (...p) => { params = p; return st; },
      first: async () => db.prepare(sql).get(...params) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...params) }),
      run: async () => { const i = db.prepare(sql).run(...params); return { success: true, meta: { changes: i.changes } }; },
    };
    return st;
  };
  return {
    prepare,
    batch: async (stmts) => {
      db.exec("BEGIN");
      try { for (const s of stmts) await s.run(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
      return [];
    },
    sqlite: db,
  };
}

export function r2Memoire() {
  const objets = new Map();
  return {
    objets,
    put: async (k, v) => { objets.set(k, v); },
    get: async (k) => (objets.has(k) ? { body: objets.get(k) } : null),
    list: async ({ prefix = "" } = {}) => ({ objects: [...objets.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false }),
    delete: async (cles) => { for (const k of [].concat(cles)) objets.delete(k); },
  };
}
