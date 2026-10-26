'use strict';
const config = require('./config');
const { createApp } = require('./app');

const { app, db } = createApp(config);

const server = app.listen(config.port, (err) => {
  if (err) return; // Express 5 pasa el error aquí; se informa en server.on('error')
  console.log(`Servidor listo en http://localhost:${config.port}`);
  console.log(`  Administración:      /admin`);
  console.log(`  Panel del personal:  /personal`);
  if (!config.isProduction) console.log('  (modo desarrollo: clave admin "admin-desarrollo", PIN "1234")');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nERROR: el puerto ${config.port} ya está en uso.`);
    console.error('Probablemente la aplicación ya está abierta en otra ventana: use esa, o ciérrela y vuelva a intentar.');
    console.error(`(También puede usar otro puerto cambiando PORT en el archivo .env)\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
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
