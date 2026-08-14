#!/usr/bin/env bash
# run-stage.sh — run a pipeline stage to completion in ≤600s slices.
#
# Usage: bash curriculum/run-stage.sh <stage> [cli args...]
#   stage ∈ dictionary|tests|validate|eval|dataset
#
# The CLI is resumable: each pass does only the unfinished work and appends to
# the stage's jsonl. This loop re-invokes the CLI until the output file stops
# growing, then exits 0. Safe to re-run anytime (picks up where it left off).
set -u
cd "$(dirname "$0")/.." || exit 1

stage="$1"; shift
case "$stage" in
  dictionary) OUT=curriculum/out/dictionary.jsonl ;;
  tests)      OUT=curriculum/out/tests-raw.jsonl ;;
  validate)   OUT=curriculum/out/tests-validated.jsonl ;;
  eval)       OUT=curriculum/out/eval.jsonl ;;
  dataset)    OUT=curriculum/out/dataset/*.jsonl ;;
  *) echo "unknown stage: $stage"; exit 2 ;;
esac

for i in $(seq 1 30); do
  before=$(cat "$OUT" 2>/dev/null | wc -l)
  timeout 480 python3 curriculum/curriculum.py "$stage" "$@" > /tmp/curriculum-$stage.log 2>&1
  rc=$?
  after=$(cat "$OUT" 2>/dev/null | wc -l)
  tail -4 /tmp/curriculum-$stage.log
  if [ "$after" = "$before" ] || [ "$after" = 0 ] && [ "$before" = 0 ]; then
    echo "[run-stage] $stage complete after $i pass(es) (rows: $after)"
    exit 0
  fi
  if [ "$rc" != 0 ]; then
    echo "[run-stage] $stage pass $i exited $rc (rows $before → $after); continuing"
  else
    echo "[run-stage] $stage pass $i done (rows $before → $after)"
  fi
done
echo "[run-stage] $stage still growing after 30 passes — re-run this script to continue"
exit 0
