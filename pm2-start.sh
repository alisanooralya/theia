#!/data/data/com.termux/files/usr/bin/bash
# Start the bot with pm2 (Termux friendly, no systemd needed)

set -e

APP_NAME="theia"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$APP_DIR/logs"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 not found, installing..."
  npm install -g pm2
fi

mkdir -p "$LOG_DIR"

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  echo "Reloading $APP_NAME..."
  pm2 reload "$APP_NAME" --update-env
else
  echo "Starting $APP_NAME..."
  pm2 start src/index.js \
    --name "$APP_NAME" \
    --cwd "$APP_DIR" \
    --time \
    --max-memory-restart 500M \
    --out-file "$LOG_DIR/out.log" \
    --error-file "$LOG_DIR/error.log"
fi

pm2 save
pm2 describe "$APP_NAME"

echo ""
echo "Logs : pm2 logs $APP_NAME"
echo "Stop : pm2 stop $APP_NAME"
echo "Autostart: install termux:boot lalu jalankan 'pm2 startup' di Termux"
