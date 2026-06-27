#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Marginly — Local Development Startup Script
#
# Usage:
#   ./dev.sh            Start everything (DB, API, frontend, seed data)
#   ./dev.sh --no-seed  Skip the database seed step
#   ./dev.sh --stop     Stop Docker services and exit
#
# Prerequisites:
#   Node.js 18+, npm, Docker (for Postgres + Redis)
#   OR: Postgres 15 and Redis 7 already running natively
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
ENV_FILE="$BACKEND_DIR/.env"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

log()     { echo -e "${BLUE}[marginly]${RESET} $*"; }
success() { echo -e "${GREEN}[✓]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[!]${RESET} $*"; }
error()   { echo -e "${RED}[✗]${RESET} $*" >&2; }
header()  { echo -e "\n${BOLD}${CYAN}══ $* ══${RESET}"; }

# ── Argument parsing ──────────────────────────────────────────────────────────
SKIP_SEED=false
STOP_MODE=false

for arg in "$@"; do
  case "$arg" in
    --no-seed) SKIP_SEED=true ;;
    --stop)    STOP_MODE=true ;;
    --help|-h)
      echo "Usage: $0 [--no-seed] [--stop]"
      exit 0
      ;;
    *)
      error "Unknown argument: $arg"; exit 1 ;;
  esac
done

# ── Stop mode ─────────────────────────────────────────────────────────────────
if $STOP_MODE; then
  log "Stopping Docker services…"
  cd "$SCRIPT_DIR"
  docker compose down
  success "Services stopped."
  exit 0
fi

# ── Track background PIDs for cleanup on Ctrl-C ───────────────────────────────
PIDS=()

cleanup() {
  echo ""
  log "Shutting down…"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  # Let processes exit gracefully
  sleep 1
  exit 0
}
trap cleanup SIGINT SIGTERM

# ─────────────────────────────────────────────────────────────────────────────
header "Checking prerequisites"
# ─────────────────────────────────────────────────────────────────────────────

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    error "$1 not found. $2"
    exit 1
  fi
  success "$1 found"
}

check_cmd node  "Install Node.js 18+ from https://nodejs.org"
check_cmd npm   "Install Node.js 18+ from https://nodejs.org"
check_cmd openssl "Install openssl via Homebrew: brew install openssl"

NODE_VERSION=$(node -e "process.exit(parseInt(process.version.slice(1)) < 18 ? 1 : 0)" 2>/dev/null && echo "ok" || echo "old")
if [[ "$NODE_VERSION" == "old" ]]; then
  error "Node.js 18+ required. Current: $(node --version)"
  exit 1
fi
success "Node.js $(node --version)"

# ─────────────────────────────────────────────────────────────────────────────
header "Starting infrastructure (Postgres + Redis)"
# ─────────────────────────────────────────────────────────────────────────────

USE_DOCKER=false

wait_for_port() {
  local host=$1 port=$2 label=$3 max=${4:-30}
  local waited=0
  until (echo >/dev/tcp/"$host"/"$port") 2>/dev/null; do
    sleep 1; waited=$((waited + 1))
    if [[ $waited -ge $max ]]; then
      error "$label did not become reachable on $host:$port within ${max}s."
      return 1
    fi
  done
  success "$label is ready on $host:$port"
}

if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  USE_DOCKER=true
  log "Docker detected — starting Postgres 15 and Redis 7 via docker compose…"
  cd "$SCRIPT_DIR"
  docker compose up -d

  DB_URL="postgres://marginly:marginly@localhost:5432/marginly"
  REDIS_URL="redis://localhost:6379"

  wait_for_port localhost 5432 "Postgres" 60 || exit 1
  wait_for_port localhost 6379 "Redis"    30 || exit 1

elif command -v brew &>/dev/null; then
  warn "Docker not available — using Homebrew services for Postgres and Redis."

  # Install if missing
  if ! brew list postgresql@15 &>/dev/null && ! brew list postgresql &>/dev/null; then
    log "Installing postgresql@15 via Homebrew…"
    brew install postgresql@15
  fi
  if ! brew list redis &>/dev/null; then
    log "Installing redis via Homebrew…"
    brew install redis
  fi

  # Start services
  brew services start postgresql@15 2>/dev/null || brew services start postgresql 2>/dev/null || true
  brew services start redis 2>/dev/null || true

  # Create the marginly role and DB if they don't exist
  sleep 2
  local_pg_user=$(whoami)
  psql postgres -U "$local_pg_user" \
    -c "CREATE ROLE marginly LOGIN PASSWORD 'marginly';" 2>/dev/null || true
  psql postgres -U "$local_pg_user" \
    -c "CREATE DATABASE marginly OWNER marginly;" 2>/dev/null || true

  DB_URL="postgres://marginly:marginly@localhost:5432/marginly"
  REDIS_URL="redis://localhost:6379"

  wait_for_port localhost 5432 "Postgres" 30 || exit 1
  wait_for_port localhost 6379 "Redis"    15 || exit 1

