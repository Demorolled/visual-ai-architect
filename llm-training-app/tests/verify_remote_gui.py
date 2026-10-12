#!/usr/bin/env python3
"""Verify the GUI's "Train on agent box" path end to end, against a worker on loopback.

Builds the real LLMTrainingStudio UI, points it at a running agent worker, queues local
data, and submits. Then checks the job really ran on the worker and that the adapter came
back and got registered.

Start a worker first, e.g.:
    ./llm-training-app/.venv/bin/python training/remote/agent_worker.py \
        --host 127.0.0.1 --port 8811 --data-dir /tmp/agent-box-data
then:
    ./.venv/bin/python tests/verify_remote_gui.py /tmp/agent-tiny-base /tmp/agent-data

Both sides are redirected to scratch directories, so the app's real data is untouched.
"""
import json
import sys
import tempfile
import time
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
ROOT = APP.parent
sys.path.insert(0, str(APP))
sys.path.insert(0, str(ROOT / "training" / "remote"))

BASE_MODEL = sys.argv[1] if len(sys.argv) > 1 else "/tmp/agent-tiny-base"
DATA_DIR_SRC = Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/agent-data")
HOST = sys.argv[3] if len(sys.argv) > 3 else "http://127.0.0.1:8811"

import engine as E  # noqa: E402
import remote_job  # noqa: E402

fails = []


def check(label, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}{'' if ok else '   <-- ' + str(detail)}")
    if not ok:
        fails.append(label)


TMP = Path(tempfile.mkdtemp(prefix="remote-gui-"))
for sub in ("uploads", "models", "exports", "categories", "experiments"):
    (TMP / sub).mkdir(parents=True)

# Redirect BOTH module namespaces: app.py imported DATA_DIR/EXPORTS_DIR by value.
for mod in (E,):
    mod.DATA_DIR = TMP
    mod.UPLOADS_DIR = TMP / "uploads"
    mod.MODELS_DIR = TMP / "models"
    mod.EXPORTS_DIR = TMP / "exports"
    mod.CATEGORIES_DIR = TMP / "categories"
    mod.EXPERIMENTS_DIR = TMP / "experiments"
    mod.METADATA_FILE = TMP / "metadata.json"

import app as A  # noqa: E402

A.DATA_DIR = TMP
A.EXPORTS_DIR = TMP / "exports"
A.messagebox.showerror = lambda *a, **k: print(f"   [error dialog: {a[:2]}]")
A.messagebox.showwarning = lambda *a, **k: print(f"   [warn dialog: {a[:2]}]")

print(f"scratch dir: {TMP}\nworker: {HOST}\ntiny base: {BASE_MODEL}")

try:
    info = remote_job.health(HOST)
except Exception as exc:
    print(f"FAILED: no worker at {HOST}: {exc}")
    sys.exit(2)
check("worker is reachable and can train for real",
      info.get("ok") and info.get("trainer"), info)

print("\n== building the real UI ==")
studio = A.LLMTrainingStudio()
check("agent controls exist in the UI", hasattr(studio, "agent_url_var")
      and hasattr(studio, "use_agent_var"))

print("\n== point the GUI at the worker ==")
studio.agent_url_var.set(HOST)
studio.use_agent_var.set(True)
studio.test_agent()
print(f"  status label: {studio.agent_status_label.cget('text')!r}")
check("Test button reports the worker as ready",
      "ready" in studio.agent_status_label.cget("text"),
      studio.agent_status_label.cget("text"))

print("\n== queue local data and read the training controls ==")
files = sorted(DATA_DIR_SRC.glob("gui-*.jsonl"))
ingested = studio.engine.ingest_files_batch(files)
for item in ingested:
    fid = item.get("id") if isinstance(item, dict) else item
    if fid:
        studio.engine.queue_add(file_id=fid)
studio.engine.save_metadata(force=True)
print(f"  queued {len(studio.engine.training_queue)} file(s)")
check("local queue is populated", len(studio.engine.training_queue) == len(files))

studio.model_var.set(f"hf/{BASE_MODEL}" if "/" in BASE_MODEL else BASE_MODEL)
studio.epoch_var.set("1")
studio.batch_var.set("1")
studio.lr_var.set("0.0001")
studio.grad_accum_var.set("1")

print("\n== press Start (this must go remote, not train locally) ==")
jobs_before = {j["id"] for j in remote_job.status_list(HOST)["jobs"]}
studio.start_training()
deadline = time.time() + 420
while studio.engine.training_active and time.time() < deadline:
    time.sleep(3)
print(f"  local training_active={studio.engine.training_active} "
      f"status={studio.engine.training_status} step={studio.engine.current_step}")

jobs_after = remote_job.status_list(HOST)["jobs"]
new_jobs = [j for j in jobs_after if j["id"] not in jobs_before]
check("a job was submitted to the worker", len(new_jobs) == 1, len(new_jobs))
if new_jobs:
    j = new_jobs[0]
    print(f"  remote job {j['id']}: status={j['status']} "
          f"steps={(j.get('progress') or {}).get('step')} base={j.get('base_model')!r}")
    check("the worker used the HF repo id as model_name", j.get("base_model") == BASE_MODEL,
          j.get("base_model"))
    check("the remote job completed", j["status"] == "completed", j.get("error"))
    check("the remote job really ran steps", (j.get("progress") or {}).get("step", 0) >= 1,
          j.get("progress"))

print("\n== the adapter came back and got registered ==")
adapters = [p.name for p in (TMP / "exports").iterdir() if (p / "adapter_config.json").exists()]
print(f"  exports: {adapters}")
check("an adapter was fetched into the local exports dir", len(adapters) >= 1, adapters)
registered = sorted(m["name"] for m in studio.engine.models.values())
print(f"  registered models: {registered}")
check("the fetched adapter is registered for the dropdown", len(registered) >= 1, registered)

print("\n== remote off means local training, not a remote submit ==")
submitted = []
real_submit = remote_job.submit
remote_job.submit = lambda *a, **k: (submitted.append(a), real_submit(*a, **k))[1]
studio.use_agent_var.set(False)          # gate lives in start_training(), not the inner method
studio.engine.training_active = False
studio.start_training()
time.sleep(3)                            # let it take the local path
studio.engine.training_active = False
studio.engine.training_status = "stopped"
remote_job.submit = real_submit
check("with the checkbox off, nothing is submitted to the worker", not submitted, submitted)

studio.root.destroy()
print(f"\nscratch dir kept: {TMP}")
print("RESULT:", "ALL PASSED" if not fails else f"{len(fails)} FAILED: {fails}")
sys.exit(1 if fails else 0)
