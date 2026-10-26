'use strict';
// Pantalla del cliente. Se genera en el servidor: el menú se ve aunque el JavaScript
// falle o tarde en cargar, y los botones funcionan como formularios comunes.
const { html } = require('../lib/format');
const { page } = require('./layout');

const LABELS = {
  mozo: { button: 'LLAMAR AL MOZO', done: 'El mozo ya fue avisado', detail: 'Enseguida viene a su mesa.' },
  cuenta: { button: 'PEDIR LA CUENTA', done: 'Ya pedimos su cuenta', detail: 'El mozo se la trae enseguida.' },
};

function callButtons({ token, status }) {
  return html`
  <nav class="acciones" id="acciones" aria-label="Llamar al personal">
    <div class="acciones__estado" id="estado" role="status" aria-live="polite">
      ${status ? statusMessage(status) : ''}
    </div>
    <div class="acciones__botones">
      ${['mozo', 'cuenta'].map(
        (type) => html`
        <form method="post" action="/m/${token}/llamar" class="accion-form">
          <input type="hidden" name="tipo" value="${type}">
          <button type="submit" class="boton boton--${type}" data-tipo="${type}">
            <span class="boton__icono" aria-hidden="true">${type === 'mozo' ? '🔔' : '🧾'}</span>
            <span class="boton__texto">${LABELS[type].button}</span>
          </button>
        </form>`
      )}
    </div>
  </nav>`;
}

/** Mensaje de confirmación cuando no hay JavaScript (después de enviar el formulario). */
function statusMessage({ type, ok, message }) {
  if (!ok) return html`<p class="aviso aviso--error">${message}</p>`;
  return html`<p class="aviso aviso--ok"><strong>✔ ${LABELS[type].done}.</strong> ${LABELS[type].detail}</p>`;
}

function menuPage({ barName, table, menu, formatPrice, token, status }) {
  const body = html`
  <a class="saltar" href="#menu">Ir al menú</a>
  <header class="cabecera">
    <div class="cabecera__textos">
      <p class="cabecera__bar">${barName}</p>
      <h1 class="cabecera__mesa">Mesa ${table.label}</h1>
    </div>
    <button type="button" class="boton-letra" id="boton-letra" aria-pressed="false" hidden>
      <span class="boton-letra__a" aria-hidden="true">A+</span>
      <span class="boton-letra__texto">Letra más grande</span>
    </button>
  </header>

  <main id="menu" class="menu" tabindex="-1">
    ${menu.length === 0
      ? html`<p class="vacio">El menú todavía no está cargado. Por favor, consulte al mozo.</p>`
      : html`
    <nav class="indice" aria-label="Secciones del menú">
      <h2 class="indice__titulo">¿Qué desea ver?</h2>
      <ul class="indice__lista">
        ${menu.map((c) => html`<li><a class="indice__boton" href="#cat-${c.id}">${c.name}</a></li>`)}
      </ul>
    </nav>
    ${menu.map(
      (category) => html`
    <section class="categoria" id="cat-${category.id}" aria-labelledby="titulo-${category.id}" tabindex="-1">
      <h2 class="categoria__titulo" id="titulo-${category.id}">${category.name}</h2>
      <ul class="productos">
        ${category.products.map((p) => productItem(p, formatPrice))}
      </ul>
      <a class="volver" href="#menu">↑ Volver a las secciones</a>
    </section>`
    )}`}
    <p class="ayuda">¿No funciona algún botón? Levante la mano y el mozo lo atiende.</p>
  </main>

  ${callButtons({ token, status })}`;

  return page({
    title: `${barName} · Mesa ${table.label}`,
    css: ['/css/cliente.css'],
    js: ['/js/cliente.js'],
    body,
    bodyClass: 'cliente',
    head: html`<meta name="description" content="Menú de ${barName}"><meta name="robots" content="noindex">`,
  });
}

function productItem(p, formatPrice) {
  const soldOut = !p.available;
  return html`
  <li class="producto${soldOut ? ' producto--agotado' : ''}">
    ${p.photo
      ? html`<img class="producto__foto" src="/uploads/${p.photo}" alt="" loading="lazy" decoding="async" width="160" height="160">`
      : ''}
    <div class="producto__info">
      <h3 class="producto__nombre">${p.name}</h3>
      ${p.description ? html`<p class="producto__desc">${p.description}</p>` : ''}
      ${soldOut
        ? html`<p class="producto__agotado"><strong>SIN STOCK</strong> · No disponible por ahora</p>`
        : ''}
    </div>
    <p class="producto__precio">${formatPrice(p.price_cents)}</p>
  </li>`;
}

function invalidTablePage(barName) {
  return page({
    title: barName,
    css: ['/css/cliente.css'],
    bodyClass: 'cliente',
    body: html`
    <main class="menu menu--error">
      <h1 class="cabecera__mesa">${barName}</h1>
      <p class="aviso aviso--error">Este código no es válido o es de una mesa anterior.</p>
      <p class="vacio">Por favor, pídale ayuda al mozo o escanee el código que está en su mesa.</p>
    </main>`,
  });
}

module.exports = { menuPage, invalidTablePage, LABELS };
