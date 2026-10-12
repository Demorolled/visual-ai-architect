#!/usr/bin/env bash
# llm-training-studio.sh — start the LLM Training Studio desktop app (llm-training-app/).
#
# This is the "button" behind the Desktop icon and the app-grid entry.
#
#   ./scripts/llm-training-studio.sh start    # launch the GUI (what the icon runs)
#   ./scripts/llm-training-studio.sh doctor   # check the environment, launch nothing
#   ./scripts/llm-training-studio.sh deps     # install missing Python deps into the venv
#   ./scripts/llm-training-studio.sh web      # browser UI instead (needs no Tk)
#   ./scripts/llm-training-studio.sh menu     # interactive menu
#
# Why this exists instead of llm-training-app/start.sh:
#   1. start.sh runs `pip3 install`, which Ubuntu 24.04+ refuses outside a venv
#      (PEP 668 "externally-managed-environment"), so it dies before the GUI opens.
#   2. Its .desktop ran `bash -c "cd $(dirname %k) && bash start.sh"`, and %k is the
#      path of the .desktop file itself — copy that icon anywhere else and the cd
#      lands in the wrong directory.
# Everything here is absolute-path based, uses the app's own .venv, and reports
# failures in a dialog, because a Terminal=false icon that dies is a silent no-op.
#
# Note: a cold start takes ~30-40 s before the window appears, because importing the
# app pulls in torch. `start` posts a desktop notification so the wait is not silent.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/llm-training-app"
VENV="$APP/.venv"
VENV_PY="$VENV/bin/python"
LOGS="$ROOT/logs"
LOG="$LOGS/llm-training-studio.log"
TK_PACKAGE="python3-tk"
# module:pip-name — the module is what must import, the pip name is what installs it.
# `PIL.ImageTk` rather than `PIL` on purpose: the distro's python3-pil imports fine but
# is built without Tk support, so `import PIL` succeeds while matplotlib's tkagg backend
# then dies on `from PIL import ImageTk`. Check the thing that actually breaks.
GUI_DEPS=(customtkinter:customtkinter tkinterdnd2:tkinterdnd2 matplotlib:matplotlib PyPDF2:PyPDF2 PIL.ImageTk:Pillow)
# python-multipart is needed by the FastAPI backend the moment it declares a Form field.
WEB_DEPS=(fastapi:fastapi uvicorn:uvicorn multipart:python-multipart)

mkdir -p "$LOGS"

# ── helpers ──────────────────────────────────────────────────────────────────
c_ok()   { printf '\033[32m%s\033[0m\n' "$*"; }
c_bad()  { printf '\033[31m%s\033[0m\n' "$*"; }
c_warn() { printf '\033[33m%s\033[0m\n' "$*"; }
c_hd()   { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }

# Prefer the app's venv; fall back to the system interpreter so `doctor` still
# reports something useful when the venv is missing.
py() { if [ -x "$VENV_PY" ]; then "$VENV_PY" "$@"; else python3 "$@"; fi; }

# A dialog, so a failure behind a Terminal=false icon is not invisible.
alert() {  # alert <title> <text>
  if command -v zenity >/dev/null 2>&1; then
    zenity --error --width=560 --title="$1" --text="$2" 2>/dev/null
  elif command -v notify-send >/dev/null 2>&1; then
    notify-send --urgency=critical "$1" "$2" 2>/dev/null
  fi
  return 0
}

have()   { py -c "import $1" >/dev/null 2>&1; }        # have <module>
has_tk() { py -c "import tkinter" >/dev/null 2>&1; }   # the GUI backend

mod_of() { printf '%s' "${1%%:*}"; }   # the module that must import
pkg_of() { printf '%s' "${1##*:}"; }   # the pip name that provides it

# missing_deps <module:pip-name...> -> pip names that do not import, space separated
missing_deps() {
  local e out=""
  for e in "$@"; do have "$(mod_of "$e")" || out="$out $(pkg_of "$e")"; done
  printf '%s' "${out# }"
}

usage() {
  cat <<EOF
LLM Training Studio — launcher

  $0 start    launch the desktop GUI (what the desktop icon runs)
  $0 doctor   check python, Tk, deps, display and GPUs
  $0 deps     install missing python deps into llm-training-app/.venv
  $0 web      browser UI on http://localhost:8001 (no Tk required)
  $0 menu     interactive menu

Logs: $LOG
EOF
}

# ── deps ─────────────────────────────────────────────────────────────────────
install_deps() {
  if [ ! -x "$VENV_PY" ]; then
    c_bad "no interpreter at $VENV_PY"
    echo "  create it with:  python3 -m venv --system-site-packages '$VENV'"
    return 1
  fi
  local want
  want="$(missing_deps "${GUI_DEPS[@]}" "${WEB_DEPS[@]}")"
  if [ -z "$want" ]; then
    c_ok "python deps already present"
    return 0
  fi
  c_hd "installing into the venv: $want"
  # Word-splitting $want is intentional: it is a space separated module list.
  # shellcheck disable=SC2086
  if "$VENV_PY" -m pip install --disable-pip-version-check -q $want; then
    c_ok "installed: $want"
  else
    c_bad "pip install failed — see the output above"
    return 1
  fi
}

