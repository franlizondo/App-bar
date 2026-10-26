@echo off
REM Doble clic para iniciar la aplicacion en Windows.
chcp 65001 >nul
title Menu QR - servidor
cd /d "%~dp0"

if not exist package.json (
  echo.
  echo  ERROR: este archivo esta fuera de la carpeta de la aplicacion.
  echo  Descomprima el ZIP con clic derecho - "Extraer todo" y ejecutelo desde la carpeta extraida.
  goto :error
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  ERROR: falta instalar Node.js, o la computadora no se reinicio despues de instalarlo.
  echo   1. Si no lo instalo: se abrira nodejs.org, descargue la version LTS e instalela.
  echo   2. REINICIE la computadora.
  echo   3. Vuelva a hacer doble clic en este archivo.
  start "" https://nodejs.org
  goto :error
)

echo.
echo  Node.js encontrado, version:
node -v

REM Se instala si nunca se completo la instalacion (aunque haya quedado a medias).
if not exist node_modules\.instalado (
  echo.
  echo  Primera vez: instalando, espere uno o dos minutos...
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo  ERROR: no se pudo instalar. Revise la conexion a internet y vuelva a intentar.
    echo  Si el error sigue, saque una foto de esta ventana y enviela.
    goto :error
  )
  echo ok> node_modules\.instalado
)

if not exist data\bar.db (
  echo.
  echo  Cargando menu de ejemplo y mesas 1 a 10...
  call npm run seed -- 10
  if errorlevel 1 goto :error
)

echo.
echo  =====================================================
echo   La aplicacion se abre en el navegador en unos segundos.
echo.
echo   Administracion:  http://localhost:3000/admin     clave: admin-desarrollo
echo   Panel de mozos:  http://localhost:3000/personal  PIN:   1234
echo.
echo   NO CIERRE ESTA VENTANA mientras use la aplicacion.
echo   Para apagarla, cierre esta ventana.
echo  =====================================================
echo.

start "" /min powershell -NoProfile -Command "Start-Sleep -Seconds 5; Start-Process 'http://localhost:3000/admin'"
call npm start
echo.
echo  La aplicacion se detuvo.

:error
echo.
echo  *****************************************************************
echo   Si ve un ERROR arriba, SAQUE UNA FOTO de esta ventana ANTES de
echo   apretar una tecla, y enviela para que lo podamos solucionar.
echo  *****************************************************************
echo.
pause
