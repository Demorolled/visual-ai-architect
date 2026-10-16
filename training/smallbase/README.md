# smallbase — download an open LLM, then train it

Answer to *"isn't there an open LLM I can download and start training?"* — **yes,
several**, and this folder is the path for that. It is the counterpart to
`training/fromscratch/`: same target capabilities (code + speaking + a little
reasoning), opposite starting point.

| | `training/smallbase/` (this) | `training/fromscratch/` |
|---|---|---|
| Start | a downloaded pretrained base | random init |
| Time to first useful model | **hours** | days–weeks |
| World knowledge | **retained** (inherited from the base) | genuinely absent |
| Code ability | strong on day one | learned from your ~4 B tokens |
| Reasoning | whatever the base already has | ~none at 110 M |
| Use when | you want a working specialist | you need a *purity guarantee* |

Read `training/fromscratch/SPEC.md §0` before choosing: it wants a model
*measurably unable* to answer general-fact questions. Downloading a base cannot
give you that — and `training/unlearn/README.md` already proved the corollary,
that after the fact "knowledge is not addressable". So the choice is a real
trade, not a preference:

> **Download + train = capable in hours, but it knows about the world.
> Random init = knowledge-free, but 110 M will not reason.**

If "knowledge-free" is not a hard requirement, this folder is strictly the
better deal. Nothing here touches `training/fromscratch/`.

---

## 1. What is actually downloadable (verified)

`pick_base.py` queries the Hugging Face API for real parameter counts and the
real `from_pretrained` download size, then estimates peak VRAM for this box
(1× RTX 3060, 12 GB). Measured output:

| model | role | params | download | QLoRA | LoRA | full | license |
|---|---|---:|---:|:--:|:--:|:--:|---|
| `Qwen/Qwen2.5-Coder-1.5B` | code | 1.54 B | 3.1 GB | ✅ | ✅ | ❌ | apache-2.0 |
| `Qwen/Qwen2.5-Coder-1.5B-Instruct` | code | 1.54 B | 3.1 GB | ✅ | ✅ | ❌ | apache-2.0 |
| `Qwen/Qwen2.5-Coder-3B-Instruct` | code | 3.09 B | 6.2 GB | ✅ | ✅ | ❌ | qwen-research |
| `Qwen/Qwen2.5-Coder-7B-Instruct` | code | 7.62 B | 15.2 GB | ✅ | ❌ | ❌ | apache-2.0 |
| `Qwen/Qwen3-1.7B` | reasoning | 2.03 B | 4.1 GB | ✅ | ✅ | ❌ | apache-2.0 |
| `Qwen/Qwen3-4B` | reasoning | 4.02 B | 8.1 GB | ✅ | ✅ | ❌ | apache-2.0 |
| `microsoft/Phi-3.5-mini-instruct` | reasoning | 3.82 B | 7.6 GB | ✅ | ✅ | ❌ | mit |
| `Qwen/Qwen2.5-0.5B-Instruct` | speaking | 0.49 B | 1.0 GB | ✅ | ✅ | **✅** | apache-2.0 |
| `HuggingFaceTB/SmolLM2-1.7B-Instruct` | speaking | 1.71 B | 3.4 GB | ✅ | ✅ | ❌ | apache-2.0 |
| `HuggingFaceTB/SmolLM2-360M-Instruct` | speaking | 0.36 B | 0.7 GB | ✅ | ✅ | **✅** | apache-2.0 |
| `deepseek-ai/deepseek-coder-1.3b-instruct` | code | 1.35 B | 5.4 GB | ✅ | ✅ | ❌ | other |
| `bigcode/tiny_starcoder_py` | code | 0.16 B | 1.3 GB | ✅ | ✅ | ✅ | bigcode-openrail-m |
| `meta-llama/Llama-3.2-3B-Instruct` | speaking | 3.21 B | 6.4 GB | ✅ | ✅ | ❌ | 🔒 gated |

`Qwen/Qwen2.5-Coder-1.5B-Instruct` is **already in your HF cache** (2.9 GB at
`~/.cache/huggingface/hub/models--Qwen--Qwen2.5-Coder-1.5B-Instruct`) — you can
start with zero download.

**Recommended pick for "code + speaking + a little reasoning" on this box:**
`Qwen/Qwen2.5-Coder-3B-Instruct` with `--load-in-4bit`. It already speaks
English and writes code; 3 B is the largest size that trains comfortably and
leaves ~5 GB of headroom for activations.

**If reasoning matters more than code:** `Qwen/Qwen3-1.7B` — it has a real
thinking mode (a second pass of chain-of-thought tokens), which is the cheapest
honest way to get "a little reasoning" out of something this small.

Refresh the numbers yourself any time:

```bash
python3 training/smallbase/pick_base.py            # detects VRAM via nvidia-smi
python3 training/smallbase/pick_base.py --role code --vram 24 --json
```

---

## 2. The three ways to train it

"Training it" is three different jobs. Downloading a base means you skip the
first and usually the second.

