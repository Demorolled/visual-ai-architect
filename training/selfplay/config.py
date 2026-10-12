"""Self-play configuration — endpoints, paths, and per-round parameters.

Stdlib only. The saved file is ``training/selfplay/selfplay.json`` so a run is
reproducible and editable without touching code.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

# training/selfplay/config.py → repo root is parents[2]
ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = Path(__file__).resolve().parent / "selfplay.json"


@dataclass
class Endpoints:
    """OpenAI-compatible endpoints. Nothing here is required to be local."""

    # The student = the model being trained AND served for play.
    student_url: str = "http://127.0.0.1:8000/v1"
    student_model: str = "qwen2.5-coder-14b-uncensored-dspark"

    # The judge = Gemma 4 12B on the second box (fits a single 12 GB card).
    # Set to the second machine's address, e.g. http://192.168.1.234:11434/v1
    judge_url: str = "http://127.0.0.1:11434/v1"
    judge_model: str = "gemma4:12b"

    # Semantic RAG for reference retrieval (nomic-embed-text). Runs on CPU /
    # the 1660 Ti — never put it on the judge card. Empty = keyword ranking.
    embed_url: str = "http://127.0.0.1:11434"


@dataclass
class Paths:
    exports_dir: str = str(ROOT / "backend" / "exports")
    work_dir: str = str(ROOT / "training" / "selfplay" / "work")
    corpus_dir: str = str(ROOT / "training" / "selfplay" / "corpus")
    models_dir: str = str(ROOT / "training" / "selfplay" / "models")
    # Python with the training stack (unsloth/trl/peft/transformers/bnb/torch).
    train_python: str = str(ROOT / "llm-training-app" / ".venv" / "bin" / "python")
    puzzle_trainer: str = str(ROOT / "scripts" / "puzzle_trainer.py")
    # Optional seed corpus used for the anti-regression retention mix.
    retention_jsonl: str = str(ROOT / "kaggle_upload" / "train.jsonl")
    # VACA domain corpus (built by vaca_domain.py). Re-included every round so
    # the student keeps its model of VACA itself while self-play adds new skill.
    domain_jsonl: str = str(ROOT / "training" / "selfplay" / "corpus" / "vaca-domain.jsonl")


@dataclass
class RoundConfig:
    """One loop iteration: play N rounds, then one QLoRA round."""

    # ── play ──
    play_rounds: int = 40            # puzzle rounds per iteration
    nodes_per_puzzle: int = 5
    tuneup_pct: float = 0.5
    flow: str = "full"               # "full" (5-stage) | "classic"
    no_rag: bool = False

    # ── audit ──
    judge_sample: int = 25           # rows/iteration sent to the judge LLM
    judge_required: bool = False     # if True, a failed audit blocks training

    # ── train (14B QLoRA on 2× RTX 3060) ──
    base_model: str = "BlossomsAI/Qwen2.5-Coder-14B-Instruct-Uncensored"
    max_seq_length: int = 1024       # 12 GB/card safe ceiling; 2048+ risks OOM
    epochs: float = 2
    learning_rate: float = 5e-5
    batch_size: int = 1
    grad_accum: int = 4
    lora_r: int = 8
    lora_alpha: int = 16
    lora_dropout: float = 0.05
    n_gpu_layers_cap_gb: float = 10.5  # per-card budget handed to device_map

    # ── corpus ──
    retention_mix: float = 0.15      # fraction of retention_jsonl to keep
    domain_mix: float = 1.0          # fraction of the VACA domain corpus to keep
    val_frac: float = 0.05

    # ── deploy (optional shell hooks; empty = skip) ──
    export_cmd: str = ""             # e.g. "python3 scripts/build-r30-merged.py"
    redeploy_cmd: str = ""           # e.g. "bash scripts/deploy-round20.sh"
    # Acceptance-gate promotion (replaces the saturated gold-sim decision).
    # Empty = skip. e.g. "python3 scripts/promote-adapter.py --apply"
    promote_cmd: str = ""
    max_rounds: int = 1              # loop iterations (0 = run forever)


@dataclass
class SelfPlayConfig:
    endpoints: Endpoints = field(default_factory=Endpoints)
    paths: Paths = field(default_factory=Paths)
    round: RoundConfig = field(default_factory=RoundConfig)
    # Global round counter — bumped after each completed iteration.
    start_round: int = 1


def load_config(path: str | Path | None = None) -> SelfPlayConfig:
    """Load selfplay.json, filling any missing keys with defaults."""
    p = Path(path) if path else CONFIG_PATH
    cfg = SelfPlayConfig()
    if not p.exists():
        return cfg
    raw = json.loads(p.read_text(encoding="utf-8"))
    for section, cls in (("endpoints", Endpoints), ("paths", Paths), ("round", RoundConfig)):
        for k, v in (raw.get(section) or {}).items():
            if hasattr(getattr(cfg, section), k):
                setattr(getattr(cfg, section), k, v)
    if "start_round" in raw:
        cfg.start_round = int(raw["start_round"])
    return cfg


def save_config(cfg: SelfPlayConfig, path: str | Path | None = None) -> Path:
    p = Path(path) if path else CONFIG_PATH
    p.write_text(json.dumps(asdict(cfg), indent=2) + "\n", encoding="utf-8")
    return p
