#!/usr/bin/env bash
#
# claude-sandbox.sh — bring up the whole of DockyDoc inside a Claude Code
# container so the real UI can be opened, clicked and screenshotted.
#
#   ./scripts/claude-sandbox.sh up      start everything (default)
#   ./scripts/claude-sandbox.sh down    stop everything and delete the database
#   ./scripts/claude-sandbox.sh status  show what is running
#
# Why this exists: docker-compose (dev.sh) needs a Docker daemon, which these
# containers do not run. This uses the Postgres binaries that are already
# installed, so it works with nothing but the repo.
#
# Auth: with no Clerk keys the app runs in dev-auth mode and the API trusts an
# `x-dev-user-email` header, so you are signed in as the seeded user without a
# Clerk instance. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (a development
# instance `pk_test_...`) before running to exercise the real Clerk screens
# instead; CLERK_SECRET_KEY is only needed to verify sessions server-side.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# /var/tmp, not the scratchpad: the postgres user cannot traverse the
# scratchpad, and its permissions are reset underneath a running server.
STATE_DIR="${DOCKYDOC_SANDBOX_DIR:-/var/tmp/dockydoc-sandbox}"
PGDATA="$STATE_DIR/pgdata"
LOG_DIR="$STATE_DIR/logs"

PG_PORT="${DOCKYDOC_PG_PORT:-5433}"
API_PORT="${DOCKYDOC_API_PORT:-8081}"
WEB_PORT="${DOCKYDOC_WEB_PORT:-3000}"

PG_BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
DB_URL="postgresql://postgres@localhost:${PG_PORT}/dockydoc?host=/tmp"

# Throwaway secrets. Real ones live in Render and Vercel; nothing here touches them.
export DATABASE_URL="$DB_URL"
export DIRECT_URL="$DB_URL"
export STORAGE_DRIVER=local
export ENCRYPTION_KEY="${ENCRYPTION_KEY:-0123456789abcdef0123456789abcdef}"
export SHARE_GRANT_SECRET="${SHARE_GRANT_SECRET:-0123456789abcdef0123456789abcdef0123456789abcdef}"
export JWT_SECRET="${JWT_SECRET:-sandbox_jwt_secret_not_used_in_production}"
export CORS_ORIGINS="http://localhost:${WEB_PORT}"

say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

require_pg() {
  if [ -z "$PG_BIN" ]; then
    echo "No PostgreSQL binaries found under /usr/lib/postgresql." >&2
    echo "Install them, or point DATABASE_URL at a database you already have." >&2
    exit 1
  fi
}

stop_all() {
  # The API is started from $ROOT/api as `node dist/main.js`, so its command
  # line carries no absolute path and a pattern built from $ROOT never matched
  # it: a stale API survived every restart and kept serving the previous build
  # on the port, so API changes silently did not take effect. Kill the PID this
  # script recorded, and fall back to the marker it sets in the process
  # environment, since the command line alone cannot tell them apart.
  if [ -f "$STATE_DIR/api.pid" ]; then
    kill "$(cat "$STATE_DIR/api.pid")" 2>/dev/null || true
    rm -f "$STATE_DIR/api.pid"
  fi
  for pid in $(pgrep -f "node dist/main.js" 2>/dev/null || true); do
    if tr '\0' '\n' < /proc/"$pid"/environ 2>/dev/null | grep -qx "DOCKYDOC_SANDBOX=api"; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  pkill -f "next-server" 2>/dev/null || true
  pkill -f "next start" 2>/dev/null || true
  if [ -d "$PGDATA" ]; then
    su postgres -c "$PG_BIN/pg_ctl -D $PGDATA stop -m fast" >/dev/null 2>&1 || true
  fi
  # Any other postmaster still holding the port (a sandbox from an earlier
  # session, or a stray server) would stop this one binding.
  pkill -f "postgres.*-p ${PG_PORT}" 2>/dev/null || true
  sleep 1
  rm -f "/tmp/.s.PGSQL.${PG_PORT}" "/tmp/.s.PGSQL.${PG_PORT}.lock" 2>/dev/null || true
}