# ── doctor ───────────────────────────────────────────────────────────────────
doctor() {
  c_hd "app"
  if [ -f "$APP/app.py" ]; then c_ok "app.py present"; else c_bad "missing $APP/app.py"; fi

  c_hd "python"
  echo "interpreter: $(py -c 'import sys;print(sys.executable)' 2>/dev/null || echo '?')"
  echo "version:     $(py -c 'import sys;print(sys.version.split()[0])' 2>/dev/null || echo '?')"
  if [ -x "$VENV_PY" ]; then c_ok "venv $VENV"; else c_warn "no .venv/bin/python — falling back to system python3"; fi

  c_hd "tk (the GUI backend)"
  if has_tk; then
    c_ok "tkinter, Tk $(py -c 'import tkinter;print(tkinter.TkVersion)' 2>/dev/null)"
  else
    c_bad "tkinter is missing — the GUI cannot open a window"
    echo "  fix:  sudo apt install -y $TK_PACKAGE"
  fi

  c_hd "python deps"
  local e
  for e in "${GUI_DEPS[@]}" "${WEB_DEPS[@]}"; do
    if have "$(mod_of "$e")"; then
      c_ok "$(mod_of "$e")"
    else
      c_bad "$(mod_of "$e") missing  (install with: $0 deps)"
    fi
  done

  c_hd "gui import chain (what app.py needs at startup)"
  if py -c "import customtkinter, tkinterdnd2, matplotlib.backends.backend_tkagg, PIL.ImageTk" >/dev/null 2>&1; then
    c_ok "customtkinter + tkinterdnd2 + matplotlib.tkagg + PIL.ImageTk"
  else
    c_bad "the GUI import chain is broken — run: $0 deps"
  fi

  c_hd "display"
  echo "XDG_SESSION_TYPE=${XDG_SESSION_TYPE:-?}  DISPLAY=${DISPLAY:-none}  WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-none}"
  if [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
    c_ok "a display is available"
  else
    c_warn "no display here — the GUI will not open (use: $0 web)"
  fi

  c_hd "gpu"
  if command -v nvidia-smi >/dev/null 2>&1; then
    nvidia-smi --query-gpu=index,name,memory.total,memory.used --format=csv,noheader
  else
    c_warn "no nvidia-smi — CPU-only training"
  fi
}

# ── start / web ──────────────────────────────────────────────────────────────
do_start() {
  if ! has_tk; then
    c_bad "tkinter is not installed — LLM Training Studio cannot open a window."
    echo "  fix:  sudo apt install -y $TK_PACKAGE"
    echo "  then: $0 start"
    echo "  or run the browser UI, which needs no Tk:  $0 web"
    alert "LLM Training Studio — Tk missing" "The Python Tk bindings are not installed, so the desktop window cannot open.

Open a terminal and run:

  sudo apt install -y $TK_PACKAGE

Then start the app again.

A browser UI that needs no Tk is available with:

  $0 web"
    return 1
  fi
  if [ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
    c_bad "no display in this environment — nothing to draw on"
    return 1
  fi

  local want
  want="$(missing_deps "${GUI_DEPS[@]}")"
  [ -n "$want" ] && install_deps

  # A cold start spends ~30-40 s importing torch before the window paints, so without
  # this a double-click on the icon looks like nothing happened.
  if command -v notify-send >/dev/null 2>&1; then
    notify-send -t 8000 "LLM Training Studio" "Starting — the window can take ~40 s to appear." 2>/dev/null
  fi

  cd "$APP" || return 1
  local PY; PY="$VENV_PY"; [ -x "$PY" ] || PY=python3
  c_ok "launching $(basename "$PY") app.py   (log: $LOG)"
  # Foreground: the launcher stays alive for as long as the window does, which is
  # what lets us report a crash. Output goes to the log, not a terminal we do not have.
  "$PY" "$APP/app.py" >>"$LOG" 2>&1
  local rc=$?
  # 130/143 = killed by SIGINT/SIGTERM (128+signal). That is someone stopping the app,
  # not a bug in it, so do not answer with a crash dialog that sends them hunting.
  if [ "$rc" -eq 130 ] || [ "$rc" -eq 143 ]; then
    c_warn "app.py stopped by a signal (rc=$rc) — not reporting a crash"
    return 0
  fi
  if [ "$rc" -ne 0 ]; then
    c_bad "app.py exited with code $rc — last lines of $LOG:"
    tail -n 20 "$LOG"
    alert "LLM Training Studio crashed (exit $rc)" "$(tail -n 15 "$LOG" | sed 's/&/\&amp;/g; s/</\&lt;/g')"
    return "$rc"
  fi
  c_ok "LLM Training Studio closed cleanly."
}

do_web() {
  local want
  want="$(missing_deps "${WEB_DEPS[@]}")"
  [ -n "$want" ] && install_deps

  cd "$APP" || return 1
  local PY; PY="$VENV_PY"; [ -x "$PY" ] || PY=python3
  c_ok "starting the browser UI on http://localhost:8001   (log: $LOG)"
  c_warn "static frontend: $APP/frontend/index.html"
  exec "$PY" "$APP/start-web.py" >>"$LOG" 2>&1
}

# ── menu ─────────────────────────────────────────────────────────────────────
menu() {
  while true; do
    printf '\n\033[1;36mLLM Training Studio\033[0m\n'
    echo "  1) start    launch the desktop GUI (what the icon runs)"
    echo "  2) doctor   check the environment"
    echo "  3) deps     install missing python deps into the venv"
    echo "  4) web      browser UI (no Tk needed)"
    echo "  q) quit"
    read -r -p "choice: " ans
    case "${ans:-}" in
      1|start)  do_start; return $? ;;
      2|doctor) doctor ;;
      3|deps)   install_deps ;;
      4|web)    do_web; return $? ;;
      q|quit|"") echo "bye"; return 0 ;;
      *) c_warn "unknown choice" ;;
    esac
  done
}

case "${1:-start}" in
  start)           do_start ;;
  doctor)          doctor ;;
  deps)            install_deps ;;
  web)             do_web ;;
  menu)            menu ;;
  -h|--help|help)  usage ;;
  *) c_warn "unknown command: $1"; usage; exit 2 ;;
esac
