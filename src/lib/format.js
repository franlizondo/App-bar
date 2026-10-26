'use strict';
// Utilidades de presentación.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto para insertarlo en HTML. Úselo SIEMPRE con datos cargados por usuarios. */
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

/**
 * Plantillas HTML con escape automático: html`<p>${texto}</p>`.
 * Para insertar HTML ya construido, páselo envuelto con raw().
 */
class Raw {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}
const raw = (value) => new Raw(value);

function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => {
    out += render(value) + strings[i + 1];
  });
  return raw(out);
}

function render(value) {
  if (value instanceof Raw) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  if (value === false || value === null || value === undefined) return '';
  return esc(value);
}

function createPriceFormatter(locale, currency) {
  const whole = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 });
  const cents = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 });
  return (priceCents) => (priceCents % 100 === 0 ? whole : cents).format(priceCents / 100);
}

/** "1.500,50" / "1500.5" / "1500" -> 150050 centavos. Devuelve null si no es válido. */
function parsePrice(input) {
  let text = String(input ?? '').trim().replace(/[$\s]/g, '');
  if (!text) return null;
  // Si hay coma, se toma como separador decimal (formato rioplatense) y los puntos como miles.
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, ''); // "1.500" = mil quinientos
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  return Math.round(Number(text) * 100);
}

/** Centavos -> texto para un campo de formulario ("1500" o "1500,50"). */
function priceInputValue(priceCents) {
  if (priceCents == null) return '';
  return priceCents % 100 === 0 ? String(priceCents / 100) : (priceCents / 100).toFixed(2).replace('.', ',');
}

module.exports = { esc, html, raw, createPriceFormatter, parsePrice, priceInputValue };
