# VACA unlearning harness

Selectively removes knowledge the student doesn't need — general world
knowledge (history, geography, literature, sport…) that a model which only
builds apps gains nothing from.

Method: **task-vector negation**, the most surgical option that doesn't require
retraining the 14B.

```
                 forget set                    retain set
        (general knowledge to remove)     (VACA + code to keep)
                    │                             │
                    ▼                             │
   1. train LoRA on forget  ──►  τ (task vector)   │
                    │                             │
                    ▼                             │
   2. W' = W − λ·τ   (negate lora_B by −λ)         │
                    │                             │
                    ▼                             ▼
   3. score BOTH sets for every λ ──► pick λ that forgets most
                                      without damaging retain
```

## Why train *toward* the thing you want to remove

A task vector is only meaningful if it points at a capability. Fine-tuning on
the forget set produces a direction `τ` that makes the model *better* at the
domain; subtracting it removes that capability. Subtracting a direction the
model never learned would do nothing.

## The retain set is not optional

Forgetting without measuring damage is guesswork. Every λ is scored on the
forget set (**want worse**) and the retain set (**want flat**), and only λ
values that hold retain damage under `--max-retain-delta` (default 5%) are
candidates. The harness will refuse to name a winner if every arm blows the
budget, and it still prints the rejected arms so the trade-off is visible.

Retain defaults to the VACA domain corpus from
`training.selfplay.vaca_domain` — exactly the material that must survive.

## λ meanings

| λ | Meaning |
|---|---|
| `0` | `lora_B` is zeroed ⇒ `W' = W`, the **base model**. The baseline everything is measured against. |
| `1` | Subtracts exactly the vector that was trained. |
| `> 1` | Over-subtracts: more removal, more collateral. |
| `-1` | Applies the adapter as trained — the fine-tune itself. The ceiling of how much it can know about the domain. |

Scaling is applied uniformly, including at λ=0, so the control arm is the true
base model rather than a second copy of the fine-tune.

## Two things perplexity cannot tell apart

A rising forget perplexity can mean the model forgot the domain **or** that it
can no longer write a sentence. The retain budget catches the catastrophic
cases, not the subtle ones, so read real generations:

```bash
python3 -m training.unlearn inspect --lams 0.5,1.0 --n 8
```

Every generation is labelled mechanically (no second model judging):

| label | meaning | on forget | on retain |
|---|---|---|---|
| `forgotten` | fluent, but no longer reproduces the known answer | **want ↑** | — |
| `refused` | declines to answer | want ↑ | ⚠️ want 0 |
| `unchanged` | still knows it | want ↓ | **want ↑** |
| `incoherent` | repetition, no words, symbol soup, empty | ⚠️ **must be 0** | ⚠️ **must be 0** |

A rise in retain *refusals* means the model stopped being helpful — unlearning
causes that far more often than it gets credit for, and it is invisible to
perplexity. The report ends with a verdict that names which arms genuinely
forgot versus which ones just broke.

## Stronger alternative: NPO

Task-vector negation subtracts a direction and stops. It cannot push past what
the forget adapter represented, and it has no notion of staying close to the
original elsewhere. NPO trains the removal directly, with an explicit retain KL:

```bash
python3 -m training.unlearn npo --beta 0.5 --kl-weight 1.0
```

```
L = -(2/β)·log σ( β·(log π_ref(y|x) - log π_θ(y|x)) )  +  λ·KL(π_θ ‖ π_ref)
```

β is the safety dial, and the limits are measured in `--self-test` rather than
asserted in prose:

- **β → 0** — the sigmoid is 1 everywhere, so it pushes with constant force,
  identical to gradient ascent. Unlearns hardest, collapses easiest.
- **β → ∞** — the gradient dies as soon as θ drops below the reference, so it
  stops early. Safer, weaker.
- At a fixed gap the gradient shrinks monotonically as β grows.

The reference model is the same base with the adapter disabled
(`disable_adapter()`), so it costs one model in memory rather than two — which
matters on a 12 GB card.

