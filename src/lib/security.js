'use strict';
// Sesiones firmadas, verificación de claves, limitador de pedidos y cabeceras de seguridad.
// Todo en memoria y sin dependencias: suficiente para un solo servidor.
const crypto = require('node:crypto');

/* ---------- Sesiones (cookie firmada con HMAC, sin estado en el servidor) ---------- */

const COOKIE_NAME = 'sesion';

function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(value, secret) {
  if (typeof value !== 'string') return null;
  const [body, mac] = value.split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (!safeEqual(mac, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0) out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

/** Comparación en tiempo constante (evita ataques por medición de tiempos). */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function createSessions({ secret, secure }) {
  const DURATION = { admin: 12 * 3600e3, staff: 30 * 24 * 3600e3 }; // la tablet del personal queda logueada 30 días

  return {
    /** Middleware: deja la sesión (si existe) en req.session */
    read(req, _res, next) {
      req.session = verify(parseCookies(req.headers.cookie)[COOKIE_NAME], secret);
      next();
    },
    start(res, role) {
      const exp = Date.now() + DURATION[role];
      res.cookie(COOKIE_NAME, sign({ role, exp }, secret), {
        httpOnly: true,
        sameSite: 'lax',
        secure,
        path: '/',
        maxAge: DURATION[role],
      });
    },
    end(res) {
      res.clearCookie(COOKIE_NAME, { path: '/' });
    },
    /** El administrador también puede ver el panel del personal. */
    require(role, loginPath) {
      return (req, res, next) => {
        const current = req.session && req.session.role;
        if (current === role || current === 'admin') return next();
        if (req.accepts(['html', 'json']) === 'json' || req.path.startsWith('/api/')) {
          return res.status(401).json({ error: 'Sesión vencida. Vuelva a ingresar.' });
        }
        res.redirect(`${loginPath}?volver=${encodeURIComponent(req.originalUrl)}`);
      };
    },
  };
}

/* ---------- Limitador de pedidos (ventana fija, en memoria) ---------- */

function rateLimit({ windowMs, max, key = (req) => req.ip, message = 'Demasiados intentos. Espere un momento.' }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of hits) if (entry.reset <= now) hits.delete(k);
  }, windowMs);
  timer.unref();

  const middleware = (req, res, next) => {
    const now = Date.now();
    const k = key(req);
    let entry = hits.get(k);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(k, entry);
    }
    entry.count++;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).format({
        json: () => res.json({ error: message }),
        default: () => res.type('text').send(message),
      });
    }
    next();
  };
  middleware.reset = () => hits.clear();
  return middleware;
}

/* ---------- Cabeceras y protección CSRF ---------- */

function securityHeaders(_req, res, next) {
  res.set({
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; " +
      "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin', // el token de la mesa no se filtra a otros sitios
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  next();
}

/**
 * Rechaza pedidos que modifican datos si vienen de otro sitio (CSRF).
 * Complementa a la cookie SameSite=Lax.
 */
function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return next(); // navegadores antiguos o clientes sin cabecera: los cubre SameSite
  try {
    if (new URL(origin).host === req.headers.host) return next();
  } catch {
    /* origen inválido */
  }
  res.status(403).type('text').send('Origen no permitido.');
}

module.exports = { createSessions, rateLimit, securityHeaders, sameOrigin, safeEqual };
