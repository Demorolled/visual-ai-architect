#!/usr/bin/env python3
"""Agent-box job worker for LLM Training Studio — HTTP only, no SSH required.

Runs on the machine that has the GPUs (the "agent box"). The desktop app, or the
remote_job.py CLI, uploads a dataset plus a training config and collects the adapter.

    # on the agent box (the 2x RTX 3060 machine)
    llm-training-app/.venv/bin/python training/remote/agent_worker.py --host 0.0.0.0 --port 8811

Endpoints
    GET  /health              is it alive, and can it train for real
    GET  /gpus                what GPUs it can see
    POST /jobs                upload files + config, returns a job id
    GET  /jobs                every job this worker has seen
    GET  /jobs/{id}           status, progress, metrics, error
    POST /jobs/{id}/stop      ask the running job to stop
    GET  /jobs/{id}/adapter   the adapter directory as a zip

Multi-GPU: the engine holds one model per process (start_training refuses a second run)
and loads it with device_map="auto", which spreads across *every* visible GPU. So instead
of DDP, each job runs in its own child process pinned to one card via CUDA_VISIBLE_DEVICES:
N jobs run side by side, one per GPU, which is the real win on a 2x3060 box. Each child gets
its own data dir so their metadata files cannot race.

    # both 3060s, two jobs (e.g. two roles) at once, one card each
    agent_worker.py --parallel 2
"""
import argparse
import io
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import uuid
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
APP = ROOT / "llm-training-app"
sys.path.insert(0, str(APP))

from fastapi import FastAPI, File, Form, HTTPException, UploadFile  # noqa: E402
from fastapi.responses import StreamingResponse  # noqa: E402
from pydantic import BaseModel  # noqa: E402

import engine as E  # noqa: E402

app = FastAPI(title="LLM Training Studio — agent worker", version="1.0")

JOBS: dict = {}
_LOCK = threading.Lock()
_QUEUE: list = []
_WAKE = threading.Event()

PARALLEL = 1        # how many jobs this worker may run at once (one per slot)
SLOTS: list = []    # [{gpu: int, data_dir: str}, ...]

# ── helpers ──────────────────────────────────────────────────────────────────

def sanitise(name: str) -> str:
    """A plain directory name: no separators, so a client cannot escape EXPORTS_DIR."""
    return "".join(c for c in str(name or "") if c.isalnum() or c in "-_.") or "adapter"


def public(job: dict) -> dict:
    """The job fields that are safe and useful to send back."""
    keep = ("id", "status", "output_name", "base_model", "created_at", "started_at",
            "finished_at", "progress", "metrics", "error", "files", "device", "config",
            "adapter_dir")   # where it landed on the box, for debugging
    return {k: job.get(k) for k in keep if k in job}


def _read_progress(job: dict, progress_file: str):
    """Mirror the child's progress file into the job, so /jobs/{id} stays live."""
    p = Path(progress_file)
    try:
        data = json.loads(p.read_text())
    except (OSError, json.JSONDecodeError):
        return
    if data:
        job["progress"] = data


def plan_devices(slots: int, gpu_count: int) -> list:
    """Which GPU each slot uses. With more slots than cards they share round-robin."""
    n = max(1, gpu_count)
    return [i % n for i in range(max(1, slots))]


def redirect_dirs(d: Path):
    """Point engine.py's module-level paths at a private data dir for this slot."""
    for sub in ("uploads", "models", "exports", "categories", "experiments"):
        (d / sub).mkdir(parents=True, exist_ok=True)
    E.DATA_DIR = d
    E.UPLOADS_DIR = d / "uploads"
    E.MODELS_DIR = d / "models"
    E.EXPORTS_DIR = d / "exports"
    E.CATEGORIES_DIR = d / "categories"
    E.EXPERIMENTS_DIR = d / "experiments"
    E.METADATA_FILE = d / "metadata.json"


