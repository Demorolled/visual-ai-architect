#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
# ollama-kv-cache.sh — quantize Ollama's KV cache so the 14B fits on the GPU
# ═════════════════════════════════════════════════════════════════════════════
# WHY: with the default f16 KV cache, qwen2.5-coder:14b at num_ctx=16384 does
# not fit an RTX 3060 (12 GB). Measured on the reference box, both at n_ctx=16384:
#
#              KV cache (sum)   ollama ps SIZE   CPU/GPU
#   f16          3072 MiB       12 GB            23% / 77%   ← offloading to CPU
#   q8_0         1632 MiB       10 GB            12% / 88%
#
#   (f16: CPU 640 + CUDA0 2432 | q8_0: CPU 136 + CUDA0 1496)
#
# The saving is 1.88x, NOT 2x: q8_0 stores one 2-byte scale per 32 values, so
# it costs 34/32 = 1.0625 bytes/element against f16's 2. Read the totals from
# the `llama_kv_cache: ... KV buffer size` lines, not per-device numbers — the
# CPU/GPU split shifts with layer placement between runs.
#
# The KV cache is a fixed per-context cost — it is NOT the model weights, so
# quantizing it buys VRAM without touching model precision.
#
# This is a HOST/daemon setting, not app config: VACA only talks to the daemon
# at OLLAMA_BASE_URL, so nothing under backend/ or packaging/ changes.
#
# On Ollama 0.31.1 the single variable is enough — the daemon rewrites the
# invocation itself to `--cache-type-k q8_0 --cache-type-v q8_0 --flash-attn auto`
# (tested: setting OLLAMA_KV_CACHE_TYPE alone, with OLLAMA_FLASH_ATTENTION=0,
# produced byte-identical KV buffer sizes and placement). Older builds require
# OLLAMA_FLASH_ATTENTION=1 as well; set it if KV quant silently no-ops here.
#
# NOTE: OLLAMA_NUM_PARALLEL must stay 1. KV scales linearly with parallel slots,
# so raising it silently undoes this saving.
#
# Usage:
#   scripts/ollama-kv-cache.sh              # apply drop-in + restart + verify
#   scripts/ollama-kv-cache.sh --check      # report state, change nothing
#   scripts/ollama-kv-cache.sh --revert     # remove the drop-in, restart, verify
#   scripts/ollama-kv-cache.sh --no-load    # apply, but skip the model-load proof
#   scripts/ollama-kv-cache.sh --print-dropin  # show the file it would write, root-free
#
# Overrides:  MODEL=qwen2.5-coder:14b  NUM_CTX=16384  KV_TYPE=q8_0
#             (KV_TYPE may be q8_0 | q4_0; q4_0 saves more but is lossier)
#
# Needs root or sudo (writes /etc/systemd/system, restarts the unit).
# If ollama is NOT run by systemd, this script cannot help — export
# OLLAMA_KV_CACHE_TYPE=q8_0 in whatever launches `ollama serve` instead.
# ═════════════════════════════════════════════════════════════════════════════
set -uo pipefail

OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"
MODEL="${MODEL:-qwen2.5-coder:14b}"
NUM_CTX="${NUM_CTX:-16384}"
KV_TYPE="${KV_TYPE:-q8_0}"
# UNIT/DROPIN_DIR are overridable for boxes that name the unit differently (and
# so the write path can be exercised against a scratch dir). These MUST be the
# only assignments of these two — an earlier unconditional UNIT="ollama" above
# them silently pinned both values and made the overrides dead code.
UNIT="${UNIT:-ollama}"
DROPIN_DIR="${DROPIN_DIR:-/etc/systemd/system/${UNIT}.service.d}"
DROPIN="$DROPIN_DIR/kv-cache.conf"

MODE=apply
LOAD_PROOF=1

