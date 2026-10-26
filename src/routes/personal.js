'use strict';
// Panel del personal (mozos / barra): recibe los llamados en tiempo real.
const express = require('express');
const { staffLoginPage, staffPanelPage } = require('../views/personal');
const { rateLimit, safeEqual } = require('../lib/security');
const { serializeCall } = require('./serialize');

function safeBack(value, fallback) {
  // Solo rutas internas (evita redirecciones a otros sitios).
  return typeof value === 'string' && /^\/(?!\/)/.test(value) ? value : fallback;
}

function personalRoutes({ repos, hub, config, sessions }) {
  const router = express.Router();
  const requireStaff = sessions.require('staff', '/personal/ingresar');
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    max: 10,
    message: 'Demasiados intentos. Espere 15 minutos.',
  });

  router.get('/personal/ingresar', (req, res) => {
    res.send(staffLoginPage({ back: req.query.volver }));
  });

  router.post('/personal/ingresar', loginLimiter, (req, res) => {
    if (!safeEqual(req.body.clave || '', config.staffPin)) {
      return res.status(401).send(staffLoginPage({ error: 'PIN incorrecto.', back: req.body.volver }));
    }
    sessions.start(res, 'staff');
    res.redirect(303, safeBack(req.body.volver, '/personal'));
  });

  router.post('/personal/salir', (_req, res) => {
    sessions.end(res);
    res.redirect(303, '/personal/ingresar');
  });

  router.get('/personal', requireStaff, (_req, res) => {
    res.send(staffPanelPage({ barName: repos.settings.barName() }));
  });

  const pendingCalls = () => repos.calls.pending().map(serializeCall);

  router.get('/api/personal/eventos', requireStaff, (req, res) => {
    hub.subscribe(req, res, { llamados: pendingCalls(), hora: new Date().toISOString() });
  });

  router.get('/api/personal/llamados', requireStaff, (_req, res) => {
    res.json({ llamados: pendingCalls(), hora: new Date().toISOString() });
  });

  router.post('/api/personal/llamados/:id/atendido', requireStaff, (req, res) => {
    const call = repos.calls.attend(Number(req.params.id));
    // Si otro mozo ya lo marcó, igual respondemos OK: el resultado es el mismo.
    if (call) hub.broadcast('resuelto', { id: call.id, estado: call.status });
    res.json({ ok: true });
  });

  return router;
}

module.exports = { personalRoutes, safeBack };
