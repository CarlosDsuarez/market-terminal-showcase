#!/usr/bin/env bash
# Market Terminal — stop both servers via pidfile (never by port).

set -u
cd "$(dirname "$0")"

AMBER="\033[33m"; GREEN="\033[32m"; DIM="\033[2m"; RST="\033[0m"
step() { printf "${AMBER}▸ %s${RST}\n" "$*"; }
ok()   { printf "${GREEN}✓ %s${RST}\n" "$*"; }

PIDFILE=/tmp/market-terminal.pids

proc_args() {
  ps -p "$1" -o args= 2>/dev/null || true
}

children_of() {
  pgrep -P "$1" 2>/dev/null || true
}

matches() {
  local label="$1" pid="$2" args
  args=$(proc_args "$pid")
  [ -n "$args" ] || return 1
  case "$label" in
    api)
      case "$args" in *openbb-api*) return 0 ;; esac
      ;;
    ui)
      case "$args" in *vite*|*npm*) return 0 ;; esac
      ;;
  esac
  return 1
}

kill_pid_tree() {
  local pid="$1" c
  for c in $(children_of "$pid"); do
    kill_pid_tree "$c"
  done
  kill "$pid" 2>/dev/null || true
}

hard_kill_pid_tree() {
  local pid="$1" c
  for c in $(children_of "$pid"); do
    hard_kill_pid_tree "$c"
  done
  kill -9 "$pid" 2>/dev/null || true
}

if [ ! -f "$PIDFILE" ]; then
  printf "${DIM}  no pidfile (%s) — nothing to stop${RST}\n" "$PIDFILE"
  ok "Market Terminal stopped"
  exit 0
fi

while read -r label pid _; do
  [ -n "${pid:-}" ] || continue
  case "$label" in api|ui) ;; *) continue ;; esac
  if ! kill -0 "$pid" 2>/dev/null; then
    printf "${DIM}  %s pid %s already gone${RST}\n" "$label" "$pid"
    continue
  fi
  if ! matches "$label" "$pid"; then
    printf "${DIM}  skipping %s pid %s (cmdline is not ours)${RST}\n" "$label" "$pid"
    continue
  fi
  step "Stopping $label (pid $pid)"
  kill_pid_tree "$pid"
  sleep 1
  if kill -0 "$pid" 2>/dev/null; then
    hard_kill_pid_tree "$pid"
  fi
  ok "Stopped $label"
done < "$PIDFILE"

rm -f "$PIDFILE"
ok "Market Terminal stopped"
