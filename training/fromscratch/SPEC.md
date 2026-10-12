# Knowledge-free code/scaffolding LLM — from scratch (spec)

Goal: a model that **only** knows what it was fed — code, scaffolding/reasoning,
and enough English to speak — and holds **no** general world knowledge
(history, geography, literature, news, sport). "Knowledge-free" here means
*measurably unable to answer* general-fact questions, not merely *unwilling*.

This spec exists because `training/unlearn/` already answered the other route
honestly:

> "**Knowledge is not addressable.** There is no 'American history' cluster to
> delete. What is removed is the model's *behaviour* on the forget set."

Task-vector negation / NPO on a pretrained model produces a **gradient, not a
boundary** — the pretrained world knowledge is still in the weights. The only
way to *genuinely* not have it is to **never train on it**: random init + a
curated corpus. That is what this spec builds, at a size a single RTX 3060 can
actually finish.

---

## 0. Acceptance criteria (the gate)

A run is accepted only if **all** hold:

| # | Criterion | Test | Threshold |
|---|-----------|------|-----------|
| A1 | Cannot answer general-fact questions | Forbidden-Knowledge Battery (FKB) | exact-match **≤ 8%** |
| A2 | The FKB probe actually discriminates | same probe on `Qwen2.5-Coder-1.5B` | exact-match **≥ 40%** |
| A3 | Speaks basic grammatical English | TinyStories-style prompt, 64 tok | coherence labels, 0 `incoherent` |
| A4 | Writes plausible code | held-out `corpora/vaca` files, pass@1 (executable tasks) | **≥ base rate of the corpus** |
| A5 | Emits valid scaffold | held-out task → node/logic graph parses | **≥ 60%** |
| A6 | No slice collapse | per-slice val loss | no slice > 2.0 vs its train split |

A1 without A2 is not proof (a broken model also scores 0% on FKB) — **A2 is what
makes A1 meaningful.** This mirrors the honesty rule already in
`training/unlearn/README.md` ("harvest and evaluation must be the same model").

---

## 1. What goes IN — and what is banned

The corpus is defined by exclusion as much as inclusion.

### Included (the entire universe of what the model may ever see)

| Slice | Contents | Why |
|---|---|---|
| `code` | Source files, permissively licensed, limited to the stacks VACA builds | The core capability |
| `code_prose` | Docstrings, comments, error strings, READMEs **from those same code repos** | Code-adjacent English that stays tied to code |
| `scaffold` | `corpora/vaca/` + `training/selfplay/corpus/vaca-domain.jsonl` + self-play traces + puzzle/DPO rows | The unique part — how VACA plans and reasons about files |
| `simple_en` | TinyStories-style synthetic simple English | Grammar/fluency with ~no real-world facts |

### Banned (never enters the corpus)

- Wikipedia, news, books, CommonCrawl narrative, web Q&A, encyclopedic text.
- Any general instruction dataset that carries world facts (OpenOrca, Alpaca,
  ShareGPT, the "chat" half of OpenHermes…). These are the leak vector.
- Any dataset whose provenance is "a bigger LLM generated knowledge text".

> If a token could teach the model "who won the 1969 moon race", it is out.
> Instruction-following is bought back later in SFT with **code-only** pairs.

### Language / stack scope (from the repo's actual output)

`TypeScript · TSX · JavaScript/JSX · Python · HTML · CSS · JSON · YAML · Shell · SQL`

Chosen because VACA emits these (see `backend/blueprints/*.json`,
`data/designs.json`). Everything else is deferred to a later run.

---

## 2. Token budget (pretrain, phase 1)

Target total **≈ 4.0 B tokens** for the 110 M model (Chinchilla 20× ≈ 2.2 B;
small models do better slightly over-trained, so 4 B).

| Slice | Raw tokens | Repeat | Effective | Share |
|---|---:|---:|---:|---:|
| `code` | 3.00 B | ×1 | 3.00 B | 75.0% |
| `code_prose` | 0.35 B | ×1 | 0.35 B | 8.8% |
| `scaffold` | 0.02 B | ×10 | 0.20 B | 5.0% |
| `simple_en` | 0.45 B | ×1 | 0.45 B | 11.3% |
| **total** | | | **4.00 B** | 100% |

Why repeat `scaffold` ×10: it is the smallest slice and the *most important*,
but repeating too hard overfits — cap at ×10 and hold **all** held-out VACA IDs
out of pretraining entirely (see §5 decontamination). Log the epoch count per
slice in the manifest.

---

## 3. Corpus construction

### 3.1 Code + code_prose

1. Pull a permissively-licensed code corpus (`bigcode/the-stack-smol` for a
   smoke run, or The Stack v2 with the license filter for the real run).