say()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m  ✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m  •\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m  ✘\033[0m %s\n' "$*" >&2; }

usage() {
  # Print the header comment block verbatim: from line 2 up to the closing rule.
  # Length-independent — a hard-coded line range silently truncates the text
  # whenever the header gains a line.
  # Print the header comment block: every line after the shebang until the
  # first non-comment. Counting the '═══' rules instead does not work — there
  # are two of them above the body (one after the shebang, one after the
  # title), so any "stop at the 2nd rule" rule truncates to the title line.
  awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "${BASH_SOURCE[0]}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --check|-c|--status|-s) MODE=check ;;
    --revert|-r)            MODE=revert ;;
    --no-load)              LOAD_PROOF=0 ;;
    --print-dropin)         MODE=printdropin ;;
    --model)                MODEL="${2:?--model needs a value}"; shift ;;
    --ctx)                  NUM_CTX="${2:?--ctx needs a value}"; shift ;;
    --kv-type)              KV_TYPE="${2:?--kv-type needs a value}"; shift ;;
    --help|-h)              usage; exit 0 ;;
    *) fail "unknown argument: $1 (try --help)"; exit 2 ;;
  esac
  shift
done

case "$KV_TYPE" in
  q8_0|q4_0|f16) ;;
  *) fail "KV_TYPE must be q8_0, q4_0 or f16 (got '$KV_TYPE')"; exit 2 ;;
esac
case "$NUM_CTX" in
  ''|*[!0-9]*) fail "NUM_CTX must be an integer (got '$NUM_CTX')"; exit 2 ;;
esac

# ── privilege ────────────────────────────────────────────────────────────────
# SUDO may be pre-set (SUDO=true exercises the write path against a scratch
# DROPIN_DIR with no privileges); otherwise root needs none, others need sudo.
if [ "${SUDO:-auto}" = "auto" ]; then
  if [ "$(id -u)" = "0" ]; then
    SUDO=""
  elif command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    fail "needs root or sudo to write ${DROPIN_DIR} and restart ${UNIT}"
    exit 1
  fi
fi

# ── state probes (all read-only, all safe to run unprivileged) ───────────────

# What the RUNNING llama-server was actually told. This is the authoritative
# signal: it reads the spawned process's own cmdline, so it cannot be fooled by
# a drop-in that exists on disk but was never loaded. An absent flag means the
# daemon defaulted to f16 (measured on 0.31.1).
running_kv() {
  pgrep -af '[l]lama-server' 2>/dev/null | head -1 \
    | grep -oE -- '--cache-type-k [a-z0-9_]+' | awk '{print $2}'
}

loaded_models() {
  ollama ps 2>/dev/null | awk 'NR>1 && NF {print $1}'
}

unit_exists() {
  command -v systemctl >/dev/null 2>&1 && systemctl cat "$UNIT" >/dev/null 2>&1
}

# KV buffer sizes from the daemon's own log — the direct VRAM evidence.
# Scoped to the MOST RECENT load: a plain `tail -2` splices the CUDA0 line of
# one load with the CPU line of another (they are emitted in different phases),
# which produces a total that is not any real load's KV size.
kv_buffers() {
  journalctl -u "$UNIT" --no-pager -n 400 2>/dev/null \
    | awk '/starting llama-server/{blk=""} /KV buffer size =/{blk = blk $0 "\n"} END{printf "%s", blk}' \
    | grep -oE '(CUDA0|CPU) KV buffer size = *[0-9.]+ MiB'
}

# n_ctx of the most recent load, so the buffer sizes above are self-describing.
kv_ctx() {
  journalctl -u "$UNIT" --no-pager -n 400 2>/dev/null \
    | awk '/starting llama-server/{blk=""} /llama_context: n_ctx /{blk = $0} END{print blk}' \
    | grep -oE 'n_ctx + = [0-9]+' | grep -oE '[0-9]+$'
}

