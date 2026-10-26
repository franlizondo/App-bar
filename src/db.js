'use strict';
// Conexión a SQLite y migraciones versionadas (PRAGMA user_version).
// Para agregar cambios al esquema en el futuro, sume un elemento al final de MIGRATIONS: nunca edite los anteriores.
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const MIGRATIONS = [
  // 1: esquema inicial
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE categories (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL,
    position   INTEGER NOT NULL DEFAULT 0,
    visible    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE products (
    id          INTEGER PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    photo       TEXT,                         -- nombre de archivo dentro de DATA_DIR/uploads
    available   INTEGER NOT NULL DEFAULT 1,   -- 0 = sin stock
    visible     INTEGER NOT NULL DEFAULT 1,   -- 0 = oculto del menú
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_products_category ON products(category_id, position);

  CREATE TABLE tables (
    id         INTEGER PRIMARY KEY,
    label      TEXT    NOT NULL UNIQUE,       -- lo que ve el cliente y el mozo: "5", "Terraza 2"
    token      TEXT    NOT NULL UNIQUE,       -- secreto que va dentro del QR
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE calls (
    id           INTEGER PRIMARY KEY,
    table_id     INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    type         TEXT    NOT NULL CHECK (type IN ('mozo', 'cuenta')),
    status       TEXT    NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'atendido', 'cancelado')),
    repeat_count INTEGER NOT NULL DEFAULT 1,  -- cuántas veces insistió la mesa mientras estaba pendiente
    created_at   TEXT    NOT NULL,            -- ISO 8601 UTC
    last_call_at TEXT    NOT NULL,
    resolved_at  TEXT
  );
  CREATE INDEX idx_calls_pending ON calls(status, created_at);
  CREATE INDEX idx_calls_table ON calls(table_id, type, status);
  `,
];

function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[version]);
      db.pragma(`user_version = ${version + 1}`);
    })();
  }
}

function openDatabase(dataDir) {
  let db;
  if (dataDir === ':memory:') {
    db = new Database(':memory:');
  } else {
    fs.mkdirSync(dataDir, { recursive: true });
    db = new Database(path.join(dataDir, 'bar.db'));
    db.pragma('journal_mode = WAL'); // lecturas concurrentes mientras se escribe
  }
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

module.exports = { openDatabase };
