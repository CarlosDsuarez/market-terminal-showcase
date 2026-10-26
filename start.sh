#!/usr/bin/env bash
# Market Terminal — LIVE mode: launch OpenBB + the UI (proxying to OpenBB) and open the browser.
# For the offline synthetic demo you do not need this script: cd app && npm ci && npm run dev
# Idempotent only when the occupant is this emulator (pidfile / cmdline).
# A foreign process on 6900 or 5173 is a hard fail — the browser is not opened.

set -euo pipefail
cd "$(dirname "$0")"

AMBER=$'\033[33m'; GREEN=$'\033[32m'; RED=$'\033[31m'; DIM=$'\033[2m'; RST=$'\033[0m'
step() { printf '%s▸ %s%s\n' "$AMBER" "$*" "$RST"; }
ok()   { printf '%s✓ %s%s\n' "$GREEN" "$*" "$RST"; }
fail() { printf '%s✗ %s%s\n' "$RED" "$*" "$RST" >&2; exit 1; }

API_PORT=6900
UI_PORT=5173
API_LOG=/tmp/market-terminal-api.log
UI_LOG=/tmp/market-terminal-ui.log
PIDFILE=/tmp/market-terminal.pids
# First OpenBB boot (and WSL networking) can exceed a minute.
API_WAIT_SECS="${API_WAIT_SECS:-120}"
UI_WAIT_SECS="${UI_WAIT_SECS:-45}"

[ -x .venv/bin/openbb-api ] || fail "Run ./setup.sh first (OpenBB is not installed)."
[ -d app/node_modules ] || fail "Run ./setup.sh first (UI deps not installed)."
command -v curl >/dev/null 2>&1 || fail "curl is required (sudo apt install -y curl)."

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti tcp:"$port" >/dev/null 2>&1
  elif command -v ss >/dev/null 2>&1; then
    ss -ltn "sport = :$port" 2>/dev/null | grep -q ":$port"
  else
    # bash /dev/tcp probe — connection success means something is listening
    (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1
  fi
}

wait_http() {
  local url="$1" secs="$2" label="$3" pid="${4:-}"
  printf '  %swaiting for %s' "$DIM" "$label"
  for i in $(seq 1 "$secs"); do
    if curl -s -o /dev/null --max-time 2 "$url"; then
      printf '%s\n' "$RST"
      return 0
    fi
    if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
      printf '%s\n' "$RST"
      return 2
    fi
    printf '.'
    sleep 1
  done
  printf '%s\n' "$RST"
  return 1
}

pid_on_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR==1'
  fi
}

proc_args() {
  ps -p "$1" -o args= 2>/dev/null || true
}

proc_cwd() {
  local pid="$1"
  if [ -e "/proc/$pid/cwd" ]; then
    readlink "/proc/$pid/cwd" 2>/dev/null || true
  elif command -v lsof >/dev/null 2>&1; then
    lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1
  fi
}

pidfile_pid() {
  local label="$1"
  [ -f "$PIDFILE" ] || return 0
  awk -v l="$label" '$1==l { print $2; exit }' "$PIDFILE"
}

is_our_api() {
  local pid="$1" args
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  args=$(proc_args "$pid")
  case "$args" in *openbb-api*) return 0 ;; esac
  return 1
}

is_our_ui() {
  local pid="$1" args cwd
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  args=$(proc_args "$pid")
  cwd=$(proc_cwd "$pid")
  case "$args" in *vite*|*npm\ run\ dev*) return 0 ;; esac
  case "$cwd" in *"$PWD"*)
    case "$args" in *node*|*vite*|*npm*) return 0 ;; esac
    ;;
  esac
  return 1
}

write_pidfile() {
  # A failing `[ -n "$UI_PID" ] && …` as the last command in `{ }` is
  # status 1; with `set -e` that aborted start.sh after the API came up
  # and never launched the UI.
  : > "$PIDFILE"
  [ -n "${API_PID:-}" ] && printf 'api %s\n' "$API_PID" >> "$PIDFILE"
  [ -n "${UI_PID:-}" ] && printf 'ui %s\n' "$UI_PID" >> "$PIDFILE"
  return 0
}

# Echo our PID on $port, or exit: never treat a stranger as the emulator.
claim_or_fail() {
  local port="$1" kind="$2" pid who=""
  pid=$(pid_on_port "$port")
  [ -z "$pid" ] && pid=$(pidfile_pid "$kind")
  if [ "$kind" = api ] && is_our_api "$pid"; then
    printf '%s\n' "$pid"
    return 0
  fi
  if [ "$kind" = ui ] && is_our_ui "$pid"; then
    printf '%s\n' "$pid"
    return 0
  fi
  [ -n "$pid" ] && who=" (pid $pid: $(proc_args "$pid"))"
  fail "Port $port is occupied by another process$who. Not opening the browser."
}