do_check() {
  say "Ollama KV cache status (no changes made)"
  echo

  if ! unit_exists; then
    warn "no systemd unit named '$UNIT' — is ollama run by systemd?"
    warn "if not, export OLLAMA_KV_CACHE_TYPE=$KV_TYPE where 'ollama serve' is launched"
  fi

  if curl -sf -o /dev/null --max-time 3 "$OLLAMA_URL/api/tags"; then
    ok "daemon reachable at $OLLAMA_URL"
  else
    fail "daemon NOT reachable at $OLLAMA_URL"
  fi

  echo
  say "Drop-in on disk ($DROPIN)"
  if [ -f "$DROPIN" ]; then
    ok "present:"; sed 's/^/      /' "$DROPIN"
  else
    warn "absent — KV cache is at the daemon default (f16)"
  fi

  echo
  say "Running config (authoritative)"
  local loaded; loaded="$(loaded_models)"
  if [ -z "$loaded" ]; then
    warn "no model loaded — cannot read the runner's settings until one is"
  else
    local rkv; rkv="$(running_kv)"
    printf '      loaded: %s\n' "$(echo "$loaded" | tr '\n' ' ')"
    printf '      --cache-type-k: %s\n' "${rkv:-<absent — f16>}"
    if [ "${rkv:-f16}" = "$KV_TYPE" ]; then
      ok "KV cache is quantized to $KV_TYPE"
    else
      warn "KV cache is '${rkv:-f16}', wanted '$KV_TYPE'"
    fi
  fi

  local bufs ctx; bufs="$(kv_buffers)"; ctx="$(kv_ctx)"
  if [ -n "$bufs" ]; then
    echo; say "KV buffers (most recent load${ctx:+, n_ctx=$ctx})"
    echo "$bufs" | sed 's/^/      /'
  else
    warn "journal for '$UNIT' not readable by $USER — skipping buffer sizes"
  fi

  echo
  if [ "${rkv:-f16}" != "$KV_TYPE" ] || [ ! -f "$DROPIN" ]; then
    say "Verdict: NOT applied — run without --check to apply it"
    return 1
  fi
  say "Verdict: applied"
}

# The drop-in body — shared by --print-dropin and write_dropin so the file that
# gets written is exactly the file that can be inspected root-free.
dropin_body() {
  printf '# Managed by scripts/ollama-kv-cache.sh — quantize the KV cache so a\n' 
  printf '# 14B @ num_ctx=%s fits the GPU. Revert with: %s --revert\n' \
    "$NUM_CTX" "$(basename "${BASH_SOURCE[0]}")"
  printf '[Service]\n'
  printf 'Environment="OLLAMA_KV_CACHE_TYPE=%s"\n' "$KV_TYPE"
}

write_dropin() {
  local body
  body="$(dropin_body)"

  if [ -f "$DROPIN" ] && [ "$(cat "$DROPIN")" = "$body" ]; then
    ok "drop-in already correct — leaving it untouched"
    return 0
  fi

  say "Writing $DROPIN"
  $SUDO mkdir -p "$DROPIN_DIR" || { fail "mkdir $DROPIN_DIR failed"; return 1; }
  printf '%s\n' "$body" | $SUDO tee "$DROPIN" >/dev/null || {
    fail "writing $DROPIN failed"; return 1; }
  ok "wrote drop-in (KV_TYPE=$KV_TYPE)"
}

restart_unit() {
  say "daemon-reload + restart $UNIT"
  $SUDO systemctl daemon-reload || { fail "daemon-reload failed"; return 1; }
  $SUDO systemctl restart "$UNIT"  || { fail "restart $UNIT failed"; return 1; }

  local i
  for i in $(seq 1 30); do
    curl -sf -o /dev/null --max-time 2 "$OLLAMA_URL/api/tags" && { ok "daemon back up (~${i}s)"; return 0; }
    sleep 1
  done
  fail "daemon did not come back within 30s — check: journalctl -u $UNIT -n 50"
  return 1
}

# Prove the setting reached the runner, not just the file on disk.
verify_config() {
  say "Verify: config the daemon booted with"
  local env_line
  env_line="$(journalctl -u "$UNIT" --no-pager -n 200 2>/dev/null \
    | grep -o 'OLLAMA_KV_CACHE_TYPE:[^ ,]*' | tail -1)"
  if [ -z "$env_line" ]; then
    warn "no OLLAMA_KV_CACHE_TYPE line in the last 200 journal entries (or journal"
    warn "unreadable) — falling back to the unit's own view"
    env_line="$($SUDO systemctl show "$UNIT" -p Environment 2>/dev/null \
      | grep -o 'OLLAMA_KV_CACHE_TYPE=[^ "]*' | tail -1)"
    [ -n "$env_line" ] && printf '      %s\n' "$env_line"
  else
    printf '      %s\n' "$env_line"
  fi

  case "$env_line" in
    *"${KV_TYPE}"*) ok "daemon booted with KV_TYPE=${KV_TYPE}"; return 0 ;;
    "")             warn "could not read the daemon's env — relying on the load proof below" ;;
    *)              fail "daemon booted with something else: $env_line" ;;
  esac
}

