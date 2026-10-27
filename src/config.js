'use strict';
// Configuración centralizada. Lee variables de entorno (y el archivo .env si existe).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envFile);
}

const env = process.env;
const isProduction = env.NODE_ENV === 'production';

function required(name, fallbackForDev) {
  const value = env[name];
  if (value) return value;
  if (isProduction) {
    throw new Error(`Falta la variable de entorno ${name}. Revise el archivo .env`);
  }
  return fallbackForDev;
}

const config = {
  isProduction,
  port: Number(env.PORT) || 3000,
  dataDir: path.resolve(env.DATA_DIR || path.join(__dirname, '..', 'data')),
  publicUrl: (env.PUBLIC_URL || '').replace(/\/+$/, ''),
  barName: env.BAR_NAME || 'Mi Bar',
  adminPassword: required('ADMIN_PASSWORD', 'admin-desarrollo'),
  staffPin: required('STAFF_PIN', '1234'),
  // En desarrollo se genera un secreto aleatorio: las sesiones se pierden al reiniciar, lo cual es aceptable.
  sessionSecret: required('SESSION_SECRET', crypto.randomBytes(32).toString('hex')),
  currency: env.CURRENCY || 'ARS',
  locale: env.LOCALE || 'es-AR',
  timeZone: env.TZ || 'America/Argentina/Buenos_Aires',
  callCooldownSeconds: Number(env.CALL_COOLDOWN_SECONDS) || 60,
  maxPhotoBytes: 3 * 1024 * 1024,
  // Detrás de un proxy (Caddy, nginx, Render…) hay que confiar en él para conocer la IP real del cliente.
  // En desarrollo se confía solo en proxys de la misma PC (por ejemplo un túnel de Cloudflare),
  // así los QR salen con https y la dirección pública del túnel.
  trustProxy: env.TRUST_PROXY !== undefined ? parseTrustProxy(env.TRUST_PROXY) : isProduction ? 1 : 'loopback',
};

function parseTrustProxy(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

if (isProduction) {
  if (config.adminPassword.length < 10) throw new Error('ADMIN_PASSWORD debe tener al menos 10 caracteres.');
  if (!/^\d{4,}$/.test(config.staffPin)) throw new Error('STAFF_PIN debe tener al menos 4 dígitos.');
  if (config.sessionSecret.length < 32) throw new Error('SESSION_SECRET debe tener al menos 32 caracteres.');
  if (!config.publicUrl) throw new Error('Falta PUBLIC_URL: es la dirección que se imprime en los QR.');
}

module.exports = config;
