#!/usr/bin/env bash
set -euo pipefail

APP_NAME="as400-data-importer-pro"
APP_USER="as400pro"
APP_ROOT="/opt/${APP_NAME}"
RELEASE_DIR="${APP_ROOT}/current"
DATA_DIR="/var/lib/${APP_NAME}"
ENV_FILE="/etc/${APP_NAME}.env"

if [[ "$(id -u)" != "0" ]]; then
  echo "Run as root." >&2
  exit 1
fi

apt-get update
apt-get install -y python3 python3-venv python3-pip nginx openjdk-17-jre-headless rsync

if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --home "${APP_ROOT}" --shell /usr/sbin/nologin "${APP_USER}"
fi

mkdir -p "${APP_ROOT}" "${DATA_DIR}" "${APP_ROOT}/downloads"
rsync -a --delete \
  --exclude ".git" \
  --exclude "node_modules" \
  --exclude "dist_windows" \
  --exclude "dist_windows_new" \
  --exclude "venv" \
  --exclude "backend/data" \
  /tmp/as400-data-importer-pro/ "${RELEASE_DIR}/"

python3 -m venv "${APP_ROOT}/venv"
"${APP_ROOT}/venv/bin/pip" install --upgrade pip wheel
"${APP_ROOT}/venv/bin/pip" install -r "${RELEASE_DIR}/requirements.txt"

if [[ ! -f "${ENV_FILE}" ]]; then
  install -m 600 "${RELEASE_DIR}/deploy/as400pro.env.example" "${ENV_FILE}"
  python3 - <<'PY' "${ENV_FILE}"
import secrets, sys
path = sys.argv[1]
text = open(path, encoding="utf-8").read()
text = text.replace("change-me-to-a-long-random-secret", secrets.token_urlsafe(48))
open(path, "w", encoding="utf-8").write(text)
PY
  echo "Created ${ENV_FILE}. Add SENDGRID_API_KEY before enabling email."
fi

install -m 644 "${RELEASE_DIR}/deploy/as400-data-importer-pro.service" /etc/systemd/system/as400-data-importer-pro.service
install -m 644 "${RELEASE_DIR}/deploy/nginx-as400pro.conf" /etc/nginx/sites-available/as400pro.ikonetsolutions.com
ln -sfn /etc/nginx/sites-available/as400pro.ikonetsolutions.com /etc/nginx/sites-enabled/as400pro.ikonetsolutions.com

chown -R "${APP_USER}:${APP_USER}" "${APP_ROOT}" "${DATA_DIR}"
chmod 750 "${DATA_DIR}"

nginx -t
systemctl daemon-reload
systemctl enable --now as400-data-importer-pro
systemctl reload nginx

systemctl --no-pager --full status as400-data-importer-pro
