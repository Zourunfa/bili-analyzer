#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[db-recover] project: $ROOT_DIR"

if [[ -f ".env.local" ]]; then
  ENV_FILE=".env.local"
elif [[ -f ".env" ]]; then
  ENV_FILE=".env"
else
  echo "[db-recover] error: .env.local or .env not found"
  exit 1
fi

echo "[db-recover] using env file: $ENV_FILE"

DB_URL="$(node -e "require('dotenv').config({path:'$ENV_FILE'}); process.stdout.write(process.env.DATABASE_URL||'')" || true)"
if [[ -z "${DB_URL:-}" ]]; then
  echo "[db-recover] error: DATABASE_URL is empty"
  exit 1
fi

echo "[db-recover] DATABASE_URL detected"

pg_check() {
  node -e "require('dotenv').config({path:'$ENV_FILE'}); const {Client}=require('pg'); const c=new Client({connectionString:process.env.DATABASE_URL}); c.connect().then(()=>c.query('select 1')).then(()=>{console.log('ok'); return c.end();}).catch(e=>{console.error(e.code||'', e.message||String(e)); process.exit(1);});" >/tmp/db-recover-check.log 2>&1
}

if pg_check; then
  echo "[db-recover] postgres is already reachable"
else
  CHECK_ERR="$(cat /tmp/db-recover-check.log || true)"
  echo "[db-recover] initial check failed: $CHECK_ERR"

  OS="$(uname -s || true)"

  if [[ "$OS" == "Darwin" ]]; then
    if command -v brew >/dev/null 2>&1; then
      echo "[db-recover] trying brew services start postgresql@16"
      brew services start postgresql@16 || true
      if ! brew services list | grep -q "postgresql@16"; then
        echo "[db-recover] postgresql@16 not found, trying postgresql@15"
        brew services start postgresql@15 || true
      fi
    fi
  else
    if command -v systemctl >/dev/null 2>&1; then
      echo "[db-recover] trying systemctl start postgresql"
      systemctl start postgresql || true
      systemctl start postgresql@16-main || true
      systemctl start postgresql@15-main || true
    elif command -v service >/dev/null 2>&1; then
      echo "[db-recover] trying service postgresql start"
      service postgresql start || true
    fi
  fi

  if command -v docker >/dev/null 2>&1; then
    if docker info >/dev/null 2>&1; then
      if ! docker ps -a --format '{{.Names}}' | grep -q '^videonote-pg$'; then
        echo "[db-recover] creating docker postgres container: videonote-pg"
        docker run -d --name videonote-pg \
          -e POSTGRES_PASSWORD=postgres \
          -e POSTGRES_USER=postgres \
          -e POSTGRES_DB=videonote \
          -p 5432:5432 \
          postgres:16 >/dev/null || true
      else
        echo "[db-recover] starting existing docker container: videonote-pg"
        docker start videonote-pg >/dev/null || true
      fi
    fi
  fi

  for i in {1..20}; do
    if pg_check; then
      echo "[db-recover] postgres reachable after retry $i"
      break
    fi
    sleep 1
    if [[ "$i" == "20" ]]; then
      echo "[db-recover] failed: postgres still unreachable"
      cat /tmp/db-recover-check.log || true
      exit 1
    fi
  done
fi

echo "[db-recover] running prisma generate"
npx prisma generate

echo "[db-recover] running prisma migrate deploy"
npx prisma migrate deploy

echo "[db-recover] done"
