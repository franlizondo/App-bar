'use strict';
const config = require('./config');
const { createApp } = require('./app');

const { app, db } = createApp(config);

const server = app.listen(config.port, () => {
  console.log(`Servidor listo en http://localhost:${config.port}`);
  console.log(`  Administración:      /admin`);
  console.log(`  Panel del personal:  /personal`);
  if (!config.isProduction) console.log('  (modo desarrollo: clave admin "admin-desarrollo", PIN "1234")');
});

// Las conexiones SSE quedan abiertas indefinidamente: no aplicar timeout de pedido.
server.requestTimeout = 0;
server.headersTimeout = 65_000;
server.keepAliveTimeout = 61_000;

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  server.closeAllConnections(); // corta las conexiones SSE para poder cerrar
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
