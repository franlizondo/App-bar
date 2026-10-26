'use strict';
// Panel de administración: menú, stock, mesas, QR y configuración.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const views = require('../views/admin');
const { loginPage } = require('../views/personal');
const { rateLimit, safeEqual } = require('../lib/security');
const { parsePrice } = require('../lib/format');
const { safeBack } = require('./personal');

/** Detecta el tipo real de imagen por sus primeros bytes (no confiamos en la extensión). */
function imageExtension(buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function adminRoutes({ repos, config, sessions, uploadsDir, menuUrl, formatPrice }) {
  const router = express.Router();
  const requireAdmin = sessions.require('admin', '/admin/ingresar');
  const loginLimiter = rateLimit({ windowMs: 15 * 60_000, max: 10, message: 'Demasiados intentos. Espere 15 minutos.' });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxPhotoBytes, files: 1, fields: 20 },
  }).single('foto');

  const id = (req) => Number(req.params.id);
  const text = (value, max) => String(value ?? '').trim().slice(0, max);

  /* ---------- Ingreso ---------- */

  const adminLogin = (props) =>
    loginPage({
      title: 'Administración',
      action: '/admin/ingresar',
      label: 'Contraseña',
      inputType: 'password',
      inputMode: 'text',
      autocomplete: 'current-password',
      ...props,
    });

  router.get('/admin/ingresar', (req, res) => res.send(adminLogin({ back: req.query.volver })));

  router.post('/admin/ingresar', loginLimiter, (req, res) => {
    if (!safeEqual(req.body.clave || '', config.adminPassword)) {
      return res.status(401).send(adminLogin({ error: 'Contraseña incorrecta.', back: req.body.volver }));
    }
    sessions.start(res, 'admin');
    res.redirect(303, safeBack(req.body.volver, '/admin'));
  });

  router.post('/admin/salir', (_req, res) => {
    sessions.end(res);
    res.redirect(303, '/admin/ingresar');
  });

  // Todo lo que sigue requiere sesión de administrador.
  router.use('/admin', requireAdmin);

  /* ---------- Menú: categorías ---------- */

  router.get('/admin', (req, res) => {
    res.send(views.menuPage({ menu: repos.menu.fullMenu(), formatPrice, msg: req.query.msg }));
  });

  router.post('/admin/categorias', (req, res) => {
    const name = text(req.body.nombre, 60);
    if (name) repos.menu.createCategory(name);
    res.redirect(303, '/admin?msg=creado');
  });

  router.post('/admin/categorias/:id', (req, res) => {
    const name = text(req.body.nombre, 60);
    if (name) repos.menu.updateCategory(id(req), { name, visible: req.body.visible === '1' });
    res.redirect(303, `/admin?msg=guardado#cat-${id(req)}`);
  });

  router.post('/admin/categorias/:id/mover', (req, res) => {
    repos.menu.moveCategory(id(req), Number(req.body.direccion) < 0 ? -1 : 1);
    res.redirect(303, `/admin#cat-${id(req)}`);
  });

  router.post('/admin/categorias/:id/borrar', (req, res) => {
    const category = repos.menu.fullMenu().find((c) => c.id === id(req));
    if (category) {
      category.products.forEach((p) => removePhoto(p.photo));
      repos.menu.deleteCategory(category.id);
    }
    res.redirect(303, '/admin?msg=borrado');
  });

  /* ---------- Menú: productos ---------- */

  router.get('/admin/productos/nuevo', (_req, res) => {
    res.send(views.productFormPage({ categories: repos.menu.categories() }));
  });

  router.get('/admin/productos/:id', (req, res) => {
    const product = repos.menu.product(id(req));
    if (!product) return res.redirect(303, '/admin');
    res.send(views.productFormPage({ product, categories: repos.menu.categories() }));
  });

  router.post('/admin/productos', withUpload, (req, res) => {
    const data = readProductForm(req);
    if (data.error) return showFormError(req, res, null, data.error);
    data.photo = savePhoto(req.file);
    repos.menu.createProduct(data);
    res.redirect(303, `/admin?msg=creado#cat-${data.category_id}`);
  });

  router.post('/admin/productos/:id', withUpload, (req, res) => {
    const product = repos.menu.product(id(req));
    if (!product) return res.redirect(303, '/admin');
    const data = readProductForm(req);
    if (data.error) return showFormError(req, res, product, data.error);

    data.photo = product.photo;
    if (req.file || req.body.quitar_foto === '1') {
      removePhoto(product.photo);
      data.photo = savePhoto(req.file);
    }
    repos.menu.updateProduct(product.id, data);
    res.redirect(303, `/admin?msg=guardado#cat-${data.category_id}`);
  });

  router.post('/admin/productos/:id/stock', (req, res) => {
    const product = repos.menu.product(id(req));
    if (product) repos.menu.setAvailable(product.id, req.body.disponible === '1');
    res.redirect(303, `/admin?msg=guardado#cat-${product ? product.category_id : ''}`);
  });

  router.post('/admin/productos/:id/mover', (req, res) => {
    const product = repos.menu.product(id(req));
    repos.menu.moveProduct(id(req), Number(req.body.direccion) < 0 ? -1 : 1);
    res.redirect(303, `/admin#cat-${product ? product.category_id : ''}`);
  });

  router.post('/admin/productos/:id/borrar', (req, res) => {
    const product = repos.menu.product(id(req));
    if (product) {
      removePhoto(product.photo);
      repos.menu.deleteProduct(product.id);
    }
    res.redirect(303, '/admin?msg=borrado');
  });

  function withUpload(req, res, next) {
    upload(req, res, (err) => {
      if (!err) return next();
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `La foto es demasiado grande (máximo ${Math.round(config.maxPhotoBytes / 1024 / 1024)} MB).`
          : 'No se pudo subir la foto.';
      req.file = undefined;
      const product = req.params.id ? repos.menu.product(id(req)) : null;
      showFormError(req, res, product, message);
    });
  }

  function readProductForm(req) {
    const b = req.body || {};
    const name = text(b.nombre, 80);
    const categoryId = Number(b.categoria);
    const price = parsePrice(b.precio);
    if (!name) return { error: 'Falta el nombre del producto.' };
    if (!repos.menu.category(categoryId)) return { error: 'Elija una categoría.' };
    if (price === null) return { error: 'El precio no es válido. Escriba solo números, por ejemplo 4500 o 4500,50.' };
    if (req.file && !imageExtension(req.file.buffer)) return { error: 'La foto debe ser JPG, PNG o WEBP.' };
    return {
      category_id: categoryId,
      name,
      description: text(b.descripcion, 200),
      price_cents: price,
      available: b.disponible === '1' ? 1 : 0,
      visible: b.visible === '1' ? 1 : 0,
    };
  }

  function showFormError(req, res, product, error) {
    res.status(400).send(
      views.productFormPage({ product, categories: repos.menu.categories(), error, values: req.body || {} })
    );
  }

  function savePhoto(file) {
    if (!file) return null;
    const ext = imageExtension(file.buffer);
    if (!ext) return null;
    const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(uploadsDir, name), file.buffer);
    return name;
  }

  function removePhoto(name) {
    if (!name || !/^[a-f0-9]+\.(jpg|png|webp)$/.test(name)) return;
    fs.rm(path.join(uploadsDir, name), { force: true }, () => {});
  }

  /* ---------- Mesas y QR ---------- */

  const tableError = (err) =>
    err && err.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'Ya existe una mesa con ese nombre.' : 'No se pudo guardar.';

  router.get('/admin/mesas', (req, res) => {
    res.send(views.tablesPage({ tables: repos.tables.all(), menuUrl: menuUrl(req), msg: req.query.msg }));
  });

  router.post('/admin/mesas', (req, res) => {
    const label = text(req.body.nombre, 30);
    try {
      if (label) repos.tables.create(label);
      res.redirect(303, '/admin/mesas?msg=creado');
    } catch (err) {
      res.status(400).send(views.tablesPage({ tables: repos.tables.all(), menuUrl: menuUrl(req), error: tableError(err) }));
    }
  });

  router.post('/admin/mesas/varias', (req, res) => {
    const from = Math.max(1, Number(req.body.desde) || 0);
    const to = Math.min(999, Number(req.body.hasta) || 0);
    const existing = new Set(repos.tables.all().map((t) => t.label));
    for (let n = from; n <= to && to - from < 200; n++) {
      if (!existing.has(String(n))) repos.tables.create(String(n));
    }
    res.redirect(303, '/admin/mesas?msg=mesas');
  });

  router.post('/admin/mesas/:id', (req, res) => {
    const label = text(req.body.nombre, 30);
    try {
      if (label) repos.tables.rename(id(req), label);
      res.redirect(303, '/admin/mesas?msg=guardado');
    } catch (err) {
      res.status(400).send(views.tablesPage({ tables: repos.tables.all(), menuUrl: menuUrl(req), error: tableError(err) }));
    }
  });

  router.post('/admin/mesas/:id/nuevo-qr', (req, res) => {
    repos.tables.regenerateToken(id(req));
    res.redirect(303, '/admin/mesas?msg=qr');
  });

  router.post('/admin/mesas/:id/activa', (req, res) => {
    repos.tables.setActive(id(req), req.body.activa === '1');
    res.redirect(303, '/admin/mesas?msg=guardado');
  });

  router.post('/admin/mesas/:id/borrar', (req, res) => {
    repos.tables.remove(id(req));
    res.redirect(303, '/admin/mesas?msg=borrado');
  });

  // Corrección de errores "Q" (25 %): el QR sigue funcionando aunque se manche o raye un poco.
  const QR_OPTIONS = { errorCorrectionLevel: 'Q', margin: 2, color: { dark: '#000000', light: '#ffffff' } };

  router.get('/admin/mesas/:id/qr.png', async (req, res) => {
    const table = repos.tables.byId(id(req));
    if (!table) return res.sendStatus(404);
    const png = await QRCode.toBuffer(menuUrl(req)(table.token), { ...QR_OPTIONS, width: 1024 });
    res.type('png').set('Cache-Control', 'private, no-cache');
    if (req.query.descargar) res.attachment(`qr-mesa-${table.label.replace(/[^\w-]+/g, '_')}.png`);
    res.send(png);
  });

  router.get('/admin/mesas/imprimir', async (req, res) => {
    const tables = repos.tables.all().filter((t) => t.active);
    const toUrl = menuUrl(req);
    const cards = await Promise.all(
      tables.map(async (t) => ({
        label: t.label,
        dataUrl: await QRCode.toDataURL(toUrl(t.token), { ...QR_OPTIONS, width: 600 }),
      }))
    );
    res.send(views.printPage({ barName: repos.settings.barName(), cards }));
  });

  /* ---------- Configuración ---------- */

  router.get('/admin/configuracion', (req, res) => {
    res.send(
      views.settingsPage({
        barName: repos.settings.barName(),
        staffUrl: `${menuUrl(req)('').replace(/\/m\/$/, '')}/personal`,
        msg: req.query.msg,
      })
    );
  });

  router.post('/admin/configuracion', (req, res) => {
    const name = text(req.body.nombre_bar, 60);
    if (name) repos.settings.set('barName', name);
    res.redirect(303, '/admin/configuracion?msg=guardado');
  });

  return router;
}

module.exports = { adminRoutes, imageExtension };
