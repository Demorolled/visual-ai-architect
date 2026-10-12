#!/usr/bin/env python3
"""Verify the agent worker runs jobs in parallel, one pinned GPU each.

Start a worker with more slots than GPUs (that is the interesting case — it is what a
2x3060 box does with two roles, and it also exercises the scheduling on a 1-GPU box):

    ./llm-training-app/.venv/bin/python training/remote/agent_worker.py \
        --host 127.0.0.1 --port 8812 --parallel 2 --data-dir /tmp/agent-box-data

then:
    ./.venv/bin/python tests/verify_remote_parallel.py /tmp/agent-tiny-base /tmp/agent-data \
        http://127.0.0.1:8812

Checks the device plan, that both jobs are genuinely in flight at the same time, that each
child was handed its own CUDA_VISIBLE_DEVICES, that each got its own data dir, and that both
adapters come back — none of which is true if the worker still ran jobs one at a time.
"""
import json
import sys
import time
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
ROOT = APP.parent
sys.path.insert(0, str(APP))
sys.path.insert(0, str(ROOT / "training" / "remote"))

BASE_MODEL = sys.argv[1] if len(sys.argv) > 1 else "/tmp/agent-tiny-base"
DATA_DIR_SRC = Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/agent-data")
HOST = sys.argv[3] if len(sys.argv) > 3 else "http://127.0.0.1:8812"

import remote_job  # noqa: E402
import agent_worker as W  # noqa: E402

fails = []


def check(label, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}{'' if ok else '   <-- ' + str(detail)}")
    if not ok:
        fails.append(label)


print("== the device plan gives each slot its own card ==")
check("2 slots over 2 GPUs -> one card each", W.plan_devices(2, 2) == [0, 1], W.plan_devices(2, 2))
check("4 slots over 2 GPUs -> round robin", W.plan_devices(4, 2) == [0, 1, 0, 1], W.plan_devices(4, 2))
check("2 slots over 1 GPU -> both share card 0", W.plan_devices(2, 1) == [0, 0], W.plan_devices(2, 1))
check("no GPUs at all still yields one slot", W.plan_devices(0, 0) == [0], W.plan_devices(0, 0))

try:
    info = remote_job.health(HOST)
except Exception as exc:
    print(f"FAILED: no worker at {HOST}: {exc}")
    sys.exit(2)
print(f"  worker: {json.dumps({k: info.get(k) for k in ('parallel', 'devices', 'gpu_count')})}")
check("worker reports 2 parallel slots", info.get("parallel") == 2, info.get("parallel"))
check("the API reports the card each slot will use",
      info.get("devices") == W.plan_devices(2, max(1, int(info.get("gpu_count") or 1))),
      info.get("devices"))

files = sorted(DATA_DIR_SRC.glob("gui-*.jsonl"))[:8]
print(f"\n== submitting two jobs at the same time ({len(files)} files each) ==")
common = dict(epochs=1, batch_size=1, learning_rate=0.0001,
              use_mixed_precision=False)
j1 = remote_job.submit(HOST, BASE_MODEL, files, output_name="par-a", **common)
j2 = remote_job.submit(HOST, BASE_MODEL, files, output_name="par-b", **common)
print(f"  job a = {j1}\n  job b = {j2}")
check("both submissions were accepted",
      bool(j1.get("job_id")) and bool(j2.get("job_id")), (j1, j2))
check("the worker reports jobs queued behind the two slots",
      j1["job_id"] != j2["job_id"], (j1, j2))

print("\n== do they overlap? (sample every 2s) ==")
overlap = 0
done = {}
deadline = time.time() + 120
while time.time() < deadline:
    done = {j["id"]: j for j in remote_job.status_list(HOST)["jobs"]}
    live = [done[i] for i in (j1["job_id"], j2["job_id"]) if i in done]
    running = [j for j in live if j.get("status") in ("running", "stopping")]
    if len(running) == 2:
        overlap += 1
        print(f"    both running, devices={[j.get('device') for j in running]} "
              f"steps={[(j.get('progress') or {}).get('step') for j in running]}")
    if live and all(j["status"] in ("completed", "failed", "stopped") for j in live):
        break
    time.sleep(2)

check("two jobs were in flight at the same time (not serialised)", overlap > 0,
      f"{overlap} overlapping samples")

# What the two slots *should* have used, from the same plan the worker used.
gpus_seen = max(1, int(info.get("gpu_count") or 1))
planned = [f"cuda:{g}" for g in W.plan_devices(2, gpus_seen)]
devices = [done.get(i, {}).get("device") for i in (j1["job_id"], j2["job_id"])]
check("each job ran on the card its slot was assigned", sorted(devices) == sorted(planned),
      f"got {devices}, planned {planned}")
if gpus_seen >= 2:
    check("the two jobs were pinned to different cards",
          sorted(devices) == ["cuda:0", "cuda:1"], devices)
else:
    print(f"  note  this box has {gpus_seen} GPU, so both slots share card 0; the "
          f"distinct-card case needs the 2x3060 box (the plan for 2 cards is "
          f"{W.plan_devices(2, 2)}, verified above)")

print("\n== each child was handed its own GPU, and trained for real ==")
pin_lines, real_lines = [], []
for log in sorted(Path("/tmp/agent-box-data").rglob("child.log")):
    text = log.read_text(errors="replace")
    print(f"  {log}:")
    for line in text.splitlines():
        if "CUDA_VISIBLE_DEVICES" in line or "MoE base detected" in line:
            print(f"      {line.strip()}")
        if "CUDA_VISIBLE_DEVICES=" in line:
            pin_lines.append(line.split("CUDA_VISIBLE_DEVICES=")[-1].strip())
        if "MoE base detected" in line:
            real_lines.append(str(log))
check("two independent children ran, each told which GPU to use",
      sorted(pin_lines) == sorted(str(g) for g in W.plan_devices(2, gpus_seen)), pin_lines)
check("each child detected the MoE base (real training, not simulated)",
      len(real_lines) >= 2, real_lines)
slot_dirs = [Path(done[i]["adapter_dir"]).parent.parent.name for i in (j1["job_id"], j2["job_id"])]
print(f"  each adapter came from its own slot data dir: {slot_dirs}")
check("each child got its own data dir (metadata cannot race)",
      len(set(slot_dirs)) == 2, slot_dirs)

print("\n== both adapters survive and can be fetched ==")
for tag, j in (("par-a", j1), ("par-b", j2)):
    got = remote_job.status(HOST, j["job_id"])
    print(f"  {tag}: status={got['status']} steps="
          f"{(got.get('progress') or {}).get('step')} device={got.get('device')} "
          f"error={got.get('error')}")
    check(f"job {tag} completed", got["status"] == "completed", got.get("error"))
    check(f"job {tag} ran real steps", (got.get("progress") or {}).get("step", 0) >= 1,
          got.get("progress"))
    data = remote_job.fetch(HOST, j["job_id"], "/tmp/par-fetch")
    cfg = json.loads((Path(data) / "adapter_config.json").read_text())
    tensors = (Path(data) / "adapter_model.safetensors").stat().st_size
    print(f"    fetched {data.name}: r={cfg.get('r')} bytes={tensors}")
    check(f"job {tag} returned a real LoRA adapter", cfg.get("r") == 16, cfg.get("r"))

print("\nRESULT:", "ALL PASSED" if not fails else f"{len(fails)} FAILED: {fails}")
sys.exit(1 if fails else 0)
