@echo off
REM Doble clic para iniciar la aplicacion en Windows.
chcp 65001 >nul
title Menu QR - servidor
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Falta instalar Node.js.
  echo  Se abrira la pagina de descarga: instale la version LTS y vuelva a hacer doble clic aqui.
  echo.
  start "" https://nodejs.org
  pause
  exit /b
)

if not exist node_modules (
  echo.
  echo  Primera vez: instalando, espere un minuto...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo  No se pudo instalar. Revise la conexion a internet y vuelva a intentar.
    pause
    exit /b
  )
)

if not exist data\bar.db (
  echo.
  echo  Cargando menu de ejemplo y mesas 1 a 10...
  call npm run seed -- 10
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

start "" /min powershell -NoProfile -Command "Start-Sleep -Seconds 4; Start-Process 'http://localhost:3000/admin'"
call npm start
pause
