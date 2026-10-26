'use strict';
// Panel de administración. Formularios HTML comunes: funcionan en cualquier celular o computadora.
const { html, priceInputValue } = require('../lib/format');
const { page } = require('./layout');

const MESSAGES = {
  guardado: 'Cambios guardados.',
  creado: 'Creado correctamente.',
  borrado: 'Eliminado.',
  qr: 'Se generó un QR nuevo. El anterior ya no funciona: imprima y reemplace el de la mesa.',
  mesas: 'Mesas creadas.',
};

function layout({ title, active, body, msg, error }) {
  const links = [
    ['menu', '/admin', 'Menú'],
    ['mesas', '/admin/mesas', 'Mesas y QR'],
    ['config', '/admin/configuracion', 'Configuración'],
    ['personal', '/personal', 'Panel de mozos'],
  ];
  return page({
    title: `${title} · Administración`,
    css: ['/css/admin.css'],
    js: ['/js/admin.js'],
    bodyClass: 'admin',
    body: html`
    <header class="admin__cabecera">
      <nav aria-label="Secciones de administración">
        <ul class="admin__nav">
          ${links.map(
            ([key, href, label]) =>
              html`<li><a href="${href}" ${key === active ? html`aria-current="page"` : ''}>${label}</a></li>`
          )}
          <li><form method="post" action="/admin/salir"><button type="submit" class="link">Salir</button></form></li>
        </ul>
      </nav>
    </header>
    <main class="admin__contenido">
      <h1>${title}</h1>
      ${msg && MESSAGES[msg] ? html`<p class="alerta alerta--ok" role="status">${MESSAGES[msg]}</p>` : ''}
      ${error ? html`<p class="alerta alerta--error" role="alert">${error}</p>` : ''}
      ${body}
    </main>`,
  });
}

function menuPage({ menu, formatPrice, msg, error }) {
  const body = html`
  <p class="ayuda">Toque <strong>“Sin stock”</strong> cuando se acabe algo: el cliente ve el aviso “SIN STOCK” en el menú.</p>

  <section class="tarjeta">
    <h2>Agregar</h2>
    <div class="fila-acciones">
      <a class="btn btn--primario" href="/admin/productos/nuevo">+ Nuevo producto</a>
    </div>
    <form method="post" action="/admin/categorias" class="form-linea">
      <label for="nueva-cat">Nueva categoría</label>
      <input id="nueva-cat" name="nombre" required maxlength="60" placeholder="Ej: Bebidas sin alcohol">
      <button type="submit" class="btn">Agregar categoría</button>
    </form>
  </section>

  ${menu.length === 0 ? html`<p>Todavía no hay categorías. Empiece creando una (por ejemplo “Bebidas”).</p>` : ''}

  ${menu.map(
    (cat, i) => html`
  <section class="tarjeta categoria-admin${cat.visible ? '' : ' es-oculto'}" id="cat-${cat.id}">
    <div class="categoria-admin__cabecera">
      <h2>${cat.name}${cat.visible ? '' : html` <span class="etiqueta">Oculta</span>`}</h2>
      <div class="fila-acciones">
        ${moveButtons(`/admin/categorias/${cat.id}/mover`, i, menu.length, cat.name)}
      </div>
    </div>
    <details class="editar-cat">
      <summary>Editar categoría</summary>
      <form method="post" action="/admin/categorias/${cat.id}" class="form-linea">
        <label for="cat-nombre-${cat.id}">Nombre</label>
        <input id="cat-nombre-${cat.id}" name="nombre" value="${cat.name}" required maxlength="60">
        <label class="check"><input type="checkbox" name="visible" value="1" ${cat.visible ? 'checked' : ''}> Mostrar en el menú</label>
        <button type="submit" class="btn">Guardar</button>
      </form>
      <form method="post" action="/admin/categorias/${cat.id}/borrar" data-confirmar="¿Borrar la categoría “${cat.name}” y TODOS sus productos?">
        <button type="submit" class="btn btn--peligro">Borrar categoría</button>
      </form>
    </details>

    ${cat.products.length === 0 ? html`<p class="ayuda">Sin productos.</p>` : ''}
    <ul class="lista-productos">
      ${cat.products.map(
        (p, j) => html`
      <li class="producto-admin${p.available ? '' : ' es-agotado'}${p.visible ? '' : ' es-oculto'}">
        ${p.photo ? html`<img src="/uploads/${p.photo}" alt="" width="64" height="64" loading="lazy">` : html`<span class="sin-foto" aria-hidden="true"></span>`}
        <div class="producto-admin__info">
          <strong>${p.name}</strong>
          <span>${formatPrice(p.price_cents)}</span>
          ${p.available ? '' : html`<span class="etiqueta etiqueta--agotado">Sin stock</span>`}
          ${p.visible ? '' : html`<span class="etiqueta">Oculto</span>`}
        </div>
        <div class="producto-admin__acciones">
          <form method="post" action="/admin/productos/${p.id}/stock">
            <input type="hidden" name="disponible" value="${p.available ? '0' : '1'}">
            <button type="submit" class="btn ${p.available ? 'btn--alerta' : 'btn--exito'}">
              ${p.available ? 'Sin stock' : 'Hay stock'}<span class="visualmente-oculto">: ${p.name}</span>
            </button>
          </form>
          <a class="btn" href="/admin/productos/${p.id}">Editar<span class="visualmente-oculto"> ${p.name}</span></a>
          ${moveButtons(`/admin/productos/${p.id}/mover`, j, cat.products.length, p.name)}
        </div>
      </li>`
      )}
    </ul>
  </section>`
  )}`;
  return layout({ title: 'Menú', active: 'menu', body, msg, error });
}