| Route | Teaches | Data shape | Script |
|---|---|---|---|
| **CPT** (continue-pretrain) | domain/vocabulary — *your* stacks, *your* prose | raw text | `continue_pretrain.py` ← new here |
| **SFT** | instruction-following, chat format, scaffolding | `instruction/input/output` | `training/cloud/train_round1.py`, `training/selfplay/train_student.py` |
| **Distillation** | the *behaviour* of a big model | teacher-generated pairs | `training/selfplay/orchestrator.py` (existing) |

### CPT — what the new script does

```bash
# look first: reads your corpus, prints the plan, downloads nothing
python3 training/smallbase/continue_pretrain.py \
    --base Qwen/Qwen2.5-Coder-3B-Instruct \
    --data code='training/dataset/app-shards/*.txt' \
    --data prose='docs/**/*.md' \
    --dry-run

# real run — QLoRA on the 12 GB card
python3 training/smallbase/continue_pretrain.py \
    --base Qwen/Qwen2.5-Coder-3B-Instruct --load-in-4bit \
    --data code='/abs/path/to/code/**/*.ts' \
    --data prose='/abs/path/to/docs/**/*.md' \
    --out-dir training/smallbase/out/coder3b
```

It tokenizes raw text, packs it into fixed-length blocks joined by EOS (so the
model learns document boundaries and never fuses two files), and trains
next-token loss with AdamW β=(0.9, 0.95), grad-clip 1.0, warmup + cosine decay
to 10 % — the hyperparameters from `fromscratch/SPEC.md §7`, so the two
pipelines stay comparable. Per-slice val loss is printed every
`--eval-every` steps (the A6 slice-collapse check from the SPEC), and each
slice is a named `--data NAME=GLOB` so you can see which part of the corpus is
being ignored.

### The LR ladder is this repo's convention — keep it

The R-series halves the LR each round (2e-4 → 1e-4 → 5e-5 → 2.5e-5, see
`training/cloud/README.md`). Continue that: resume from the previous adapter
into a new round rather than re-running a long single run.

```bash
python3 training/smallbase/continue_pretrain.py \
    --base Qwen/Qwen2.5-Coder-3B-Instruct --load-in-4bit \
    --data code='...' --load-adapter training/smallbase/out/coder3b/final \
    --lr 5e-5 --out-dir training/smallbase/out/coder3b-r2
```

### Distillation is how you get reasoning cheaply

You already run the teacher. `training/selfplay/selfplay.json` points the
student *and* judge at `http://127.0.0.1:11434/v1` (models `vaca-r20-q4` and
`gemma4:12b`). Point the **student** at the small base you just trained and use
the 14 B as the teacher: generate rows, keep the ones the judge accepts, then
SFT the small model on them. That transfers reasoning *behaviour* into a 1.5–3 B
model without you ever labelling anything — and it beats CPT for reasoning,
because CPT only teaches distribution, not procedure.

---

## 3. Honest timings on this box (1× RTX 3060 12 GB)

The 1.5 B row is **measured** on this box; the rest are extrapolated from it
(±50 %). Treat them as planning numbers. The first real run should still be a
`--max-steps 200` smoke to get your own tokens/s.

| Base | Method | Throughput | 100 M tokens | 1 B tokens |
|---|---|---:|---:|---:|
| 0.5 B | full fp16 | ~6 k tok/s (est.) | ~5 h | ~46 h |
| 1.5 B | QLoRA 4-bit | **2.3 k tok/s (measured)** | **~12 h** | ~120 h |
| 3 B | QLoRA 4-bit | ~1.3 k tok/s (est.) | ~21 h | ~214 h |
| 7 B | QLoRA 4-bit | ~0.6 k tok/s (est.) | ~46 h | ~460 h |

Measured run (see §6) used the deliberately small smoke settings
`seq 512 · batch 1 · grad-accum 4`, which underuses the card — a full-default run
(`seq 1024 · batch 2 · grad-accum 8`) should do better, so treat 2.3 k tok/s as
near worst case rather than a ceiling.

Two hard constraints measured on this machine:

- **Disk**: 22 GB free on `/`. A 3 B fp16 download is 6.2 GB, and checkpointing
  LoRA adapters is cheap (tens of MB), so the training path fits — but a full
  merge to 16-bit safetensors does not. Merge on Colab, exactly as
  `training/cloud/README.md` already does for the R-series.
- **VRAM**: 12 GB. Stay at `--max-seq-length 1024` for 3 B+, which the defaults
  (`--batch-size 2 --grad-accum 8`) are sized for. Longer context is tight at
  3 B+ — if you want `--max-seq-length 2048 --batch-size 1 --grad-accum 16`,
  smoke it with `--max-steps 20` first rather than assuming it fits.

**Kaggle/Colab is still the faster path for anything ≥ 3 B** (2×T4 = 32 GB), and
`training/cloud/train_round1.py` already runs there. Use `continue_pretrain.py`
locally for the CPT step and the cloud path for the SFT ladder.

---

## 4. What you will NOT get

1. **No knowledge-free model.** The base knows history, geography and
   literature, and this training does not remove it — it moves the model
   *toward* your corpus, it does not erase the rest. If that guarantee is the
   point, use `training/fromscratch/`.
