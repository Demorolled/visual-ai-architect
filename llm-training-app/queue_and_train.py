"""
Queue all 24 MindSpace training datasheets and start training.
Run from llm-training-app/ directory.
"""
import sys
import json
import time
from pathlib import Path
from engine import Engine

# ── 1. Init engine ──────────────────────────────────────────────────
print("Initializing Engine...")
engine = Engine()

# ── 2. Check for stale queue entries (orphaned UUIDs with no files) ─
stale = [fid for fid in engine.training_queue if fid not in engine.files]
if stale:
    print(f"Removing {len(stale)} stale queue entries (orphaned UUIDs)...")
    for fid in stale:
        engine.training_queue.remove(fid)

# Reset training state
engine.training_history.clear()
engine.training_active = False
engine.training_paused = False
engine.training_status = "idle"
engine.current_epoch = 0
engine.current_step = 0
engine.total_steps = 0
engine.save_metadata(force=True)
print(f"  State reset. Files: {len(engine.files)}, Queue: {len(engine.training_queue)}")

# ── 3. Locate datasheets ────────────────────────────────────────────
trainer_dir = Path(__file__).parent.parent / "MindSpace" / "trainer"
jsonl_files = sorted(trainer_dir.glob("*.jsonl"))
print(f"Found {len(jsonl_files)} datasheets in {trainer_dir}")

if not jsonl_files:
    print("ERROR: No .jsonl files found!")
    sys.exit(1)

# ── 4. Ingest all files ─────────────────────────────────────────────
print("\nIngesting datasheets...")
ingested = engine.ingest_files_batch(list(jsonl_files))
print(f"  Ingested {len(ingested)} files")

if not ingested:
    print("ERROR: No files were ingested!")
    sys.exit(1)

# ── 5. Queue all ingested files ─────────────────────────────────────
print("\nQueueing files...")
queued = 0
for item in ingested:
    fid = item.get("id", item if isinstance(item, str) else None)
    if fid:
        engine.queue_add(file_id=fid)
        queued += 1
print(f"  Queued {queued} files")

if queued == 0:
    print("ERROR: No files were queued!")
    sys.exit(1)

# ── 6. Verify state ─────────────────────────────────────────────────
print(f"\nFiles in engine: {len(engine.files)}")
print(f"Queue length: {len(engine.training_queue)}")

# Print the queued file names
print("\nQueued datasheets:")
for fid in engine.training_queue:
    fd = engine.files.get(fid, {})
    name = fd.get("original_name", "?")
    cat = fd.get("category", "?")
    print(f"  {name} ({cat})")

# ── 7. Start MindSpace training ─────────────────────────────────────
print("\nStarting MindSpace training...")
print("  GPU:         index 0 (VRAM capped at 50%)")
print("  NOTE: For multi-GPU DDP with both GPUs, use:")
print("        MindSpace/scripts/train_ddp.sh")
config = {
    "model_name": "mindspace-rnn",
    "epochs": 10,
    "learning_rate": 0.001,
    "batch_size": 8,
    "embed_dim": 128,
    "hidden_dim": 256,
    "num_layers": 2,
    "max_seq_len": 128,
    "dropout": 0.2,
    "memory_fraction": 0.50,
    "gpu_devices": [0],
}
success, msg = engine.start_training(config)
print(f"  Result: {success} — {msg}")
if not success:
    print(f"  ERROR: {msg}")
    sys.exit(1)

# ── 8. Monitor training progress ────────────────────────────────────
print(f"\nTraining status: {engine.training_status}")
print(f"Queue: {len(engine.training_queue)} files across {engine.epochs_config} epochs")
print(f"Total steps: {engine.total_steps}")
print()

poll_interval = 10  # seconds between progress checks
last_step = -1
print_every = 5  # only print every N polls
poll_count = 0

while engine.training_active:
    time.sleep(poll_interval)
    poll_count += 1

    epoch = engine.current_epoch
    step = engine.current_step
    loss = engine.model_metrics.get("loss", None)
    acc = engine.model_metrics.get("accuracy", None)

    if step != last_step and (step == 0 or poll_count % print_every == 0):
        loss_str = f"{loss:.4f}" if isinstance(loss, (int, float)) else "?"
        acc_str = f"{acc:.1f}%" if isinstance(acc, (int, float)) else "?"
        print(f"  Epoch {epoch} | Step {step}/{engine.total_steps} | Loss {loss_str} | Acc {acc_str}")
        sys.stdout.flush()
        last_step = step

print(f"\n{'='*50}")
print(f"Training completed!")
print(f"Final status: {engine.training_status}")
print(f"Final metrics:")
for k, v in engine.model_metrics.items():
    if isinstance(v, float):
        print(f"  {k}: {v:.4f}")
    else:
        print(f"  {k}: {v}")

# Print training summary if available
if engine.training_summary:
    print(f"\nTraining summary:")
    for k, v in engine.training_summary.items():
        print(f"  {k}: {v}")
