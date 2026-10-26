'use strict';
// Ajustes editables desde el panel (clave/valor). Los valores por defecto vienen de config.

function createSettingsRepo(db, defaults) {
  const getStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const setStmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );

  return {
    get(key) {
      const row = getStmt.get(key);
      return row ? row.value : defaults[key];
    },
    set(key, value) {
      setStmt.run(key, String(value));
    },
    barName() {
      return this.get('barName');
    },
  };
}

module.exports = { createSettingsRepo };
