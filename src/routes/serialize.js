'use strict';
/** Forma pública de un llamado (lo que recibe el panel del personal). */
function serializeCall(call) {
  return {
    id: call.id,
    mesa: call.table_label,
    tipo: call.type,
    estado: call.status,
    veces: call.repeat_count,
    creado: call.created_at,
    ultimo: call.last_call_at,
  };
}

module.exports = { serializeCall };
