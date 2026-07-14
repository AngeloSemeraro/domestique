#!/usr/bin/env bash
#
# Pubblica Domestique sul sito WordPress in un solo comando, da un Mac/PC
# SENZA Node: scarica l'ultima versione (git pull) e carica il plugin
# già compilato via FTP. Il build avviene nel cloud e finisce nel repo.
#
#   ./scripts/publish.sh
#
# Richiede solo: git e lftp, più scripts/.env.deploy (gitignored).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "▸ Aggiorno il progetto (git pull)…"
git pull --ff-only

ENV_FILE="$ROOT/scripts/.env.deploy"
[ -f "$ENV_FILE" ] || { echo "✗ Manca $ENV_FILE — copia scripts/.env.deploy.example"; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE"
: "${DEPLOY_HOST:?set DEPLOY_HOST}"; : "${DEPLOY_USER:?set DEPLOY_USER}"; : "${DEPLOY_PASS:?set DEPLOY_PASS}"
DEPLOY_METHOD="${DEPLOY_METHOD:-ftps}"
DEPLOY_PORT="${DEPLOY_PORT:-21}"
PLUGIN_REMOTE_DIR="${PLUGIN_REMOTE_DIR:-wp-content/plugins/domestique}"

LOCAL="$ROOT/wordpress-plugin/domestique"
[ -f "$LOCAL/assets/js/app.iife.js" ] || { echo "✗ Manca il bundle compilato nel repo"; exit 1; }

command -v lftp >/dev/null || { echo "✗ lftp non installato (brew install lftp)"; exit 1; }

case "$DEPLOY_METHOD" in
  sftp) SCHEME=sftp; SET="set sftp:auto-confirm yes;" ;;
  ftps) SCHEME=ftp;  SET="set ftp:ssl-force true; set ftp:ssl-protect-data true; set ssl:verify-certificate no;" ;;
  ftp)  SCHEME=ftp;  SET="set ftp:ssl-allow no;" ;;
  *) echo "✗ DEPLOY_METHOD deve essere sftp, ftps o ftp"; exit 1 ;;
esac

echo "▸ Carico su $DEPLOY_HOST:$PLUGIN_REMOTE_DIR  ($DEPLOY_METHOD)…"
LFTP_PASSWORD="$DEPLOY_PASS" lftp --env-password -u "$DEPLOY_USER" "$SCHEME://$DEPLOY_HOST:$DEPLOY_PORT" <<LFTP
$SET
set net:timeout 30;
set net:max-retries 2;
mirror -R --delete --verbose --exclude-glob .DS_Store "$LOCAL/" "$PLUGIN_REMOTE_DIR/"
bye
LFTP
echo "✓ Pubblicato su WordPress."
