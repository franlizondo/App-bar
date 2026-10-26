'use strict';
// Rutas públicas: menú de la mesa y llamados al personal.
const express = require('express');
const { menuPage, invalidTablePage } = require('../views/cliente');
const { rateLimit } = require('../lib/security');
const { CALL_TYPES } = require('../data/calls');
const { serializeCall } = require('./serialize');

function clienteRoutes({ repos, hub, config, formatPrice }) {
  const router = express.Router();

  // Un mismo celular no puede disparar más de 12 acciones por minuto (protege contra abusos y scripts).
  const callLimiter = rateLimit({
    windowMs: 60_000,
    max: 12,
    message: 'Ya enviamos su aviso. Por favor, espere un momento.',
  });

  function findTable(req, res, next) {
    const table = repos.tables.byToken(req.params.token);
    if (!table) {
      if (req.method === 'GET') {
        return res.status(404).send(invalidTablePage(repos.settings.barName()));
      }
      return res.status(404).json({ error: 'Este código QR ya no es válido. Por favor, avise al mozo.' });
    }
    req.table = table;
    next();
  }

  const wantsJson = (req) => req.is('application/json') || req.accepts(['html', 'json']) === 'json';

  router.get('/m/:token', findTable, (req, res) => {
    // Confirmación para navegadores sin JavaScript (después de enviar el formulario).
    let status = null;
    const type = req.query.aviso;
    if (CALL_TYPES.includes(type)) status = { type, ok: true };
    if (req.query.error === 'espere') status = { ok: false, message: 'Ya enviamos su aviso. Por favor, espere un momento.' };

    res.set('Cache-Control', 'no-cache'); // siempre se revalida: los cambios de stock se ven al recargar
    res.send(
      menuPage({
        barName: repos.settings.barName(),
        table: req.table,
        menu: repos.menu.publicMenu(),
        formatPrice,
        token: req.params.token,
        status,
      })
    );
  });

  router.post('/m/:token/llamar', callLimiter, findTable, (req, res) => {
    const type = req.body && req.body.tipo;
    if (!CALL_TYPES.includes(type)) return res.status(400).json({ error: 'Pedido inválido.' });

    const { call, notify, retryAfterSeconds } = repos.calls.register(req.table.id, type, config.callCooldownSeconds);
    if (notify) hub.broadcast('llamado', serializeCall(call));

    if (wantsJson(req)) {
      return res.json({ ok: true, tipo: type, avisado: true, nuevoAviso: notify, esperar: retryAfterSeconds });
    }
    res.redirect(303, `/m/${encodeURIComponent(req.params.token)}?aviso=${type}#acciones`);
  });

  router.post('/m/:token/cancelar', callLimiter, findTable, (req, res) => {
    const type = req.body && req.body.tipo;
    if (!CALL_TYPES.includes(type)) return res.status(400).json({ error: 'Pedido inválido.' });
    const call = repos.calls.cancel(req.table.id, type);
    if (call) hub.broadcast('resuelto', { id: call.id, estado: call.status });
    res.json({ ok: true });
  });

  return router;
}

module.exports = { clienteRoutes };
