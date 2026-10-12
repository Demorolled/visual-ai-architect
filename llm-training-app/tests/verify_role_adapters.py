#!/usr/bin/env python3
"""End-to-end check of training/roles/train_roles.py, using a tiny local MoE as the base.

Verifies, without a 13 GB download:
  * four roles train sequentially, one adapter per role, none overwriting another
  * each adapter is registered so the GUI lists it as local/<output_name>
  * because the base is a MoE, LoRA is retargeted to all-linear and the saved adapter
    actually contains expert-layer weights (engine._detect_moe + the all-linear path)

Engine data dirs are redirected to a temp directory, so the app's real state is untouched.
"""
import contextlib
import io
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
ROOT = APP.parent
sys.path.insert(0, str(APP))

import torch  # noqa: E402
from transformers import AutoTokenizer  # noqa: E402

import engine as E  # noqa: E402

fails = []


def check(label, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}{'' if ok else '   <-- ' + str(detail)}")
    if not ok:
        fails.append(label)


TMP = Path(tempfile.mkdtemp(prefix="role-adapters-"))
print(f"scratch dir: {TMP}")

# ── redirect the engine's storage so the real app state is never touched ──────
for sub in ("uploads", "models", "exports", "categories", "experiments"):
    (TMP / sub).mkdir(parents=True, exist_ok=True)
E.DATA_DIR = TMP
E.UPLOADS_DIR = TMP / "uploads"
E.MODELS_DIR = TMP / "models"
E.EXPORTS_DIR = TMP / "exports"
E.CATEGORIES_DIR = TMP / "categories"
E.EXPERIMENTS_DIR = TMP / "experiments"
E.METADATA_FILE = TMP / "metadata.json"

# ── a tiny local MoE, with a real tokenizer taken from the OLMoE download ────
print("\n== building a tiny local MoE base ==")
snaps = sorted(Path.home().glob(
    ".cache/huggingface/hub/models--allenai--OLMoE-1B-7B-0924/snapshots/*"))
tok_src = str(snaps[0]) if snaps else "gpt2"
tok = AutoTokenizer.from_pretrained(tok_src)
VOCAB = len(tok)

from transformers import AutoConfig, AutoModelForCausalLM  # noqa: E402

BASE = TMP / "tiny-moe-base"
made = None
for config_cls, kwargs in [
    ("OlmoEConfig", dict(hidden_size=32, intermediate_size=64, num_hidden_layers=2,
                         num_attention_heads=2, num_key_value_heads=1, num_experts=4,
                         num_experts_per_tok=2, moe_intermediate_size=16)),
    ("Qwen2MoeConfig", dict(hidden_size=32, intermediate_size=64, num_hidden_layers=2,
                            num_attention_heads=2, num_key_value_heads=1, num_experts=4,
                            num_experts_per_tok=2, moe_intermediate_size=16)),
    ("MixtralConfig", dict(hidden_size=32, intermediate_size=64, num_hidden_layers=2,
                           num_attention_heads=2, num_key_value_heads=1,
                           num_local_experts=4, num_experts_per_tok=2)),
]:
    try:
        cls = getattr(__import__("transformers", fromlist=[config_cls]), config_cls)
        cfg = cls(vocab_size=VOCAB, max_position_embeddings=1024, **kwargs)
        model = AutoModelForCausalLM.from_config(cfg)
        model.save_pretrained(str(BASE))
        tok.save_pretrained(str(BASE))
        made = config_cls
        break
    except Exception as exc:  # try the next architecture
        print(f"  {config_cls} unavailable: {type(exc).__name__}: {exc}")

if made is None:
    print("FAILED: no MoE architecture could be built")
    sys.exit(1)
real_cfg = AutoConfig.from_pretrained(str(BASE))
print(f"  base built with {made}: model_type={real_cfg.model_type!r}, "
      f"params={sum(p.numel() for p in model.parameters()) / 1e3:.0f}K")
check("engine._detect_moe recognises the base config",
      E.Engine._detect_moe(real_cfg) is True)

