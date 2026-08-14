#!/usr/bin/env python3
"""
Kaggle run-cell test (single-GPU, ROUNDS=1)
============================================
Guards the v6 run-cell design in scripts/build-kaggle-notebook.py.

HARD LESSON (2026-08-01): torchrun DDP is UNRELIABLE on this Kaggle account —
the node reports 2 T4s (torch.cuda.device_count()==2) but the session only
GRANTS 1 usable GPU to the training subprocess, so torchrun rank 1 died with
'invalid device ordinal' during model load. This failed identically across
hardcoded torchrun, count-based adaptive, AND probe-based adaptive launches.
Therefore v6 ALWAYS runs plain single-GPU python, one round per run (ROUNDS=1)
to stay under Kaggle's 12 h cap.

Builds all four kernel modes fresh (scripts/build-kaggle-notebook.py) and
simulates each notebook's run cell with a mocked torch, asserting:
  - the launch is ALWAYS plain python: cmd[0] == sys.executable, and the cell
    source contains NO 'torchrun' / '--nproc_per_node' / GPU probe
  - ROUNDS=1 (--rounds '1') — one round per run
  - CPU-only (torch.cuda.is_available() False) → clear 'GPU' abort BEFORE
    launching anything; Step 1 carries the same clear 'No GPU detected' assert
  - per-variant args:
      rounds12 → --start-round 1 / --lr 2e-4   / NO --load-adapter
      round2   → --start-round 2 / --lr 1e-4   / --load-adapter /kaggle/working/adapter
      rounds34 → --start-round 3 / --lr 5e-5   / --load-adapter /kaggle/working/adapter
      round4   → --start-round 4 / --lr 2.5e-5 / --load-adapter /kaggle/working/adapter
  - common args: --dataset /kaggle/working/dataset/train.jsonl, --out-dir,
    --epochs 2, --max-seq-length 2048

Usage:
    python3 tests/test-kaggle-adaptive-run-cell.py
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KAGGLE_DIR = ROOT / "training" / "cloud" / "kaggle"

# Per-variant expected command args (guards the builder's mode-aware logic)
SPECS = {
    "train_rounds12_kaggle.ipynb": {
        "start_round": "1", "lr": "2e-4", "load_adapter": False,
    },
    "train_round2_kaggle.ipynb": {
        "start_round": "2", "lr": "1e-4", "load_adapter": True,
    },
    "train_rounds34_kaggle.ipynb": {
        "start_round": "3", "lr": "5e-5", "load_adapter": True,
    },
    "train_round4_kaggle.ipynb": {
        "start_round": "4", "lr": "2.5e-5", "load_adapter": True,
    },
}


def extract_run_cell(nb: dict) -> str:
    for c in nb["cells"]:
        if c["cell_type"] != "code":
            continue
        s = "".join(c.get("source", []))
        if "ROUNDS = 1" in s and "subprocess.run" in s and "base = ['train_round1.py'" in s:
            return s
    raise AssertionError("run cell not found")


def extract_step1(nb: dict) -> str:
    """The Step 1 GPU-check cell (the early-fail guard for CPU-only)."""
    for c in nb["cells"]:
        if c["cell_type"] != "code":
            continue
        s = "".join(c.get("source", []))
        if "assert torch.cuda.is_available()" in s:
            return s
    raise AssertionError("Step 1 GPU-check cell not found")


def simulate(src: str, cuda_ok: bool = True):
    """Exec the run cell with torch mocked so is_available()==cuda_ok.

    Returns (cmd, err): cmd is the constructed launch command (None if the
    cell aborted via assert), err is the AssertionError message (None if it
    launched). A CPU-only session (cuda_ok=False) must abort with a clear
    'GPU' message BEFORE building/launching any command.
    """
    # Drop the `import subprocess, sys, torch` line (we inject mocks), and
    # replace the trailing subprocess.run() with a capture of `cmd`.
    lines = [l for l in src.splitlines() if not l.lstrip().startswith("import ")]
    body = "\n".join(lines) + "\ncaptured = cmd"

    class _Cuda:
        def __init__(self, available):
            self._available = available

        def is_available(self):
            return self._available

    class _Torch:
        def __init__(self, available):
            self.cuda = _Cuda(available)

    ns = {
        "torch": _Torch(cuda_ok),
        "sys": sys,
        "subprocess": type("S", (), {"run": lambda *a, **k: None})(),
        # The run cell also does `import os, subprocess, sys, torch` on one line;
        # the strip-all-imports filter above drops `os` too, so provide it here
        # (the cell legitimately uses os.environ to pin CUDA_VISIBLE_DEVICES).
        "os": __import__("os"),
    }
    try:
        exec(compile(body, "<run-cell>", "exec"), ns)
        return ns["captured"], None
    except AssertionError as e:
        return None, str(e)


def has_flag(cmd: list, flag: str, value: str) -> bool:
    return flag in cmd and cmd[cmd.index(flag) + 1] == value


def main() -> int:
    # 1. rebuild all kernel modes fresh so the test reflects the current builder
    subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "build-kaggle-notebook.py")],
        cwd=ROOT, check=True,
    )

    fails = 0
    for name, spec in SPECS.items():
        nb = json.loads((KAGGLE_DIR / name).read_text())
        src = extract_run_cell(nb)

        # v6 design invariants: plain python only, no torchrun, no probe.
        # NB: the bare word 'torchrun' appears in the cell's explanatory
        # comment ("why we DON'T use it"), so ban the COMMAND form
        # "['torchrun'" plus the DDP machinery, not the word itself.
        assert "subprocess.run" in src, "run cell must launch via subprocess"
        assert "ROUNDS = 1" in src, "run cell must default to one round per run"
        assert "torch.cuda.is_available()" in src, "run cell must guard CPU-only sessions"
        for banned in ("['torchrun'", "--nproc_per_node", "n_usable", "torch.zeros"):
            assert banned not in src, f"run cell must NOT contain '{banned}' (single-GPU only)"

        # Step 1 must fail a CPU-only session with a clear message (early)
        step1 = extract_step1(nb)
        ok = "No GPU detected" in step1
        print(f"  {'PASS' if ok else 'FAIL'}  {name}  Step 1 has clear 'No GPU detected' assert")
        if not ok:
            fails += 1

        # GPU-present → plain python (never torchrun); CPU-only → clear abort
        cmd, err = simulate(src, cuda_ok=True)
        is_plain = bool(cmd) and cmd[0] == sys.executable and "torchrun" not in cmd
        print(f"  {'PASS' if is_plain else 'FAIL'}  {name}  GPU present → "
              f"plain python (no torchrun)  cmd: {' '.join(cmd or [])[:96]}")
        if not is_plain:
            fails += 1

        cmd, err = simulate(src, cuda_ok=False)
        ok = cmd is None and err is not None and "GPU" in err
        print(f"  {'PASS' if ok else 'FAIL'}  {name}  CPU-only → clear abort, "
              f"no launch (msg: {(err or 'none')[:60]})")
        if not ok:
            fails += 1

        # mode-aware args (on the GPU-present command)
        cmd, _ = simulate(src, cuda_ok=True)
        assert cmd is not None, "GPU-present simulation must produce a command"
        checks = [
            ("--start-round", has_flag(cmd, "--start-round", spec["start_round"]),
             f"--start-round {spec['start_round']}"),
            ("--lr", has_flag(cmd, "--lr", spec["lr"]), f"--lr {spec['lr']}"),
            ("--load-adapter", ("--load-adapter" in cmd) == spec["load_adapter"],
             f"--load-adapter present={spec['load_adapter']}"),
        ]
        for label, ok, detail in checks:
            print(f"  {'PASS' if ok else 'FAIL'}  {name}  arg {label} ({detail})")
            if not ok:
                fails += 1
        if spec["load_adapter"] and "/kaggle/working/adapter" not in cmd:
            print(f"  FAIL  {name}  --load-adapter must point at /kaggle/working/adapter")
            fails += 1

        # common args present in every variant (ROUNDS=1 → --rounds '1')
        for flag, val in (("--dataset", "/kaggle/working/dataset/train.jsonl"),
                          ("--out-dir", "/kaggle/working/out"),
                          ("--rounds", "1"),
                          ("--epochs", "2"),
                          ("--max-seq-length", "2048")):
            if not has_flag(cmd, flag, val):
                print(f"  FAIL  {name}  missing {flag} {val}")
                fails += 1

    print("✅ Kaggle run-cell checks passed for all 4 modes"
          if fails == 0 else f"❌ {fails} check(s) failed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
