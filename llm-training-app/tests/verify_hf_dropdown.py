#!/usr/bin/env python3
"""Verify the '+ Add HF repo id' dropdown entry against the real app code.

Builds the actual LLMTrainingStudio UI and drives the real handlers. The only thing
stubbed is the modal text prompt (tkinter.simpledialog.askstring) — the method under
test, `_ask_hf_repo_id`, always runs for real.

metadata.json is backed up and restored, so this cannot alter the app's saved state.
Run from llm-training-app/ with a display available:
    DISPLAY=:0 ./.venv/bin/python tests/verify_hf_dropdown.py

Needs network: the repo-id guard calls HfApi().model_info(), and two cases assert on
real repos. Offline, the 404 case cannot be distinguished from a connection error.
"""
import os
import shutil
import sys

sys.path.insert(0, os.getcwd())
import tkinter.simpledialog as sd

import engine as E

SRC = str(E.METADATA_FILE)
BACKUP = "/tmp/metadata-backup.json"
HAD = os.path.exists(SRC)
if HAD:
    shutil.copy2(SRC, BACKUP)
print(f"metadata: {SRC}  (backed up: {HAD})")

import app as A

# Modal dialogs would block a headless run — report them instead.
DIALOGS = []
A.messagebox.showerror = lambda *a, **k: DIALOGS.append(a[1] if len(a) > 1 else a)

fails = []
REAL_REPO = "allenai/OLMoE-1B-7B-0924"


def check(label, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}{'' if ok else '   <-- ' + str(detail)}")
    if not ok:
        fails.append(label)


def type_into_dialog(text):
    """Pretend the user typed `text` into the prompt (None == cancelled)."""
    sd.askstring = lambda *a, _t=text, **k: _t


print("\n== building the real UI ==")
studio = A.LLMTrainingStudio()
vals = list(studio.model_dropdown.cget("values"))
print(f"  dropdown: {vals}")
check("sentinel present in dropdown", A.HF_ADD_ENTRY in vals)
check("sentinel is not the default selection", studio.model_var.get() != A.HF_ADD_ENTRY,
      studio.model_var.get())

print("\n== add an HF repo id (real _on_model_pick + real _ask_hf_repo_id) ==")
studio.model_var.set("simulated")
type_into_dialog(REAL_REPO)
studio._on_model_pick(A.HF_ADD_ENTRY)
check("stored in engine.settings", REAL_REPO in studio.engine.settings.get("hf_models", []),
      studio.engine.settings.get("hf_models"))
check("selected value is hf/<id>", studio.model_var.get() == f"hf/{REAL_REPO}",
      studio.model_var.get())
check("appears in dropdown values",
      f"hf/{REAL_REPO}" in list(studio.model_dropdown.cget("values")))

# Exactly what app.start_training() does with the selection.
raw = studio.model_var.get()
use_ollama = raw.startswith("ollama/")
model_name = raw.split("/", 1)[1] if "/" in raw else raw
print(f"  start_training would send: model_name={model_name!r} use_ollama={use_ollama}")
check("engine receives the unmodified HF repo id",
      model_name == REAL_REPO and not use_ollama, model_name)

print("\n== cancelling the dialog leaves no fake model selected ==")
studio.model_var.set(A.HF_ADD_ENTRY)
type_into_dialog(None)
studio._on_model_pick(A.HF_ADD_ENTRY)
check("sentinel not left selected", studio.model_var.get() != A.HF_ADD_ENTRY,
      studio.model_var.get())

print("\n== repo-id validation (real _ask_hf_repo_id) ==")
cases = [
    # typed value                                  expected return
    ("Qwen/Qwen2.5-Coder-7B-Instruct",             "Qwen/Qwen2.5-Coder-7B-Instruct"),
    ("hf/openai-community/gpt2",                   "openai-community/gpt2"),
    ("openai-community/gpt2",                      "openai-community/gpt2"),
    ("  openai-community/gpt2/  ",                 "openai-community/gpt2"),
    ("a/b/c",                                      None),
    ("has space",                                  None),
    ("",                                           None),
    ("/",                                          None),
    ("no-such-org-xyz123/no-such-model-xyz123",    None),   # 404 guard
]
for typed, want in cases:
    type_into_dialog(typed)
    got = studio._ask_hf_repo_id()
    check(f"{typed!r} -> {got!r}", got == want, f"want {want!r}")

check("404 repo was never added to settings",
      "no-such-org-xyz123/no-such-model-xyz123" not in studio.engine.settings.get("hf_models", []))
# An error dialog is raised for each rejected id: 'a/b/c', 'has space', '/' and the 404.
# A cancelled prompt ('') returns early and must stay silent.
check("error dialogs raised only for the rejected ids", len(DIALOGS) == 4, len(DIALOGS))

print("\n== persistence across a restart ==")
studio.root.destroy()
fresh = E.Engine()
check("a new Engine() reloads hf_models from metadata.json",
      REAL_REPO in fresh.settings.get("hf_models", []), fresh.settings.get("hf_models"))

if HAD:
    shutil.copy2(BACKUP, SRC)
    print(f"\nmetadata.json restored ({SRC})")
print("\nRESULT:", "ALL PASSED" if not fails else f"{len(fails)} FAILED: {fails}")
sys.exit(1 if fails else 0)
