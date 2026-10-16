#!/usr/bin/env python3
"""
Scan server — the phone talks to this.

    phone browser ──POST /api/scans──▶ save video ──queue──▶ pipeline.run_scan
                   ◀──GET /api/scans/{id}──  status + step + log tail
                   ◀──GET /viewer/{id}──     Spark viewer for the finished splat

Runs on the agent box and is reached over the LAN, so there is no app to install
on the phone — any browser works, including iOS Safari.

One worker per GPU: the box has two 3060s and nerfstudio trains single-GPU, so
two scans run concurrently, each pinned with CUDA_VISIBLE_DEVICES.
"""
from __future__ import annotations

import json
import os
import queue
import shutil
import threading
import time
import uuid
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

HERE = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("SPLAT_DATA", Path.home() / "splat/scans"))
STATIC_DIR = HERE / "static"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# One worker per GPU; each worker owns a card via CUDA_VISIBLE_DEVICES.
N_GPUS = int(os.environ.get("SPLAT_GPUS", "2"))
MAX_UPLOAD_BYTES = int(os.environ.get("SPLAT_MAX_UPLOAD_MB", "4096")) * 1024 * 1024

app = FastAPI(title="VACA Scan", docs_url="/api/docs")

_state_lock = threading.Lock()
_scans: dict[str, dict] = {}
_jobs: "queue.Queue[str]" = queue.Queue()


# ─── state ───────────────────────────────────────────────────────────────────

def _scan_dir(scan_id: str) -> Path:
    return DATA_DIR / scan_id


def _state_path(scan_id: str) -> Path:
    return _scan_dir(scan_id) / "scan.json"


def save_scan(scan: dict) -> None:
    with _state_lock:
        _scans[scan["id"]] = scan
    _state_path(scan["id"]).write_text(json.dumps(scan, indent=2))


def load_scans() -> None:
    """Rehydrate from disk so a restart does not lose the scan list."""
    for p in DATA_DIR.glob("*/scan.json"):
        try:
            scan = json.loads(p.read_text())
        except (OSError, ValueError):
            continue
        # A scan left mid-flight by a restart is not running any more.
        if scan.get("status") in ("queued", "running"):
            scan["status"] = "interrupted"
            scan["step"] = "server restarted mid-scan"
        _scans[scan["id"]] = scan


def update(scan_id: str, **fields) -> dict:
    with _state_lock:
        scan = _scans[scan_id]
        scan.update(fields)
        scan["updated_at"] = time.time()
    _state_path(scan_id).write_text(json.dumps(scan, indent=2))
    return scan


# ─── worker ──────────────────────────────────────────────────────────────────

def _worker(slot: int) -> None:
    """Pull jobs and run them on GPU `slot`."""
    from pipeline import ScanSpec, StepFailed, run_scan

    while True:
        scan_id = _jobs.get()
        if scan_id is None:
            return
        with _state_lock:
            scan = _scans.get(scan_id)
        if not scan or scan.get("status") == "cancelled":
            _jobs.task_done()
            continue

        dir_ = _scan_dir(scan_id)
        update(scan_id, status="running", step="starting", started_at=time.time(),
               gpu=slot)
        spec = ScanSpec(
            video=dir_ / scan["video_name"],
            out_dir=dir_,
            frames=scan["params"]["frames"],
            turns=scan["params"]["turns"],
            start_deg=scan["params"]["start_deg"],
            clockwise=scan["params"]["clockwise"],
            elevation_deg=scan["params"]["elevation_deg"],
            fov_deg=scan["params"]["fov_deg"],
            iterations=scan["params"]["iterations"],
            gpu=slot,
            pose_mode=scan["params"]["pose_mode"],
        )

        def on_step(name: str, _id=scan_id) -> None:
            update(_id, step=name)

        try:
            result = run_scan(spec, on_step=on_step)
            update(scan_id, status="done", step="complete", result=result,
                   finished_at=time.time(), log_tail=spec.log[-60:])
        except StepFailed as e:
            update(scan_id, status="failed", step="failed", error=str(e)[:4000],
                   finished_at=time.time(), log_tail=spec.log[-60:])
        except Exception as e:  # noqa: BLE001 - surface anything, never hang
            update(scan_id, status="failed", step="crashed",
                   error=f"{type(e).__name__}: {e}"[:4000],
                   finished_at=time.time(), log_tail=spec.log[-60:])
        finally:
            (dir_ / "pipeline.log").write_text("\n".join(spec.log[-2000:]))
            _jobs.task_done()


@app.on_event("startup")
def _start_workers() -> None:
    load_scans()
    for slot in range(max(1, N_GPUS)):
        threading.Thread(target=_worker, args=(slot,), daemon=True).start()
    print(f"▶ {max(1, N_GPUS)} scan worker(s) ready — data dir {DATA_DIR}")


