#!/usr/bin/env bash
# One-shot setup for gaussian-scan on the agent box.
#
#   ./install.sh            # full setup + systemd service
#   ./install.sh --no-service
#
# Idempotent: safe to re-run. It reflects what was actually done by hand during
# development, including the two version pins that are load-bearing (see README §5).
set -euo pipefail

APP_DIR="${SPLAT_HOME:-$HOME/splat}"
VENV="$APP_DIR/.venv"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${SPLAT_PORT:-8090}"
GPUS="${SPLAT_GPUS:-2}"
WITH_SERVICE=1
[ "${1:-}" = "--no-service" ] && WITH_SERVICE=0

say() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------- python 3.11
# Ubuntu 26.04 ships only Python 3.14; nerfstudio requires <3.13. uv fetches a
# standalone 3.11 so the studio venv at llm-training-app/.venv is left alone.
say "Python 3.11"
if [ ! -x "$VENV/bin/python" ]; then
  if ! command -v uv >/dev/null; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
  fi
  mkdir -p "$APP_DIR"
  (cd "$APP_DIR" && uv venv --python 3.11 .venv)
fi
PY="$VENV/bin/python"
"$PY" -V

# ---------------------------------------------------------------- packages
# torch 2.5.1, not 2.6+: 2.6 flipped torch.load to weights_only=True, which makes
# ns-export raise UnpicklingError on nerfstudio's own checkpoints.
say "Installing torch 2.5.1 + nerfstudio (this one is slow)"
"$PY" -m pip install --upgrade pip wheel >/dev/null
"$PY" -m pip install "torch==2.5.1" "torchvision==0.20.1" \
    --index-url https://download.pytorch.org/whl/cu124
"$PY" -m pip install nerfstudio==1.1.5
"$PY" -m pip install fastapi "uvicorn[standard]" python-multipart

# ffmpeg is used for frame extraction; colmap is deliberately NOT installed —
# the distro build on 26.04 is broken and the turntable path never needs it.
if ! command -v ffmpeg >/dev/null; then
  say "ffmpeg"
  sudo apt-get update && sudo apt-get install -y ffmpeg
fi

# ---------------------------------------------------------------- app + data
say "Deploying app"
mkdir -p "$APP_DIR/scans"
for f in app/turntable.py app/pipeline.py app/server.py; do
  cp "$SRC_DIR/$f" "$APP_DIR/app/$(basename "$f")"
done
mkdir -p "$APP_DIR/app/static/vendor"
cp -r "$SRC_DIR/app/static/." "$APP_DIR/app/static/"
cp -r "$SRC_DIR/tools" "$APP_DIR/tools"

# The viewer is dead without a complete, correctly-mapped vendor tree, and a
# missing chunk fails SILENTLY in the browser (stuck on "loading…", no error).
# Check it here instead of discovering it on the phone.
if [ -f "$SRC_DIR/tools/vendor.sh" ]; then
  say "Checking the viewer's vendored JS"
  VENDOR_DEST="$APP_DIR/app/static/vendor" bash "$SRC_DIR/tools/vendor.sh" --check
fi

# ------------------------------------------------------------------ service
if [ "$WITH_SERVICE" = 1 ]; then
  say "systemd service"
  sed -e "s|@HOME@|$HOME|g" -e "s|@USER@|$USER|g" \
      -e "s|@PORT@|$PORT|g" -e "s|@GPUS@|$GPUS|g" \
      "$SRC_DIR/splat-scan.service" | sudo tee /etc/systemd/system/splat-scan.service >/dev/null
  sudo systemctl daemon-reload
  sudo systemctl enable --now splat-scan
  sleep 2
  systemctl --no-pager --lines=5 status splat-scan || true
fi

say "Done"
cat <<EOF
Phone URL : http://$(hostname -I | awk '{print $1}'):$PORT
Health    : curl http://127.0.0.1:$PORT/health
Logs      : journalctl -u splat-scan -f
EOF
