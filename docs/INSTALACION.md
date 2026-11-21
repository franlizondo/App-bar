# Instalación, publicación y solución de problemas

Guía técnica. Para una explicación general de la aplicación, ver el [README](../README.md).

- [1. Instalación local](#1-instalación-local)
- [2. Configuración (`.env`)](#2-configuración-env)
- [3. Probar con el celular en la misma red](#3-probar-con-el-celular-en-la-misma-red)
- [4. Probar por internet sin servidor (túnel gratuito)](#4-probar-por-internet-sin-servidor-túnel-gratuito)
- [5. Publicar en un servidor](#5-publicar-en-un-servidor)
- [6. Copias de seguridad y monitoreo](#6-copias-de-seguridad-y-monitoreo)
- [7. Solución de problemas](#7-solución-de-problemas)

---

## 1. Instalación local

Requisito: **[Node.js](https://nodejs.org) LTS, versión 22.13 o más nueva.** No hace falta Visual Studio, Python ni ningún compilador:
todas las dependencias están escritas en JavaScript.

**Windows:** doble clic en `iniciar-windows.bat`. Verifica Node.js, instala las dependencias la primera vez,
carga el menú de ejemplo con 10 mesas, arranca el servidor y abre el navegador.

**Cualquier sistema:**

```bash
npm install
npm run seed -- 10     # menú de ejemplo + mesas 1 a 10 (no borra nada si ya hay datos)
npm run dev            # http://localhost:3000, con recarga automática al editar el código
npm test               # pruebas automáticas
```

Claves de desarrollo: administración `admin-desarrollo`, PIN de mozos `1234`.

Los datos se guardan en la carpeta `data/`: `bar.db` (base de datos SQLite) y `uploads/` (fotos).
Para empezar de cero, borre esa carpeta.

---

## 2. Configuración (`.env`)

Copie `.env.example` como `.env` y complete los valores:

| Variable | Para qué |
|---|---|
| `PUBLIC_URL` | Dirección pública, **la que se imprime dentro de los QR**. Ej: `https://menu.mibar.com`. Si se deja vacía, se usa la dirección con la que se abrió la administración. |
| `ADMIN_PASSWORD` | Contraseña de administración (mínimo 10 caracteres) |
| `STAFF_PIN` | PIN de los mozos (mínimo 4 dígitos) |
| `SESSION_SECRET` | Texto aleatorio largo para firmar las sesiones. Genérelo con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `BAR_NAME` | Nombre inicial del bar (después se cambia desde la administración) |
| `CURRENCY`, `LOCALE` | Moneda y formato de precios. Por defecto `ARS` / `es-AR` → "$ 4.500" |
| `CALL_COOLDOWN_SECONDS` | Segundos de bloqueo después de un llamado (por defecto 60) |
| `TZ` | Zona horaria del servidor |
| `PORT`, `DATA_DIR` | Puerto (3000) y carpeta de datos (`./data`) |
| `TRUST_PROXY` | Cantidad de proxys delante de la app (1 con Caddy, nginx o un hosting). En desarrollo se confía solo en proxys de la misma computadora. |

Con `NODE_ENV=production` la app **no arranca** si falta alguna variable importante o si las claves son demasiado cortas.
Así nunca queda publicada con las claves de prueba.

---

## 3. Probar con el celular en la misma red

1. Averigüe la IP de la computadora:
   - **Windows:** `ipconfig` → "Dirección IPv4" debajo de **"Adaptador de LAN inalámbrica Wi-Fi"**. Ignore las que dicen vEthernet, VirtualBox o VPN.
   - **Mac:** Ajustes del Sistema → Wi-Fi → Detalles.
2. Abra la administración **con esa IP**: `http://192.168.0.15:3000/admin`. Los QR toman la dirección con la que se abrió la página.
   Si los genera desde `localhost`, el QR contiene "localhost" y el celular no lo puede abrir.
3. Escanee un QR de la hoja de impresión con el celular. Debe estar conectado al mismo Wi-Fi y con los datos móviles apagados.

Si no abre, vea [El celular no abre la página](#el-celular-no-abre-la-página).

---

## 4. Probar por internet sin servidor (túnel gratuito)

Un túnel de Cloudflare le da a la computadora una dirección pública con HTTPS, sin abrir puertos ni configurar el router.
Sirve para probar con los datos móviles del celular.

```powershell
winget install --id Cloudflare.cloudflared        # una sola vez (Windows)
cloudflared tunnel --url http://localhost:3000     # con la app ya abierta
```

Aparece una dirección `https://algo-al-azar.trycloudflare.com`. Abra la administración **desde esa dirección**
para que los QR la usen.

Limitaciones:
- **La dirección cambia cada vez** que se abre el túnel. No imprima esos QR para el bar.
- **La computadora tiene que estar prendida.**
- **Las alertas en tiempo real pueden no funcionar a través del túnel rápido.** Abra el **panel de mozos en la computadora**, con `http://localhost:3000/personal`.

---

## 5. Publicar en un servidor

| Opción | Costo aproximado | Comentario |
|---|---|---|
| **VPS con Docker** (Hetzner, DigitalOcean, Vultr, Contabo…) — *recomendada* | USD 4-6 por mes | Control total, HTTPS automático, sobra capacidad. |
| **Oracle Cloud "Always Free"** + dirección gratuita de **DuckDNS** | Gratis | Pide tarjeta para verificar identidad. Oracle puede apagar servidores gratuitos con muy poco uso, y pasar la cuenta a "Pago por uso" lo evita, sin costo si no se excede lo gratuito. Las condiciones cambian: verifíquelas al registrarse. |
| Fly.io / Railway con volumen persistente | USD 3-7 por mes | Sin administrar el servidor. Necesita un volumen para `/data`. |
| ❌ Planes gratuitos que "duermen" (Render, Koyeb, etc.) | — | **No sirven.** Tardan hasta un minuto en despertar, cortan el panel de mozos y pueden borrar la base de datos al reiniciar. |

### Opción A — VPS con Docker (recomendada)

1. Cree un servidor Ubuntu 24.04 (1 vCPU, 1 GB de RAM) e instale Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
2. En su proveedor de dominio, cree un registro **A** de `menu.mibar.com` que apunte a la IP del servidor.
   Con DuckDNS, la dirección `tubar.duckdns.org` se configura en su sitio con la IP del servidor.
3. Copie el proyecto al servidor (por ejemplo con `git clone`) y configure:
   ```bash
   cp .env.example .env && nano .env              # PUBLIC_URL, claves, PIN y secreto
   echo "DOMINIO=menu.mibar.com" > deploy/.env
   ```
4. Arranque:
   ```bash
   cd deploy
   docker compose up -d --build
   ```
   Caddy obtiene el certificado HTTPS automáticamente. En uno o dos minutos, `https://menu.mibar.com/salud` responde `{"ok":true}`.
5. (Opcional) Cargue el menú de ejemplo y las mesas: `docker compose exec app node src/seed.js 15`

**Actualizar la aplicación:** `git pull && cd deploy && docker compose up -d --build`. La base de datos y las fotos se conservan en el volumen.

### Opción B — Sin Docker

```bash
npm ci --omit=dev
NODE_ENV=production npm start      # con las variables de .env
```

Déjelo como servicio (systemd o `pm2`) detrás de Caddy o nginx con HTTPS. Con nginx, desactive el buffer en
`/api/personal/eventos` (`proxy_buffering off;`). Mantenga `TRUST_PROXY=1` para que el límite de pedidos vea la IP real del cliente.

---

## 6. Copias de seguridad y monitoreo

### Copias de seguridad

`deploy/backup.sh` guarda una copia consistente de la base de datos y de las fotos, aunque la app esté funcionando.
Conserva los últimos 30 días. Prográmelo con `crontab -e`:

```
15 5 * * * /ruta/al/proyecto/deploy/backup.sh
```

Copie también las copias fuera del servidor (por ejemplo a Google Drive o a un disco externo).

### Monitoreo

Cree un chequeo gratuito en [UptimeRobot](https://uptimerobot.com) o un servicio similar sobre
`https://menu.mibar.com/salud`, con aviso al celular si deja de responder.

---

## 7. Solución de problemas

### Windows: "npm no se reconoce como comando"
Node.js no está instalado, o la computadora no se reinició después de instalarlo.

### Windows: la ventana negra muestra un error y "Presione una tecla para continuar"
Lea el mensaje de arriba antes de apretar la tecla. Los más comunes son:
- **"el puerto 3000 ya está en uso"**: la app ya está abierta en otra ventana.
- **Error al instalar**: revise la conexión a internet y vuelva a ejecutar `iniciar-windows.bat`. Repite la instalación si quedó a medias.

### El celular no abre la página
Primero abra `http://SU-IP:3000/admin` **en la misma computadora**:

- **No abre ni en la computadora** → la IP es incorrecta o la app no está corriendo.
- **Abre en la computadora pero no en el celular** → lo bloquea el firewall o el router.

**Firewall de Windows.** Abra *Terminal (Administrador)* (clic derecho en el botón Inicio) y ejecute:

```powershell
# Borra reglas que bloquean Node.js (se crean si alguna vez se tocó "Cancelar" en el aviso del firewall)
Get-NetFirewallApplicationFilter -Program "*node.exe" | Get-NetFirewallRule | Where-Object Action -eq Block | Remove-NetFirewallRule

# Permite conexiones al puerto de la app
New-NetFirewallRule -DisplayName "Menu QR Bar (puerto 3000)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Any
```

Cuando termine de probar, conviene quitar la regla, sobre todo si usa la computadora en redes públicas:
`Remove-NetFirewallRule -DisplayName "Menu QR Bar (puerto 3000)"`.

**Router con aislamiento de clientes.** Muchos routers de fibra de los proveedores, y las redes de "invitados",
no dejan que los dispositivos se comuniquen entre sí. Para comprobarlo, active el **hotspot** del celular,
conecte la computadora a esa red, vuelva a averiguar la IP y repita. Si así funciona, el bloqueo es del router.
Para usarla en el bar, lo más simple es [publicarla en un servidor](#5-publicar-en-un-servidor).

### El panel de mozos no suena
- Toque **"Empezar a recibir llamados"** al abrir el panel: los navegadores no dejan reproducir sonido sin un toque previo.
- Toque **"Probar sonido"** y suba el volumen con los botones laterales.
- En iPhone o iPad, revise que no esté activado **No molestar** ni otro modo de concentración.

### La tablet de los mozos se apaga sola
Desactive el bloqueo automático: en iPad, **Ajustes → Pantalla y brillo → Bloqueo automático → Nunca**.
En Android, **Ajustes → Pantalla → Tiempo de espera de la pantalla**. Déjela enchufada.