def run_job_child(spec_file: str) -> int:
    """Child process: train exactly one job, on the one GPU it can see.

    Progress and the final result are written to files for the parent to read, so the
    parent API process never has to hold a model itself.
    """
    spec = json.loads(Path(spec_file).read_text())
    redirect_dirs(Path(spec["data_dir"]))
    engine = E.Engine()
    progress_file = Path(spec["progress_file"])
    result_file = Path(spec["result_file"])
    stop_file = progress_file.parent / "STOP"

    def write_result(payload: dict):
        result_file.write_text(json.dumps(payload))

    try:
        print(f"[child {spec['job_id']}] CUDA_VISIBLE_DEVICES={os.environ.get('CUDA_VISIBLE_DEVICES')}",
              flush=True)
        engine.training_queue.clear()
        ingested = engine.ingest_files_batch([Path(p) for p in spec["files"]])
        for item in ingested:
            fid = item.get("id") if isinstance(item, dict) else item
            if fid:
                engine.queue_add(file_id=fid)
        engine.save_metadata(force=True)
        if not engine.training_queue:
            raise RuntimeError("nothing was ingested from the uploaded files")

        ok, msg = engine.start_training(dict(spec["config"]))
        if not ok:
            raise RuntimeError(f"trainer refused the job: {msg}")

        while engine.training_active:
            if stop_file.exists() and engine.training_status != "stopped":
                engine.training_status = "stopped"
                engine.training_active = False
            progress_file.write_text(json.dumps({
                "epoch": engine.current_epoch, "step": engine.current_step,
                "total_steps": engine.total_steps, "status": engine.training_status,
            }))
            time.sleep(2)

        progress = {"epoch": engine.current_epoch, "step": engine.current_step,
                    "total_steps": engine.total_steps, "status": engine.training_status}
        progress_file.write_text(json.dumps(progress))

        if engine.training_status == "stopped":
            write_result({"status": "stopped", "progress": progress,
                          "metrics": dict(engine.model_metrics)})
            return 0
        if engine.current_step < 1:
            raise RuntimeError("the training loop completed 0 optimisation steps — the "
                               "adapter would be untrained (check the child log)")
        adapter_dir = E.EXPORTS_DIR / spec["output_name"]
        if not (adapter_dir / "adapter_config.json").exists():
            raise RuntimeError(f"no adapter at {adapter_dir} (status={engine.training_status})")
        write_result({"status": "completed", "adapter_dir": str(adapter_dir),
                      "progress": progress, "metrics": dict(engine.model_metrics)})
        return 0
    except Exception as exc:
        message = f"{type(exc).__name__}: {exc}"
        print(f"[child {spec['job_id']}] FAILED: {message}", flush=True)
        write_result({"status": "failed", "error": message,
                      "progress": {"epoch": engine.current_epoch, "step": engine.current_step,
                                   "total_steps": engine.total_steps,
                                   "status": engine.training_status},
                      "metrics": dict(engine.model_metrics)})
        return 1


def run_job(slot: dict, job: dict):
    """Parent side: spawn the child for this job on this slot's GPU and mirror its files."""
    job["status"] = "running"
    job["started_at"] = time.time()
    job["device"] = f"cuda:{slot['gpu']}"
    job_dir = Path(job["job_dir"])
    job_dir.mkdir(parents=True, exist_ok=True)
    spec = {
        "job_id": job["id"],
        "config": job["config"],
        "files": job["upload_paths"],
        "output_name": job["output_name"],
        "data_dir": slot["data_dir"],
        "progress_file": str(job_dir / "progress.json"),
        "result_file": str(job_dir / "result.json"),
    }
    spec_file = job_dir / "spec.json"
    spec_file.write_text(json.dumps(spec))

    env = dict(os.environ)
    env["CUDA_VISIBLE_DEVICES"] = str(slot["gpu"])   # this job sees only its own card
    env.setdefault("PYTHONUNBUFFERED", "1")
    proc = None
    try:
        with open(job_dir / "child.log", "w") as log:
            proc = subprocess.Popen(
                [sys.executable, str(Path(__file__).resolve()), "--run-job", str(spec_file)],
                env=env, stdout=log, stderr=subprocess.STDOUT, cwd=str(ROOT))
            deadline = time.time() + 60          # give a graceful stop this long
            while proc.poll() is None:
                _read_progress(job, spec["progress_file"])
                if job.get("stop_requested"):
                    (job_dir / "STOP").write_text("stop")
                    if time.time() > deadline:
                        print(f"[job {job['id']}] stop timed out — terminating", flush=True)
                        proc.terminate()
                        job["status"] = "stopped"
                        break
                time.sleep(2)

        _read_progress(job, spec["progress_file"])
        result_path = Path(spec["result_file"])
        result = json.loads(result_path.read_text()) if result_path.exists() else {}
        if not result:
            raise RuntimeError(f"the child exited ({proc.returncode}) without a result — "
                               f"see {job_dir / 'child.log'}")
        job["progress"] = result.get("progress", job.get("progress"))
        job["metrics"] = result.get("metrics", {})
        if result.get("status") == "completed":
            job["adapter_dir"] = result["adapter_dir"]
            job["status"] = "completed"
        elif result.get("status") == "stopped":
            job["status"] = "stopped"
        else:
            job["status"] = "failed"
            job["error"] = result.get("error", "unknown child failure")
            print(f"[job {job['id']}] FAILED: {job['error']}", flush=True)
    except Exception as exc:  # surface it to the client instead of dying quietly
        job["status"] = "failed"
        job["error"] = f"{type(exc).__name__}: {exc}"
        print(f"[job {job['id']}] FAILED: {job['error']}", flush=True)
    finally:
        if proc is not None and proc.poll() is None:
            proc.terminate()
        job["finished_at"] = time.time()
        for p in job.get("upload_paths", []):
            try:
                Path(p).unlink(missing_ok=True)
            except OSError:
                pass