else
  warn "Neither Docker nor Homebrew found."
  warn "Please start Postgres 15 and Redis 7 manually, then re-run this script."
  warn "  Postgres: postgres://marginly:marginly@localhost:5432/marginly"
  warn "  Redis:    redis://localhost:6379"
  DB_URL="postgres://marginly:marginly@localhost:5432/marginly"
  REDIS_URL="redis://localhost:6379"

  wait_for_port localhost 5432 "Postgres" 5 || exit 1
  wait_for_port localhost 6379 "Redis"    5 || exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
header "Setting up backend environment"
# ─────────────────────────────────────────────────────────────────────────────

if [[ ! -f "$ENV_FILE" ]]; then
  log "Creating $ENV_FILE from .env.example…"
  cp "$BACKEND_DIR/.env.example" "$ENV_FILE"
  # Replace placeholder DATABASE_URL and REDIS_URL in-place immediately
  sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|" "$ENV_FILE"
  sed -i '' "s|^REDIS_URL=.*|REDIS_URL=$REDIS_URL|"   "$ENV_FILE"

  # Generate RS256 key pair for JWT (stored base64-encoded in .env)
  log "Generating RS256 key pair for JWT…"
  TMPDIR_KEYS=$(mktemp -d)
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
    -out "$TMPDIR_KEYS/private.pem" 2>/dev/null
  openssl rsa -pubout -in "$TMPDIR_KEYS/private.pem" \
    -out "$TMPDIR_KEYS/public.pem" 2>/dev/null
  JWT_PRIVATE_KEY=$(base64 < "$TMPDIR_KEYS/private.pem" | tr -d '\n')
  JWT_PUBLIC_KEY=$(base64  < "$TMPDIR_KEYS/public.pem"  | tr -d '\n')
  APP_SECRET=$(openssl rand -hex 32)
  WIDGET_SECRET=$(openssl rand -hex 24)
  rm -rf "$TMPDIR_KEYS"

  # Append generated secrets (DATABASE_URL/REDIS_URL already set in-place above)
  {
    echo ""
    echo "# ── Auto-generated by dev.sh ($(date -u +%Y-%m-%dT%H:%M:%SZ)) ──"
    echo "APP_SECRET=$APP_SECRET"
    echo "JWT_PRIVATE_KEY=$JWT_PRIVATE_KEY"
    echo "JWT_PUBLIC_KEY=$JWT_PUBLIC_KEY"
    echo "WIDGET_SECRET=$WIDGET_SECRET"
    echo "SKIP_HIBP_CHECK=true"
    echo "NODE_ENV=development"
    echo "FRONTEND_URL=http://localhost:5173"
  } >> "$ENV_FILE"

  success ".env created with generated RSA keys and secrets"
else
  log ".env already exists — skipping generation"

  # Ensure DATABASE_URL and REDIS_URL are current (may have been copied from example)
  if ! grep -q "^DATABASE_URL=postgres" "$ENV_FILE" 2>/dev/null; then
    echo "DATABASE_URL=$DB_URL" >> "$ENV_FILE"
    log "Appended DATABASE_URL to existing .env"
  fi
  if ! grep -q "^REDIS_URL=redis" "$ENV_FILE" 2>/dev/null; then
    echo "REDIS_URL=$REDIS_URL" >> "$ENV_FILE"
    log "Appended REDIS_URL to existing .env"
  fi
  # Ensure JWT keys exist (needed for RS256 auth)
  if ! grep -q "^JWT_PRIVATE_KEY=" "$ENV_FILE" 2>/dev/null; then
    warn "JWT_PRIVATE_KEY missing in .env — generating new RSA key pair…"
    TMPDIR_KEYS=$(mktemp -d)
    openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
      -out "$TMPDIR_KEYS/private.pem" 2>/dev/null
    openssl rsa -pubout -in "$TMPDIR_KEYS/private.pem" \
      -out "$TMPDIR_KEYS/public.pem" 2>/dev/null
    echo "JWT_PRIVATE_KEY=$(base64 < "$TMPDIR_KEYS/private.pem" | tr -d '\n')" >> "$ENV_FILE"
    echo "JWT_PUBLIC_KEY=$(base64  < "$TMPDIR_KEYS/public.pem"  | tr -d '\n')"  >> "$ENV_FILE"
    rm -rf "$TMPDIR_KEYS"
    success "RSA keys appended to .env"
  fi
  if ! grep -q "^SKIP_HIBP_CHECK=" "$ENV_FILE" 2>/dev/null; then
    echo "SKIP_HIBP_CHECK=true" >> "$ENV_FILE"
  fi
  if ! grep -q "^WIDGET_SECRET=" "$ENV_FILE" 2>/dev/null; then
    echo "WIDGET_SECRET=$(openssl rand -hex 24)" >> "$ENV_FILE"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