## Readiness check

```bash
python3 -m training.unlearn preflight
```

Checks the local stack, the student and judge endpoints, and prints the exact
command sequence with real URLs substituted — so the sweep can start the moment
the agent box comes up, instead of being reconstructed from this README.

## Usage

```bash
# 0. what can actually run right now?
python3 -m training.unlearn preflight

# 0b. rebuild a TRAINABLE base from the GGUF that is actually deployed.
#     PEFT cannot train on a GGUF, and the only local copy of the deployed model
#     is one. This dequantizes it to fp16 safetensors; --stdin streams the blob
#     straight from another host so it is never spooled to disk.
python3 -m training.unlearn dequant --gguf models/<model>.gguf --out <dir>
ssh host 'sudo cat <blob>' | python3 -m training.unlearn dequant --stdin --out <dir>
python3 -m training.unlearn dequant --stdin --out <dir> --check   # audit it

# 1. build the sets (retain comes from the VACA domain corpus)
python3 -m training.unlearn sets
python3 -m training.unlearn sets --forget-source harvest \
    --endpoint http://127.0.0.1:8000/v1 --model <served-student>

# 2. train the forget adapter (the expensive step — the agent's GPUs)
python3 -m training.unlearn train --dry-run
python3 -m training.unlearn train

# 3. write the λ variants — pure tensor math, no GPU, no base model
python3 -m training.unlearn negate --lams 0.25,0.5,0.75,1.0,1.25

# 4. score every arm and pick a winner
python3 -m training.unlearn eval
python3 -m training.unlearn eval --dry-run

# prove the negation math is right
python3 -m training.unlearn self-test
```

Artifacts land in `training/unlearn/data/` (sets + manifest) and
`training/unlearn/adapters/` (`forget-lora/`, `lambda-*/`, `sweep.md`, `sweep.json`).

### Populating the forget set

| `--forget-source` | What it is | When |
|---|---|---|
| `harvest` | The **student's own answers** to the built-in questions | Best fidelity — the set then describes what *this* model knows. Needs the student served. |
| `from-file` | Your own JSONL of `instruction`/`output` | You already have a corpus for the domain. |
| `seed` | The built-in question list with unanswered outputs | Offline planning. Not scorable, and the manifest says so. |

## Runtime budget

| Stage | Cost |
|---|---|
| `sets` | seconds |
| `train` | one QLoRA round — small (38 rows, 1 epoch, seq 1024), same 2×3060 config as a student round |
| `negate` | **seconds, CPU only** — a few MB of adapter weights, no base model required |
| `eval` | loads the 14B (4-bit) for inference; one forward pass per row. Keep retain affordable with `--retain-limit` |

`eval` needs `transformers` + `peft` + `torch`. The system `python3` on this box
has torch but **not** transformers/peft, and the `llm-training-app` venv has
them but its `torch` install is broken (namespace package, no `__init__.py`), so
evaluation must run on the agent box. `eval` detects a missing stack and tells
you which interpreter to use instead of failing obscurely.

## Honest limits

1. **Knowledge is not addressable.** There is no "American history" cluster to
   delete. What is removed is the model's *behaviour* on the forget set.
   Expect a gradient, not a clean boundary — and expect adjacency damage
   (dates, names, maths) which is precisely what retain Δ catches.
2. **Perplexity is a proxy.** It can rise because the model became incoherent
   rather than because it forgot. The report says this; read a few generations
   before deploying.
3. **λ does not transfer between runs.** The right λ depends on how the forget
   adapter was trained, so re-run the sweep each time rather than reusing a
   number.
4. **DoRA and `modules_to_save` break the simple negation.** Negating `lora_B`
   alone is not the whole task vector in those cases. Both are detected by
   `negate`'s audit and reported rather than silently half-applied.
5. **This does not make the model smaller or faster.** Dense weights are still
   all read per token; removing knowledge is a *behavioural* change, not a
   performance one. If the goal is speed, distillation or quantization is the
   lever.
