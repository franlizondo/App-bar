'use strict';
// Pruebas de integración: levantan la app real con una base en memoria.  Ejecutar: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createApp } = require('../src/app');
const { parsePrice, createPriceFormatter } = require('../src/lib/format');

const config = {
  isProduction: false,
  port: 0,
  dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bar-test-')),
  publicUrl: 'https://menu.ejemplo.com',
  barName: 'Bar de Prueba',
  adminPassword: 'clave-admin-123',
  staffPin: '9876',
  sessionSecret: 'x'.repeat(64),
  currency: 'ARS',
  locale: 'es-AR',
  callCooldownSeconds: 60,
  maxPhotoBytes: 1024 * 1024,
  trustProxy: false,
};

const { app, repos, db } = createApp(config, { dbPath: ':memory:' });
let server;
let base;
let table;

test.before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const cat = repos.menu.createCategory('Bebidas');
  repos.menu.createProduct({ category_id: cat, name: 'Café <b>', description: 'Rico', price_cents: 190000, photo: null, available: 1, visible: 1 });
  repos.menu.createProduct({ category_id: cat, name: 'Té', description: '', price_cents: 150000, photo: null, available: 0, visible: 1 });
  repos.menu.createProduct({ category_id: cat, name: 'Oculto', description: '', price_cents: 1, photo: null, available: 1, visible: 0 });
  table = repos.tables.byId(repos.tables.create('7'));
});

test.after(() => {
  server.closeAllConnections();
  server.close();
  db.close();
  fs.rmSync(config.dataDir, { recursive: true, force: true });
});

const post = (url, body, headers = {}) =>
  fetch(base + url, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const login = async (url, clave) => {
  const res = await fetch(base + url, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ clave }),
  });
  return { status: res.status, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
};

test('el QR abre el menú de la mesa, escapando HTML y marcando sin stock', async () => {
  const res = await fetch(`${base}/m/${table.token}`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Mesa 7/);
  assert.match(html, /Café &lt;b&gt;/, 'el nombre se escapa');
  assert.match(html, /\$\s1\.900/);
  assert.match(html, /SIN STOCK/);
  assert.doesNotMatch(html, /Oculto/);
  assert.match(html, /LLAMAR AL MOZO/);
  assert.match(html, /PEDIR LA CUENTA/);
});

test('un token inválido no muestra el menú', async () => {
  const res = await fetch(`${base}/m/token-falso`);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /no es válido/);
  const call = await post('/m/token-falso/llamar', { tipo: 'mozo' });
  assert.equal(call.status, 404);
});

test('llamar al mozo: avisa una vez, bloquea repetidos y llega al panel', async () => {
  const first = await (await post(`/m/${table.token}/llamar`, { tipo: 'mozo' })).json();
  assert.equal(first.nuevoAviso, true);
  const second = await (await post(`/m/${table.token}/llamar`, { tipo: 'mozo' })).json();
  assert.equal(second.nuevoAviso, false, 'el segundo toque no vuelve a avisar');
  assert.ok(second.esperar > 0 && second.esperar <= 60);

  const pending = repos.calls.pending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].table_label, '7');
});

test('pasado el bloqueo, volver a llamar cuenta como insistencia', () => {
  const later = new Date(Date.now() + 61_000);
  const result = repos.calls.register(table.id, 'mozo', 60, later);
  assert.equal(result.notify, true);
  assert.equal(result.call.repeat_count, 2);
});

test('tipo de llamado inválido es rechazado', async () => {
  const res = await post(`/m/${table.token}/llamar`, { tipo: 'cerveza' });
  assert.equal(res.status, 400);
});

test('formulario sin JavaScript redirige con confirmación', async () => {
  const res = await fetch(`${base}/m/${table.token}/llamar`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'tipo=cuenta',
  });
  assert.equal(res.status, 303);
  const page = await (await fetch(base + res.headers.get('location'))).text();
  assert.match(page, /Ya pedimos su cuenta/);
});

test('el cliente puede cancelar un llamado por error', async () => {
  await post(`/m/${table.token}/llamar`, { tipo: 'cuenta' });
  const res = await post(`/m/${table.token}/cancelar`, { tipo: 'cuenta' });
  assert.equal(res.status, 200);
  assert.ok(!repos.calls.pending().some((c) => c.type === 'cuenta'));
});

test('pedidos desde otro sitio son rechazados (CSRF)', async () => {
  const res = await post(`/m/${table.token}/llamar`, { tipo: 'mozo' }, { Origin: 'https://malicioso.com' });
  assert.equal(res.status, 403);
});