2. **No new capability, only redistribution.** A 1.5 B base fine-tuned on code
   gets better *at code it has seen shapes of*. It will not start solving
   problems the base could not approximate — that gap needs scale or
   distillation from something bigger.
3. **CPT can cost you instruction-following.** Raw-text training degrades chat
   behaviour (the model starts continuing text instead of answering). Keep the
   ratio of chat data sane, or re-run SFT after, and measure both —
   `eval_vlm.py` in `training/vlm/` shows the two-axis (task **and** retention)
   eval shape this repo uses; keep that discipline here too.
4. **A 0.16–0.5 B full fine-tune is a toy.** Good for verifying the loop and the
   tokenizer, not for shipping VACA.
5. **`--dry-run` is not a test of training.** It proves the corpus reads and the
   plan is coherent. It never downloads the base and never touches the GPU.

---

## 5. Verified by an actual run

A real 20-step QLoRA run on this box (1× RTX 3060, base from the local HF
cache — no download):

```bash
llm-training-app/.venv/bin/python training/smallbase/continue_pretrain.py \
    --base Qwen/Qwen2.5-Coder-1.5B-Instruct --load-in-4bit \
    --data scaffold='training/dataset/app-shards/*.txt' \
    --data prose='docs/**/*.md' \
    --max-seq-length 512 --batch-size 1 --grad-accum 4 \
    --max-steps 20 --eval-every 10 --save-every 0 \
    --out-dir /tmp/smallbase-smoke
```

Result: loss **2.867 → 1.290** over 20 steps, per-slice val loss
`scaffold=0.893 prose=1.479` at step 10, exit 0, 18 s of GPU time.
Artifacts: `adapter_model.safetensors` (71 MB, 392 tensors, all finite),
`adapter_config.json` (r=16, all 7 projection targets), `tokenizer.json`,
`history.json`, `run_config.json`. The adapter was re-loaded with
`PeftConfig.from_pretrained` to confirm it is usable, not just written.

`llm-training-app/.venv` already has the right stack for this — torch
2.12.1+cu130, transformers 5.17.0, peft 0.21.1, datasets 5.0.1, bitsandbytes
0.50.2 — so no extra install was needed. Note that path is the *studio's* venv;
`requirements.txt` here is for a standalone venv.

The same run was repeated on the agent box (`llmlab@192.168.1.234`, 2× RTX 3060,
identical stack) with `dspark_server.py` stopped first. Result: exit 0, the same
20-step shape, adapter 71 MB, and `history.json` showing
`val 1.9674 per_slice {'distilled': 3.141, 'gui': 0.793}`.

### Three defects this smoke testing caught

None of these are visible to `--dry-run`, which never imports torch:

1. **`AttributeError: 'list' object has no attribute 'to'`.** On `datasets` 5.x
   with torch 2, `DataLoader` over an HF `Dataset` yields plain nested **lists**,
   not tensors. Fixed with `.with_format("torch")` on both splits.
2. **Validation slices silently vanished.** A slice whose documents were shorter
   than one block produced 0 full blocks and was dropped, removing it from the
   per-slice table. Now the trailing block is padded and loss-masked with `-100`.
3. **A global eval budget hid whole slices.** `evaluate()` capped *batches*
   globally, so a slice-ordered val set spent the entire budget on the first
   slice: `gui` never appeared in the per-slice loss at all. The budget is now
   **per slice** (`--eval-blocks-per-slice`, default 32), which is what the A6
   slice-collapse signal requires.

Also made version-safe: the `dtype`/`torch_dtype` kwarg (transformers 5 renamed
it), and the tokenizer's own `model_max_length` is raised only while packing and
restored before saving — a 49k-token source file is normal here because the
packer chunks it, so the saved tokenizer config still reads `32768`.

> **Single-GPU caveat, measured.** `--device` defaults to `cuda:0` and the model
> loads with `device_map={"": 0}`, so a run uses **one** card. After the agent-box
> run the second 3060 still showed 15 MiB in use — it was never touched. On a
> 2-card box, launch one process per card with `CUDA_VISIBLE_DEVICES` (the
> convention in `training/remote/`) to use both.

## 6. Files

| File | What it is |
|---|---|
| `pick_base.py` | Queries HF for the candidate bases; real download size, params, license, gating, VRAM fit. No torch, no GPU. |
| `continue_pretrain.py` | CPT on raw text: packing, LoRA/QLoRA/full, LR ladder resume, per-slice val loss, checkpointing, `--dry-run`. |
| `requirements.txt` | Trainer deps (transformers + peft + bitsandbytes; no unsloth on this path). |
| `README.md` | This plan. |

Related, already in the repo: `training/fromscratch/SPEC.md` (the knowledge-free
alternative), `training/cloud/README.md` (the QLoRA SFT ladder + GGUF export),
`training/selfplay/` (teacher/judge generation for distillation),
`llm-training-app/engine.py` (the local studio, which does LoRA training with
transformers+peft and calls MindSpace for from-scratch runs).
