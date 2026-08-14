# ☁️ VACA Cloud QLoRA Trainer — Upload Guide

Package for running the **4-round QLoRA fine-tune** of
`Qwen2.5-7B-Instruct-Uncensored` on free / rented GPU services, then
downloading the tuned GGUF to deploy locally.

> ⚠️ **Kaggle status (re-verified Aug 1, 2026 — CONFIRMED FAILED):** `scripts/kaggle-status.sh`
> confirms both kernels today:
> - `stevenawoods/vaca-qlora-rounds-1-2` → **Status: error**. Log tail shows the same
>   signature as the earlier 5 probe kernels: `pip` can't resolve `unsloth`
>   (`Temporary failure in name resolution`) and the GPU-probe cell printed
>   `CUDA: False | GPU: NONE | count: 0` — i.e. the API push silently ran with
>   **Internet OFF and no GPU** despite `enable_internet: true` +
>   `machine_shape: NvidiaTeslaT4` in the metadata.
> - `stevenawoods/vaca-qlora-rounds-3-4` → **Not found / not pushed yet** — the chain
>   script waits for kernel 1 to complete, so kernel 2 was never created.
> **Colab is the recommended free path — use `colab/train_vaca_colab.ipynb`** (validated:
> rebuilds cleanly, 8 steps, embedded trainer matches `train_round1.py`; pick **T4 GPU** in
> Runtime → Change runtime type). The Kaggle notebooks in `kaggle/` are kept for when this
> resolves — see the retry note in *Quick start (Kaggle)*.

## Files

| File | What it is |
|------|-----------|
| `colab/train_vaca_colab.ipynb` | **Upload this to Colab.** Self-contained 4-round notebook (embeds the trainer script); default `MODE=rounds12` |
| `colab/train_vaca_colab_rounds34.ipynb` | Rounds-3-4 variant — same notebook pre-set to `MODE=rounds34` (resume from a rounds-1-2 adapter). Build: `python3 scripts/build-colab-notebook.py --mode rounds34` |
| `train_round1.py` | Standalone trainer script (for CLI services / manual runs) |
| `train_round1.ipynb` | Legacy single-round notebook (superseded by `colab/` — kept for reference) |
| `campaign50-dataset.zip` | Dataset: train (3,297) / val (412) / test (413) — 2.1 MB (rebuild with `scripts/build-colab-dataset-zip.py`) |
| `kaggle/` | Kaggle notebook + kernel-metadata builders (`scripts/build-kaggle-notebook.py`) |
| `README.md` | This guide |

## Config (identical to the local run)

- Base: `Orion-zhen/Qwen2.5-7B-Instruct-Uncensored`, 4-bit NF4 QLoRA
- 4 rounds, LR halved each: **2e-4 → 1e-4 → 5e-5 → 2.5e-5**, 2 epochs each, `max_seq_length=2048`
- LoRA r=8 / α=16 / dropout 0.05 · batch 1 · grad-accum 8 · adamw_8bit
- Export: GGUF **q4_k_m** → `results.zip` (adapter_round*/ + adapter/ + tuned GGUF)

## Quick start (Colab)

