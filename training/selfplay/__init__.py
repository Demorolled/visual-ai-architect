"""VACA self-play trainer (rebuilt).

Round-based loop that recreates the original "play → judge → bake rows →
QLoRA → redeploy" system:

    puzzle_trainer.py (student plays for rewards, anti-cheat graded)
          → judge.py (Gemma 4 12B audits the subjective slice + cheat checks)
          → orchestrator.py (compile corpus, run QLoRA, export, redeploy)
          → repeat

Topology: the AGENT (2× RTX 3060) trains the student; the SECOND box
(Gemma 4 12B) serves the judge over HTTP. See README.md.
"""

from .config import SelfPlayConfig, load_config, save_config

__all__ = ["SelfPlayConfig", "load_config", "save_config"]
