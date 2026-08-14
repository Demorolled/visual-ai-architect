#!/usr/bin/env python3
"""
=============================================================================
  🧠 GUI GGUF Trainer Engine
  ==========================
  Fine-tunes Qwen2.5-7B-Instruct on GUI datasets using Unsloth,
  exports the trained model to GGUF format.

  Features:
    - Dataset loading & combination from multiple JSONL sources
    - LoRA fine-tuning with configurable hyperparameters
    - Multi-GPU support (DDP)
    - Progress reporting via callback
    - GGUF export (f16, q4_k_m, q5_k_m, q8_0)
    - Incremental training (continue from checkpoint)

  Usage:
    from train_engine import GUITrainer
    trainer = GUITrainer()
    trainer.train(dataset_paths=[...])
=============================================================================
"""

import os, sys, json, time, gc, math, threading, queue, random
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Callable

# ─── CUDA Library Path Fix ──────────────────────────────────────────────
_user_lib = os.path.expanduser('~/.local/lib')
_ld_path = os.environ.get('LD_LIBRARY_PATH', '')
if _user_lib not in _ld_path:
    os.environ['LD_LIBRARY_PATH'] = _user_lib + ':' + _ld_path if _ld_path else _user_lib

import torch
import torch.nn as nn

# Unsloth — optional, only needed when training
try:
    from unsloth import FastLanguageModel, is_bfloat16_supported
except ImportError:
    FastLanguageModel = None
    is_bfloat16_supported = None
from datasets import Dataset as HFDataset
from transformers import TrainingArguments, TrainerCallback
from trl import SFTTrainer

# ─── Paths ──────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).parent.parent.parent
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "training" / "gui-trainer" / "models"
DEFAULT_DATASET_DIR = PROJECT_ROOT / "training" / "gui_trainer" / "datasets"
EXISTING_DATASET_DIR = PROJECT_ROOT / "training" / "dataset"
LOG_FILE = Path("/tmp/gui-trainer.log")

DEFAULT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# ─── Progress Reporter ──────────────────────────────────────────────────

class TrainingProgress:
    """Thread-safe training progress tracker."""
    def __init__(self):
        self.lock = threading.Lock()
        self.status = "idle"  # idle, loading, training, evaluating, exporting, done, error
        self.current_round = 0
        self.total_rounds = 0
        self.current_step = 0
        self.total_steps = 0
        self.current_epoch = 0
        self.total_epochs = 0
        self.loss = 0.0
        self.accuracy = 0.0
        self.best_accuracy = 0.0
        self.elapsed_seconds = 0
        self.eta_seconds = 0
        self.gpu_util = 0
        self.gpu_memory = 0
        self.message = ""
        self.error = ""
        self.callbacks = []

    def update(self, **kwargs):
        with self.lock:
            for k, v in kwargs.items():
                if hasattr(self, k):
                    setattr(self, k, v)
        for cb in self.callbacks:
            try:
                cb(self)
            except Exception:
                pass

    def get_snapshot(self):
        with self.lock:
            return {
                "status": self.status,
                "current_round": self.current_round,
                "total_rounds": self.total_rounds,
                "current_step": self.current_step,
                "total_steps": self.total_steps,
                "current_epoch": self.current_epoch,
                "total_epochs": self.total_epochs,
                "loss": self.loss,
                "accuracy": self.accuracy,
                "best_accuracy": self.best_accuracy,
                "elapsed_seconds": self.elapsed_seconds,
                "eta_seconds": self.eta_seconds,
                "gpu_util": self.gpu_util,
                "gpu_memory": self.gpu_memory,
                "message": self.message,
                "error": self.error,
            }


# ─── Training Callback ──────────────────────────────────────────────────

