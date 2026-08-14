# Round-7 Training Runbook — Gemma-4 Emotion Distillation (Q4 QLoRA)

**Target model:** `Qwen2.5-7B-Instruct-Uncensored` (VACA's current tuned LLM on dspark :8000)
**Teacher model:** `dna5rm/gemma4:12b-8k` — Google Gemma 4 12B (Q4_K_M, 7.6 GB) via Ollama
**Method:** Distill the teacher's emotional + reasoning register → SFT dataset → QLoRA 4-bit → adapter → GGUF `q4_k_m` export
**Duration:** ~4–5 h on a Kaggle T4 at 2 epochs (~1.1k rows) — well under the 12 h cap
**Notebook:** `training/cloud/kaggle/train_round7_kaggle.ipynb` (built by `scripts/build-r7-kaggle-notebook.py`)
**Dataset:** `training/dataset/round7-emotion.jsonl` (built by `scripts/build-round7-emotion-dataset.py`)

---

## 1. Why this round exists

VACA's emotion claim was at 8/10 via prompt engineering (mood mirroring, empathy-first
modifiers, sassy banter directives, echo/leak guards). The remaining gap is the 7B's
consistency ceiling — it occasionally goes flat on jokes, drifts on long conversations,
or emits training-data degenerations (echoes, "I'm just a static file", system-prompt
dumps). Prompt fixes are deterministic backstops; this round **bakes the register into
the weights** by distilling a stronger model (Gemma 4 12B) on the exact behaviors the
app wants, so the tuned model needs fewer guardrails to behave right.

## 2. Teacher note (Gemma 4 is a reasoning model)

`dna5rm/gemma4:12b-8k` returns a `reasoning` chain-of-thought field. With a small
`max_tokens` the whole budget is eaten by reasoning and `content` comes back empty.
**Always pass `reasoning_effort: "none"`** (Ollama OpenAI-compatible /v1) — verified:
content comes back clean and the roasts are excellent.

## 3. Dataset composition (target ~1,100 rows)

| Source | Rows | Purpose |
|---|---|---|
| Gemma-4 distillate — banter/roast (yo-mama, "fight me 1v1", lol/lmao, sucker…) | ~120 | Witty comebacks; a joke must never get sympathy |
| Gemma-4 distillate — empathy-first (stress, grief, "my dog died lol", anxiety, breakup…) | ~60 | Empathic opening before advice; serious-negative beats banter |
| Gemma-4 distillate — joy / excitement | ~28 | Match positive energy |
| Gemma-4 distillate — neutral chat | ~28 | Natural, non-canned replies |
| Gemma-4 distillate — personality / identity (name=Veronica, no company claims, no narration) | ~24 | The "who am I" register |
| Gemma-4 distillate — technical reasoning (APIs, debugging, architecture, algorithms) | ~40 | Concrete, confident engineering answers |
| Gemma-4 distillate — mood mirroring & continuity (2-turn chains: playful→playful, stressed→empathy, playful→serious decay) | ~16 | Cross-turn emotion continuity + decay |
| **Round-6 retention** (sampled from `round6-bible-10h.jsonl`) | 800 | Preserve blueprint fidelity + bible→code skills — no codegen regression |

**Every distillate row passes a Python port of the app's `responseCleaner` gates**:
no echoes / "I see you're typing", no static-file claims, no `[REASONING]`, no
system-prompt dumps, no blueprint JSON for chat, no verbatim user echoes, no
`Assistant:`/`User:`/`Bot:` turn labels, no teacher meta-commentary — plus
register-consistency checks. Empathy rows reject ONLY advice-first replies with
zero acknowledgment (a warm reply without the keyword tokens still passes — the
gate must not select FOR canned "I'm sorry" empathy); banter rows must never
reply with sympathy. `--samples 3` (per-sample temperature 0.8/1.0/1.2) gives
real variety per scenario. `source` records the register for provenance.

## 4. Build + train (the flow)

```bash
# 1. Pull the teacher (done):   ollama pull dna5rm/gemma4:12b-8k
# 2. Generate the distillate (resumable):
python3 scripts/build-round7-emotion-dataset.py --samples 3 --concurrency 3
#    → training/dataset/round7-emotion.jsonl (1,276 rows: 476 distill + 800 retention)
#      (+ round7-stats.json + checkpoint)

# 3. Build + validate the Kaggle notebook:
python3 scripts/build-r7-kaggle-notebook.py
python3 scripts/validate-cloud-notebooks.py --notebooks training/cloud/kaggle/train_round7_kaggle.ipynb

# 4. Push to Kaggle (dataset + kernel):
bash scripts/kaggle-setup-r7.sh
#    then in the web UI: Settings → Accelerator GPU T4 x2 + Internet ON → Run All

# 5. After the kernel finishes: download /kaggle/working/out/results.zip, then:
scripts/deploy-tuned-dspark.sh --now
```

## 5. Config (proven ladder, gentle continuation)

| Setting | Value | Why |
|---|---|---|
| Method | QLoRA 4-bit (`load_in_4bit=True`) | Matches the deployed Q4 GGUF |
| LoRA | `r=8, α=16, dropout=0.05`, q/k/v/o + gate/up/down | Round-1-proven, stable for 7B SFT |
| Sequence length | 2048 | Chat + short technical answers fit |
| LR | `5e-5` | Later ladder round — gentler than 2e-4, keeps round-6 skills |
| Epochs | 2 | ~4–5 h on T4 at ~1.1k rows; raise to 3–4 if you land a faster GPU |
| Rounds | 1 | Fresh from base (retention mix preserves prior rounds' knowledge) |
| Launch | plain single-GPU python (no torchrun) | Kaggle grants 1 usable T4; DDP dies 'invalid device ordinal' |

## 6. Verification gates (run after deploy)

```bash
python3 scripts/verify-blueprint-emotion.py      # emotion continuity probe (was 3/3 PASS)
python3 scripts/validate-blueprint-fidelity.py --all   # fidelity vs round-6 (must NOT regress)
# + the claims-audit Quick Test in the browser
```

**What to expect (honest):** the emotion register should become *more consistent*
(fewer flat jokes, mood mirroring sticks, empathy-first always fires), and the
degeneration patterns (echo / static-file / system-prompt dumps) should shrink
further because the training data explicitly demonstrates their absence. The 7B
ceiling remains — Gemma 12B → Qwen 7B distillation improves reliability, not raw
depth. Fidelity must stay within ~1-2 points of round 6 thanks to the 800-row
retention mix; if it drops more, bump retention to 1,200 and re-run.

*Runbook for CHANGE 61 — 2026-08-08.*
