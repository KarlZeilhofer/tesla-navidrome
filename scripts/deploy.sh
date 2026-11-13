#!/bin/sh
set -eu

SCRIPT_PATH=$(readlink -f "$0")
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$SCRIPT_PATH")" && pwd)
cd "$SCRIPT_DIR/.."
PATH=/usr/local/node-v24.16.0/bin:$PATH npm install
PATH=/usr/local/node-v24.16.0/bin:$PATH npm run build

if ! getent passwd tesla-navidrome-control >/dev/null; then
  useradd --system --home-dir /var/lib/tesla-navidrome-control --shell /usr/sbin/nologin tesla-navidrome-control
fi

install -d -m 0755 /opt/tesla-navidrome-control
install -m 0644 package.json package-lock.json /opt/tesla-navidrome-control/
PATH=/usr/local/node-v24.16.0/bin:$PATH npm ci --omit=dev --ignore-scripts --prefix /opt/tesla-navidrome-control
install -m 0644 server/control-server.mjs /opt/tesla-navidrome-control/control-server.mjs
install -o root -g root -m 0755 server/music-files.py /usr/local/sbin/tesla-navidrome-music-files
install -d -o root -g root -m 0700 /srv/tesla-navidrome-trash
install -m 0644 deploy/tesla-music-files.service /etc/systemd/system/tesla-music-files.service
install -d -o tesla-navidrome-control -g tesla-navidrome-control -m 0700 /var/lib/tesla-navidrome-control
install -d -o tesla-navidrome-control -g navidrome -m 2755 /srv/music/Uploads
install -m 0644 deploy/tesla-navidrome-control.service /etc/systemd/system/tesla-navidrome-control.service
install -m 0644 deploy/nginx-control-location.conf /etc/nginx/snippets/tesla-navidrome-control.conf
systemctl daemon-reload
systemctl enable tesla-music-files.service
systemctl restart tesla-music-files.service
systemctl enable tesla-navidrome-control.service
systemctl restart tesla-navidrome-control.service

install -d -m 0755 /var/www/tesla-navidrome
find /var/www/tesla-navidrome -mindepth 1 -maxdepth 3 -delete
cp -a dist/. /var/www/tesla-navidrome/
nginx -t
systemctl reload nginx