def worker_loop(slot: dict):
    """One slot = one GPU = one job at a time. Several slots run in parallel."""
    while True:
        with _LOCK:
            job = _QUEUE.pop(0) if _QUEUE else None
        if job is None:
            _WAKE.wait(5)
            _WAKE.clear()
            continue
        print(f"[slot gpu{slot['gpu']}] starting job {job['id']} ({job['output_name']})",
              flush=True)
        run_job(slot, job)
        print(f"[slot gpu{slot['gpu']}] job {job['id']} -> {job['status']}", flush=True)


# ── endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    gpus = []
    try:
        for g in E.Engine().detect_gpus():
            gpus.append(g)
    except Exception:
        pass
    running = [j
        for j in JOBS.values() if j["status"] in ("running", "stopping")]
    return {
        "ok": True,
        "trainer": bool(E.HAS_REAL_TRAINING),
        "gpu_count": len(gpus),
        "exports_dir": str(E.EXPORTS_DIR),
        "busy": bool(_QUEUE) or bool(running),
        "queued": len(_QUEUE),
        "parallel": PARALLEL,          # how many jobs can run at once
        "running": len(running),
        "devices": [s["gpu"] for s in SLOTS],
    }


@app.get("/gpus")
def gpus():
    try:
        return {"gpus": E.Engine().detect_gpus()}
    except Exception as exc:
        return {"gpus": [], "error": f"{type(exc).__name__}: {exc}"}


@app.post("/jobs")
async def submit_job(payload: str = Form(...), files: list[UploadFile] = File(...)):
    """payload is the JSON training config; files are the dataset files."""
    try:
        config = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"payload is not JSON: {exc}")

    # Accept either key, but the engine reads "model_name". Without it the run silently
    # becomes *simulated* training: falling loss, no adapter.
    if not config.get("model_name") and config.get("base_model"):
        config["model_name"] = config["base_model"]
    if not config.get("base_model"):
        config["base_model"] = config.get("model_name") or ""
    if not config.get("model_name"):
        raise HTTPException(status_code=400,
                            detail="config needs 'model_name' (or 'base_model')")
    if str(config["model_name"]) == "simulated":
        raise HTTPException(status_code=400,
                            detail="'simulated' is not a trainable base model")
    if not files:
        raise HTTPException(status_code=400, detail="no dataset files were uploaded")

    job_id = uuid.uuid4().hex[:12]
    # Under the worker's data dir, so spec/progress/log survive the run for debugging.
    job_dir = Path(E.DATA_DIR) / "jobs" / job_id
    upload_dir = job_dir / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    saved, original = [], []
    for up in files:
        dest = upload_dir / Path(up.filename or "data.jsonl").name
        with dest.open("wb") as fh:
            shutil.copyfileobj(up.file, fh)
        saved.append(str(dest))
        original.append(dest.name)

    output_name = sanitise(config.get("output_name") or Path(original[0]).stem)
    job = {
        "id": job_id,
        "status": "queued",
        "job_dir": str(job_dir),
        "created_at": time.time(),
        "output_name": output_name,
        "base_model": config["base_model"],
        "files": original,
        "upload_paths": saved,
        "progress": {"epoch": 0, "step": 0, "total_steps": 0, "status": "queued"},
        "metrics": {},
        "config": {**config, "output_name": output_name},
    }
    with _LOCK:
        JOBS[job["id"]] = job
        _QUEUE.append(job)
    _WAKE.set()
    return {"job_id": job["id"], "status": job["status"], "output_name": output_name,
            "queued_ahead": len(_QUEUE) - 1}