class ProgressCallback(TrainerCallback):
    """HuggingFace Trainer callback that reports progress."""
    def __init__(self, progress: TrainingProgress, total_steps: int):
        self.progress = progress
        self.total_steps = total_steps
        self.start_time = time.time()

    def on_step_end(self, args, state, control, **kwargs):
        now = time.time()
        elapsed = now - self.start_time
        completed = state.global_step
        remaining = max(1, self.total_steps - completed)
        speed = completed / max(elapsed, 1)
        eta = remaining / max(speed, 1)

        loss = state.log_history[-1].get("loss", 0) if state.log_history else 0

        # Get GPU stats
        gpu_util = 0
        gpu_memory = 0
        try:
            import subprocess
            r = subprocess.run(
                ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used",
                 "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=2
            )
            if r.stdout:
                parts = r.stdout.strip().split('\n')[0].split(', ')
                gpu_util = int(parts[0]) if len(parts) > 0 else 0
                gpu_memory = int(parts[1]) if len(parts) > 1 else 0
        except Exception:
            pass

        self.progress.update(
            current_step=completed,
            total_steps=self.total_steps,
            elapsed_seconds=int(elapsed),
            eta_seconds=int(eta),
            loss=loss,
            gpu_util=gpu_util,
            gpu_memory=gpu_memory,
        )
        return control


# ─── Dataset Loader ─────────────────────────────────────────────────────

def load_gui_dataset(dataset_paths: List[str], tokenizer, max_seq_length: int = 2048,
                     row_caps: Optional[dict] = None, mix_seed: int = 42):
    """Load dataset from JSONL files, combine, and convert to HuggingFace Dataset.
    Returns pre-tokenized train/val splits with input_ids, attention_mask, labels columns.
    Label masking uses prompt-length detection (tokenize prompt separately) instead
    of fragile token-ID search, ensuring robust assistant-only loss computation.

    row_caps: optional {path: max_rows} dict. A file with a cap is sampled down to
    at most max_rows VALID records (deterministic, seed 42 by default) BEFORE
    tokenization, so a large retention set contributes only a bounded slice.
    Used by the mix_paths/mix_ratio retention-mix feature.
    """
    all_records = []
    system_prompt = "You are a Visual AI Architect assistant specializing in GUI development. You build complete web applications, explain UI patterns, generate code, and help with frontend development."
    
    for path in dataset_paths:
        p = Path(os.path.abspath(path))
        if not p.exists():
            print(f"  ⚠️  Dataset not found: {path}")
            continue
        
        cap = (row_caps or {}).get(str(p))
        if cap is not None and cap <= 0:
            continue
        
        valid_records = []
        with open(p, 'r') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                    instruction = record.get("instruction", "")
                    input_text = record.get("input", "")
                    output_text = record.get("output", "")
                    
                    if not output_text or len(output_text) < 10:
                        continue
                    
                    user_text = instruction
                    if input_text and input_text.strip() and input_text != "Auto-learned conversation":
                        user_text = f"{instruction}\n\n{input_text}"
                    
                    valid_records.append((instruction, input_text, user_text, output_text))
                except json.JSONDecodeError:
                    continue
        
        # Retention mix: sample `cap` of this file's valid rows (deterministic)
        # so a mix file never dominates the round.
        if cap is not None and len(valid_records) > cap:
            valid_records = random.Random(mix_seed).sample(valid_records, cap)
        
        for instruction, input_text, user_text, output_text in valid_records:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_text.strip()},
                {"role": "assistant", "content": output_text.strip()},
            ]
            
            # --- Tokenize prompt (system + user) separately to find assistant boundary ---
            prompt_messages = messages[:-1]  # system + user only
            prompt_ids = tokenizer.apply_chat_template(
                prompt_messages,
                tokenize=True,
                add_generation_prompt=True,
            )
            prompt_len = len(prompt_ids)
            
            # --- Tokenize full conversation ---
            full_ids = tokenizer.apply_chat_template(
                messages,
                tokenize=True,
                add_generation_prompt=False,
            )
            
            # Truncate if too long
            if len(full_ids) > max_seq_length:
                full_ids = full_ids[:max_seq_length]
            
            # Create labels: mask prompt tokens with -100
            labels = [-100] * min(prompt_len, len(full_ids)) + full_ids[min(prompt_len, len(full_ids)):]
            
            # Ensure same length
            original_len = len(full_ids)
            if len(labels) < original_len:
                labels.extend([-100] * (original_len - len(labels)))
            
            all_records.append({
                "input_ids": full_ids,
                "attention_mask": [1] * len(full_ids),
                "labels": labels,
            })
    
    if not all_records:
        print("  ❌ No valid records found in datasets!")
        return None, None
    
    print(f"  Loaded {len(all_records)} records from {len(dataset_paths)} files")
    
    # Pad all sequences to max_seq_length
    pad_id = tokenizer.pad_token_id or tokenizer.eos_token_id or 0
    
    for rec in all_records:
        rec["input_ids"] = (rec["input_ids"] + [pad_id] * max_seq_length)[:max_seq_length]
        rec["attention_mask"] = (rec["attention_mask"] + [0] * max_seq_length)[:max_seq_length]
        rec["labels"] = (rec["labels"] + [-100] * max_seq_length)[:max_seq_length]
    
    # Create dataset
    dataset = HFDataset.from_list(all_records)
    
    # Split 90/10 train/val
    split = dataset.train_test_split(test_size=0.1, seed=42)
    
    return split["train"], split["test"]


