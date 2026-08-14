#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  🚀 GUI GGUF Trainer — Startup Script
#  ═══════════════════════════════════════════════════════════════════════════
#  Usage:
#    ./training/gui-trainer/start.sh                  # Default: port 8765
#    ./training/gui-trainer/start.sh --port 8888      # Custom port
#    ./training/gui-trainer/start.sh --reload          # Dev mode with auto-reload
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════╗"
echo "║     🎨 GUI GGUF Trainer — Starting Up            ║"
echo "╠══════════════════════════════════════════════════╣"
echo -e "║  ${YELLOW}Project:${NC} Visual AI Architect              ║"
echo -e "║  ${YELLOW}Model:${NC}   Qwen2.5-7B-Instruct              ║"
echo -e "║  ${YELLOW}Dataset:${NC} 92 GUI projects + synthetic       ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

# Step 1: Set HF_TOKEN if available
if [ -f "$PROJECT_ROOT/.env" ]; then
    source "$PROJECT_ROOT/.env"
fi

if [ -n "${HF_TOKEN:-}" ]; then
    echo -e "${GREEN}  ✅ HF_TOKEN set${NC}"
else
    echo -e "${YELLOW}  ⚠️  HF_TOKEN not set. Qwen2.5-7B-Instruct requires authentication.${NC}"
    echo -e "${YELLOW}     Get a token: https://huggingface.co/settings/tokens${NC}"
    echo -e "${YELLOW}     Then: export HF_TOKEN='your_token_here'${NC}"
fi

# Step 2: Generate datasets if they don't exist
DATASET_DIR="$SCRIPT_DIR/datasets"
if [ ! -f "$DATASET_DIR/gui-projects.jsonl" ]; then
    echo -e "${YELLOW}  🔄 Generating GUI datasets...${NC}"
    python3 "$SCRIPT_DIR/generate-gui-datasets.py"
    echo -e "${GREEN}  ✅ Datasets generated${NC}"
else
    echo -e "${GREEN}  ✅ Datasets already exist${NC}"
    total=$(wc -l "$DATASET_DIR"/*.jsonl 2>/dev/null | tail -1 | awk '{print $1}')
    echo -e "${GREEN}     Total: $total entries${NC}"
fi

# Parse args
PORT="${PORT:-8765}"
HOST="${HOST:-0.0.0.0}"
RELOAD_FLAG=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --port) PORT="$2"; shift 2 ;;
        --host) HOST="$2"; shift 2 ;;
        --reload) RELOAD_FLAG="--reload"; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Step 3: Start the server
echo -e "\n${CYAN}  🚀 Starting server...${NC}"
echo -e "${CYAN}     Open: http://${HOST}:${PORT}${NC}\n"

python3 -m uvicorn training.gui_trainer.server:app \
    --host "${HOST}" \
    --port "${PORT}" \
    ${RELOAD_FLAG} \
    --log-level info