# ── tiny per-role data + a roles file reusing the real role names ────────────
ROLE_NAMES = ["reasoning", "codeGeneration", "guiBuild", "fastChat"]
data_dir = TMP / "role-data"
data_dir.mkdir()
FILES_PER_ROLE = 16
for name in ROLE_NAMES:
    # StreamingTextDataset tokenizes each file with truncation to max_length-1, so one
    # file yields exactly ONE training chunk whatever its size. The engine also
    # auto-scales batch_size (5-8 on this GPU) and the loader uses drop_last=True, so a
    # role needs more files than the batch size or it produces zero batches and an
    # untrained adapter. Hence 16 small files rather than 1 big one.
    for i in range(FILES_PER_ROLE):
        rows = [{"instruction": f"{name} task {i}-{j}", "input": "",
                 "output": f"run a small verifiable {name} step and record what changed. " * 6}
                for j in range(3)]
        (data_dir / f"{name}-{i:02d}.jsonl").write_text(
            "\n".join(json.dumps(r) for r in rows) + "\n")

roles_file = TMP / "roles.json"
roles_file.write_text(json.dumps({
    "base_model": str(BASE),
    "epochs": 1, "learning_rate": 1e-4, "batch_size": 1,
    "gradient_accumulation_steps": 1, "max_length": 64, "use_mixed_precision": False,
    "roles": [{"role": n, "output_name": f"role-{n}",
               "data": sorted(str(p) for p in data_dir.glob(f"{n}-*.jsonl"))}
              for n in ROLE_NAMES],
}, indent=2))
print(f"\n  roles file: {roles_file}")

# ── run the real runner ─────────────────────────────────────────────────────
print("\n== running train_roles.py for all four roles ==")
sys.path.insert(0, str(ROOT / "training" / "roles"))
import train_roles  # noqa: E402

sys.argv = ["train_roles.py", "--roles-file", str(roles_file)]
log = io.StringIO()
with contextlib.redirect_stdout(log):
    rc = train_roles.main()
output = log.getvalue()
print(output)
check("train_roles.main() returned 0", rc == 0, rc)
steps = [ln.strip() for ln in output.splitlines() if "steps completed:" in ln]
check("every role ran at least one optimisation step",
      len(steps) == len(ROLE_NAMES)
      and all(int(s.split()[2].split("/")[0]) >= 1 for s in steps), steps)

# ── assertions ──────────────────────────────────────────────────────────────
print("\n== adapters on disk ==")
for name in ROLE_NAMES:
    d = E.EXPORTS_DIR / f"role-{name}"
    ok = (d / "adapter_config.json").exists() and (d / "adapter_model.safetensors").exists()
    check(f"adapter for {name} saved separately", ok, d)

sizes = {n: (E.EXPORTS_DIR / f"role-{n}" / "adapter_model.safetensors").stat().st_size
         for n in ROLE_NAMES
         if (E.EXPORTS_DIR / f"role-{n}" / "adapter_model.safetensors").exists()}
check("all four adapters exist and none is empty", len(sizes) == 4 and all(sizes.values()),
      sizes)

print("\n== LoRA retargeted at the experts (the MoE part) ==")
adapter_cfg = json.loads((E.EXPORTS_DIR / "role-reasoning" / "adapter_config.json").read_text())
targets = adapter_cfg.get("target_modules")
print(f"  target_modules in the saved adapter: {targets!r}")
# PEFT expands "all-linear" into the concrete module names when it saves, so assert on
# what those names actually cover rather than on the literal string.
check("adapter targets non-attention layers (MLP / experts)",
      isinstance(targets, list) and any("expert" in t or "mlp" in t for t in targets),
      targets)
check("adapter still targets all four attention projections",
      isinstance(targets, list) and all(
          any(t.endswith(p) for t in targets) for p in ("q_proj", "k_proj", "v_proj", "o_proj")),
      targets)

from safetensors import safe_open  # noqa: E402

keys = []
with safe_open(str(E.EXPORTS_DIR / "role-reasoning" / "adapter_model.safetensors"),
               framework="pt") as fh:
    keys = list(fh.keys())
expert_keys = [k for k in keys if "expert" in k.lower()]
print(f"  adapter tensors: {len(keys)}; mentioning an expert layer: {len(expert_keys)}")
if expert_keys:
    print(f"    e.g. {expert_keys[0]}")
check("saved adapter contains expert-layer weights", len(expert_keys) > 0, keys[:5])

print("\n== registered for the GUI dropdown ==")
eng = E.Engine()
names = sorted(m["name"] for m in eng.models.values())
print(f"  registered models: {names}")
for name in ROLE_NAMES:
    check(f"local/role-{name} registered",
          f"role-{name}" in names, names)

print(f"\nscratch dir kept for inspection: {TMP}")
print("RESULT:", "ALL PASSED" if not fails else f"{len(fails)} FAILED: {fails}")
sys.exit(1 if fails else 0)