function moveButtons(action, index, total, name) {
  return html`
  <form method="post" action="${action}" class="mover">
    <button type="submit" name="direccion" value="-1" class="btn btn--chico" ${index === 0 ? 'disabled' : ''}>↑<span class="visualmente-oculto"> Subir ${name}</span></button>
    <button type="submit" name="direccion" value="1" class="btn btn--chico" ${index === total - 1 ? 'disabled' : ''}>↓<span class="visualmente-oculto"> Bajar ${name}</span></button>
  </form>`;
}

function productFormPage({ product, categories, error, values }) {
  const isNew = !product;
  const v = values || product || { available: 1, visible: 1 };
  const priceValue = values ? values.precio : priceInputValue(v.price_cents);
  const body = html`
  ${categories.length === 0
    ? html`<p class="alerta alerta--error">Primero cree una categoría en la pantalla <a href="/admin">Menú</a>.</p>`
    : html`
  <form method="post" action="${isNew ? '/admin/productos' : `/admin/productos/${product.id}`}" enctype="multipart/form-data" class="tarjeta form">
    <label for="nombre">Nombre</label>
    <input id="nombre" name="nombre" required maxlength="80" value="${v.name || v.nombre || ''}">

    <label for="categoria">Categoría</label>
    <select id="categoria" name="categoria" required>
      ${categories.map(
        (c) => html`<option value="${c.id}" ${Number(v.category_id || v.categoria) === c.id ? 'selected' : ''}>${c.name}</option>`
      )}
    </select>

    <label for="descripcion">Descripción corta <span class="opcional">(opcional)</span></label>
    <textarea id="descripcion" name="descripcion" maxlength="200" rows="3">${v.description || v.descripcion || ''}</textarea>

    <label for="precio">Precio</label>
    <p class="ayuda" id="precio-ayuda">Solo números. Ejemplo: 4500 o 4500,50</p>
    <input id="precio" name="precio" required inputmode="decimal" aria-describedby="precio-ayuda" value="${priceValue || ''}">

    <label for="foto">Foto <span class="opcional">(opcional)</span></label>
    ${product && product.photo
      ? html`<div class="foto-actual"><img src="/uploads/${product.photo}" alt="Foto actual" width="120" height="120">
          <label class="check"><input type="checkbox" name="quitar_foto" value="1"> Quitar la foto</label></div>`
      : ''}
    <input id="foto" name="foto" type="file" accept="image/jpeg,image/png,image/webp" data-achicar="1">
    <p class="ayuda">JPG, PNG o WEBP. La foto se achica automáticamente para que el menú cargue rápido.</p>

    <label class="check"><input type="checkbox" name="disponible" value="1" ${v.available ? 'checked' : ''}> Hay stock</label>
    <label class="check"><input type="checkbox" name="visible" value="1" ${v.visible ? 'checked' : ''}> Mostrar en el menú</label>

    <div class="fila-acciones">
      <button type="submit" class="btn btn--primario">${isNew ? 'Crear producto' : 'Guardar cambios'}</button>
      <a class="btn" href="/admin">Cancelar</a>
    </div>
  </form>
  ${isNew ? '' : html`
  <form method="post" action="/admin/productos/${product.id}/borrar" data-confirmar="¿Borrar “${product.name}”? Esta acción no se puede deshacer.">
    <button type="submit" class="btn btn--peligro">Borrar producto</button>
  </form>`}`}`;
  return layout({ title: isNew ? 'Nuevo producto' : `Editar: ${product.name}`, active: 'menu', body, error });
}