6. **Not the strongest unlearner.** NPO / gradient-ascent unlearning with a
   retain-set KL term removes more aggressively, at the cost of a real training
   run and more fragility. This harness is the surgical, cheap, testable one.

## Current state (2026-09-30)

**Forget set: harvested and QA-clean.** 38/38 answers from the served student
`vaca-r40-q4` on the agent box (`192.168.1.234:11434`) — 0 refusals, 0 empty,
0 incoherent, 10–218 words (median 62). The student genuinely knows the
material, so the set is trustworthy. Retain = 680 VACA-domain rows.

**The full pipeline has been run end to end** at smoke scale, on
`Qwen/Qwen2.5-Coder-1.5B-Instruct` (artifacts in `adapters-smoke/`):

train 28 s → negate 5 λ variants → eval → inspect.

| arm | forget ppl | forget Δ | retain ppl | retain Δ |
|---|---|---|---|---|
| base | 2.56 | +0.0% | 8.01 | +0.0% |
| λ=0.25 | 2.60 | +1.6% | 8.02 | +0.1% |
| λ=0.50 | 2.67 | +4.3% | 8.04 | +0.4% |
| λ=0.75 | 2.73 | +6.6% | 8.06 | +0.6% |
| λ=1.00 | 2.80 | +9.4% | 8.08 | +0.9% |
| λ=1.25 | 2.87 | +12.1% | 8.10 | +1.1% |

The λ effect is **monotone**, which is the mechanism working as designed, and
retain damage stayed tiny, so the guardrail holds. Generation inspection found
**zero incoherence** on either set at any λ — fluent before and after.

### The GGUF → HF stage (`gguf_to_hf`)

Two defects were found by dequantizing the real file, both silent — they produce
NaN/Inf and transposed weights rather than an error, which is why there is now a
finite-value guard on every tensor:

1. The streaming reader started its cursor at `data_start` instead of the end of
   the header, so it never skipped the alignment padding and read every tensor
   0–31 bytes out of place. Only `--stdin` was affected; a seekable file happens
   to be immune, which is why the local dry run looked clean.
2. GGUF stores dimensions innermost-first, so HF shape is the reverse. Skipping
   that transposes every 2-D weight (`lm_head` came out (5120, 152064)).

`--check` re-derives every shape from the GGUF and compares it against the
written shards, so a 30 GB artifact can be audited without re-running it.

### What this run does NOT prove

It validates the machinery, not the effect size, and two things make that
unavoidable at this scale:

1. **The 1.5B never held the knowledge.** References were harvested from the
   **14B** student; the 1.5B answers "James Madison"/"James Garfield" to "who
   was the third president" both before *and* after unlearning. So the baseline
   itself scores 66.7% "forgotten", and label counts are identical across arms:
   a +12% perplexity shift does not move greedy-decoded tokens when the model
   was never right. Harvest and evaluation must be the **same model** for the
   forget/unchanged split to mean anything — which is precisely what
   `--forget-source harvest` is for.
2. **The overlap heuristic measures wording, not truth.** It labelled a wrong
   answer "unchanged" because the sentence structure matched the reference
   (overlap 0.545). It cannot tell "right" from "plausible-sounding wrong".
   Treat `unchanged` as "reproduces the reference wording", nothing more.

### Where the real 14B sweep stands (2026-09-30, paused)

The base model problem is **solved** — no Hub download is needed any more. The
deployed model (`vaca-r40-q4`, the R40 merge) was dequantized out of the GGUF
Ollama serves, straight into a verified HF checkpoint:

```
training/unlearn/models/vaca-r40-q4   579/579 tensors, 7 shards, 14.77B params
                                      29.6 GB fp16, all shapes match the GGUF
                                      tokenizer 0/24 mismatches, rope_theta 1e6
```

It loads 4-bit in 0.4 min and generates coherently (it answers VACA questions
and still knows general history — i.e. there is genuinely something to prune).
Because the forget set was harvested from `vaca-r40-q4` itself, harvest and
evaluation are now the *same* model, which retires caveat 1 below.