start_api() {
  : > "$API_LOG"
  # python/sitecustomize.py coerces Finviz "-" blanks so valuation screens don't 500.
  PYTHONPATH="$PWD/python${PYTHONPATH:+:$PYTHONPATH}" \
    nohup .venv/bin/openbb-api --host 127.0.0.1 --port "$API_PORT" \
    > "$API_LOG" 2>&1 &
  echo $!
}

# -------- warm OpenBB package cache (avoids a cold first boot timeout) --------
if [ ! -f .venv/.openbb-warmed ]; then
  step "Warming OpenBB package cache (first run only, ~30s)"
  if .venv/bin/python -c "from openbb import obb; print('ok')" >>"$API_LOG" 2>&1; then
    touch .venv/.openbb-warmed
    ok "OpenBB cache ready"
  else
    printf '%s  warm-up failed — continuing anyway (see %s)%s\n' "$DIM" "$API_LOG" "$RST"
  fi
fi

# -------- API --------
if port_in_use "$API_PORT"; then
  API_PID=$(claim_or_fail "$API_PORT" api)
  ok "OpenBB API already running on :$API_PORT (pid $API_PID)"
else
  step "Starting OpenBB API on :$API_PORT"
  API_PID=$(start_api)
  if wait_http "http://127.0.0.1:$API_PORT/openapi.json" "$API_WAIT_SECS" "API" "$API_PID"; then
    ok "OpenBB API up (pid $API_PID)"
  else
    status=$?
    # CFTC lifespan timeout on openbb[all] often dies on first attempt — one retry.
    if [ "$status" = "2" ] || ! port_in_use "$API_PORT"; then
      step "API exited early — retrying once (common on first boot / WSL)"
      sleep 2
      API_PID=$(start_api)
      if wait_http "http://127.0.0.1:$API_PORT/openapi.json" "$API_WAIT_SECS" "API" "$API_PID"; then
        ok "OpenBB API up on retry (pid $API_PID)"
      else
        printf '%s--- last 40 lines of %s ---%s\n' "$DIM" "$API_LOG" "$RST" >&2
        tail -40 "$API_LOG" >&2 || true
        fail "API didn't come up. Full log: $API_LOG"
      fi
    else
      printf '%s--- last 40 lines of %s ---%s\n' "$DIM" "$API_LOG" "$RST" >&2
      tail -40 "$API_LOG" >&2 || true
      fail "API didn't respond within ${API_WAIT_SECS}s. Full log: $API_LOG"
    fi
  fi
fi
write_pidfile

# -------- UI --------
if port_in_use "$UI_PORT"; then
  UI_PID=$(claim_or_fail "$UI_PORT" ui)
  ok "UI dev server already running on :$UI_PORT (pid $UI_PID)"
else
  step "Starting UI on :$UI_PORT"
  UI_PID=$(
    cd app
    nohup npm run dev:live -- --host 127.0.0.1 --port "$UI_PORT" > "$UI_LOG" 2>&1 &
    echo $!
  )
  if wait_http "http://127.0.0.1:$UI_PORT/" "$UI_WAIT_SECS" "UI" "$UI_PID"; then
    ok "UI up (pid $UI_PID)"
  else
    printf '%s--- last 40 lines of %s ---%s\n' "$DIM" "$UI_LOG" "$RST" >&2
    tail -40 "$UI_LOG" >&2 || true
    fail "UI didn't respond within ${UI_WAIT_SECS}s. Full log: $UI_LOG"
  fi
fi
write_pidfile

# -------- Open browser --------
sleep 1
URL="http://localhost:$UI_PORT/"
if command -v open >/dev/null 2>&1; then
  open "$URL" >/dev/null 2>&1 || true
elif command -v wslview >/dev/null 2>&1; then
  wslview "$URL" >/dev/null 2>&1 || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 || true
elif grep -qi microsoft /proc/version 2>/dev/null; then
  # WSL without wslview — ask Windows to open the URL
  cmd.exe /c start "$URL" >/dev/null 2>&1 || true
fi

cat <<EOF

${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}
${AMBER}  Market Terminal is live${RST}

  UI:         ${AMBER}${URL}${RST}
  API docs:   ${DIM}http://localhost:${API_PORT}/docs${RST}

  Logs:       $API_LOG
              $UI_LOG
  Pids:       $PIDFILE

  Stop:       ${AMBER}./stop.sh${RST}
${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}

${DIM}On Windows, open the UI URL in Edge/Chrome if a browser didn't pop up.${RST}
EOF
