VACA QLoRA Colab bundle
========================

Contents:
  1. train_vaca_colab.ipynb  — the self-contained 4-round trainer notebook
  2. campaign50-dataset.zip  — the dataset (2.1 MB, flat layout)

How to run (free T4):
  1. Open https://colab.research.google.com  →  File → Upload notebook
     → pick train_vaca_colab.ipynb
  2. Runtime → Change runtime type → **T4 GPU**
  3. Step 3 (config): leave MODE="rounds12". On FREE tier set ROUNDS = 1
     (a full 2-round run can exceed the ~12 h free-session cap).
  4. Step 4 (dataset): the notebook looks for campaign50-dataset.zip on
     Google Drive first; if not found it prompts you to upload —
     upload the campaign50-dataset.zip from this bundle.
  5. Run all cells in order. Step 7 trains; Step 8 zips results.
     Download /content/out/results.zip from the left files panel.

Expected: ~8-12 h per round on 1x T4. Each round saves its own adapter,
so a killed session can resume (set MODE round2 / rounds34 + ROUNDS=1).

SMOKE TEST (verify the pipeline in ~15 min, before committing to a full run):
  After Step 4 has extracted the dataset (and after Step 6 writes the
  trainer), run this in a scratch cell to shrink train.jsonl:
      import pathlib
      rows = pathlib.Path('/content/dataset/train.jsonl').read_text().splitlines()
      pathlib.Path('/content/dataset/train.jsonl').write_text('\n'.join(rows[:40]) + '\n')
      print('sliced to', len(rows[:40]), 'rows')
  and edit Step 7 to `--epochs 1`. Then run the cells from Step 7 on —
  this confirms GPU, install, dataset, forward/backward pass and export
  work, in minutes.

  IMPORTANT: the slice overwrites train.jsonl IN PLACE for the rest of the
  session. Before the REAL run, re-run **Step 4** to re-extract the full
  zip (that restores all 3,297 train rows), revert Step 7 to `--epochs 2`,
  then run Step 7 with the full dataset + ROUNDS=1.

If Step 2 fails on `import torch, unsloth, trl`:
  Runtime → Change runtime type → pick a **Python 3.12** runtime and re-run
  from Step 2 (unsloth is picky about very new Python versions).