The remaining blocker is **fit, not data**:

- **This box — one RTX 3060 (12 GB): hard no.** `prepare_model_for_kbit_training`
  upcasts every fp16 parameter to fp32. On the 1.56B-param embedding + lm_head
  that is +3.1 GB, and it OOMs *inside* prepare (~1 GB free beside a 9.25 GB
  4-bit model) before a single step runs. `--card-gb` only moves where the
  offload happens; the upcast is the wall.
- **Agent box (2× RTX 3060, 16 cores, 56 GB RAM) — the design target, and next.**
  Its `llm-training-app/.venv` is an empty venv symlinked to system python with
  only numpy (no torch/transformers/peft/bitsandbytes/accelerate), but `ensurepip`
  works, so it can be rebuilt properly. Its repo also lacks `training/selfplay/`
  and `training/unlearn/`, so that code needs syncing.

Do **not** ship the 29.6 GB checkpoint over: the agent box holds the same r40
blob, so dequantize there directly from its local copy and only copy the
adapters (a few MB) and reports back.

```bash
# on the agent box, after the venv and the code are in place
sudo cat /usr/share/ollama/.ollama/models/blobs/sha256-<r40> \
  | python3 -m training.unlearn dequant --stdin --out training/unlearn/models/vaca-r40-q4
python3 -m training.unlearn train --base training/unlearn/models/vaca-r40-q4 --seq 1024
python3 -m training.unlearn negate --lams 0.25,0.5,0.75,1.0,1.25
python3 -m training.unlearn eval  --base training/unlearn/models/vaca-r40-q4
python3 -m training.unlearn inspect --base training/unlearn/models/vaca-r40-q4 --lams 0.5,1.0 --n 8
```

## Environment

The training interpreter is `llm-training-app/.venv/bin/python`. On this box
that venv arrived **hollow**: it had been built on the GPU host
(`pyvenv.cfg` pointed at `/home/llmlab/...`) and `torch/` contained zero real
files — only empty directory skeletons — with no `dist-info`, and packages
imported as empty namespace packages.

It was rebuilt rather than repaired (contents were gone, not damaged): the
broken copy is preserved at `.venv.broken-20260930`, and the new venv is
created with `--system-site-packages` so it **inherits the working system torch
(2.12.1+cu130, CUDA)** instead of re-downloading ~2.5 GB. The eval stack
(`transformers`, `peft`, `accelerate`, `safetensors`) plus `datasets`, `trl` and
`bitsandbytes` are installed into it.

`python3-venv` is not installed on this host, so `venv` cannot bootstrap pip by
itself; the venv was created with `--without-pip` and populated via
`python3 -m pip --python <venv-python> install ...`. Do not recreate it with a
plain `python3 -m venv` — it will fail on `ensurepip`.

## Verification

Each stage ships a self-test that runs on real tensors with no model needed:

```bash
python3 -m training.unlearn self-test          # W - λ·τ identity
python3 -m training.unlearn inspect --self-test  # forgetting vs incoherence
python3 -m training.unlearn npo --self-test      # NPO loss + retain KL
```

- **negate** — the `W − λ·τ` identity holds for any LoRA scaling (`alpha/r` and
  rsLoRA alike), the λ=1 adapter cancels the trained one exactly, λ=0 zeroes
  `lora_B` so the base model is the baseline, non-`lora_B` tensors are never
  touched, and the on-disk round-trip is exact.
- **inspect** — separates crafted cases across all four labels, and specifically
  does **not** call a fluent-but-wrong answer `incoherent`.
- **npo** — the gradient w.r.t. the forget log-probability is positive (descent
  lowers it), descent saturates instead of diverging, β→0 matches gradient
  ascent while β→∞ kills the gradient, the gradient shrinks monotonically in β,
  and the retain KL is zero with zero gradient at π_θ = π_ref.
- **verdict logic** — picks the arm that forgets most within the retain budget,
  rejects the over-budget arms, and refuses to name a winner when every arm
  blows the budget.