1. [colab.research.google.com](https://colab.research.google.com) → Runtime → **Change runtime type** → **T4 GPU**
2. Upload `colab/train_vaca_colab.ipynb` (or open it from Drive) → run all cells in order
3. **Step 3** picks the rounds: `rounds12` (fresh, LR 2e-4 → 1e-4), `round2` (resume at round 2),
   `rounds34` (resume rounds 3-4 from a rounds-1-2 adapter). Set `ROUNDS = 1` on free tier.
4. **Step 4** finds `campaign50-dataset.zip` on Drive or asks you to upload it (2.1 MB)
5. **Step 7** trains (see the printed ⚙️ line). Each round saves its own adapter —
   a killed session can resume (see Step 5 note). ~8-12 h per round on 1× T4.
6. **Step 8** shows outputs; download `/content/out/results.zip` or let it copy to Drive.

Timing (honest): 1× T4 ≈ half of Kaggle's 2× T4, and Colab free sessions cap at
~12 h — prefer `ROUNDS = 1` per session, or Colab Pro for a full 2-round run.

### Round 2 resume (anti-delegation re-tune) — exact steps

The dataset now includes the 25 self-contained anti-delegation rows (see
`ROUND2_PLAN.md`). Launch **round 2** to break the delegation habit:

1. **Rebuild the dataset zip** (already done — contains 4,122 rows):
   ```bash
   python3 scripts/build-colab-dataset-zip.py   # → training/cloud/campaign50-dataset.zip
   ```
2. In the notebook's **Step 3 config cell**, set:
   ```python
   MODE = "round2"   # resumes round 2 (LR 1e-4) from the round-1 adapter
   ROUNDS = 1        # 2 only if Pro (free session caps ~12 h)
   USE_DRIVE = True  # or False → upload prompts appear
   ```
   (Step 3 prints `⚙️ MODE=round2 → rounds 2-2 | first LR 1e-4 | load: --load-adapter /content/adapter`.)
3. **Step 4**: let it find `campaign50-dataset.zip` on Drive or upload the rebuilt zip.
4. **Step 5 (adapter)**: upload your **round-1 `results.zip`** (or a zip of the
   `adapter_round1/` folder) — Step 5 auto-picks `adapter_round1` for `round2` mode.
   > ⚠️ No round-1 adapter ships with this repo — it comes from your completed
   > round-1 run. If you don't have `results.zip`, re-run `rounds12` instead.
5. **Step 7** runs `train_round1.py --rounds 1 --lr 1e-4 --start-round 2 --load-adapter /content/adapter …`.
   ~8-12 h on 1× T4.
6. **Step 8** downloads `/content/out/results.zip` (adapter_round2/ + tuned GGUF).
7. Back home: unzip, find the real GGUF name, deploy + A/B test:
   ```bash
   MAX_WAIT=0 bash scripts/deploy-tuned-dspark.sh --now cloud-out/<ACTUAL-GGUF>.gguf
   python3 scripts/ab-test-tuned-vs-stock.py   # acceptance: 2/3 runs, 0 imports, 0 default exports
   ```

## Quick start (Kaggle) — ⚠️ currently broken, see status note above

- Kaggle gives **2× T4 for 30 h/week free** — the fastest free option *if the push issue resolves*.
- Build the notebooks: `python3 scripts/build-kaggle-notebook.py`, then push with
  `scripts/kaggle-setup.sh` (kernel 1) and `scripts/kaggle-chain-rounds.sh` (watches
  kernel 1, then pushes kernel 2 with the round-2 adapter attached).
- Last verified (Aug 1): kernel 1 `vaca-qlora-rounds-1-2` errored (no GPU + no
  internet); kernel 2 `vaca-qlora-rounds-3-4` was never created. To retry,
  after pushing, open the kernel page → **Settings → Accelerator = GPU T4 x2**,
  **Internet = On** → **Run All** — the manual step the CLI push skips.

## Quick start (other services)

- **Lightning AI / Modal / RunPod / Vast.ai / Sagemaker Lab**: upload
  `train_round1.py` + `campaign50-dataset.zip`, then:
  ```bash
  pip install unsloth trl transformers datasets accelerate
  unzip campaign50-dataset.zip -d dataset
  python train_round1.py --dataset dataset/train.jsonl --out-dir out
  ```
- Any 16 GB+ NVIDIA GPU works (T4/P100/A100/L4/3060).

## Customization

- Rounds in one run: `--rounds 4` (whole ladder in one session — needs ~24 h, Pro-tier)
- Resume: `--load-adapter <dir> --start-round N --lr <halved>` (e.g. start-round 3, LR 5e-5)
- Different LR: `--lr 1e-4`
- Longer context: `--max-seq-length 4096` (needs 24 GB+ VRAM)

## Deploying the result (back on your machine)

```bash
# 1. Download results.zip, unzip into a folder, e.g. cloud-out/
# 2. Find the real GGUF name (unsloth may prefix it, e.g. "unsloth."):
ls -lh cloud-out/*.gguf
# 3. Deploy it (use the ACTUAL filename from the ls above):
MAX_WAIT=0 bash scripts/deploy-tuned-dspark.sh --now cloud-out/<ACTUAL-GGUF-NAME>.gguf
```
(Or copy it to `models/` and restart DSpark manually — see `scripts/deploy-tuned-dspark.sh --help`.)

## CI / build gate (`scripts/check-training.sh`)

The build-time validation gate for the training pipeline — **wired into the
root `npm run build`** (runs last, after the frontend + backend builds) and
also exposed via `make check-training` / `npm run check:training`. It runs
**3 stages**:

| # | Stage | What it verifies | Full (default) | `--quick` |
|---|-------|------------------|----------------|-----------|
| 1 | `py_compile` | Syntax-gates the 7 pipeline Python scripts (incl. the concurrency test itself) | 7 files | same |
| 2 | tsc_check concurrency | Scratch-dir safety: 2 PARALLEL worker processes, unique scratch per call — guards the old shared-`tsc-tmp` clobbering bug | **48 calls** (2×3×8) | 12 calls (2×2×3) |
| 3 | Probe self-check (`--fail-on-probe-clean`) | Re-runs the shared-scratch regression probe; **fails CI if it produces ZERO spurious failures** — i.e. the probe no longer detects the bug it guards | **144 calls** (3 rounds) | 36 calls (3 rounds) |

- **Runtime**: full ≈ **22 s** (measured); `--quick` ≈ **5 s** (measured). `npm run build`
  now runs the **full** gate, so every build gets 48 + 144 call coverage.
- **Deterministic probe**: the probe re-creates the old shared-scratch bug
  and *deliberately* provokes the collision (in-flight markers + file
  sabotage), so detection never flakes on OS-scheduling luck.
- **Self-skip**: if `node_modules/typescript` (tsc) is unavailable the tsc
  stages self-skip (exit 0) — but **`python3` is required** (stage 1 hard-fails
  without it).
- **Variants**: `bash scripts/check-training.sh` (full) ·
  `--quick` (fast local iteration; also `make check-training-quick`) ·
  `--skip-tsc-test` (py_compile only).
- **Unit test**: `tests/test-tsc-concurrency.py` (run via
  `npm run test:tsc-concurrency` or `make tsc-concurrency`; `--regression-detect`
  shows the probe, `--fail-on-probe-clean` is its CI self-check).

## Notes / gotchas

- **Disk**: Colab has ~78 GB free — plenty (model ~15 GB + GGUF ~4.4 GB).
- **VRAM**: 4-bit 7B @ seq 2048 fits in **16 GB** (T4). Colab free = 1× T4.
- **Session**: training keeps Colab alive; don't idle. Browser tab must stay open for the download step.
- **HF cache**: the base model downloads from Hugging Face once (~15 GB); reruns are instant.
- The script evaluates on a 10% held-out split (seed 42) — same as the local engine.
