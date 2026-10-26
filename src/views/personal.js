'use strict';
const { html } = require('../lib/format');
const { page } = require('./layout');

function loginPage({ title, action, label, inputType, inputMode, error, back, autocomplete }) {
  return page({
    title,
    css: ['/css/admin.css'],
    bodyClass: 'login',
    body: html`
    <main class="login__caja">
      <h1>${title}</h1>
      ${error ? html`<p class="alerta alerta--error" role="alert">${error}</p>` : ''}
      <form method="post" action="${action}">
        <input type="hidden" name="volver" value="${back || ''}">
        <label for="clave">${label}</label>
        <input id="clave" name="clave" type="${inputType}" inputmode="${inputMode}" autocomplete="${autocomplete}" required autofocus>
        <button type="submit" class="btn btn--primario btn--ancho">Entrar</button>
      </form>
    </main>`,
  });
}

function staffLoginPage({ error, back }) {
  return loginPage({
    title: 'Panel del personal',
    action: '/personal/ingresar',
    label: 'PIN del personal',
    inputType: 'password',
    inputMode: 'numeric',
    autocomplete: 'current-password',
    error,
    back,
  });
}

function staffPanelPage({ barName }) {
  return page({
    title: `Llamados · ${barName}`,
    css: ['/css/personal.css'],
    js: ['/js/personal.js'],
    bodyClass: 'personal',
    body: html`
    <div class="inicio" id="inicio">
      <h1>${barName}</h1>
      <p>Panel de llamados de las mesas.</p>
      <button type="button" class="inicio__boton" id="empezar">Empezar a recibir llamados</button>
      <p class="inicio__nota">Al tocar se activa el sonido de las alertas. Deje esta pantalla abierta y el volumen alto.</p>
    </div>

    <header class="barra">
      <h1 class="barra__titulo">Llamados</h1>
      <p class="barra__conexion" id="conexion" role="status">Conectando…</p>
      <button type="button" class="barra__boton" id="probar-sonido">Probar sonido</button>
      <form method="post" action="/personal/salir"><button type="submit" class="barra__boton">Salir</button></form>
    </header>

    <main>
      <p class="sin-llamados" id="vacio">No hay llamados pendientes.</p>
      <ul class="llamados" id="llamados" aria-live="polite"></ul>
    </main>`,
  });
}

module.exports = { staffLoginPage, staffPanelPage, loginPage };
