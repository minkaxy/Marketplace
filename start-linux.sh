#!/usr/bin/env sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
node scripts/check-runtime.mjs
if [ ! -f .env ]; then cp config.example.env .env; chmod 600 .env; fi
node scripts/build.mjs
exec node scripts/start.mjs