2. **Language filter** → the 9 stacks above only.
3. **Quality filter**: require ≥ 5 lines, non-trivial, parse-clean where a
   parser exists; drop generated/vendored/minified; cap file at 32 KB.
4. **Dedup**: exact SHA-1 line dedup, then MinHash near-dup (Jaccard 0.8).
   Dedup matters more than scale at this size.
5. **PII/secret scrub**: strip emails, keys, tokens, absolute paths, URLs.
6. `code_prose` = the comment/docstring/README portion of the *same repos*,
   kept separate so its share is controllable.

### 3.2 scaffold

Reuse what exists — do not rebuild:

- `corpora/vaca/` — 685 raw rows / 197 tasks, **already decontaminated**
  (`leak_threshold: 0.2`, `n_dropped_leak: 95`, 7 held-out IDs). Its
  `system_prompt` is the scaffold-author contract; keep it verbatim.
- `training/selfplay/corpus/vaca-domain.jsonl` — 1030 rows, 10 facets
  (`identity_role`…`troubleshooting`), `coverage_score: 100.0`.
- `training/selfplay/corpus/r1/` + `work/` traces (play, DPO, tune-up rows).

Re-verify the leak report after any merge (the harness exists; `corpora/vaca/
leak_report.json` is the current output).

### 3.3 simple_en

- **Primary**: TinyStories (`roneneldan/TinyStories`) — synthetic, ~1.5 k-word
  vocabulary, grammatical, world-fact-poor by construction.
- **Filter**: drop any story line containing a proper noun from a banned list
  (countries, capitals, historical figures, brands) so it teaches *grammar*,
  not *facts*.
- **Fallback** if TinyStories over-leaks: build `simple_en` from VACA's own
  narration strings + short "describe this file" pairs (see `docs/narration/`).

### 3.4 Output layout (mirrors `selfplay/corpus/` conventions)

```
training/fromscratch/
  SPEC.md                  ← this file
  corpus.manifest.json     ← machine-readable spec of the mix
  corpus/
    code/{train,val}.bin
    code_prose/{train,val}.bin
    scaffold/{train,val}.bin
    simple_en/{train,val}.bin
    manifest.json          ← built artifact: real counts + hashes per slice
  tokenizer/bpe-32k/       ← tokenizer.json + vocab
  models/nano-110m/        ← ckpt.pt + config.json
  eval/{forbidden.jsonl,results.json}
```

---

## 4. Tokenizer

- **Byte-level BPE**, vocab **32,768**, trained **only on the curated mix**
  (never on a generic web corpus — a tokenizer trained on Wikipedia smuggles in
  a world-lexicon).
- Special tokens: `<|pad|> <|bos|> <|eos|> <|system|> <|user|> <|assistant|>`.
- Whitespace/indentation tokens are mandatory: measure **tokens-per-TS-file vs
  tokens-per-English-sentence** and confirm code is not over-split.
- Rationale for own tokenizer over reusing StarCoder's: purity. Reusing an
  open tokenizer is acceptable only if its training corpus was code-only.

---

## 5. Decontamination (keep the gate honest)

Held-out sets must be excluded from **all** pretrain slices:

- The 7 `held_out_ids` from `corpora/vaca/meta.json`.
- A 2% random hold-out of `code` (for A4).
- A 1% hold-out of `simple_en` and `code_prose` (for A3/A6).

Then run the same near-dup check **across slices** — a held-out VACA file may
also appear inside The Stack, which would silently leak the eval.

---

## 6. Model

Two sizes; the **nano** is the one that fits a single 3060 today.

| | `nano-110m` (do this first) | `small-350m` (scale-up) |
|---|---|---|
| d_model | 768 | 1024 |
| layers | 12 | 24 |
| heads / head_dim | 12 / 64 | 16 / 64 |
| FFN (SwiGLU) | 2048 | 2816 |
| context | 1024 | 2048 |
| vocab | 32768 (tied) | 32768 (tied) |
| params | **≈ 110 M** | **≈ 342 M** |
| norm / pos | pre-RMSNorm / RoPE | same |
| biases | none | none |

Standard decoder-only block. No MoE, no GQA at this size (heads = d/64 keeps it
simple). Tie input embedding and `lm_head`.

Reference implementation to lift the block from: **nanoGPT** (`model.py`,
`train.py`) — small, readable, and matches this config almost line-for-line.
Do not hand-roll attention; use `F.scaled_dot_product_attention`.

---

## 7. Pretrain (phase 1)

