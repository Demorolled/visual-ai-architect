# Round-8 Training Runbook — qwen3.6:27b Code Distillation (Q4 QLoRA)

**Target model:** `Qwen2.5-7B-Instruct-Uncensored` (VACA's tuned LLM on dspark :8000)
**Teacher model:** `qwen3.6:27b-q4_K_M` (17 GB Q4_K_M, spans both RTX 3060s) via Ollama
**Method:** Distill tight code question→answer pairs → SFT dataset → QLoRA 4-bit → GGUF export (follows the round-7 Kaggle flow)
**Dataset:** `training/dataset/round8-code.jsonl` (~10 MB target) — built by `scripts/build-round8-code-dataset.py`
**Started:** 2026-08-08 (CHANGE 62)

---

## 1. Why this round exists

VACA's codegen skills are strong (rounds 1-7 kept them from regressing via
retention mixes), but the local 7B still benefits from MORE tight, idiomatic
code Q&A — and the user wants a large code-focused distillation from the new
27B teacher to drive the next fine-tune. The register is **code**: writing,
generation, algorithms, debugging, review, refactoring, explanations,
architecture, API usage, SQL, shell, git, docker, testing, security, data
structures, regex, and web tasks.

## 2. Teacher note (qwen3.6 is a REASONING model)

`qwen3.6:27b-q4_K_M` returns a hidden `reasoning` chain-of-thought. With the
OpenAI-compatible `/v1/chat/completions` endpoint, `think:false` is IGNORED
and `content` comes back empty (verified). Use the **native `/api/chat`**
endpoint with `"think": false` + `"stream": false` — verified to return clean
tight answers. Do NOT use `[/no_think]` prompt tokens (also ignored).

## 3. Dataset composition (target ~10 MB, ~13k rows)

| Register | Scenarios | Row goal |
|---|---|---|
| codegen (14 languages × 75 tasks) | 1,050 | large |
| api usage (14 langs × 66 tasks) | 924 | large |
| explain concepts (14 langs × ~90) | 1,302 | large |
| algo (14 langs × 34) | 476 | large |
| sql / shell / web / regex / arch | 262 | medium |
| debug / review / refactor | 84 | medium |
| git / docker / test / security / data / http | 170 | medium |
| **planning** — start-to-end build walkthroughs (media player, chat, e-commerce, …) | 40 | medium |
| **Total** | **4,307 scenarios × 4 samples = 17,228 tasks** | **~10 MB cap** |

> **Planning register (added mid-run, 2026-08-08):** captures HOW a senior
> architect builds an app from scratch — scope → architecture → file tree →
> build order → verification — via a dedicated `PLANNING_SYSTEM` prompt that
> demands a tight 5-stage walkthrough. This teaches the student the *build
> approach*, not just code snippets. Deliberately uses the clean external plan
> (Demo A), NOT the hidden `reasoning` field — raw CoT is a noisy, budget-
> eating scratchpad that the 7B would only mimic degenerately.

Every row: `{instruction, input, output, source}` with `source:
distill:<register>:qwen3.6`. Answers are TIGHT by construction — the teacher
prompt demands a ```lang code block plus at most 1-2 sentences, zero
preamble; gates then reject fluff openers, echoes, reasoning dumps, turn
labels, and rows missing a code fence in code-required registers.

## 4. Build (already running)

```bash
# Launched (survives reboots via setsid):
setsid nohup python3 scripts/build-round8-code-dataset.py \
  --samples 4 --concurrency 2 --max-bytes 10000000 \
  > data/round8-build.log 2>&1 < /dev/null &

# Monitor:
tail -f data/round8-build.log      # rows / bytes / failed / eta per flush
wc -l training/dataset/round8-code.jsonl

# Resume after a crash / reboot (idempotent — hashes checkpointed):
python3 scripts/build-round8-code-dataset.py --samples 4 --concurrency 2 --max-bytes 10000000
```

Rate: ~11-12 s/row × ~1 KB/row at ~15 tok/s aggregate (both GPUs at
bandwidth saturation — parallel >2 does NOT help). **Full 10 MB ≈ 1.5-2 days
continuous.** Partial data is usable at any point; the run stops at the byte
cap or when the task list is exhausted.

## 5. After the build completes

1. Merge into the training dataset / run the next fine-tune
   (round-7 Kaggle notebook flow: build notebook → validate → push → run →
   deploy-tuned-dspark.sh --now). Round-7 kernel `vaca-qlora-round7-gemma-4-emotion-distill`
   was still RUNNING when round 8 began — check it first:
   `kaggle kernels status stevenawoods/vaca-qlora-round7-gemma-4-emotion-distill`
2. Sanity gates: spot-check JSON validity + `source` distribution, then mix
   with retention (round-6 bible rows) so codegen skills don't regress.

*Runbook for CHANGE 62 — 2026-08-08.*