header "Installing dependencies"
# ─────────────────────────────────────────────────────────────────────────────

log "Backend…"
(cd "$BACKEND_DIR" && npm install --prefer-offline --loglevel=error)
success "Backend dependencies ready"

log "Frontend…"
(cd "$FRONTEND_DIR" && npm install --prefer-offline --loglevel=error)
success "Frontend dependencies ready"

# ─────────────────────────────────────────────────────────────────────────────
header "Database migrations"
# ─────────────────────────────────────────────────────────────────────────────

log "Syncing database schema…"
if [[ -d "$BACKEND_DIR/prisma/migrations" ]]; then
  (cd "$BACKEND_DIR" && npx prisma migrate deploy 2>&1 | tail -5)
else
  (cd "$BACKEND_DIR" && npx prisma db push --skip-generate 2>&1 | tail -5)
fi
success "Database schema up to date"

if ! $SKIP_SEED; then
  log "Seeding demo data…"
  (cd "$BACKEND_DIR" && npx ts-node prisma/seed.ts 2>&1 | tail -10)
  success "Demo data seeded"
else
  log "Skipping seed (--no-seed flag set)"
fi

# ─────────────────────────────────────────────────────────────────────────────
header "Starting services"
# ─────────────────────────────────────────────────────────────────────────────

BACKEND_LOG="$SCRIPT_DIR/.dev-backend.log"
FRONTEND_LOG="$SCRIPT_DIR/.dev-frontend.log"

log "Starting backend API on http://localhost:4000 …"
(cd "$BACKEND_DIR" && npm run dev 2>&1) > "$BACKEND_LOG" &
PIDS+=($!)

# Give the backend a moment to start before the frontend
sleep 2

log "Starting frontend on http://localhost:5173 …"
(cd "$FRONTEND_DIR" && npm run dev 2>&1) > "$FRONTEND_LOG" &
PIDS+=($!)

# ─────────────────────────────────────────────────────────────────────────────
# Wait for the backend to be healthy
# ─────────────────────────────────────────────────────────────────────────────
log "Waiting for API to be ready…"
wait_for_port localhost 4000 "API" 90 || warn "API slow to start — check: tail -f $BACKEND_LOG"

# ─────────────────────────────────────────────────────────────────────────────
# Ready banner
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║          Marginly is running locally  🚀             ║${RESET}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}Frontend${RESET}   →  ${CYAN}http://localhost:5173${RESET}"
echo -e "  ${BOLD}API${RESET}        →  ${CYAN}http://localhost:4000${RESET}"
echo -e "  ${BOLD}API Docs${RESET}   →  ${CYAN}http://localhost:4000/api/docs${RESET}"
echo ""
echo -e "  ${BOLD}Demo accounts${RESET}"
echo -e "  ┌─────────────────────────────┬────────────────────┬──────────┐"
echo -e "  │ Tenant                      │ Email              │ Password │"
echo -e "  ├─────────────────────────────┼────────────────────┼──────────┤"
echo -e "  │ Acme Coffee Roasters (GROWTH│ demo@acmecoffee.com│ DemoPass123! │"
echo -e "  │ Acme Coffee Roasters (ADMIN)│ ops@acmecoffee.com │ DemoPass123! │"
echo -e "  │ PixelForge Studio (STARTER) │ demo@pixelforge.com│ DemoPass123! │"
echo -e "  └─────────────────────────────┴────────────────────┴──────────┘"
echo ""
echo -e "  ${BOLD}Logs${RESET}"
echo -e "  Backend:   tail -f $BACKEND_LOG"
echo -e "  Frontend:  tail -f $FRONTEND_LOG"
echo ""
echo -e "  ${YELLOW}Press Ctrl-C to stop all services${RESET}"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Tail both logs to the terminal so the developer sees output in real time
# ─────────────────────────────────────────────────────────────────────────────
tail -f "$BACKEND_LOG" "$FRONTEND_LOG" &
PIDS+=($!)

# Wait for all background processes
wait "${PIDS[@]}" 2>/dev/null || true
