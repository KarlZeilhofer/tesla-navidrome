#!/bin/sh
set -eu

cd /root/git/tesla-navidrome
PATH=/usr/local/node-v24.16.0/bin:$PATH npm install
PATH=/usr/local/node-v24.16.0/bin:$PATH npm run build
install -d -m 0755 /var/www/tesla-navidrome
find /var/www/tesla-navidrome -mindepth 1 -maxdepth 3 -delete
cp -a dist/. /var/www/tesla-navidrome/
nginx -t
systemctl reload nginx
