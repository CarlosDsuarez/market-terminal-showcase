#!/usr/bin/env bash
# Market Terminal — one-time setup
# Installs OpenBB Platform (Python) and the UI (Node). Run once.

set -euo pipefail
cd "$(dirname "$0")"

ROOT="$(pwd)"
AMBER=$'\033[33m'; GREEN=$'\033[32m'; RED=$'\033[31m'; DIM=$'\033[2m'; RST=$'\033[0m'

step() { printf '%s▸ %s%s\n' "$AMBER" "$*" "$RST"; }
ok()   { printf '%s✓ %s%s\n' "$GREEN" "$*" "$RST"; }
fail() { printf '%s✗ %s%s\n' "$RED" "$*" "$RST" >&2; exit 1; }

hint_python() {
  if grep -qi microsoft /proc/version 2>/dev/null || [ -n "${WSL_DISTRO_NAME:-}" ]; then
    echo "On WSL/Ubuntu: sudo apt install -y python3 python3-venv python3-pip"
  else
    echo "macOS: brew install python@3.12   |   Ubuntu: sudo apt install -y python3 python3-venv"
  fi
}

hint_node() {
  if grep -qi microsoft /proc/version 2>/dev/null || [ -n "${WSL_DISTRO_NAME:-}" ]; then
    echo "On WSL, apt Node is often too old. Install Node 20 LTS:"
    echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "  sudo apt install -y nodejs"
  else
    echo "macOS: brew install node   |   or install Node 20 LTS from https://nodejs.org"
  fi
}

step "Checking prerequisites"

# Prefer explicit 3.12 → 3.11 → 3.10, then fall back to python3 if recent enough.
PY=""
for cand in python3.12 python3.11 python3.10 python3; do
  if command -v "$cand" >/dev/null 2>&1; then
    ver=$("$cand" -c 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")')
    major=${ver%%.*}; minor=${ver#*.}
    if [ "$major" -eq 3 ] && [ "$minor" -ge 10 ] && [ "$minor" -le 12 ]; then
      PY="$cand"
      break
    fi
  fi
done
[ -n "$PY" ] || fail "Python 3.10–3.12 required. $(hint_python)"
ok "Python: $($PY --version)"

command -v node >/dev/null 2>&1 || fail "Node.js 18+ is required. $(hint_node)"
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)
[ "$NODE_MAJOR" -ge 18 ] || fail "Node.js 18+ required (found $(node --version)). $(hint_node)"
ok "Node:   $(node --version)"

command -v npm >/dev/null 2>&1 || fail "npm is required. $(hint_node)"
ok "npm:    $(npm --version)"

command -v curl >/dev/null 2>&1 || fail "curl is required (sudo apt install -y curl)."
ok "curl:   present"

# -------- Python venv + OpenBB --------
step "Creating Python virtual environment (.venv)"
if [ ! -d .venv ]; then
  "$PY" -m venv .venv
  ok "Created .venv with $PY"
else
  ok ".venv already exists"
fi

step "Upgrading pip"
.venv/bin/pip install --upgrade --quiet pip wheel

step "Installing OpenBB Platform (this takes ~3–8 minutes on WSL)"
.venv/bin/pip install --quiet "openbb[all]" openbb-cli openbb-finviz
ok "OpenBB + provider extensions installed"

# CFTC extension fetches remote COT data during API lifespan and often times out
# on first boot (especially WSL). This app never uses it — drop it so start.sh
# does not die with TimeoutError before /openapi.json is ready.
if .venv/bin/pip show openbb-cftc >/dev/null 2>&1; then
  step "Removing openbb-cftc (unused; causes API startup timeouts)"
  .venv/bin/pip uninstall -y openbb-cftc >/dev/null 2>&1 || true
  ok "openbb-cftc removed"
fi

step "Warming OpenBB package cache"
if .venv/bin/python -c "from openbb import obb; print('ok')" >/tmp/market-terminal-warmup.log 2>&1; then
  touch .venv/.openbb-warmed
  ok "OpenBB cache built"
else
  printf '%s  warm-up warned — first ./start.sh may take longer (see /tmp/market-terminal-warmup.log)%s\n' "$DIM" "$RST"
fi

# -------- UI dependencies --------
step "Installing UI dependencies"
( cd "$ROOT/app" && { npm ci --silent || npm install --silent --no-package-lock; } )
ok "Node modules installed"

cat <<EOF

${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}
${AMBER}  Market Terminal is ready.${RST}
${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}

  Launch:    ${AMBER}./start.sh${RST}
  Stop:      ${AMBER}./stop.sh${RST}
  Docs:      see README.md (Windows section for WSL)

${DIM}On Windows/WSL open http://localhost:5173/ in Edge or Chrome after start.${RST}
EOF
