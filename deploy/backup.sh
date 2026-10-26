#!/bin/sh
# Copia de seguridad diaria de la base de datos y las fotos.
# Programar con cron:  15 5 * * *  /ruta/al/proyecto/deploy/backup.sh
set -e
DESTINO="${DESTINO:-$HOME/backups-bar}"
FECHA="$(date +%Y-%m-%d)"
mkdir -p "$DESTINO"
# "VACUUM INTO" de SQLite hace una copia consistente aunque la app esté funcionando.
docker compose -f "$(dirname "$0")/docker-compose.yml" exec -T app \
  node --disable-warning=ExperimentalWarning -e "require('fs').rmSync('/data/backup.db',{force:true});new (require('node:sqlite').DatabaseSync)('/data/bar.db').exec(\"VACUUM INTO '/data/backup.db'\")"
docker compose -f "$(dirname "$0")/docker-compose.yml" exec -T app tar -C /data -czf - backup.db uploads > "$DESTINO/bar-$FECHA.tar.gz"
# Conserva los últimos 30 días.
find "$DESTINO" -name 'bar-*.tar.gz' -mtime +30 -delete
echo "Copia guardada en $DESTINO/bar-$FECHA.tar.gz"
