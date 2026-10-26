'use strict';
// Mesas y sus tokens. El token va dentro del QR: es lo que impide que alguien
// "adivine" la dirección de otra mesa y haga llamados falsos.
const crypto = require('node:crypto');

const newToken = () => crypto.randomBytes(12).toString('base64url'); // 16 caracteres, 96 bits

function createTablesRepo(db) {
  const stmts = {
    all: db.prepare('SELECT * FROM tables ORDER BY active DESC, CAST(label AS INTEGER), label'),
    byId: db.prepare('SELECT * FROM tables WHERE id = ?'),
    byToken: db.prepare('SELECT * FROM tables WHERE token = ? AND active = 1'),
    insert: db.prepare('INSERT INTO tables (label, token) VALUES (?, ?)'),
    rename: db.prepare('UPDATE tables SET label = ? WHERE id = ?'),
    setToken: db.prepare('UPDATE tables SET token = ? WHERE id = ?'),
    setActive: db.prepare('UPDATE tables SET active = ? WHERE id = ?'),
    remove: db.prepare('DELETE FROM tables WHERE id = ?'),
  };

  return {
    all: () => stmts.all.all(),
    byId: (id) => stmts.byId.get(id),
    byToken: (token) => (typeof token === 'string' && token.length <= 64 ? stmts.byToken.get(token) : undefined),
    create: (label) => stmts.insert.run(label, newToken()).lastInsertRowid,
    rename: (id, label) => stmts.rename.run(label, id),
    /** Invalida el QR anterior (por ejemplo, si alguien se lo llevó en una foto). */
    regenerateToken: (id) => stmts.setToken.run(newToken(), id),
    setActive: (id, active) => stmts.setActive.run(active ? 1 : 0, id),
    remove: (id) => stmts.remove.run(id),
  };
}

module.exports = { createTablesRepo };