# The real acceptance test: load the model and read what the runner was told.
verify_load() {
  say "Verify: load $MODEL at num_ctx=$NUM_CTX and inspect the runner"
  if ! ollama list 2>/dev/null | awk 'NR>1{print $1}' | grep -qx "$MODEL"; then
    fail "model '$MODEL' not in 'ollama list' — pass --model NAME"
    return 1
  fi

  curl -s "$OLLAMA_URL/api/generate" \
    -d "{\"model\":\"$MODEL\",\"prompt\":\"hi\",\"stream\":false,\"keep_alive\":\"5m\",\"options\":{\"num_ctx\":$NUM_CTX,\"num_predict\":1}}" \
    -o /dev/null -w '      load http=%{http_code} (%{time_total}s)\n' || {
      fail "generate request failed — is the model pulled?"; return 1; }

  echo
  say "ollama ps"
  ollama ps 2>/dev/null | sed 's/^/      /'

  local rkv; rkv="$(running_kv)"
  echo
  if [ "$rkv" = "$KV_TYPE" ]; then
    ok "runner was passed --cache-type-k $rkv — KV cache IS quantized"
  elif [ -z "$rkv" ]; then
    fail "no --cache-type-k flag on the runner — KV cache is still f16"
    return 1
  else
    fail "runner has --cache-type-k $rkv, wanted $KV_TYPE"
    return 1
  fi

  local bufs ctx; bufs="$(kv_buffers)"; ctx="$(kv_ctx)"
  if [ -n "$bufs" ]; then
    echo; say "KV buffers (this load${ctx:+, n_ctx=$ctx})"
    echo "$bufs" | sed 's/^/      /'
  fi
}

# ── main ─────────────────────────────────────────────────────────────────────
case "$MODE" in
  check) do_check; exit $? ;;
  printdropin)
    say "Would write to $DROPIN:"
    echo
    dropin_body | sed 's/^/      /'
    echo
    if [ -f "$DROPIN" ]; then
      if [ "$(cat "$DROPIN")" = "$(dropin_body)" ]; then ok "already identical on disk";
      else warn "differs from what is on disk — current contents:"; sed 's/^/      /' "$DROPIN"; fi
    else
      warn "no file at that path yet"
    fi
    exit 0
    ;;
  revert)
    say "Reverting KV cache quantization"
    if [ ! -f "$DROPIN" ]; then
      ok "no drop-in at $DROPIN — nothing to revert"
    else
      $SUDO rm -f "$DROPIN" || { fail "removing $DROPIN failed"; exit 1; }
      ok "removed $DROPIN"
    fi
    restart_unit || exit 1
    echo; say "Reverted: KV cache is back to the daemon default (f16)"
    exit 0
    ;;
  apply) ;;
esac

if ! unit_exists; then
  fail "no systemd unit named '$UNIT' — cannot write a drop-in for it"
  warn "if ollama is started another way, export OLLAMA_KV_CACHE_TYPE=$KV_TYPE"
  warn "where 'ollama serve' is launched, then re-run with --check"
  exit 1
fi

echo
say "Applying OLLAMA_KV_CACHE_TYPE=$KV_TYPE to $UNIT"
write_dropin || exit 1
echo
restart_unit || exit 1
echo
verify_config
echo

if [ "$LOAD_PROOF" = "1" ]; then
  verify_load || exit 1
  echo
  say "Done. Expect a KV cache of ~1632 MiB (q8_0) instead of the measured"
  say "3072 MiB (f16) at n_ctx=$NUM_CTX, and a smaller CPU share in 'ollama ps'"
  say "(23%/77% -> 12%/88% measured)."
else
  say "Done (load proof skipped). Confirm later with: $(basename "${BASH_SOURCE[0]}") --check"
fi
