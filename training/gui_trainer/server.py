#!/usr/bin/env python3
"""
=============================================================================
  🚀 GUI GGUF Trainer Server
  ===========================
  FastAPI server that:
    - Serves the trainer web UI (static files)
    - Lists/manages datasets
    - Controls training (start/stop/status)
    - Monitors training progress via SSE
    - Exports trained models to GGUF

  Usage:
    python3 training/gui-trainer/server.py [--port 8765] [--host 0.0.0.0]
=============================================================================
"""

import os, sys, json, time, asyncio, threading, uuid
from pathlib import Path
from datetime import datetime
from typing import Optional, List
from contextlib import asynccontextmanager

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import uvicorn
from fastapi import FastAPI, Request, Query, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from training.gui_trainer.engine import GUITrainer, TrainingProgress

# ─── Paths ──────────────────────────────────────────────────────────────
STATIC_DIR = Path(__file__).parent / "static"
DATASET_DIR = Path(__file__).parent / "datasets"
EXISTING_DATASET = PROJECT_ROOT / "training" / "dataset"
MODELS_DIR = Path(__file__).parent / "models"

STATIC_DIR.mkdir(parents=True, exist_ok=True)
DATASET_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR.mkdir(parents=True, exist_ok=True)


# ─── Trainer Manager ────────────────────────────────────────────────────

