# Menú QR con "Llamar al mozo"

Menú digital para bares: cada mesa tiene un código QR. El cliente lo escanea con la cámara del celular
(sin descargar nada ni registrarse), ve el menú y tiene siempre a mano **LLAMAR AL MOZO** y **PEDIR LA CUENTA**.
Los mozos reciben los llamados al instante en una tablet o celular, con sonido.

Diseñado para personas mayores: letra grande, alto contraste, botones enormes, sin ventanas emergentes.

📄 Stack, arquitectura, modelo de datos, plan por fases y riesgos: **[docs/PROPUESTA.md](docs/PROPUESTA.md)**

| Pantalla | Dirección | Quién la usa |
|---|---|---|
| Menú de una mesa | `/m/<token>` (la abre el QR) | Clientes |
| Panel de llamados | `/personal` | Mozos / barra (PIN) |
| Administración | `/admin` | Dueño / encargado (contraseña) |

---

## 1. Probarlo en su computadora (5 minutos)

Requisito: [Node.js](https://nodejs.org) versión LTS (22.13 o más nueva).

**En Windows, lo más fácil:** descomprima el ZIP y haga doble clic en `iniciar-windows.bat`. Instala lo necesario la primera vez, carga datos de ejemplo y abre el navegador.

```bash
npm install
npm run seed -- 12      # menú de ejemplo + mesas 1 a 12 (muestra la dirección de la mesa 1)
npm run dev             # http://localhost:3000
```

- Administración: http://localhost:3000/admin — contraseña de desarrollo `admin-desarrollo`
- Panel de mozos: http://localhost:3000/personal — PIN de desarrollo `1234`
- Menú: abra la dirección que mostró `npm run seed`, o desde **Administración → Mesas y QR → "Ver el menú como cliente"**.

Para probarlo con su celular en la misma red wifi, use la IP de la computadora (ej. `http://192.168.0.10:3000`)
y en `.env` ponga `PUBLIC_URL=http://192.168.0.10:3000` para que los QR apunten ahí.

Pruebas automáticas: `npm test`

---

## 2. Configuración (`.env`)

Copie `.env.example` como `.env` y complete:

| Variable | Para qué |
|---|---|
| `PUBLIC_URL` | Dirección pública, **la que se imprime en los QR**. Ej: `https://menu.mibar.com` |
| `ADMIN_PASSWORD` | Contraseña de administración (mín. 10 caracteres) |
| `STAFF_PIN` | PIN de los mozos (mín. 4 dígitos) |
| `SESSION_SECRET` | Texto aleatorio largo. Genérelo con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `BAR_NAME` | Nombre inicial del bar (después se cambia desde el panel) |
| `CURRENCY`, `LOCALE` | Moneda y formato. Por defecto `ARS` / `es-AR` → "$ 4.500" |
| `CALL_COOLDOWN_SECONDS` | Segundos de bloqueo después de llamar (por defecto 60) |
| `TZ` | Zona horaria del servidor |

En producción (`NODE_ENV=production`) la app **no arranca** si falta alguna de las variables importantes: así no queda publicada con claves de prueba.

---

## 3. Publicarlo en internet

Necesita: un **dominio** (≈ USD 10-15/año) y un **servidor**. Costos aproximados:

| Opción | Costo | Comentario |
|---|---|---|
| **VPS** (Hetzner, DigitalOcean, Vultr, Contabo) con Docker — *recomendada* | USD 4-6/mes | Control total, HTTPS automático, sobra capacidad. |
| Fly.io / Railway con volumen persistente | USD 3-7/mes | Sin administrar servidor. Requiere volumen para `/data`. |
| ❌ Planes gratuitos que "duermen" (Render free, etc.) | — | **No sirven:** tardan 30-60 s en despertar y cortan el panel de mozos. |

### Opción A — VPS con Docker (recomendada)

1. Cree un servidor Ubuntu 24.04 (1 vCPU, 1 GB RAM) e instale Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
2. En su proveedor de dominio, cree un registro **A** de `menu.mibar.com` apuntando a la IP del servidor.
3. Copie el proyecto al servidor (por ejemplo con `git clone`) y configure:
   ```bash
   cp .env.example .env && nano .env              # complete PUBLIC_URL, claves, PIN, secreto
   echo "DOMINIO=menu.mibar.com" > deploy/.env
   ```
4. Arranque:
   ```bash
   cd deploy
   docker compose up -d --build
   ```
   Caddy obtiene el certificado HTTPS solo. En 1-2 minutos `https://menu.mibar.com/salud` responde `{"ok":true}`.
5. (Opcional) Cargue el menú de ejemplo y mesas: `docker compose exec app node src/seed.js 15`
6. Copias de seguridad diarias (`crontab -e`):
   ```
   15 5 * * * /ruta/al/proyecto/deploy/backup.sh
   ```
7. Monitoreo gratuito: cree un chequeo en [UptimeRobot](https://uptimerobot.com) sobre `https://menu.mibar.com/salud` con aviso al celular.

**Actualizar:** `git pull && cd deploy && docker compose up -d --build` (la base de datos y las fotos se conservan en el volumen).

### Opción B — Sin Docker

```bash
npm ci --omit=dev
NODE_ENV=production node src/server.js     # con las variables de .env
```
Póngalo como servicio (systemd o `pm2`) detrás de Caddy o nginx con HTTPS. Si usa nginx, desactive el buffer
para `/api/personal/eventos` (`proxy_buffering off;`) — la app ya envía `X-Accel-Buffering: no`.
Mantenga `TRUST_PROXY=1` para que el límite de pedidos vea la IP real.

---

## 4. Puesta en marcha en el local

### Cargar el menú
**Administración → Menú**: cree categorías ("Bebidas", "Comidas"…) y productos.
- Precio: solo números (`4500` o `4500,50`).
- Foto: opcional; se achica sola.
- **Sin stock**: un toque en el botón del producto. Se vuelve a habilitar con "Hay stock".
- Las flechas ↑ ↓ cambian el orden.

### Generar e imprimir los QR
1. **Administración → Mesas y QR → Varias mesas numeradas**: "desde 1 hasta 20" → *Crear*.
2. **Abrir hoja de impresión** → *Imprimir* (A4, 4 QR por hoja, con instrucciones simples para el cliente).
   También puede descargar el PNG de cada mesa (1024 px) para mandarlo a una imprenta.
3. Recomendaciones de impresión:
   - Tamaño mínimo del QR: **6 × 6 cm** (la hoja ya lo respeta).
   - Plastificar o usar portacartel de acrílico; evitar superficies brillantes que reflejen luz.
   - **Antes de distribuir, escanee cada QR** y compruebe que dice el número de mesa correcto.
4. Si un QR se pierde o alguien se lo lleva: **Generar QR nuevo** en esa mesa (el anterior deja de funcionar) y reimprima solo ese.

### Panel de los mozos
1. En la tablet/celular de la barra abra `https://menu.mibar.com/personal` e ingrese el PIN.
2. Toque **"Empezar a recibir llamados"** (habilita el sonido) y luego **"Probar sonido"**.
3. Deje la pantalla encendida, enchufada y con volumen alto. La sesión dura 30 días.
4. Cada llamado muestra **mesa, tipo (mozo o cuenta) y hora**. Al atender, tocar **✔ ATENDIDO**.
   - Si una mesa insiste, la tarjeta dice "¡insistió 2 veces!".
   - Después de 3 minutos sin atender, la tarjeta se pone roja y vuelve a sonar cada minuto.
   - Si arriba aparece **SIN CONEXIÓN**, revise el wifi: la app se reconecta sola y recupera los llamados.
5. Pueden tener el panel abierto en varios dispositivos a la vez; al marcar "atendido" en uno, desaparece de todos.

---

## 5. Estructura del proyecto

```
src/            servidor (Express): rutas, vistas, datos, seguridad, tiempo real
public/         estilos, scripts del navegador y service worker
test/           pruebas automáticas (npm test)
deploy/         Docker Compose + Caddy (HTTPS) + backup
docs/           propuesta técnica
```

Datos en `DATA_DIR` (por defecto `./data`): `bar.db` (SQLite) y `uploads/` (fotos).