@app.get("/jobs")
def list_jobs():
    return {"jobs": [public(j) for j in JOBS.values()]}


@app.get("/jobs/{job_id}")
def job_status(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"no job {job_id}")
    return public(job)


@app.post("/jobs/{job_id}/stop")
def stop_job(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"no job {job_id}")
    if job["status"] == "running":
        # The job runs in its own process, so ask it politely via a stop file; the
        # slot escalates to SIGTERM if the child does not wind down.
        job["stop_requested"] = True
        job["status"] = "stopping"
    return public(job)


@app.get("/jobs/{job_id}/adapter")
def fetch_adapter(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"no job {job_id}")
    if job["status"] != "completed" or not job.get("adapter_dir"):
        raise HTTPException(status_code=409, detail=f"job is {job['status']}, no adapter yet")
    adapter_dir = Path(job["adapter_dir"])
    if not adapter_dir.exists():
        raise HTTPException(status_code=410, detail=f"adapter dir vanished: {adapter_dir}")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(adapter_dir.rglob("*")):
            if f.is_file():
                zf.write(f, f.relative_to(adapter_dir))
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip", headers={
        "X-Adapter-Name": job["output_name"],
        "Content-Disposition": f'attachment; filename="{job["output_name"]}.zip"',
    })


def main() -> int:
    global PARALLEL, SLOTS
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="0.0.0.0", help="0.0.0.0 exposes it to your LAN")
    ap.add_argument("--port", type=int, default=8811)
    ap.add_argument("--data-dir", default=None,
                    help="keep uploads/models/exports here instead of the app's own data dir "
                         "(useful for a dedicated worker or a hermetic test)")
    ap.add_argument("--parallel", type=int, default=0,
                    help="jobs to run at once, one per GPU (default: one per GPU found). "
                         "With 2 GPUs this trains two jobs side by side, a card each")
    ap.add_argument("--run-job", default=None, metavar="SPEC_JSON",
                    help=argparse.SUPPRESS)   # internal: the per-job child process
    args = ap.parse_args()

    if args.run_job:
        return run_job_child(args.run_job)

    if args.data_dir:
        redirect_dirs(Path(args.data_dir).expanduser().resolve())

    try:
        gpu_count = len(E.Engine().detect_gpus())
    except Exception as exc:
        print(f"  GPU detection failed ({exc}); assuming one slot")
        gpu_count = 0

    PARALLEL = args.parallel if args.parallel > 0 else max(1, min(gpu_count, 4))
    base_data = Path(E.DATA_DIR)
    devices = plan_devices(PARALLEL, gpu_count or 1)
    SLOTS = [{"gpu": g, "data_dir": str(base_data / f"slot{i}_gpu{g}")}
             for i, g in enumerate(devices)]

    print(f"LLM Training Studio agent worker")
    print(f"  app           : {APP}")
    print(f"  real training : {E.HAS_REAL_TRAINING}")
    print(f"  data dir      : {base_data}")
    print(f"  GPUs found    : {gpu_count}")
    print(f"  parallel jobs : {PARALLEL}  (one per slot)")
    for i, s in enumerate(SLOTS):
        print(f"    slot {i}: GPU {s['gpu']}  ->  {s['data_dir']}")
    print(f"  listening     : http://{args.host}:{args.port}")
    if PARALLEL > 1:
        print(f"  note          : jobs run in child processes pinned with "
              f"CUDA_VISIBLE_DEVICES, so each card loads one model")
    for s in SLOTS:
        threading.Thread(target=worker_loop, args=(s,), daemon=True).start()

    import uvicorn
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")
    return 0


if __name__ == "__main__":
    sys.exit(main())
