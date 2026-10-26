// Panel del personal: recibe los llamados en tiempo real (Server-Sent Events),
// suena una alerta, y permite marcarlos como atendidos.
(function () {
  'use strict';

  var lista = document.getElementById('llamados');
  var vacio = document.getElementById('vacio');
  var conexion = document.getElementById('conexion');
  var inicio = document.getElementById('inicio');
  var llamados = new Map(); // id -> llamado
  var audio = null;
  var wakeLock = null;
  var fuente = null;
  var hora = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

  /* ---------- Sonido (Web Audio: no necesita archivos) ---------- */
  function tono(frecuencia, inicioSeg, duracion) {
    var osc = audio.createOscillator();
    var vol = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = frecuencia;
    vol.gain.setValueAtTime(0.0001, audio.currentTime + inicioSeg);
    vol.gain.exponentialRampToValueAtTime(0.7, audio.currentTime + inicioSeg + 0.02);
    vol.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + inicioSeg + duracion);
    osc.connect(vol).connect(audio.destination);
    osc.start(audio.currentTime + inicioSeg);
    osc.stop(audio.currentTime + inicioSeg + duracion + 0.05);
  }
  function sonar(tipo) {
    if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
    if (!audio) return;
    if (audio.state === 'suspended') audio.resume();
    if (tipo === 'cuenta') {
      tono(660, 0, 0.25); tono(880, 0.3, 0.25); tono(1100, 0.6, 0.4);
    } else {
      tono(880, 0, 0.35); tono(660, 0.4, 0.5); tono(880, 1.0, 0.35); tono(660, 1.4, 0.5);
    }
  }

  /* ---------- Mantener la pantalla encendida ---------- */
  function pedirPantallaEncendida() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    navigator.wakeLock.request('screen').then(function (lock) { wakeLock = lock; }).catch(function () {});
  }

  document.getElementById('empezar').addEventListener('click', function () {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audio = new Ctx();
    inicio.hidden = true;
    sonar('mozo');
    pedirPantallaEncendida();
  });
  document.getElementById('probar-sonido').addEventListener('click', function () {
    if (!audio) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audio = new Ctx();
    }
    sonar('mozo');
  });

  /* ---------- Dibujo de la lista ---------- */
  function minutosDesde(iso) {
    return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  }
  function textoHace(min) {
    if (min < 1) return 'recién';
    if (min === 1) return 'hace 1 minuto';
    return 'hace ' + min + ' minutos';
  }

  function crearTarjeta(ll) {
    var li = document.createElement('li');
    li.className = 'llamado llamado--' + ll.tipo;
    li.setAttribute('data-id', ll.id);

    var info = document.createElement('div');
    info.className = 'llamado__info';

    var mesa = document.createElement('p');
    mesa.className = 'llamado__mesa';
    mesa.textContent = 'MESA ' + ll.mesa;

    var tipo = document.createElement('p');
    tipo.className = 'llamado__tipo';
    tipo.textContent = ll.tipo === 'cuenta' ? '🧾 PIDE LA CUENTA' : '🔔 LLAMA AL MOZO';

    var cuando = document.createElement('p');
    cuando.className = 'llamado__hora';

    info.appendChild(mesa);
    info.appendChild(tipo);
    info.appendChild(cuando);

    var boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'llamado__atendido';
    boton.textContent = '✔ ATENDIDO';
    boton.setAttribute('aria-label', 'Marcar mesa ' + ll.mesa + ' como atendida');
    boton.addEventListener('click', function () { atender(ll.id); });

    li.appendChild(info);
    li.appendChild(boton);
    return li;
  }

  function actualizarTarjeta(li, ll) {
    var min = minutosDesde(ll.creado);
    var texto = hora.format(new Date(ll.creado)) + ' · ' + textoHace(min);
    if (ll.veces > 1) texto += ' · ¡insistió ' + ll.veces + ' veces!';
    li.querySelector('.llamado__hora').textContent = texto;
    li.classList.toggle('llamado--demorado', min >= 3);
  }

  function dibujar() {
    var ordenados = Array.from(llamados.values()).sort(function (a, b) {
      return a.creado < b.creado ? -1 : 1; // el más antiguo primero
    });
    var existentes = {};
    Array.prototype.forEach.call(lista.children, function (li) { existentes[li.getAttribute('data-id')] = li; });

    ordenados.forEach(function (ll, i) {
      var li = existentes[ll.id] || crearTarjeta(ll);
      delete existentes[ll.id];
      actualizarTarjeta(li, ll);
      if (lista.children[i] !== li) lista.insertBefore(li, lista.children[i] || null);
    });
    Object.keys(existentes).forEach(function (id) { lista.removeChild(existentes[id]); });

    vacio.hidden = ordenados.length > 0;
    document.title = (ordenados.length ? '(' + ordenados.length + ') ' : '') + 'Llamados';
  }

  function resaltar(id) {
    var li = lista.querySelector('[data-id="' + id + '"]');
    if (!li) return;
    li.classList.add('llamado--nuevo');
    setTimeout(function () { li.classList.remove('llamado--nuevo'); }, 15000);
  }

  /* ---------- Acciones ---------- */
  function atender(id) {
    var ll = llamados.get(id);
    llamados.delete(id); // se quita al instante; si falla, vuelve a aparecer
    dibujar();
    fetch('/api/personal/llamados/' + id + '/atendido', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    })
      .then(function (res) {
        if (res.status === 401) return irAlIngreso();
        if (!res.ok) throw new Error('error');
      })
      .catch(function () {
        if (ll) llamados.set(id, ll);
        dibujar();
        estadoConexion(false, 'No se pudo marcar como atendido. Revise la conexión y vuelva a tocar.');
      });
  }

  function irAlIngreso() {
    location.href = '/personal/ingresar?volver=/personal';
  }

  /* ---------- Conexión en tiempo real ---------- */
  function estadoConexion(ok, texto) {
    conexion.textContent = texto || (ok ? '● Conectado' : '● SIN CONEXIÓN — reintentando…');
    conexion.className = 'barra__conexion ' + (ok ? 'es-ok' : 'es-error');
  }

  function conectar() {
    if (fuente) fuente.close();
    fuente = new EventSource('/api/personal/eventos');

    fuente.addEventListener('open', function () { estadoConexion(true); });

    fuente.addEventListener('snapshot', function (e) {
      var datos = JSON.parse(e.data);
      var antes = new Set(llamados.keys());
      llamados.clear();
      datos.llamados.forEach(function (ll) { llamados.set(ll.id, ll); });
      dibujar();
      // Llamados que llegaron mientras estábamos desconectados: también suenan.
      datos.llamados.forEach(function (ll) {
        if (antes.size && !antes.has(ll.id)) { resaltar(ll.id); sonar(ll.tipo); }
      });
      estadoConexion(true);
    });

    fuente.addEventListener('llamado', function (e) {
      var ll = JSON.parse(e.data);
      llamados.set(ll.id, ll);
      dibujar();
      resaltar(ll.id);
      sonar(ll.tipo);
    });

    fuente.addEventListener('resuelto', function (e) {
      llamados.delete(JSON.parse(e.data).id);
      dibujar();
    });

    fuente.addEventListener('error', function () {
      estadoConexion(false);
      // EventSource reintenta solo; si se cerró del todo (por ejemplo, sesión vencida), lo revisamos.
      if (fuente.readyState === EventSource.CLOSED) {
        fetch('/api/personal/llamados', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
          .then(function (res) {
            if (res.status === 401) return irAlIngreso();
            setTimeout(conectar, 3000);
          })
          .catch(function () { setTimeout(conectar, 3000); });
      }
    });
  }

  // Actualiza los "hace X minutos" y recuerda con un sonido suave si hay llamados demorados.
  var ciclos = 0;
  setInterval(function () {
    dibujar();
    ciclos++;
    if (ciclos % 3 === 0) {
      var demorado = Array.from(llamados.values()).find(function (ll) { return minutosDesde(ll.creado) >= 3; });
      if (demorado) sonar(demorado.tipo);
    }
  }, 20000);

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      pedirPantallaEncendida();
      if (!fuente || fuente.readyState === EventSource.CLOSED) conectar();
    }
  });

  conectar();
})();
