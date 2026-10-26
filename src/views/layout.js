'use strict';
const { html } = require('../lib/format');

/** Documento HTML base. `css` y `js` son rutas dentro de /public. */
function page({ title, css, js = [], body, bodyClass = '', head = '' }) {
  return html`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0b3d91">
<title>${title}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${css.map((href) => html`<link rel="stylesheet" href="${href}">`)}
${head}
</head>
<body class="${bodyClass}">
${body}
${js.map((src) => html`<script src="${src}" defer></script>`)}
</body>
</html>`.toString();
}

module.exports = { page };