class TrainerManager:
    """Manages the training lifecycle."""
    def __init__(self):
        self.trainer: Optional[GUITrainer] = None
        self.train_thread: Optional[threading.Thread] = None
        self._progress_callbacks = []
        self.current_config = {}
        self.training_history = []
        self._load_history()

    def _load_history(self):
        """Load training history from file."""
        history_file = MODELS_DIR / "training_history.json"
        if history_file.exists():
            try:
                with open(history_file) as f:
                    self.training_history = json.load(f)
            except:
                self.training_history = []

    def _save_history(self):
        """Save training history to file."""
        history_file = MODELS_DIR / "training_history.json"
        try:
            with open(history_file, 'w') as f:
                json.dump(self.training_history[-50:], f, indent=2, default=str)
        except:
            pass

    def get_datasets(self):
        """Get list of available datasets with stats."""
        datasets = []
        
        # GUI datasets
        if DATASET_DIR.exists():
            for f in sorted(DATASET_DIR.glob("*.jsonl")):
                try:
                    line_count = sum(1 for _ in open(f) if _.strip())
                    size_kb = f.stat().st_size / 1024
                    datasets.append({
                        "name": f.stem,
                        "filename": f.name,
                        "path": str(f),
                        "entries": line_count,
                        "size_kb": round(size_kb, 1),
                        "type": "gui",
                    })
                except:
                    pass
        
        # Existing training dataset
        existing = EXISTING_DATASET / "train.jsonl"
        if existing.exists():
            try:
                line_count = sum(1 for _ in open(existing) if _.strip())
                size_kb = existing.stat().st_size / 1024
                datasets.append({
                    "name": "existing-training",
                    "filename": existing.name,
                    "path": str(existing),
                    "entries": line_count,
                    "size_kb": round(size_kb, 1),
                    "type": "existing",
                })
            except:
                pass
        
        # Existing val/test datasets
        for name in ["val.jsonl", "test.jsonl"]:
            fp = EXISTING_DATASET / name
            if fp.exists():
                try:
                    line_count = sum(1 for _ in open(fp) if _.strip())
                    datasets.append({
                        "name": f"existing-{name.replace('.jsonl','')}",
                        "filename": fp.name,
                        "path": str(fp),
                        "entries": line_count,
                        "size_kb": round(fp.stat().st_size / 1024, 1),
                        "type": "existing",
                    })
                except:
                    pass
        
        return datasets

    def get_status(self):
        """Get current trainer status."""
        if self.trainer is None:
            return {"status": "idle", "message": "No training session active"}
        
        progress = self.trainer.progress.get_snapshot()
        progress["config"] = self.trainer.config
        
        # Get GPU info
        try:
            import subprocess
            r = subprocess.run(
                ["nvidia-smi", "--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu",
                 "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=2
            )
            gpus = []
            if r.stdout:
                for line in r.stdout.strip().split('\n'):
                    parts = [p.strip() for p in line.split(', ')]
                    if len(parts) >= 5:
                        gpus.append({
                            "index": parts[0],
                            "name": parts[1],
                            "util": int(parts[2]),
                            "mem_used": int(parts[3]),
                            "mem_total": int(parts[4]),
                            "temp": int(parts[5]) if len(parts) > 5 else 0,
                        })
            progress["gpus"] = gpus
        except:
            progress["gpus"] = []
        
        progress["is_training"] = self.train_thread is not None and self.train_thread.is_alive()
        progress["history"] = self.training_history[-10:]  # Last 10 runs
        
        return progress

    def start_training(self, dataset_paths: List[str], config: dict):
        """Start training in background thread."""
        if self.train_thread and self.train_thread.is_alive():
            return False, "Training already in progress"
        
        self.trainer = GUITrainer(str(MODELS_DIR))
        self.trainer.update_config(**config)
        
        self.current_config = {
            "config": dict(config),
            "datasets": dataset_paths,
            "started_at": datetime.now().isoformat(),
            "run_id": str(uuid.uuid4())[:8],
        }
        
        def run():
            try:
                self.trainer.train(dataset_paths)
                # Save to history on completion
                self.current_config["completed_at"] = datetime.now().isoformat()
                self.current_config["result"] = self.trainer.progress.get_snapshot()
                self.training_history.append(self.current_config)
                self._save_history()
            except Exception as e:
                self.current_config["completed_at"] = datetime.now().isoformat()
                self.current_config["error"] = str(e)
                self.training_history.append(self.current_config)
                self._save_history()
        
        self.train_thread = threading.Thread(target=run, daemon=True)
        self.train_thread.start()
        
        return True, "Training started"

    def stop_training(self):
        """Request graceful stop of training."""
        if self.trainer and self.trainer.progress.status in ("training", "loading", "evaluating"):
            self.trainer.request_stop()
            return True, "Stop requested"
        return False, "No active training"


# ─── Global Manager ─────────────────────────────────────────────────────

manager = TrainerManager()


# ─── FastAPI App ─────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print(f"  🚀 GUI GGUF Trainer Server")
    print(f"  Datasets: {DATASET_DIR}")
    print(f"  Models:   {MODELS_DIR}")
    print(f"  Static:   {STATIC_DIR}")
    yield
    # Shutdown
    if manager.trainer:
        manager.trainer.request_stop()


app = FastAPI(title="GUI GGUF Trainer", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ─── API Routes ─────────────────────────────────────────────────────────

@app.get("/")
async def root():
    """Serve the main web UI."""
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/api/status")
async def get_status():
    """Get current trainer status."""
    return manager.get_status()


@app.get("/api/datasets")
async def list_datasets():
    """List available datasets."""
    return {"datasets": manager.get_datasets()}


class TrainRequest(BaseModel):
    datasets: List[str]
    config: dict = {}


@app.post("/api/train/start")
async def start_training(req: TrainRequest):
    """Start training with selected datasets and config."""
    success, message = manager.start_training(req.datasets, req.config)
    return {"success": success, "message": message}


@app.post("/api/train/stop")
async def stop_training():
    """Stop training gracefully."""
    success, message = manager.stop_training()
    return {"success": success, "message": message}


@app.get("/api/train/progress")
async def training_progress(request: Request):
    """SSE endpoint for real-time training progress."""
    async def event_generator():
        last_snapshot = None
        while True:
            try:
                await asyncio.sleep(0.5)
                
                if manager.trainer is None:
                    data = {"status": "idle", "message": "No active training"}
                else:
                    data = manager.trainer.progress.get_snapshot()
                
                # Only send if changed
                if data != last_snapshot:
                    last_snapshot = data
                    yield f"data: {json.dumps(data)}\n\n"
                
                # Check if client disconnected
                if await request.is_disconnected():
                    break
                    
            except asyncio.CancelledError:
                break
            except Exception:
                break
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@app.get("/api/models")
async def list_models():
    """List trained models available for download."""
    models = []
    
    # GGUF files
    for f in MODELS_DIR.glob("*.gguf"):
        size_gb = f.stat().st_size / (1024**3)
        models.append({
            "name": f.stem,
            "filename": f.name,
            "path": str(f),
            "size_gb": round(size_gb, 2),
            "type": "gguf",
            "modified": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
        })
    
    # Adapter directories
    for d in MODELS_DIR.iterdir():
        if d.is_dir() and (d / "adapter_config.json").exists():
            models.append({
                "name": d.name,
                "path": str(d),
                "type": "adapter",
                "modified": datetime.fromtimestamp(d.stat().st_mtime).isoformat(),
            })
    
    return {"models": models}


@app.get("/api/models/{filename}")
async def download_model(filename: str):
    """Download a trained model file."""
    # Sanitize: only allow the filename, no path traversal
    safe_name = Path(filename).name
    filepath = MODELS_DIR / safe_name
    if not filepath.exists() or not filepath.is_file():
        raise HTTPException(status_code=404, detail="Model not found")
    return FileResponse(str(filepath), filename=safe_name, media_type="application/octet-stream")


@app.get("/api/config/defaults")
async def get_default_config():
    """Get default training configuration."""
    trainer = GUITrainer()
    return {"config": trainer.config}


class GenerateDatasetsRequest(BaseModel):
    pass


@app.post("/api/datasets/generate")
async def generate_datasets():
    """Generate GUI training datasets from projects."""
    try:
        # Import and run the dataset generator
        from training.gui_trainer.generate_gui_datasets import generate_all_datasets
        total = generate_all_datasets()
        return {"success": True, "total": total, "message": f"Generated {total} training entries"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/gpu-info")
async def gpu_info():
    """Get GPU information."""
    try:
        import subprocess
        r = subprocess.run(
            ["nvidia-smi", "--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=2
        )
        gpus = []
        if r.stdout:
            for line in r.stdout.strip().split('\n'):
                parts = [p.strip() for p in line.split(', ')]
                if len(parts) >= 5:
                    gpus.append({
                        "index": parts[0],
                        "name": parts[1],
                        "utilization": int(parts[2]),
                        "memory_used_mb": int(parts[3]),
                        "memory_total_mb": int(parts[4]),
                        "temperature": int(parts[5]) if len(parts) > 5 else 0,
                        "power_w": parts[6] if len(parts) > 6 else "N/A",
                    })
        return {"gpus": gpus}
    except Exception as e:
        return {"gpus": [], "error": str(e)}


# ─── Main ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="GUI GGUF Trainer Server")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind to")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload")
    args = parser.parse_args()
    
    print(f"""
╔══════════════════════════════════════════════════╗
║     🎨 GUI GGUF Trainer — Web Interface          ║
║                                                  ║
║     Open: http://{args.host}:{args.port}                ║
║     Train: GUI datasets → Qwen2.5-7B → GGUF    ║
╚══════════════════════════════════════════════════╝
    """)
    
    uvicorn.run(
        "training.gui_trainer.server:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info",
    )