```
optimizer    AdamW  β=(0.9, 0.95), weight_decay 0.1
grad clip    1.0
LR           6e-4 (nano) / 3e-4 (small), warmup 2000 steps, cosine → 10%
eff batch    ≈ 0.5 M tokens = 32 seq × 1024 ctx × grad_accum 16
precision    bf16 autocast (Ampere supports it; 3060 OK)
eval         every 250 steps, per-slice val loss
ckpt         every 500 steps, rolling 3 + best
seed         42
```

**Runtime on 1× RTX 3060 (12 GB), `nano-110m` ≈ 4 B tokens:**
FLOPs ≈ 6·N·D = 6 · 1.1e8 · 4e9 ≈ **2.6e18**; at ~15 TFLOP/s effective
(~30% MFU) that is ≈ **2–3 days**. The `small-350m` at 8 B tokens ≈ **~13 days**
— run it on the 2× 3060 agent box or a rented card, not this one.

Smoke before the real run: `--max-steps 200` on 64 MB of data, confirm loss
falls and no OOM, then launch.

---

## 8. SFT (phase 2) — where "scaffolding" is actually learned

Pretraining teaches completion; instruction-following comes from SFT. Reuse the
existing row formats (`orchestrator.py` already emits `instruction/input/output`
and DPO rows):

- **Data**: `corpora/vaca` scaffold-refinement pairs (held-out IDs excluded),
  `vaca-domain.jsonl`, self-play clean rows from `training/selfplay/corpus/r1/`,
  and code instruction pairs **filtered to code only** (no world-fact answers).
- **Method**: full fine-tune (the model is tiny — no LoRA needed), 1–2 epochs,
  LR 1e-4 cosine, seq 1024, batch 8, mask loss to the assistant span (the
  masking logic already exists in `train_student.py::load_rows`).
- **Optional DPO** on the `dpo-puzzle-*.jsonl` rows if SFT plateaus.

---

## 9. Evaluation harness

`eval/forbidden.jsonl` — the FKB. ~300 rows across categories that must be
absent, each with a known short answer, e.g.:

```jsonl
{"category":"history","q":"Who was the third U.S. president?","a":"Thomas Jefferson"}
{"category":"geography","q":"What is the capital of France?","a":"Paris"}
{"category":"literature","q":"Who wrote Hamlet?","a":"Shakespeare"}
```

Gate logic:
- A1: greedy-decode, exact/contained match ≤ 8%.
- A2: run the *same* file through `Qwen/Qwen2.5-Coder-1.5B-Instruct`; if it does
  not score ≥ 40%, the probe is too weak and must be replaced before trusting A1.
- A4: executable tasks from held-out `corpora/vaca` files, pass@1.
- A5: held-out task → scaffold graph parses (`tasks.txt`/`gold.jsonl` in
  `corpora/vaca/` are the references).
- A6: per-slice val loss table.

Write `eval/results.json` with every arm + verdict, mirroring the shape of
`training/unlearn/data/.../sweep.json` so both harnesses read alike.

---

## 10. Honest limits

1. **Purity vs fluency is a real trade.** The stricter the exclusion, the less
   coherent the model. A3 will be the first thing to fail if `simple_en` is cut
   too far.
2. **110 M does not reason.** A4/A5 come from SFT, and even then this is a
   *specialist*, not a rival to Qwen2.5-Coder-14B. Keep the pretrained model for
   production; build this one for *purity* and as VACA's owned substrate.
3. **Docstrings and READMEs leak a little world knowledge.** They are included
   because they are code-adjacent; if A1 fails, shrink `code_prose` first.
4. **Decontamination is the whole ballgame.** One leaked held-out file makes A4
   a lie — rerun `leak_report` after every corpus edit.
5. **"Knowledge-free" is asymptotic, not binary.** Report the FKB number; never
   claim zero.
6. **This is not cheaper than unlearning** — it is a different guarantee. The
   `unlearn/` harness changes behaviour on an existing model in hours;
   this run cannot finish in hours.

---

## 11. Run order (checklist)

- [ ] 1. Build `corpus/` per §3, write real counts to `corpus/manifest.json`.
- [ ] 2. Train tokenizer (§4); report tokens/file for TS + English.
- [ ] 3. Decontaminate (§5); regenerate `leak_report`; commit hashes.
- [ ] 4. Smoke pretrain 200 steps on 64 MB; confirm loss ↓, no OOM.
- [ ] 5. Full `nano-110m` pretrain (§7) — ~2–3 days on the 3060.
- [ ] 6. SFT (§8) on scaffold + code instructions.
- [ ] 7. Eval (§9); A2 must pass **before** trusting A1.
- [ ] 8. If accepted, scale to `small-350m` on the 2×3060 agent box.
