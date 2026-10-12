# Agent Box Cleanup Report — 2026-09-30

Machine: **llmlab@192.168.1.234** (`llmlab-To-Be-Filled-By-O-E-M`), 2× RTX 3060 12 GB.
Trigger: the box was at **96% full (23 GB free)**, which blocks training and quantising.

> **Bottom line: ~150 GB reclaimed — 23 GB → 212 GB free, 96% → 53% used.**
> Nothing currently in use was touched.

---

## 1. Ollama models removed (~33 GB)

| Model | Size | Why it was safe to remove | How to restore |
|---|---|---|---|
| `vaca-r36:latest` | 15 GB | Superseded vaca round | Re-merge its adapter (`scripts/build-r36-merged.py` pattern) + `ollama create` |
| `vaca-r38:latest` | 15 GB | Superseded vaca round | Same, for r38 (`scripts/auto-deploy-r38.sh`) |
| `buffy:latest` | 9 GB | **Zero references** in the repo; recipe kept at `models/Modelfile-buffy` | `ollama create buffy -f models/Modelfile-buffy` |
| `qwen2.5:7b-instruct` | 4.7 GB | Documented as having **failed** `~/ornith-trainer/scripts/judge_sanity.py` | `ollama pull qwen2.5:7b-instruct` |

### Kept, and why

| Model | Reason |
|---|---|
| `vaca-r40-q4:latest` | Ornith policy; now also the backend `primary` |
| `vaca-r40:latest` | Ornith policy (Q8 arm) |
| `qwen2.5-coder:14b` | **The Ornith trainer's active judge** (`configs/vaca.yaml`, `vaca_rag_full.yaml`, `vaca_rag_index.yaml`; `runs/*/progress.json` → `judge_model`) |
| `ornith:35b` | Offline auditor |
| `qwen2.5:3b` | `backend/llm-config.json` → `secondary` |
| `qwen2.5-coder:0.5b` | Hardcoded default in `backend/src/ai/translator.ts:61` and `routes/benchmark.ts` |
| `nomic-embed-text:latest` | self-play embeddings |
| `qwen2.5vl:7b` | Vision model — kept deliberately (no code refs, but a capability) |

---

## 2. Training / model artifacts removed (~117 GB)

| Path | Size | Why | How to regenerate |
|---|---|---|---|
| `training/cloud/out/unified/merged/` | 28 GB | Sep-5 merge, superseded | Re-merge the round's adapter |
| `training/cloud/out/unified/r40-merged/` | 28 GB | Merged fp16 R40 — already quantised and live in Ollama | `scripts/build-r40-merged.py`, or re-download the Kaggle output |
| `training/cloud/out/unified/gguf-r40-q4/` | 8.4 GB | Duplicate of the `vaca-r40-q4` Ollama blob | `scripts/quantize-r40-q4.sh` |
| `training/unlearn/models/vaca-r40-q4/` | 28 GB | R40 **dequantised** to 16-bit (built 2026-09-30 10:33) | `python3 -m training.unlearn dequant` |
| `models/ornith-35b.Q3_K_M.gguf` | 16.7 GB | Raw duplicate of the `ornith:35b` blob | `ollama show ornith:35b`, or re-download |
| `models/Qwen2.5-Coder-14B-Instruct-Uncensored.R20.Q4_K_M.gguf` | 8.4 GB | The **DSpark** target; DSpark is retired on this box | Re-download / re-merge the R20 adapter |

### Deliberately preserved

- `training/cloud/out/unified/{build-r38,deploy-r38,deploy-r40,deploy}.log` and `unified-deploy.done` — small, and they are the deploy history.
- `models/Modelfile*` — the model recipes.
- Ollama blobs in `/usr/share/ollama/.ollama`.

---

## 3. Config changes (DSpark retired on this box)

1. **`backend/llm-config.json`** — the `dspark` top-level key was **removed**, and `ollama` / `primary` / `fastChat` / `roles.reasoning` now point at the local Ollama server:
   `http://127.0.0.1:11434/v1`, model `vaca-r40-q4:latest`. (The local file is backed up as `llm-config.json.bak-<stamp>`.)
   *Why removing the key matters:* `backend/src/ai/translator.ts` resolves the provider as
   `config.dspark ? 'dspark' : config.ollama ? 'ollama' : 'gguf'` — as long as a `dspark` key existed it won the precedence no matter what `primary` said. `routes/config.ts` has the same precedence.
2. **`backend/.env`** — `DSPARK_AUTOSTART=0`, so the backend no longer tries to spawn a DSpark server for a GGUF that no longer exists.
3. **`scripts/dspark-target.env`** — removed (backed up), so nothing references the deleted R20 GGUF. `/api/llm/dspark-status` now reports unconfigured rather than a missing file.
4. **`backend/src/index.ts` — health probe bug fixed.** `llmHealth()` used a hardcoded DSpark base URL (`DSPARK_PORT` / `:8000`) instead of the configured provider, so `/api/health` reported `llm.up:false, error: fetch failed` while Ollama was answering every request. It now resolves the provider from `backend/llm-config.json` (`dspark` → `ollama` → `primary`) and falls back to the legacy DSpark default if unreadable. Verified: `{"llm":{"up":true,"model":"vaca-r40-q4:latest"}}`.

---

## 4. Notes for the next session

- The VACA mastery rule (`VACA_MASTERY_RULE` in `backend/src/routes/reasoning.ts`, plus four rows in `training/selfplay/vaca_domain.py` and a section in `LLM_ORIENTATION.md`) was synced here and is live after the backend restart.
- If DSpark is ever wanted back: restore `scripts/dspark-target.env`, re-place the R20 GGUF, set `DSPARK_AUTOSTART=1`, and re-add the `dspark` key to `backend/llm-config.json`.