case "${1:-up}" in
  down)
    say "Stopping sandbox"
    stop_all
    rm -rf "$STATE_DIR"
    echo "Stopped. Database deleted."
    exit 0
    ;;
  status)
    printf 'postgres  %s\n' "$(pg_isready -h /tmp -p "$PG_PORT" >/dev/null 2>&1 && echo running || echo stopped)"
    printf 'api       %s\n' "$(curl -fsS -m 3 "http://localhost:${API_PORT}/api/v1/health" >/dev/null 2>&1 && echo running || echo stopped)"
    printf 'web       %s\n' "$(curl -fsS -m 3 -o /dev/null "http://localhost:${WEB_PORT}/login" && echo running || echo stopped)"
    exit 0
    ;;
  up) ;;
  *)
    echo "Usage: $0 [up|down|status]" >&2
    exit 1
    ;;
esac

require_pg
say "Cleaning up anything already running"
stop_all
rm -rf "$STATE_DIR"
mkdir -p "$PGDATA" "$LOG_DIR"
chown postgres:postgres "$PGDATA"

say "Starting PostgreSQL on port $PG_PORT"
su postgres -c "$PG_BIN/initdb -D $PGDATA -U postgres --auth=trust" > "$LOG_DIR/initdb.log" 2>&1
su postgres -c "$PG_BIN/pg_ctl -D $PGDATA -o '-p $PG_PORT -k /tmp' -l $PGDATA/server.log start" >/dev/null
for _ in $(seq 1 30); do
  pg_isready -h /tmp -p "$PG_PORT" >/dev/null 2>&1 && break
  sleep 1
done
psql -h /tmp -p "$PG_PORT" -U postgres -qc "CREATE DATABASE dockydoc;"

say "Installing API dependencies"
cd "$ROOT/api"
[ -d node_modules ] || npm install --no-audit --no-fund --silent

say "Applying migrations and seeding"
npx prisma migrate deploy 2>&1 | tail -1
npm run db:seed 2>&1 | tail -3

say "Building and starting the API on port $API_PORT"
npm run build 2>&1 | tail -1
# NODE_ENV belongs to the API alone: exporting it would put `next build`
# into development mode, where prerendering fails.
NODE_ENV=development PORT="$API_PORT" DOCKYDOC_SANDBOX=api \
  setsid nohup node dist/main.js > "$LOG_DIR/api.log" 2>&1 < /dev/null &
echo $! > "$STATE_DIR/api.pid"
for _ in $(seq 1 40); do
  curl -fsS -m 2 "http://localhost:${API_PORT}/api/v1/health" >/dev/null 2>&1 && break
  sleep 1
done

say "Building and starting the web app on port $WEB_PORT"
cd "$ROOT/web"
[ -d node_modules ] || npm install --no-audit --no-fund --silent
export API_URL="http://localhost:${API_PORT}"
npx next build 2>&1 | grep -E '✓|Error' | head -3
PORT="$WEB_PORT" DOCKYDOC_SANDBOX=web \
  setsid nohup npx next start > "$LOG_DIR/web.log" 2>&1 < /dev/null &
for _ in $(seq 1 40); do
  curl -fsS -m 2 -o /dev/null "http://localhost:${WEB_PORT}/login" && break
  sleep 1
done

say "Ready"
cat <<INFO
  Web    http://localhost:${WEB_PORT}
  API    http://localhost:${API_PORT}/api/v1
  Docs   http://localhost:${API_PORT}/api/docs
  Health http://localhost:${API_PORT}/api/v1/health
  Logs   $LOG_DIR

  Signed in as   alice@acmecorp.com   (seeded owner)
  Clerk          ${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:+enabled}${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-off — dev-auth header mode}

  curl the API directly:
    curl -H 'x-dev-user-email: alice@acmecorp.com' http://localhost:${API_PORT}/api/v1/auth/me

  Stop it with: ./scripts/claude-sandbox.sh down
INFO
