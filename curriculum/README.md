# curriculum — the self-improvement pipeline (standalone, app-agnostic)

Turns *any* application's docs + source into a fine-tune loop:

```
corpus ──▶ DICTIONARY ──▶ TIERED TESTS ──▶ VALIDATE ──▶ EVAL STUDENT ──▶ DATASET ──▶ QLoRA
(qwen3.6 reads   (topics+facts)   (tier 1 super    (structure,   (test the real    ({instruction,   (GUITrainer,
 the app)                         easy → tier 5     dedupe,       tuned model,       input, output,   round-5
                                  extremely         teacher-judge) judge pass/fail)  source})         pattern)
                                  complex)
```

- **Teacher** = a powerful local model (`qwen3.6:27b-q4_K_M` on Ollama :11434)
  that reads the app, writes the dictionary, generates the difficulty ladder,
  validates tests, and grades answers.
- **Student** = the model being tested + fine-tuned (the tuned
  `qwen2.5-7b-instruct-uncensored-dspark` on :8000).
- Call patterns are the *proven* ones from the round-8 dataset builder and the
  round-5 QLoRA launcher — no new integrations.

## Run (VACA, the default config)

```bash
python3 curriculum/curriculum.py plan          # what will the corpus scan produce
python3 curriculum/curriculum.py dictionary    # stage 1 — teacher reads every chunk
python3 curriculum/curriculum.py tests         # stage 2 — laddered tests per topic
python3 curriculum/curriculum.py validate      # stage 3 — keep only good tests
python3 curriculum/curriculum.py eval          # stage 4 — test the student, per-tier report
python3 curriculum/curriculum.py dataset       # stage 5 — fine-tune rows
python3 curriculum/curriculum.py train-script  # writes launch-curriculum-round.py (does NOT train)
```

`python3 curriculum/curriculum.py all --limit-chunks 8 --max-topics 5 --limit 8`
runs a small end-to-end smoke.

Every stage is **resumable**: re-run it and it only does the unfinished work.

## Use it on ANOTHER app

1. Copy `config.yaml`, point `app.corpus` at the other app's docs + source
   (files and/or dirs), set `app.name`.
2. Optionally change `teacher.model` / `student.model`.
3. Run the same commands. Nothing is VACA-specific in the pipeline itself.

## Train

`train-script` emits `out/launch-curriculum-round.py` mirroring the proven
round-5 launcher (GUITrainer, 4-bit, GGUF export, 15% retention mix from
`round8-code.jsonl`). Training is deliberately manual — it pins both GPUs for
hours. Stop the serving model first (`bash scripts/start-dspark.sh --stop`).

## Anti-collapse guardrails (built in)

- **External validation**: every test is teacher-judged against the
  dictionary facts before it may enter the dataset (stage 3) — unanswerable or
  wrong tests are dropped, answers corrected.
- **Dedup**: normalized-question dedupe at validation, plus row-id dedupe at
  dataset build.
- **Tiered sourcing**: dataset rows carry `tier` in the source field, so a
  later round can balance easy/hard instead of skewing easy (the classic
  "all passes are easy" trap).
- **Retention mix**: the launch script mixes 15% of round8-code.jsonl so a
  curriculum round can't regress prior capability.
