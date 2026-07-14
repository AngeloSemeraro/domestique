#!/usr/bin/env bash
#
# Deploy Domestique to a WordPress site over SFTP/FTPS.
#
# Runs from a LOCAL Claude Code session (or your own terminal) — this needs
# real outbound SSH/FTP access to your host, which the cloud environment
# doesn't have. Credentials live in scripts/.env.deploy, which is gitignored
# and never leaves your machine.
#
#   1. cp scripts/.env.deploy.example scripts/.env.deploy
#   2. fill in scripts/.env.deploy
#   3. ./scripts/deploy.sh            # builds + uploads the plugin
#
# Requires: node/npm and `lftp` (brew install lftp / apt-get install lftp).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/scripts/.env.deploy"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "✗ Missing $ENV_FILE — copy scripts/.env.deploy.example and fill it in." >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

: "${DEPLOY_HOST:?set DEPLOY_HOST in .env.deploy}"
: "${DEPLOY_USER:?set DEPLOY_USER in .env.deploy}"
: "${DEPLOY_PASS:?set DEPLOY_PASS in .env.deploy}"
DEPLOY_METHOD="${DEPLOY_METHOD:-sftp}"   # sftp | ftp | ftps
DEPLOY_PORT="${DEPLOY_PORT:-22}"
PLUGIN_REMOTE_DIR="${PLUGIN_REMOTE_DIR:-wp-content/plugins/domestique}"

if ! command -v lftp >/dev/null 2>&1; then
  echo "✗ lftp not installed. macOS: brew install lftp — Debian/Ubuntu: sudo apt-get install lftp" >&2
  exit 1
fi

echo "▸ Building the plugin bundle…"
( cd "$ROOT/wordpress-plugin" && npm install --silent && npm run build )
LOCAL_DIR="$ROOT/wordpress-plugin/domestique"
test -f "$LOCAL_DIR/assets/js/app.iife.js"
test -f "$LOCAL_DIR/assets/css/app.css"

# Pick the lftp URL scheme. sftp uses SSH (port 22); ftp/ftps use 21.
case "$DEPLOY_METHOD" in
  sftp) SCHEME="sftp"; SETTINGS="set sftp:auto-confirm yes;" ;;
  ftps) SCHEME="ftp";  SETTINGS="set ftp:ssl-force true; set ftp:ssl-protect-data true; set ssl:verify-certificate no;" ;;
  ftp)  SCHEME="ftp";  SETTINGS="set ftp:ssl-allow no;" ;;
  *) echo "✗ DEPLOY_METHOD must be sftp, ftps or ftp (got '$DEPLOY_METHOD')" >&2; exit 1 ;;
esac

echo "▸ Uploading $LOCAL_DIR → $DEPLOY_HOST:$PLUGIN_REMOTE_DIR  ($DEPLOY_METHOD)"
# mirror -R = reverse mirror (local → remote). --delete keeps the remote
# folder an exact copy; drop it if you prefer additive uploads.
LFTP_PASSWORD="$DEPLOY_PASS" lftp --env-password -u "$DEPLOY_USER" "$SCHEME://$DEPLOY_HOST:$DEPLOY_PORT" <<LFTP
$SETTINGS
set net:max-retries 2;
set net:timeout 20;
mirror -R --delete --verbose --exclude-glob .DS_Store "$LOCAL_DIR/" "$PLUGIN_REMOTE_DIR/"
bye
LFTP

echo "✓ Plugin deployed to $DEPLOY_HOST:$PLUGIN_REMOTE_DIR"