# ─── API ─────────────────────────────────────────────────────────────────────

@app.post("/api/scans")
async def create_scan(
    background: BackgroundTasks,
    video: UploadFile = File(...),
    frames: int = Form(120),
    turns: float = Form(1.0),
    start_deg: float = Form(0.0),
    clockwise: bool = Form(False),
    elevation_deg: float = Form(12.0),
    fov_deg: float = Form(60.0),
    iterations: int = Form(15000),
    pose_mode: str = Form("turntable"),
    name: str = Form(""),
) -> JSONResponse:
    """Accept a phone video, stream it to disk, and queue the scan."""
    suffix = Path(video.filename or "clip.mp4").suffix.lower() or ".mp4"
    if suffix not in {".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm", ".3gp"}:
        raise HTTPException(400, f"unsupported video type: {suffix}")

    scan_id = uuid.uuid4().hex[:12]
    dir_ = _scan_dir(scan_id)
    dir_.mkdir(parents=True, exist_ok=True)
    dest = dir_ / f"raw{suffix}"

    written = 0
    with dest.open("wb") as fh:
        while chunk := await video.read(1024 * 1024):
            written += len(chunk)
            if written > MAX_UPLOAD_BYTES:
                fh.close()
                shutil.rmtree(dir_, ignore_errors=True)
                raise HTTPException(
                    413, f"video exceeds {MAX_UPLOAD_BYTES // (1024*1024)} MB limit")
            fh.write(chunk)
    if written == 0:
        shutil.rmtree(dir_, ignore_errors=True)
        raise HTTPException(400, "empty upload")

    scan = {
        "id": scan_id,
        "name": name or (video.filename or scan_id),
        "status": "queued",
        "step": "waiting for a free GPU",
        "created_at": time.time(),
        "video_name": dest.name,
        "video_bytes": written,
        "params": {
            "frames": frames, "turns": turns, "start_deg": start_deg,
            "clockwise": clockwise, "elevation_deg": elevation_deg,
            "fov_deg": fov_deg, "iterations": iterations, "pose_mode": pose_mode,
        },
    }
    save_scan(scan)
    _jobs.put(scan_id)
    return JSONResponse({"id": scan_id, "status": "queued"}, status_code=202)


@app.get("/api/scans")
def list_scans() -> JSONResponse:
    with _state_lock:
        items = sorted(_scans.values(), key=lambda s: s.get("created_at", 0),
                       reverse=True)
    return JSONResponse({"scans": items, "queued": _jobs.qsize(), "gpus": N_GPUS})


@app.get("/api/scans/{scan_id}")
def get_scan(scan_id: str) -> JSONResponse:
    with _state_lock:
        scan = _scans.get(scan_id)
    if not scan:
        raise HTTPException(404, "no such scan")
    if scan.get("status") == "running" and scan_id in {s for s in _scans}:
        log = _scan_dir(scan_id) / "pipeline.log"
        if log.exists():
            scan = {**scan, "log_tail": log.read_text().splitlines()[-40:]}
    return JSONResponse(scan)


@app.delete("/api/scans/{scan_id}")
def delete_scan(scan_id: str) -> JSONResponse:
    with _state_lock:
        scan = _scans.get(scan_id)
        if scan:
            _scans.pop(scan_id, None)
    if not scan:
        raise HTTPException(404, "no such scan")
    shutil.rmtree(_scan_dir(scan_id), ignore_errors=True)
    return JSONResponse({"deleted": scan_id})


@app.get("/api/scans/{scan_id}/model")
def get_model(scan_id: str) -> FileResponse:
    ply = _scan_dir(scan_id) / "export" / "point_cloud.ply"
    if not ply.exists():
        raise HTTPException(404, "no splat yet")
    return FileResponse(ply, media_type="application/octet-stream",
                        filename=f"{scan_id}.ply")


@app.get("/api/scans/{scan_id}/video")
def get_video(scan_id: str) -> FileResponse:
    with _state_lock:
        scan = _scans.get(scan_id)
    if not scan:
        raise HTTPException(404, "no such scan")
    path = _scan_dir(scan_id) / scan["video_name"]
    if not path.exists():
        raise HTTPException(404, "video gone")
    return FileResponse(path)


@app.get("/viewer/{scan_id}", response_class=HTMLResponse)
def viewer(scan_id: str) -> HTMLResponse:
    page = STATIC_DIR / "viewer.html"
    if not page.exists():
        raise HTTPException(500, "viewer.html missing")
    return HTMLResponse(page.read_text())


@app.get("/health")
def health() -> JSONResponse:
    return JSONResponse({"ok": True, "scans": len(_scans), "gpus": N_GPUS})


if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
