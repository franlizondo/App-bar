'use strict';
// Arma la aplicación Express. Separado de server.js para poder testearla.
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const compression = require('compression');

const { openDatabase } = require('./db');
const { createSettingsRepo } = require('./data/settings');
const { createMenuRepo } = require('./data/menu');
const { createTablesRepo } = require('./data/tables');
const { createCallsRepo } = require('./data/calls');
const { createRealtimeHub } = require('./lib/realtime');
const { createSessions, securityHeaders, sameOrigin } = require('./lib/security');
const { createPriceFormatter, html } = require('./lib/format');
const { page } = require('./views/layout');
const { clienteRoutes } = require('./routes/cliente');
const { personalRoutes } = require('./routes/personal');
const { adminRoutes } = require('./routes/admin');
const { serializeCall } = require('./routes/serialize');

function createApp(config, { dbPath } = {}) {
  const db = openDatabase(dbPath || config.dataDir);
  const uploadsDir = path.join(config.dataDir, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  const repos = {
    settings: createSettingsRepo(db, { barName: config.barName }),
    menu: createMenuRepo(db),
    tables: createTablesRepo(db),
    calls: createCallsRepo(db),
  };
  const hub = createRealtimeHub();
  const sessions = createSessions({ secret: config.sessionSecret, secure: config.isProduction });
  const formatPrice = createPriceFormatter(config.locale, config.currency);
  // Dirección completa del menú de una mesa (la que va en el QR).
  const menuUrl = (req) => {
    const base = config.publicUrl || `${req.protocol}://${req.get('host')}`;
    return (token) => `${base}/m/${token}`;
  };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(securityHeaders);
  app.use(compression());

  // Archivos estáticos. El service worker no se cachea para que las actualizaciones lleguen rápido.
  const publicDir = path.join(__dirname, '..', 'public');
  app.get('/sw.js', (_req, res) => {
    res.set('Cache-Control', 'no-cache').sendFile(path.join(publicDir, 'sw.js'));
  });
  app.use(express.static(publicDir, { maxAge: '1h', index: false }));
  // Las fotos tienen nombres aleatorios: si cambian, cambia el nombre. Se pueden cachear un año.
  app.use('/uploads', express.static(uploadsDir, { maxAge: '365d', immutable: true, index: false }));

  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  app.use(express.json({ limit: '10kb' }));
  app.use(sameOrigin);
  app.use(sessions.read);

  app.get('/salud', (_req, res) => res.json({ ok: true, paneles: hub.size }));

  app.get('/', (_req, res) => {
    res.send(
      page({
        title: repos.settings.barName(),
        css: ['/css/cliente.css'],
        bodyClass: 'cliente',
        body: html`<main class="menu menu--error">
          <h1 class="cabecera__mesa">${repos.settings.barName()}</h1>
          <p class="vacio">Para ver el menú, escanee con la cámara del celular el código QR que está en su mesa.</p>
        </main>`,
      })
    );
  });

  const deps = { repos, hub, config, sessions, formatPrice, uploadsDir, menuUrl };
  app.use(clienteRoutes(deps));
  app.use(personalRoutes(deps));
  app.use(adminRoutes(deps));

  app.use((_req, res) => {
    res.status(404).send(
      page({
        title: 'Página no encontrada',
        css: ['/css/cliente.css'],
        bodyClass: 'cliente',
        body: html`<main class="menu menu--error"><h1 class="cabecera__mesa">Página no encontrada</h1>
          <p class="vacio">Escanee el código QR de su mesa o pídale ayuda al mozo.</p></main>`,
      })
    );
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    console.error(err);
    if (res.headersSent) return;
    const status = err.status || err.statusCode || 500;
    const message = status < 500 ? 'Pedido inválido.' : 'Ocurrió un error. Intente de nuevo.';
    if (req.path.startsWith('/api/') || req.is('application/json')) return res.status(status).json({ error: message });
    res.status(status).type('text').send(message);
  });

  // Cierra llamados olvidados y borra historial viejo, una vez por hora.
  const housekeeping = setInterval(() => {
    if (repos.calls.housekeeping() > 0) hub.broadcast('snapshot', { llamados: repos.calls.pending().map(serializeCall) });
  }, 3600e3);
  housekeeping.unref();

  return { app, db, repos, hub };
}

module.exports = { createApp };
