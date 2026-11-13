#!/bin/sh
set -eu
if ! dpkg-query -W -f='${Status}' python3.11-venv 2>/dev/null | grep -q 'install ok installed'; then
  apt-get update -qq
  apt-get install -y python3.11-venv
fi
python3 -m venv /opt/tesla-navidrome-radio-venv
/opt/tesla-navidrome-radio-venv/bin/pip install --disable-pip-version-check -r server/radio-requirements.txt
python3 server/setup_radio.py
