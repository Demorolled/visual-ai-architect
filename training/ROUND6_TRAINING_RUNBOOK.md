# Round-6 Training Runbook — Bible Knowledge + Error Fix (Q4 QLoRA)

**Target model:** `Qwen2.5-7B-Instruct-Uncensored` (base `gguf` deployed on dspark :8000)
**Method:** QLoRA 4-bit fine-tune → adapter → GGUF `q4_k_m` export
**Duration:** sized for **~10.9 h on a Colab T4 at 2 epochs** (2,941 rows; honest range **8.7–13.1 h** @ 5.3–8.0 s/row)
**Notebook:** `training/cloud/colab/train_round6_bible_10h_q4.ipynb`
**Dataset:** `training/dataset/round6-bible-10h.jsonl` (+ zip `training/cloud/round6-bible-10h.zip`)

---

## 1. Why this round exists (the error history)

| Round | What happened | Lesson folded into round 6 |
|---|---|---|
| 3 | Trained on the leaked full file (test instructions in-train) → 59% fidelity, but partly memorization | Round 5/6 keep a clean retention sample (no new eval leakage) |
| 4 | Trained only on the 25 failures → **regression 59 → 45.9%**; model invented alias app_types (`alertmanager_config_lab`, `color_palette_generator`) and two prompts returned prose/C# instead of JSON | Round 6 adds **99 fidelity-fix rows** (33 failures → canonical JSON) + **20 alias-normalization rows** |
| 5 | Clean 1,108-pair split + Colab notebook built, **never trained** | Round 6 is the actual run, with the bible knowledge added |

Current measured state: **96.7% parse · 75.4% known · 67.2% exact · 45.9% full fidelity** (61-prompt check, 33 failing).

## 2. Dataset composition (2,941 rows)

| Source | Rows | Purpose |
|---|---|---|
| Bible → code (`data/code-bible/*.py`, 904 chunks × 2 phrasings) | 1,808 | Teach code-component generation from the 904-chunk knowledge base |
| Blueprint retention (clean train sample) | 800 | Preserve plan/blueprint fidelity knowledge |
| Round-4 failures (reinforcement) | 401 | Keep the previous error-fix round's gains |
| Fidelity-fix (33 failing prompts → canonical blueprint) | 99 | Teach the exact answer for every prompt currently wrong |
| Alias normalization (got→canonical app_type) | 20 | Stop `_lab`/`_generator`-style invented keys |

**Eval hygiene:** the 61 val + 61 test prompts are excluded from the *new*
retention sample. The 33 failing test prompts are **intentionally** in-train
(that is the error-fix round — same design as round 4). All val/test presence
in the dataset is inherited from `round4-failures.jsonl`'s historical retention
mix, and is documented in `training/dataset/round6-stats.json`.

## 3. The correct training config (proven across rounds)

| Setting | Value | Why |
|---|---|---|
| Method | QLoRA 4-bit (`load_in_4bit=True`) | Fits 7B on 16 GB T4; matches the deployed Q4 GGUF |
| LoRA | `r=8, α=16, dropout=0.05` | Standard, stable for 7B SFT |
| Target modules | `q/k/v/o_proj + gate/up/down_proj` | Full attention + MLP LoRA |
| Sequence length | 2048 | Round-4 measured 5.3 s/row/GPU at 2048; bible code + blueprint JSON fit comfortably |
| LR | `2e-4` (round 1) | Kernels 1–2 both used 2e-4→5e-5; single-round runs use 2e-4 |
| Epochs | **2** (default) | 1 = short; 3 = max (drift risk per round-4). At the pessimistic T4 end (8 s/row) 2 epochs ≈ 13.1 h > an 11 h session — the notebook's Step 4 projection warns in that case; drop to 1 epoch to fit. |
| Rounds | 1 | Fresh start (round 6); no adapter chaining needed |
| Precision | auto bf16 → **fp16 fallback** | T4 has no bf16; the trainer detects and falls back |
| Save | `save_strategy` disabled by default in engine; Colab trainer saves adapter + exports GGUF | Avoids the round-3 SFTConfig pickle crash (Change 24 fix) |
| Gradient checkpointing | unsloth | Keeps VRAM ~11 GB peak at seq 2048 |

## 4. How to run it (Colab)

1. **Upload** `training/cloud/round6-bible-10h.zip` to Drive (or upload at Step 4).
2. Open `training/cloud/colab/train_round6_bible_10h_q4.ipynb` in Colab.
3. Runtime → Change runtime type → **T4 GPU**.
4. **Run all.** Step 4 prints the projected wall time for your GPU; if you land
   an L4/A100 the projection will show **less** than 11 h (raise `EPOCHS` to
   3–4 to fill the session, or just take the faster run). If the T4 projection
   exceeds ~90% of the session, drop `EPOCHS` to 1.
5. Download `/content/out/results.zip` (adapter + ~4.4 GB GGUF).

## 5. After training (back on this machine)

```bash
# 1. deploy the tuned GGUF
scripts/deploy-tuned-dspark.sh --now          # or copy into models/ + restart dspark

# 2. measure real fidelity vs round-4's 45.9%
python3 scripts/validate-blueprint-fidelity.py --all
```

**What to expect (honest):**
- The 33 in-train fix prompts should hit exact-match (they are now train rows) —
  that is **not** a generalization signal by itself.
- The real signals: (a) the **known** gate — the model should emit valid
  library keys; (b) alias drift should vanish on the whole 61 (no more
  `_lab`/`_generator` inventions); (c) bible→code rows should make codegen use
  real chunk components.
- **How many prompts are truly held-out:** 12 of the 61 (49 test prompts have
  their instruction somewhere in round-6 — 33 intentional error-fixes + 16
  inherited from the round-4 retention mix). Those 12 + the `known` gate are
  the honest generalization measure.
- Round-3's 59% baseline is not comparable anymore (different training set).

## 6. Files

- `scripts/build-round6-bible-dataset.py` — rebuild the dataset (deterministic, seed 42)
- `training/dataset/round6-bible-10h.jsonl` — the dataset (2,941 rows)
- `training/dataset/round6-stats.json` — provenance, sources, leakage audit
- `scripts/build-colab-round6-notebook.py` — rebuild the notebook
- `training/cloud/colab/train_round6_bible_10h_q4.ipynb` — the Colab run
- `training/cloud/round6-bible-10h.zip` — upload this to Colab

*Runbook for Change 30 — 2026-08-06.*
