// Service worker: guarda una copia del menú y los estilos para que la página abra
// aunque la conexión del bar sea mala. Los llamados (POST) nunca se guardan: siempre van al servidor.
const CACHE = 'menu-v1';
const ESTATICOS = ['/css/cliente.css', '/js/cliente.js', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ESTATICOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Menú: primero la red (precios y stock al día); si falla o tarda más de 4 s, la copia guardada.
  if (url.pathname.startsWith('/m/') && req.mode === 'navigate') {
    event.respondWith(redPrimero(req, 4000));
    return;
  }
  // Fotos: tienen nombre único, la copia guardada siempre sirve.
  if (url.pathname.startsWith('/uploads/')) {
    event.respondWith(
      caches.match(req).then((guardada) => guardada || fetch(req).then((res) => guardar(req, res)))
    );
    return;
  }
  // Estilos y scripts del cliente: copia guardada al instante y se actualiza en segundo plano.
  if (ESTATICOS.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then((guardada) => {
        const red = fetch(req).then((res) => guardar(req, res)).catch(() => guardada);
        return guardada || red;
      })
    );
  }
});

function guardar(req, res) {
  if (res.ok) {
    const copia = res.clone();
    caches.open(CACHE).then((cache) => cache.put(req, copia));
  }
  return res;
}

function redPrimero(req, espera) {
  return new Promise((resolve) => {
    let resuelto = false;
    const usarCopia = () =>
      caches.match(req).then((guardada) => {
        if (guardada && !resuelto) {
          resuelto = true;
          resolve(guardada);
        }
        return guardada;
      });
    const timer = setTimeout(usarCopia, espera);
    fetch(req)
      .then((res) => {
        clearTimeout(timer);
        if (!resuelto) {
          resuelto = true;
          resolve(res.ok ? guardar(req, res) : res);
        } else if (res.ok) {
          guardar(req, res);
        }
      })
      .catch(() => {
        clearTimeout(timer);
        usarCopia().then((guardada) => {
          if (!resuelto) {
            resuelto = true;
            resolve(guardada || Response.error());
          }
        });
      });
  });
}
