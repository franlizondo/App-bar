// Menú del cliente: mejora progresiva. Sin este archivo, el menú y los botones igual funcionan
// (como formularios comunes); con él, el llamado se envía sin recargar, con reintentos
// automáticos si la conexión es inestable y bloqueo temporal para evitar llamados repetidos.
(function () {
  'use strict';

  var root = document.documentElement;
  var token = location.pathname.split('/')[2] || '';
  var STORAGE_KEY = 'llamados:' + token;

  var TEXTOS = {
    mozo: {
      boton: 'LLAMAR AL MOZO',
      hecho: 'MOZO AVISADO',
      titulo: '✔ El mozo ya fue avisado.',
      detalle: 'Enseguida viene a su mesa.',
    },
    cuenta: {
      boton: 'PEDIR LA CUENTA',
      hecho: 'CUENTA PEDIDA',
      titulo: '✔ Ya pedimos su cuenta.',
      detalle: 'El mozo se la trae enseguida.',
    },
  };

  /* ---------- Almacenamiento seguro (puede fallar en modo privado) ---------- */
  function leer(clave, porDefecto) {
    try {
      var valor = localStorage.getItem(clave);
      return valor === null ? porDefecto : JSON.parse(valor);
    } catch (e) {
      return porDefecto;
    }
  }
  function guardar(clave, valor) {
    try {
      localStorage.setItem(clave, JSON.stringify(valor));
    } catch (e) {
      /* sin almacenamiento: se pierde el bloqueo al recargar, el servidor igual lo controla */
    }
  }

  /* ---------- Letra más grande ---------- */
  var botonLetra = document.getElementById('boton-letra');
  function aplicarLetra(grande) {
    root.classList.toggle('letra-grande', grande);
    if (!botonLetra) return;
    botonLetra.setAttribute('aria-pressed', grande ? 'true' : 'false');
    botonLetra.querySelector('.boton-letra__texto').textContent = grande ? 'Letra normal' : 'Letra más grande';
    botonLetra.querySelector('.boton-letra__a').textContent = grande ? 'A−' : 'A+';
  }
  aplicarLetra(leer('letraGrande', false));
  if (botonLetra) {
    botonLetra.hidden = false;
    botonLetra.addEventListener('click', function () {
      var grande = !root.classList.contains('letra-grande');
      guardar('letraGrande', grande);
      aplicarLetra(grande);
    });
  }

  /* ---------- Que la barra fija nunca tape el contenido ---------- */
  var barra = document.getElementById('acciones');
  if (!barra) return;
  function ajustarAlto() {
    root.style.setProperty('--barra-alto', barra.offsetHeight + 'px');
  }
  ajustarAlto();
  if ('ResizeObserver' in window) new ResizeObserver(ajustarAlto).observe(barra);
  else window.addEventListener('resize', ajustarAlto);

  /* ---------- Llamados ---------- */
  var estado = document.getElementById('estado');
  var bloqueos = leer(STORAGE_KEY, {}); // { mozo: timestampHasta, cuenta: ... }
  var temporizadores = {};
  var enviando = {};

  // Si la página vino con un mensaje del servidor (sin JS), lo dejamos y luego lo limpiamos.
  if (estado.children.length) {
    setTimeout(function () { limpiarMensaje(null); }, 15000);
  }
  if (location.search) history.replaceState(null, '', location.pathname);

  function botonDe(tipo) {
    return barra.querySelector('button[data-tipo="' + tipo + '"]');
  }

  function textoBoton(boton, icono, texto) {
    boton.querySelector('.boton__icono').textContent = icono;
    boton.querySelector('.boton__texto').textContent = texto;
  }

  var ocultarMensaje = null;

  // Un solo mensaje a la vez, para no tapar el menú. Los de confirmación se ocultan solos
  // (el botón sigue mostrando "MOZO AVISADO" mientras dura el bloqueo).
  function mensaje(tipo, clase, titulo, detalle, conCancelar, duracionMs) {
    limpiarMensaje(null);
    clearTimeout(ocultarMensaje);
    if (duracionMs) ocultarMensaje = setTimeout(function () { limpiarMensaje(null); }, duracionMs);
    var caja = document.createElement('div');
    caja.className = 'aviso ' + clase;
    caja.setAttribute('data-tipo', tipo);
    var fuerte = document.createElement('strong');
    fuerte.textContent = titulo;
    caja.appendChild(fuerte);
    caja.appendChild(document.createTextNode(detalle));
    if (conCancelar) {
      var cancelar = document.createElement('button');
      cancelar.type = 'button';
      cancelar.className = 'aviso__cancelar';
      cancelar.textContent = 'Lo toqué sin querer: cancelar';
      cancelar.addEventListener('click', function () { cancelarLlamado(tipo); });
      caja.appendChild(document.createElement('br'));
      caja.appendChild(cancelar);
      ajustarAlto();
    }
    estado.appendChild(caja);
    ajustarAlto();
  }

  function limpiarMensaje(tipo) {
    Array.prototype.slice.call(estado.children).forEach(function (el) {
      if (tipo === null || el.getAttribute('data-tipo') === tipo || !el.getAttribute('data-tipo')) {
        estado.removeChild(el);
      }
    });
    ajustarAlto();
  }

  function bloquear(tipo, segundos, mostrarCancelar) {
    var hasta = Date.now() + segundos * 1000;
    bloqueos[tipo] = hasta;
    guardar(STORAGE_KEY, bloqueos);
    aplicarBloqueo(tipo, hasta);
    mensaje(tipo, 'aviso--ok', TEXTOS[tipo].titulo, ' ' + TEXTOS[tipo].detalle, mostrarCancelar, 30000);
  }

  function aplicarBloqueo(tipo, hasta) {
    var boton = botonDe(tipo);
    boton.setAttribute('aria-disabled', 'true');
    boton.classList.remove('boton--enviando');
    textoBoton(boton, '✔', TEXTOS[tipo].hecho);
    clearTimeout(temporizadores[tipo]);
    temporizadores[tipo] = setTimeout(function () { desbloquear(tipo); }, Math.max(0, hasta - Date.now()));
  }

  function desbloquear(tipo) {
    clearTimeout(temporizadores[tipo]);
    delete bloqueos[tipo];
    guardar(STORAGE_KEY, bloqueos);
    var boton = botonDe(tipo);
    boton.removeAttribute('aria-disabled');
    boton.classList.remove('boton--enviando');
    textoBoton(boton, tipo === 'mozo' ? '🔔' : '🧾', TEXTOS[tipo].boton);
    limpiarMensaje(tipo);
  }

  // Al recargar la página se respetan los bloqueos vigentes.
  Object.keys(bloqueos).forEach(function (tipo) {
    if (!TEXTOS[tipo]) return;
    if (bloqueos[tipo] > Date.now()) aplicarBloqueo(tipo, bloqueos[tipo]);
    else desbloquear(tipo);
  });

  function enviar(url, datos) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(datos),
      credentials: 'same-origin',
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (cuerpo) {
        return { status: res.status, cuerpo: cuerpo };
      });
    });
  }

  function llamar(tipo, intento) {
    var boton = botonDe(tipo);
    enviando[tipo] = true;
    boton.classList.add('boton--enviando');
    textoBoton(boton, '⏳', 'AVISANDO…');

    enviar('/m/' + token + '/llamar', { tipo: tipo })
      .then(function (r) {
        enviando[tipo] = false;
        if (r.status === 200) return bloquear(tipo, r.cuerpo.esperar || 60, true);
        if (r.status === 429) return bloquear(tipo, 60, false);
        desbloquear(tipo);
        mensaje(tipo, 'aviso--error', 'No se pudo avisar.', ' ' + (r.cuerpo.error || 'Por favor, levante la mano para llamar al mozo.'), false);
      })
      .catch(function () {
        // Sin conexión: reintentamos solos durante un minuto y medio.
        if (intento < 30) {
          mensaje(tipo, 'aviso--espera', 'Sin conexión a internet.', ' Seguimos intentando avisar al mozo…', false);
          setTimeout(function () { llamar(tipo, intento + 1); }, 3000);
        } else {
          enviando[tipo] = false;
          desbloquear(tipo);
          mensaje(tipo, 'aviso--error', 'No hay conexión.', ' Por favor, levante la mano para llamar al mozo.', false);
        }
      });
  }

  function cancelarLlamado(tipo) {
    enviar('/m/' + token + '/cancelar', { tipo: tipo })
      .then(function () {
        desbloquear(tipo);
        mensaje(tipo, 'aviso--ok', 'Listo, cancelado.', ' No se avisará al mozo.', false, 6000);
      })
      .catch(function () {
        mensaje(tipo, 'aviso--error', 'No se pudo cancelar.', ' Sin conexión. Si el mozo viene, avísele que fue un error.', false);
      });
  }

  barra.addEventListener('submit', function (evento) {
    evento.preventDefault();
    var tipo = evento.target.querySelector('input[name="tipo"]').value;
    var boton = botonDe(tipo);
    if (enviando[tipo] || boton.getAttribute('aria-disabled') === 'true') return;
    llamar(tipo, 0);
  });

  /* ---------- Funcionamiento con conexión inestable ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }
})();