# ─── GUI Trainer Class ──────────────────────────────────────────────────

class GUITrainer:
    """Main trainer class for GUI-focused GGUF model fine-tuning."""

    def __init__(self, output_dir: str = None):
        self.output_dir = Path(output_dir) if output_dir else DEFAULT_OUTPUT_DIR
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        self.progress = TrainingProgress()
        self.model = None
        self.tokenizer = None
        self.train_dataset = None
        self.val_dataset = None
        self._stop_requested = False
        
        # Default config
        self.config = {
            # Matches the q4_k_m GGUF that dspark actually serves (uncensored)
            "model_name": "Orion-zhen/Qwen2.5-7B-Instruct-Uncensored",
            "max_seq_length": 2048,
            "lora_r": 8,
            "lora_alpha": 16,
            "lora_dropout": 0.05,
            "learning_rate": 2e-4,
            "num_epochs": 2,
            # 215-example campaign set: 3 LR-decay rounds is plenty
            "max_rounds": 3,
            "target_accuracy": 0.99,
            "batch_size": 1,
            "gradient_accumulation": 8,
            "gpu_ceiling": 0.75,
            "quantization": "4bit",
            "gguf_quantization": "q4_k_m",
            "weight_decay": 0.01,
            "warmup_ratio": 0.03,
            "max_grad_norm": 0.3,
            # Retention mix (anti-regression): load_datasets samples each
            # mix_paths file down to `mix_ratio` of its rows (deterministic,
            # mix_seed) and appends them to the primary dataset(s).
            "mix_paths": [],
            "mix_ratio": 0.15,
            "mix_seed": 42,
        }

    def update_config(self, **kwargs):
        """Update training configuration."""
        self.config.update(kwargs)

    def request_stop(self):
        """Request graceful training stop."""
        self._stop_requested = True

    def load_model(self):
        """Load the base model with Unsloth."""
        if FastLanguageModel is None:
            raise ImportError(
                "Unsloth is not installed!\n"
                "Install with: pip install unsloth unsloth_zoo\n"
                "Then restart the server."
            )
        
        local_rank = int(os.environ.get("LOCAL_RANK", 0))
        cfg = self.config
        
        if local_rank == 0:
            print(f"\n  Loading model: {cfg['model_name']}")
            print(f"  Max seq length: {cfg['max_seq_length']}")
            print(f"  LoRA rank: {cfg['lora_r']}")
        
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=cfg["model_name"],
            max_seq_length=cfg["max_seq_length"],
            dtype=None,  # Auto-detect bf16/fp16
            load_in_4bit=(cfg["quantization"] == "4bit"),
            load_in_8bit=(cfg["quantization"] == "8bit"),
            device_map="auto" if torch.cuda.device_count() <= 1 
                       else {"": int(os.environ.get("LOCAL_RANK", 0))},
            token=os.environ.get("HF_TOKEN", None),
        )
        
        # Apply LoRA
        model = FastLanguageModel.get_peft_model(
            model,
            r=cfg["lora_r"],
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                           "gate_proj", "up_proj", "down_proj"],
            lora_alpha=cfg["lora_alpha"],
            lora_dropout=cfg["lora_dropout"],
            bias="none",
            use_gradient_checkpointing="unsloth",
            random_state=42,
            max_seq_length=cfg["max_seq_length"],
        )
        
        if local_rank == 0:
            trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
            total = sum(p.numel() for p in model.parameters())
            print(f"  Trainable params: {trainable:,} ({100 * trainable / total:.2f}%)")
            print(f"  bf16 supported: {is_bfloat16_supported()}")
        
        self.model = model
        self.tokenizer = tokenizer
        return model, tokenizer

    def _apply_retention_mix(self, dataset_paths: List[str]) -> tuple:
        """Honor the mix_paths/mix_ratio config keys the curriculum template passes.

        Returns (paths, row_caps, mix_seed): the retention files from mix_paths
        get a cap of `round(mix_ratio * file_rows)` VALID rows each (sampled
        deterministically inside load_gui_dataset with config mix_seed), while
        the primary dataset_paths stay uncapped. This keeps the retention slice
        bounded so a code round can't drown out the GUI round, and prevents
        regression of prior capability.
        """
        cfg = self.config
        mix_paths = cfg.get("mix_paths") or []
        if isinstance(mix_paths, str):
            mix_paths = [mix_paths]
        ratio = float(cfg.get("mix_ratio", 0.15))
        mix_seed = int(cfg.get("mix_seed", 42))
        if not mix_paths or ratio <= 0:
            return [os.path.abspath(p) for p in dataset_paths], None, mix_seed

        paths = [os.path.abspath(p) for p in dataset_paths]
        row_caps = {}
        for mp in mix_paths:
            p = Path(os.path.abspath(mp))
            if not p.exists():
                if int(os.environ.get("LOCAL_RANK", 0)) == 0:
                    print(f"  ⚠️  Mix dataset not found: {mp} (skipping)")
                continue
            if str(p) in paths:
                continue
            paths.append(str(p))
            with open(p, 'r') as f:
                n_rows = sum(1 for line in f if line.strip())
            cap = max(1, int(round(n_rows * ratio)))
            row_caps[str(p)] = cap
            if int(os.environ.get("LOCAL_RANK", 0)) == 0:
                print(f"  🎲 Retention mix: {mp} → up to {cap} of {n_rows} rows ({ratio:.0%})")
        return paths, row_caps or None, mix_seed

    def load_datasets(self, dataset_paths: List[str] = None):
        """Load training datasets."""
        if dataset_paths is None:
            # Default: load all GUI datasets + existing training data
            dataset_paths = []
            gui_dir = DEFAULT_DATASET_DIR
            if gui_dir.exists():
                dataset_paths.extend(sorted(str(p) for p in gui_dir.glob("*.jsonl")))
            existing = EXISTING_DATASET_DIR / "train.jsonl"
            if existing.exists():
                dataset_paths.append(str(existing))
        
        paths, row_caps, mix_seed = self._apply_retention_mix(dataset_paths)
        
        self.progress.update(status="loading", message="Loading datasets...")
        train, val = load_gui_dataset(
            paths,
            self.tokenizer,
            self.config["max_seq_length"],
            row_caps=row_caps,
            mix_seed=mix_seed,
        )
        
        self.train_dataset = train
        self.val_dataset = val
        return train, val

    def evaluate(self, max_samples: int = 100):
        """Evaluate model accuracy on validation set."""
        if self.val_dataset is None or len(self.val_dataset) == 0:
            return {"accuracy": 0, "exact_match": 0, "samples": 0}
        
        self.model.eval()
        device = next(self.model.parameters()).device
        total, correct = 0, 0
        correct_ex, examples = 0, 0
        
        # The val split from load_gui_dataset is pre-tokenized (records hold
        # input_ids / attention_mask / labels with -100 on prompt tokens) —
        # there is NO "text" column, so evaluate on the tokenized records.
        with torch.no_grad():
            for i in range(min(len(self.val_dataset), max_samples)):
                rec = self.val_dataset[i]
                input_ids = torch.tensor(rec["input_ids"], device=device).unsqueeze(0)
                attention_mask = torch.tensor(rec["attention_mask"], device=device).unsqueeze(0)
                labels = torch.tensor(rec["labels"], device=device).unsqueeze(0)
                
                outputs = self.model(input_ids=input_ids, attention_mask=attention_mask)
                preds = torch.argmax(outputs.logits[..., :-1, :], dim=-1)
                labels = labels[..., 1:]
                mask = labels != -100
                
                tc = ((preds == labels) & mask).sum().item()
                tt = mask.sum().item()
                correct += tc
                total += tt
                
                if ((preds == labels) & mask).all() and mask.any():
                    correct_ex += 1
                examples += 1
        
        self.model.train()
        
        accuracy = round(correct / total, 4) if total > 0 else 0
        exact_match = round(correct_ex / max(examples, 1), 4)
        
        return {"accuracy": accuracy, "exact_match": exact_match, "samples": examples}

    def train(self, dataset_paths: List[str] = None):
        """Run the full training pipeline."""
        cfg = self.config
        local_rank = int(os.environ.get("LOCAL_RANK", 0))
        world_size = int(os.environ.get("WORLD_SIZE", 1))
        
        self._stop_requested = False
        
        try:
            # ─── Load Model ────────────────────────────────────────────
            self.progress.update(status="loading", message="Loading model...")
            self.load_model()
            
            # ─── Load Dataset ──────────────────────────────────────────
            self.load_datasets(dataset_paths)
            
            if self.train_dataset is None or len(self.train_dataset) == 0:
                self.progress.update(status="error", error="No training data loaded! Please generate datasets first (click 'Generate' button).")
                if local_rank == 0:
                    print(f"\n  ❌ No training data loaded!")
                    print(f"     Make sure datasets exist in {DEFAULT_DATASET_DIR}")
                    print(f"     or generate them via the web UI (click 'Generate' button).")
                return False
            
            if local_rank == 0:
                print(f"\n  Dataset: {len(self.train_dataset)} train, {len(self.val_dataset)} val")
            
            # ─── Patch Trainer.training_step for debugging ──────────────
            import transformers
            _orig_training_step = transformers.Trainer.training_step
            def _patched_training_step(self, *args, **kwargs):
                loss = _orig_training_step(self, *args, **kwargs)
                if not isinstance(loss, torch.Tensor):
                    with open("/tmp/trainer_error.txt", "a") as f:
                        f.write(f"training_step returned {type(loss)}: {loss}\n")
                        import traceback
                        traceback.print_stack(file=f)
                    loss = torch.tensor(loss, dtype=torch.float32, device=self.args.device)
                return loss
            transformers.Trainer.training_step = _patched_training_step

            # ─── Training Config ───────────────────────────────────────
            use_bf16 = is_bfloat16_supported()
            effective_batch = cfg["batch_size"] * cfg["gradient_accumulation"] * world_size
            warmup = max(1, int(cfg["warmup_ratio"] * len(self.train_dataset) * cfg["num_epochs"] // effective_batch))
            
            base_args = dict(
                output_dir=str(self.output_dir),
                num_train_epochs=cfg["num_epochs"],
                per_device_train_batch_size=cfg["batch_size"],
                gradient_accumulation_steps=cfg["gradient_accumulation"],
                warmup_steps=warmup,
                lr_scheduler_type="constant",
                optim="adamw_8bit",
                max_grad_norm=cfg["max_grad_norm"],
                weight_decay=cfg["weight_decay"],
                logging_steps=10,
                # save_strategy="no" is REQUIRED — not just save_steps=0. HF's
                # DefaultFlowCallback forces a final checkpoint save whenever
                # save_strategy == "steps" (the default), and Trainer._save then
                # runs torch.save(self.args, training_args.bin). Unsloth's
                # compiled-trainer patch swaps trl.trainer.sft_config.SFTConfig
                # for its UnslothSFTConfig subclass, so pickle fails with
                # "Can't pickle SFTConfig: it's not the same object as ..." and
                # the run dies AFTER all steps complete (rounds 1 & 3). The
                # engine saves the adapter itself below, so HF saving is off.
                save_strategy="no",
                save_steps=0,
                bf16=use_bf16,
                fp16=not use_bf16,
                dataloader_num_workers=4,
                remove_unused_columns=False,
                report_to="none",
                ddp_find_unused_parameters=False if world_size > 1 else None,
                ddp_backend="nccl" if world_size > 1 else None,
            )
            
            # Learning rate schedule
            learning_rates = [2e-4, 1e-4, 5e-5, 2e-5, 1e-5, 1e-5, 5e-6, 5e-6, 2e-6, 1e-6]
            
            # ─── Training Loop ─────────────────────────────────────────
            best_acc = 0.0
            start_time = time.time()
            total_steps_per_round = max(1, len(self.train_dataset) // effective_batch * cfg["num_epochs"])
            total_steps = total_steps_per_round * min(cfg["max_rounds"], len(learning_rates))
            
            self.progress.update(
                status="training",
                total_rounds=min(cfg["max_rounds"], len(learning_rates)),
                total_steps=total_steps,
                total_epochs=cfg["num_epochs"],
            )
            
            for round_num in range(1, cfg["max_rounds"] + 1):
                if self._stop_requested:
                    if local_rank == 0:
                        print("\n  ⏹️  Training stopped by user request")
                    break
                
                lr_idx = min(round_num - 1, len(learning_rates) - 1)
                lr = learning_rates[lr_idx]
                
                self.progress.update(current_round=round_num, message=f"Round {round_num}/{cfg['max_rounds']}")
                
                if local_rank == 0:
                    print(f"\n{'─'*50}")
                    print(f"  Round {round_num}/{cfg['max_rounds']} | LR: {lr:.1e}")
                    print(f"{'─'*50}")
                
                # Create training args per round
                round_args = TrainingArguments(
                    learning_rate=lr,
                    local_rank=local_rank,
                    **base_args,
                )
                
                # Calculate steps for this round
                round_steps = total_steps_per_round
                
                trainer = SFTTrainer(
                    model=self.model,
                    tokenizer=self.tokenizer,
                    args=round_args,
                    train_dataset=self.train_dataset,
                    max_seq_length=cfg["max_seq_length"],
                    dataset_text_field=None,
                    packing=False,
                    callbacks=[ProgressCallback(self.progress, round_steps)],
                )
                
                # Train this round
                trainer.train()
                
                # Evaluate
                if local_rank == 0:
                    self.progress.update(status="evaluating", message="Evaluating...")
                    metrics = self.evaluate(max_samples=100)
                    acc = metrics["accuracy"]
                    em = metrics["exact_match"]
                    elapsed = (time.time() - start_time) / 60
                    
                    print(f"\n  📊 Round {round_num} ({elapsed:.1f}m): Acc={acc*100:.2f}% EM={em*100:.2f}%")
                    
                    self.progress.update(
                        accuracy=acc,
                        best_accuracy=max(best_acc, acc),
                        message=f"Round {round_num}: Acc={acc*100:.1f}%",
                    )
                    
                    if acc > best_acc:
                        best_acc = acc
                        best_dir = self._save_adapter(self.output_dir / "best_adapter")
                        print(f"  🏆 New best! Saved to {best_dir}")
                    
                    if acc >= cfg["target_accuracy"]:
                        print(f"\n🎯 Target achieved! {acc*100:.2f}% >= {cfg['target_accuracy']*100:.0f}%")
                        break
                
                # Cleanup
                gc.collect()
                torch.cuda.empty_cache()
            
            # ─── Save Adapter ──────────────────────────────────────────
            if local_rank == 0:
                adapter_dir = self._save_adapter(self.output_dir / "adapter")
                print(f"\n  💾 Adapter saved to {adapter_dir}")
            
            # ─── Export to GGUF ────────────────────────────────────────
            if local_rank == 0 and not self._stop_requested:
                self._export_gguf()
            
            if local_rank == 0:
                total_time = (time.time() - start_time) / 60
                self.progress.update(
                    status="done",
                    best_accuracy=best_acc,
                    message=f"Training complete in {total_time:.1f}m. Best acc: {best_acc*100:.2f}%",
                )
                print(f"\n{'='*50}")
                print(f"  ✅ Training complete in {total_time:.1f}m")
                print(f"  Best accuracy: {best_acc*100:.2f}%")
                print(f"{'='*50}")
            
            return True
            
        except Exception as e:
            import traceback
            error_msg = f"{type(e).__name__}: {str(e)}"
            traceback.print_exc()
            with open("/tmp/trainer_error.txt", "w") as f:
                f.write(f"❌ Training error: {error_msg}\n\n")
                traceback.print_exc(file=f)
            print(f"\n  ❌ Training error written to /tmp/trainer_error.txt")

            # Emergency adapter snapshot — leave a loadable adapter behind even
            # on an unexpected crash, so no separate recovery script is needed.
            try:
                if local_rank == 0 and self.model is not None:
                    em_dir = self._save_adapter(self.output_dir / "adapter_emergency")
                    print(f"  💾 Emergency adapter snapshot saved to {em_dir}")
            except Exception:
                pass

            self.progress.update(status="error", error=error_msg)
            return False

    def _save_adapter(self, target: str):
        """Save the LoRA adapter + tokenizer via save_pretrained.

        This is the crash-safe save path — unlike HF Trainer checkpoint saving,
        it never pickles the SFTConfig, so it cannot hit the unsloth class-swap
        PicklingError. Used for best_adapter, the final adapter, and the
        emergency snapshot.
        """
        target = Path(target)
        target.mkdir(parents=True, exist_ok=True)
        self.model.save_pretrained(str(target))
        if self.tokenizer is not None:
            self.tokenizer.save_pretrained(str(target))
        return target

    def _export_gguf(self):
        """Export trained model to GGUF format."""
        cfg = self.config
        gguf_quant = cfg.get("gguf_quantization", "q4_k_m")
        
        self.progress.update(status="exporting", message="Exporting to GGUF...")
        print(f"\n{'='*50}")
        print(f"  🔄 Exporting to GGUF ({gguf_quant})...")
        print(f"{'='*50}")
        
        # Save merged model
        merged_dir = self.output_dir / "merged_model"
        merged_dir.mkdir(exist_ok=True)
        print(f"  Saving merged model...")
        
        quant_method = gguf_quant
        if gguf_quant == "f16":
            quant_method = "f16"
        
        self.model.save_pretrained_gguf(
            str(self.output_dir),
            self.tokenizer,
            quantization_method=quant_method,
        )
        
        print(f"  ✅ GGUF export complete!")
        
        # List output files
        gguf_files = list(self.output_dir.glob("*.gguf"))
        if gguf_files:
            for f in gguf_files:
                size_gb = f.stat().st_size / (1024**3)
                print(f"  📁 {f.name}: {size_gb:.2f} GB")
        
        self.progress.update(
            status="done",
            message=f"GGUF model exported to {self.output_dir}",
        )
