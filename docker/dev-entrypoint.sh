#!/bin/sh

set -eu

lock_hash="$(sha256sum package-lock.json | cut -d ' ' -f 1)"
lock_marker="node_modules/.gam-package-lock.sha256"

if [ ! -f "$lock_marker" ] || [ "$(cat "$lock_marker")" != "$lock_hash" ]; then
  echo "Installing dependencies because package-lock.json changed."
  npm ci
  printf '%s\n' "$lock_hash" > "$lock_marker"
fi

exec npm start -- \
  --host 0.0.0.0 \
  --port 4200 \
  --poll "${WATCH_POLL_INTERVAL:-2000}" \
  --proxy-config proxy.docker.conf.json