function tablesPage({ tables, menuUrl, msg, error }) {
  const body = html`
  <section class="tarjeta">
    <h2>Imprimir</h2>
    <p>Genera una hoja lista para imprimir con el QR de cada mesa activa (4 por hoja A4).</p>
    <a class="btn btn--primario" href="/admin/mesas/imprimir" target="_blank" rel="noopener">Abrir hoja de impresión</a>
  </section>

  <section class="tarjeta">
    <h2>Agregar mesas</h2>
    <form method="post" action="/admin/mesas" class="form-linea">
      <label for="mesa-nueva">Una mesa (número o nombre)</label>
      <input id="mesa-nueva" name="nombre" required maxlength="30" placeholder="Ej: 12 o Terraza 3">
      <button type="submit" class="btn">Agregar</button>
    </form>
    <form method="post" action="/admin/mesas/varias" class="form-linea">
      <span class="label">Varias mesas numeradas</span>
      <label for="desde">Desde</label>
      <input id="desde" name="desde" type="number" min="1" max="999" required inputmode="numeric" class="corto">
      <label for="hasta">hasta</label>
      <input id="hasta" name="hasta" type="number" min="1" max="999" required inputmode="numeric" class="corto">
      <button type="submit" class="btn">Crear</button>
    </form>
  </section>

  <section class="tarjeta">
    <h2>Mesas (${tables.length})</h2>
    <ul class="lista-mesas">
      ${tables.map(
        (t) => html`
      <li class="mesa${t.active ? '' : ' es-oculto'}">
        <img class="mesa__qr" src="/admin/mesas/${t.id}/qr.png" alt="QR de la mesa ${t.label}" width="120" height="120" loading="lazy">
        <div class="mesa__info">
          <h3>Mesa ${t.label} ${t.active ? '' : html`<span class="etiqueta">Desactivada</span>`}</h3>
          <p class="mesa__url"><a href="${menuUrl(t.token)}" target="_blank" rel="noopener">Ver el menú como cliente</a></p>
          <div class="fila-acciones">
            <a class="btn" href="/admin/mesas/${t.id}/qr.png?descargar=1">Descargar QR</a>
            <form method="post" action="/admin/mesas/${t.id}/nuevo-qr" data-confirmar="¿Generar un QR nuevo para la mesa ${t.label}? El QR impreso actual dejará de funcionar.">
              <button type="submit" class="btn">Generar QR nuevo</button>
            </form>
            <form method="post" action="/admin/mesas/${t.id}/activa">
              <input type="hidden" name="activa" value="${t.active ? '0' : '1'}">
              <button type="submit" class="btn">${t.active ? 'Desactivar' : 'Activar'}</button>
            </form>
          </div>
          <details>
            <summary>Cambiar nombre o borrar</summary>
            <form method="post" action="/admin/mesas/${t.id}" class="form-linea">
              <label for="mesa-${t.id}">Nombre</label>
              <input id="mesa-${t.id}" name="nombre" value="${t.label}" required maxlength="30">
              <button type="submit" class="btn">Guardar</button>
            </form>
            <form method="post" action="/admin/mesas/${t.id}/borrar" data-confirmar="¿Borrar la mesa ${t.label} y su historial de llamados?">
              <button type="submit" class="btn btn--peligro">Borrar mesa</button>
            </form>
          </details>
        </div>
      </li>`
      )}
    </ul>
  </section>`;
  return layout({ title: 'Mesas y QR', active: 'mesas', body, msg, error });
}

/** Hoja A4 para imprimir: 4 tarjetas por página, con instrucciones simples. */
function printPage({ barName, cards }) {
  return page({
    title: `QR de las mesas · ${barName}`,
    css: ['/css/imprimir.css'],
    js: ['/js/imprimir.js'],
    body: html`
    <div class="no-imprimir controles">
      <p>Imprima en hoja A4, a color o blanco y negro. Recorte por la línea punteada.</p>
      <button type="button" id="imprimir">Imprimir</button>
      <a href="/admin/mesas">Volver</a>
    </div>
    <div class="hojas">
      ${cards.map(
        (c) => html`
      <article class="qr-tarjeta">
        <p class="qr-tarjeta__bar">${barName}</p>
        <p class="qr-tarjeta__mesa">MESA ${c.label}</p>
        <img class="qr-tarjeta__img" src="${c.dataUrl}" alt="Código QR de la mesa ${c.label}">
        <p class="qr-tarjeta__titulo">MENÚ y LLAMAR AL MOZO</p>
        <ol class="qr-tarjeta__pasos">
          <li>Abra la <strong>cámara</strong> del celular.</li>
          <li>Apunte a este cuadrado.</li>
          <li>Toque el enlace que aparece.</li>
        </ol>
      </article>`
      )}
    </div>`,
  });
}

function settingsPage({ barName, staffUrl, msg, error }) {
  const body = html`
  <form method="post" action="/admin/configuracion" class="tarjeta form">
    <label for="bar">Nombre del bar</label>
    <input id="bar" name="nombre_bar" value="${barName}" required maxlength="60">
    <button type="submit" class="btn btn--primario">Guardar</button>
  </form>
  <section class="tarjeta">
    <h2>Panel de los mozos</h2>
    <p>En la tablet o celular de la barra, abra esta dirección e ingrese el PIN del personal:</p>
    <p class="destacado">${staffUrl}</p>
    <p class="ayuda">El PIN y la contraseña de administración se cambian en el archivo de configuración del servidor (.env).</p>
  </section>`;
  return layout({ title: 'Configuración', active: 'config', body, msg, error });
}

module.exports = { menuPage, productFormPage, tablesPage, printPage, settingsPage };