test('el panel del personal requiere PIN y recibe eventos en tiempo real', async () => {
  assert.equal((await fetch(`${base}/api/personal/llamados`)).status, 401);
  assert.equal((await login('/personal/ingresar', '0000')).status, 401);
  const { status, cookie } = await login('/personal/ingresar', config.staffPin);
  assert.equal(status, 303);

  // Conexión SSE: primero llega el estado completo y luego cada llamado nuevo.
  const events = [];
  const received = new Promise((resolve, reject) => {
    const req = http.get(`${base}/api/personal/eventos`, { headers: { Cookie: cookie } }, (res) => {
      assert.equal(res.headers['content-type'], 'text/event-stream; charset=utf-8');
      res.setEncoding('utf8');
      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk;
        const matches = buffer.match(/event: (\w+)/g) || [];
        events.splice(0, events.length, ...matches.map((m) => m.slice(7)));
        if (events.includes('snapshot') && events.length === 1) {
          const other = repos.tables.create('8');
          post(`/m/${repos.tables.byId(other).token}/llamar`, { tipo: 'cuenta' });
        }
        if (events.includes('llamado')) {
          req.destroy();
          resolve(buffer);
        }
      });
    });
    req.on('error', reject);
    setTimeout(() => reject(new Error('no llegó el evento en 2 s')), 2000);
  });
  const buffer = await received;
  assert.match(buffer, /"mesa":"8","tipo":"cuenta"/);

  const pending = await (await fetch(`${base}/api/personal/llamados`, { headers: { Cookie: cookie } })).json();
  const call = pending.llamados.find((c) => c.mesa === '8');
  const attended = await fetch(`${base}/api/personal/llamados/${call.id}/atendido`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  assert.equal(attended.status, 200);
  assert.ok(!repos.calls.pending().some((c) => c.id === call.id));
});

test('el PIN del personal no da acceso a la administración', async () => {
  const { cookie } = await login('/personal/ingresar', config.staffPin);
  const res = await fetch(`${base}/admin`, { headers: { Cookie: cookie }, redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /\/admin\/ingresar/);
});

test('administración: crear producto, marcar sin stock y generar QR', async () => {
  const { status, cookie } = await login('/admin/ingresar', config.adminPassword);
  assert.equal(status, 303);
  const headers = { Cookie: cookie };

  const form = new FormData();
  form.set('nombre', 'Medialuna');
  form.set('categoria', String(repos.menu.categories()[0].id));
  form.set('precio', '1.200,50');
  form.set('disponible', '1');
  form.set('visible', '1');
  const created = await fetch(`${base}/admin/productos`, { method: 'POST', headers, body: form, redirect: 'manual' });
  assert.equal(created.status, 303);
  const product = repos.menu.fullMenu()[0].products.find((p) => p.name === 'Medialuna');
  assert.equal(product.price_cents, 120050);

  const stock = await fetch(`${base}/admin/productos/${product.id}/stock`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'disponible=0',
    redirect: 'manual',
  });
  assert.equal(stock.status, 303);
  assert.equal(repos.menu.product(product.id).available, 0);

  const qr = await fetch(`${base}/admin/mesas/${table.id}/qr.png`, { headers });
  assert.equal(qr.headers.get('content-type'), 'image/png');
  assert.ok((await qr.arrayBuffer()).byteLength > 1000);

  const sheet = await (await fetch(`${base}/admin/mesas/imprimir`, { headers })).text();
  assert.match(sheet, /MESA 7/);
});

test('regenerar el QR invalida el anterior', async () => {
  const old = table.token;
  repos.tables.regenerateToken(table.id);
  assert.equal((await fetch(`${base}/m/${old}`)).status, 404);
  table = repos.tables.byId(table.id);
  assert.equal((await fetch(`${base}/m/${table.token}`)).status, 200);
});

test('precios: lectura y formato', () => {
  assert.equal(parsePrice('4500'), 450000);
  assert.equal(parsePrice('4.500'), 450000);
  assert.equal(parsePrice('4500,50'), 450050);
  assert.equal(parsePrice('$ 1.234,5'), 123450);
  assert.equal(parsePrice('abc'), null);
  assert.equal(parsePrice('-3'), null);
  const format = createPriceFormatter('es-AR', 'ARS');
  assert.match(format(450000), /4\.500$/);
  assert.match(format(450050), /4\.500,50$/);
});
