#!/usr/bin/env python3
"""Train one LoRA adapter per VACA band role, sequentially, using LLM Training Studio's trainer.

Roles come from training/roles/roles.json (see LLM_ORIENTATION.md for what each role is).
Each role trains on its own data, saves to its own adapter directory, and is then
registered with the studio so it appears in the model dropdown as `local/<output_name>`.

Use the app's virtualenv — it is the only interpreter with torch/transformers/peft:

    V=llm-training-app/.venv/bin/python
    $V training/roles/train_roles.py --dry-run      # validate roles.json + data paths
    $V training/roles/train_roles.py                # every role, in file order
    $V training/roles/train_roles.py --role guiBuild --role fastChat
    $V training/roles/train_roles.py --base Qwen/Qwen2.5-Coder-7B-Instruct

This is a sequential loop on purpose: LLM Training Studio holds one model at a time
(engine.start_training refuses a second run while training_active), and one 12 GB GPU
cannot hold several adapters' training at once anyway.
"""
import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
APP = ROOT / "llm-training-app"
sys.path.insert(0, str(APP))

import engine as E  # noqa: E402  (path set up above)


def load_roles_file(path: Path):
    cfg = json.loads(Path(path).read_text())
    roles = cfg.get("roles") or []
    if not roles:
        raise SystemExit(f"no roles defined in {path}")
    return cfg, roles


def resolve_data(role: dict):
    """Repo-relative or absolute paths for a role's data; every one must exist."""
    paths = []
    for rel in role.get("data", []):
        candidate = Path(rel)
        p = candidate if candidate.is_absolute() else (ROOT / rel)
        p = p.resolve()
        if not p.exists():
            raise SystemExit(f"role {role['role']!r}: missing data file {rel} (looked at {p})")
        paths.append(p)
    if not paths:
        raise SystemExit(f"role {role['role']!r}: no data listed")
    return paths


def count_rows(path: Path) -> int:
    try:
        if path.suffix.lower() in (".jsonl", ".csv", ".txt", ".md"):
            with path.open("rb") as fh:
                return sum(1 for _ in fh)
        return -1
    except OSError:
        return -1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--roles-file", default=str(Path(__file__).parent / "roles.json"))
    ap.add_argument("--role", action="append", default=[],
                    help="train only this role (repeatable); default is all of them")
    ap.add_argument("--base", default=None, help="override base_model from the roles file")
    ap.add_argument("--out-suffix", default="", help="suffix added to each output_name")
    ap.add_argument("--dry-run", action="store_true",
                    help="validate the roles file and data paths, train nothing")
    args = ap.parse_args()

    cfg, roles = load_roles_file(Path(args.roles_file))
    if args.role:
        wanted = set(args.role)
        known = {r["role"] for r in roles}
        unknown = wanted - known
        if unknown:
            raise SystemExit(f"unknown role(s): {sorted(unknown)}; known: {sorted(known)}")
        roles = [r for r in roles if r["role"] in wanted]

    base = args.base or cfg.get("base_model")
    if not base:
        raise SystemExit("no base model: set base_model in the roles file or pass --base")

    plan = []
    print(f"base model : {base}")
    print(f"roles file : {args.roles_file}")
    print(f"roles      : {len(roles)}")
    print("\nplan:")
    for r in roles:
        data = resolve_data(r)
        out_name = f"{r['output_name']}{args.out_suffix}"
        rows = sum(count_rows(p) for p in data)
        rel = ", ".join(str(p.relative_to(ROOT)) if ROOT in p.parents else str(p) for p in data)
        print(f"  {r['role']:16} -> exports/{out_name:24} {rows:>6} rows  [{rel}]")
        plan.append((r, data, out_name))

    if args.dry_run:
        print("\ndry run: roles file and every data path validated; nothing was trained.")
        return 0

    eng = E.Engine()
    if not E.HAS_REAL_TRAINING:
        raise SystemExit("this install cannot train for real — torch/transformers/peft missing")

    for role, data, out_name in plan:
        print(f"\n{'=' * 72}\nrole: {role['role']}  ->  {E.EXPORTS_DIR / out_name}\n{'=' * 72}")

        # Each role trains on only its own data: clear the queue first.
        eng.training_queue.clear()
        ingested = eng.ingest_files_batch(data)
        for item in ingested:
            fid = item.get("id") if isinstance(item, dict) else item
            if fid:
                eng.queue_add(file_id=fid)
        eng.save_metadata(force=True)
        print(f"  queued {len(eng.training_queue)} file(s)")
        if not eng.training_queue:
            raise SystemExit(f"role {role['role']}: nothing was ingested — refusing to train")

        config = {
            "model_name": base,
            "output_name": out_name,          # keeps each role's adapter separate
            "epochs": int(cfg.get("epochs", 2)),
            "learning_rate": float(cfg.get("learning_rate", 5e-5)),
            "batch_size": int(cfg.get("batch_size", 1)),
            "gradient_accumulation_steps": int(cfg.get("gradient_accumulation_steps", 8)),
            "max_length": int(cfg.get("max_length", 512)),
            "use_mixed_precision": bool(cfg.get("use_mixed_precision", True)),
            "gpu_devices": list(eng.settings.get("gpu_devices", [])),
        }
        ok, msg = eng.start_training(config)
        if not ok:
            raise SystemExit(f"role {role['role']}: training refused — {msg}")

        last_step = -1
        while eng.training_active:
            time.sleep(10)
            if eng.current_step != last_step:
                last_step = eng.current_step
                print(f"    epoch {eng.current_epoch}  step {eng.current_step}/{eng.total_steps}"
                      f"  loss {eng.model_metrics.get('loss')}", flush=True)

        adapter_dir = E.EXPORTS_DIR / out_name
        print(f"  steps completed: {eng.current_step}/{eng.total_steps}")
        if eng.current_step < 1:
            raise SystemExit(
                f"role {role['role']}: the loop completed 0 optimisation steps, so the "
                f"adapter would be untrained — refusing to keep it. Check the traceback "
                f"above (status={eng.training_status}).")
        if not (adapter_dir / "adapter_config.json").exists():
            raise SystemExit(f"role {role['role']}: no adapter at {adapter_dir} "
                             f"(status={eng.training_status})")
        print(f"  adapter saved: {adapter_dir}")

        entry = eng.ingest_model_folder(adapter_dir)
        if entry:
            print(f"  registered as: local/{entry['name']}  (model id {entry['id'][:8]})")

    print(f"\nall {len(plan)} role(s) trained. Adapters are in {E.EXPORTS_DIR}.")
    print("They are now selectable in LLM Training Studio as local/<output_name>.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
