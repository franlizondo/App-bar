'use strict';
// Notificaciones en tiempo real hacia los paneles del personal con Server-Sent Events (SSE).
// SSE es una conexión HTTP normal que el servidor mantiene abierta: el navegador se
// reconecta solo si se corta, atraviesa proxys sin configuración especial y no necesita librerías.

function createRealtimeHub() {
  const clients = new Set();

  // Comentario cada 20 s para que proxys y routers no corten la conexión por inactividad.
  const heartbeat = setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
  }, 20_000);
  heartbeat.unref();

  return {
    /** Registra una conexión SSE. `snapshot` se envía al conectar (estado completo). */
    subscribe(req, res, snapshot) {
      res.set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // desactiva el buffer en nginx
      });
      res.flushHeaders();
      res.write('retry: 2000\n\n'); // si se corta, reintentar a los 2 s
      send(res, 'snapshot', snapshot);
      clients.add(res);
      req.on('close', () => clients.delete(res));
    },
    broadcast(event, data) {
      for (const res of clients) send(res, event, data);
    },
    get size() {
      return clients.size;
    },
  };
}

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  // compression() acumula datos; flush() los envía de inmediato.
  if (typeof res.flush === 'function') res.flush();
}

module.exports = { createRealtimeHub };
