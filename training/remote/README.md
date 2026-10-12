# 🌐 Remote training on the agent box (HTTP only, no SSH)

Run LLM Training Studio's trainer on the machine that has the GPUs — the agent box with
the 2× RTX 3060 — and drive it from this desktop over the LAN. Nothing is shared over
SSH or a network filesystem: datasets go up over HTTP, adapters come back as a zip.

```
desktop (GUI / remote_job.py)  ──HTTP──►  agent box: agent_worker.py ──► engine.py ──► exports/<name>
        POST /jobs  (files + config)                 GET /jobs/{id}       (progress)
        GET  /jobs/{id}/adapter  (zip)               POST /jobs/{id}/stop
```

## 1. On the agent box (once)

The box needs its own checkout of this repo and the app's virtualenv, because the worker
imports `llm-training-app/engine.py`:

```bash
git clone <your repo> visual-ai-architect
cd visual-ai-architect
python3 -m venv --system-site-packages llm-training-app/.venv
llm-training-app/.venv/bin/python -m pip install -r llm-training-app/requirements.txt
sudo apt install -y python3-tk          # only for the desktop GUI; the worker does not need it
```

Open the port and note the address:

```bash
hostname -I                              # e.g. 192.168.1.234
sudo ufw allow 8811/tcp                  # if ufw is active
```

## 2. Start the worker on the agent box

```bash
./training/remote/start-agent.sh                 # binds 0.0.0.0:8811
./training/remote/start-agent.sh --port 9000     # different port
```

Check it: `curl http://192.168.1.234:8811/health` → `{"ok":true,"trainer":true,...}`.
`trainer:false` means that box's venv has no torch/transformers/peft — fix that first,
otherwise every job runs in *simulated* mode.

## 3. From the desktop GUI (no terminal needed)

In LLM Training Studio, the training panel has two new controls:

- **Agent box URL** — e.g. `http://192.168.1.234:8811`. Saved with your other settings.
- **Train on agent box** — a checkbox. Tick it and press **Start**: the studio uploads the
  queued files and the current training settings, follows the job on the box, and pulls
  the finished adapter into `data/exports/` where it appears in the model dropdown as
  `local/<output_name>`.

The **Test** button next to the URL asks the box `/health` and reports whether it is
reachable *and* can train for real (`trainer: true`). With the checkbox off, Start
behaves exactly as before: local training on this machine.

## 4. From the desktop CLI

```bash
export VACA_AGENT=http://192.168.1.234:8811

V=llm-training-app/.venv/bin/python
$V training/remote/remote_job.py health
$V training/remote/remote_job.py gpus          # what the box can see

# train one role on the box, wait, and pull the adapter back
$V training/remote/remote_job.py submit \
    --base Qwen/Qwen2.5-Coder-7B-Instruct \
    --output-name role-reasoning \
    --file training/selfplay/corpus/vaca-domain.jsonl \
    --epochs 2 --max-length 512 --wait

$V training/remote/remote_job.py fetch <job_id> --out llm-training-app/data/exports/
```

The four band roles from `training/roles/roles.json` submit the same way — pass each
role's `data` files to `--file` and use its `output_name`.

`fetch` unpacks `exports/<output_name>/` with `adapter_config.json` +
`adapter_model.safetensors` (+ tokenizer). Register it locally with
`engine.ingest_model_folder(<that dir>)`, or just drop it in `llm-training-app/data/models/`;
it then shows up in the model dropdown as `local/<output_name>`.

## Alternative: run the whole studio on the box

If you'd rather use the app's own UI against the box's GPUs, run the studio there and
open it from the desktop — it already binds `0.0.0.0`:

```bash
# on the agent box
llm-training-app/start-studio.sh          # API on :8001, static UI on :8088
# in your desktop browser
http://192.168.1.234:8001/docs            # API
http://192.168.1.234:8088/                # UI
```

## Multi-GPU: one job per card, several jobs at once

The engine holds one model per process (`start_training` refuses a second run), and it
loads with `device_map="auto"`, which spreads across *every* GPU it can see. So rather
than DDP, the worker runs **one child process per slot**, each pinned with
`CUDA_VISIBLE_DEVICES`, and each slot gets its own data dir so the children cannot race
on each other's metadata.

```bash
# 2x RTX 3060: two jobs at once, one card each
./training/remote/start-agent.sh --parallel 2

# default is one slot per GPU the box reports
./training/remote/start-agent.sh
```

This is what makes the four band roles practical: submit the roles two at a time and both
cards work instead of idling. `/health` reports `parallel`, `running` and the `devices`
plan, so the desktop can see the box is busy before it submits.

DDP is deliberately **not** used: bitsandbytes 4-bit + DDP needs `find_unused_parameters`
tuning and frequently mis-handles the MoE expert layers this repo trains (LoRA on
`mlp.shared_expert.*`). Independent processes are simpler, isolate VRAM, and give the same
"both cards busy" result.

## Operational notes (measured on this repo's hardware)

- **One job per slot, queued.** Each slot runs one job at a time; extra jobs wait in the
  queue. `/health` → `queued` shows how many are waiting.
- **A job only sees one GPU.** The child is launched with `CUDA_VISIBLE_DEVICES=<slot>`, so
  `device_map="auto"` inside that child means "all one card" — this is how per-GPU
  parallelism is enforced without touching the engine.
- **4-bit loading has a VRAM floor.** transformers reserves the model's *unquantized*
  fp16 size before loading (`caching_allocator_warmup`). A 7B model wants ~10.4 GiB free
  on one card, so on a 12 GB 3060 it fails unless nothing else is using the GPU. On the
  agent box, pick the card with the most free VRAM, or use a ≤4B base.
- **Small datasets can produce zero steps.** The dataset yields one chunk per file and
  the loader uses `drop_last=True` with an auto-scaled batch size (5–8), so queue more
  files than the batch size. The worker rejects a job that completed 0 steps rather than
  handing back an untrained adapter.
- **A wrong base model is caught.** The engine silently falls back to *simulated*
  training when a model will not load; the worker checks for real steps and reports
  `failed` instead of a fake "completed".
- **Stopping is graceful.** `POST /jobs/{id}/stop` writes a stop file the job polls (every
  2s); if the job has not wound down within 60s the slot terminates it. Status becomes
  `stopped`, not `failed`.

## Verifying it

Each harness needs a worker running on loopback first (see the header of each file for the
exact command), and both redirect the app's data to scratch dirs:

```bash
V=llm-training-app/.venv/bin/python
cd llm-training-app
$V tests/verify_remote_gui.py      /tmp/agent-tiny-base /tmp/agent-data http://127.0.0.1:8812
$V tests/verify_remote_parallel.py /tmp/agent-tiny-base /tmp/agent-data http://127.0.0.1:8812
```

`verify_remote_parallel.py` checks the device plan, that two jobs are genuinely in flight
at once, that each child was handed its own `CUDA_VISIBLE_DEVICES` and data dir, and that
both adapters come back intact. On a one-GPU box both slots share card 0 (the harness says
so); the distinct-card case only exercises with two real GPUs.
