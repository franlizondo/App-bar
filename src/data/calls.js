'use strict';
// Llamados de las mesas ("mozo" o "cuenta").

const CALL_TYPES = ['mozo', 'cuenta'];

function createCallsRepo(db) {
  const SELECT = `
    SELECT c.*, t.label AS table_label
    FROM calls c JOIN tables t ON t.id = c.table_id
  `;
  const stmts = {
    byId: db.prepare(`${SELECT} WHERE c.id = ?`),
    pending: db.prepare(`${SELECT} WHERE c.status = 'pendiente' ORDER BY c.created_at`),
    pendingFor: db.prepare(
      "SELECT * FROM calls WHERE table_id = ? AND type = ? AND status = 'pendiente' ORDER BY id DESC LIMIT 1"
    ),
    insert: db.prepare(
      "INSERT INTO calls (table_id, type, created_at, last_call_at) VALUES (?, ?, ?, ?)"
    ),
    repeat: db.prepare('UPDATE calls SET repeat_count = repeat_count + 1, last_call_at = ? WHERE id = ?'),
    resolve: db.prepare("UPDATE calls SET status = ?, resolved_at = ? WHERE id = ? AND status = 'pendiente'"),
    expire: db.prepare(
      "UPDATE calls SET status = 'atendido', resolved_at = ? WHERE status = 'pendiente' AND last_call_at < ?"
    ),
    purge: db.prepare("DELETE FROM calls WHERE status != 'pendiente' AND created_at < ?"),
  };

  return {
    /**
     * Registra un llamado. Si ya hay uno pendiente del mismo tipo:
     *  - dentro del tiempo de bloqueo: no hace nada (evita llamados repetidos)
     *  - pasado ese tiempo: cuenta como "insistencia" y vuelve a avisar al personal
     * Devuelve { call, notify, retryAfterSeconds }.
     */
    register(tableId, type, cooldownSeconds, now = new Date()) {
      return db.transaction(() => {
        const nowIso = now.toISOString();
        const existing = stmts.pendingFor.get(tableId, type);
        if (existing) {
          const elapsed = (now - new Date(existing.last_call_at)) / 1000;
          if (elapsed < cooldownSeconds) {
            return {
              call: stmts.byId.get(existing.id),
              notify: false,
              retryAfterSeconds: Math.ceil(cooldownSeconds - elapsed),
            };
          }
          stmts.repeat.run(nowIso, existing.id);
          return { call: stmts.byId.get(existing.id), notify: true, retryAfterSeconds: cooldownSeconds };
        }
        const id = stmts.insert.run(tableId, type, nowIso, nowIso).lastInsertRowid;
        return { call: stmts.byId.get(id), notify: true, retryAfterSeconds: cooldownSeconds };
      })();
    },
    /** El cliente se arrepintió (tocó "Cancelar"). */
    cancel(tableId, type) {
      const existing = stmts.pendingFor.get(tableId, type);
      if (!existing) return null;
      stmts.resolve.run('cancelado', new Date().toISOString(), existing.id);
      return stmts.byId.get(existing.id);
    },
    /** El mozo tocó "Atendido". Devuelve null si ya estaba resuelto. */
    attend(id) {
      const result = stmts.resolve.run('atendido', new Date().toISOString(), id);
      return result.changes ? stmts.byId.get(id) : null;
    },
    pending: () => stmts.pending.all(),
    /** Limpieza: llamados olvidados (más de 6 h) se cierran y se borra historial de más de 90 días. */
    housekeeping(now = new Date()) {
      const expired = stmts.expire.run(now.toISOString(), new Date(now - 6 * 3600e3).toISOString()).changes;
      stmts.purge.run(new Date(now - 90 * 24 * 3600e3).toISOString());
      return expired;
    },
  };
}

module.exports = { createCallsRepo, CALL_TYPES };
