# vacalatest — the training dataset, generated from the live VACA build

Every dataset row in this project is produced from the VACA source tree that is
on disk **right now**. Nothing is inherited, remembered, or hand-typed from a
doc: `extract.mjs` imports the real TypeScript modules, and the build refuses to
run if an export it depends on has moved. That is what makes the "latest build"
guarantee real instead of aspirational.

## What it produces

`training/dataset/` — the canonical dataset home the rest of the repo already uses:

| File | Rows | What it teaches |
|---|---:|---|
| `how-vaca-works.jsonl` | 64 | the running system: node types, mounted `/api` routes, shipped blueprints, how a language is chosen, how output is gated, the dependency rule |
| `languages.jsonl` | 39 | per language: VACA's exact code contract, its extensions and gate toolchain, and a **verified** exemplar program |
| `train.jsonl` / `val.jsonl` / `test.jsonl` | 85 / 9 / 9 | the two corpora combined and split (80/10/10, seed 42) |
| `dataset_meta.json` | — | which build it came from: git rev + a SHA-256 of every source file it was generated from |
| `language-gaps.jsonl` | — | the corrected answer for each language the probed model failed |

Row shape is the repo convention: `{instruction, input, output, source}`, where
`source` is the repo-relative file (plus symbol) the row was derived from — so
every row is traceable to a real line of the build.

## The language surface (read out of the live source, not a doc)

VACA's authoritative language declaration is
`backend/src/ai/languageInference.ts` → `SUPPORTED_CODING_LANGUAGES`:

**13 coding languages** — typescript, javascript, python, go, rust, java, csharp,
swift, kotlin, php, ruby, cpp, c

**17 natural formats** — html, css, sql, json, yaml, yml, xml, md, txt, sh, bash,
dockerfile, env, ini, toml, csv, svg

Language selection is by **app domain first**, not by OS
(`inferLanguageForGoal`): an explicitly named language wins; otherwise web and
CLI goals become `typescript` (the pipeline supports it end to end — tsc gate,
esbuild preview, TS scaffold); only a genuinely native target falls back to the
OS map (`linux→go`, `windows→csharp`, `mac/ios→swift`, `android→kotlin`).

Verification is split: TypeScript goes through the tsc gate, and the other 12 go
through `backend/src/sandbox/nonTsCompileGate.ts`, which stages the whole project
and runs the real toolchain. That module states the rule this project applies to
model output too: **an unavailable toolchain is a FAILED gate — "unverified" is
never "clean".**

## Commands

```bash
python3 training/vacalatest/build.py              # rebuild the dataset from the live source
python3 training/vacalatest/build.py --dry-run    # report row counts, write nothing
python3 training/vacalatest/verify.py             # integrity + staleness checks
python3 training/vacalatest/verify_exemplars.py   # gate + RUN every exemplar
python3 training/vacalatest/probe.py              # ask the LLM to write each language

# The two below need the app's venv (real tokenizer):
V=llm-training-app/.venv/bin/python
$V training/vacalatest/shard_for_app.py                 # shard to the loader's token budget
$V training/vacalatest/install_into_app.py --dir app-shards
```

## Why the dataset is sharded before it reaches the studio

The app does **not** train on a whole uploaded file. `engine.py` chains:

```
_file_to_text_mmap()   -> parse_file(max_bytes=16384)          16 KB
text = text[:8192]     -> StreamedTextDataset                   8 KB
tokenizer(..., truncation=True, max_length=max_length - 1)     ~511 tokens
```

The truncation happens **before** chunking, so every uploaded file contributes
exactly one ~511-token sample no matter how large it is. Measured on the real
tokenizer, the 5 assembled corpora (23,700 tokens of content) delivered
2,555 tokens to the trainer — **~89% of the dataset was silently discarded.**

`shard_for_app.py` fixes this on the data side, without touching the app: keep
every output file under 511 tokens and the whole file is then absorbed. Result:
75 shards, **30,884 tokens reaching the trainer (100% of content)** — 12x more
signal. `MAX_FILES_IN_MEMORY = 2000` x 511 gives an effective ceiling of ~1.0M
tokens.

The script refuses to write if sharding would lose content, and re-checks every
shard through the loader's real truncation chain before reporting success.

`verify.py` includes a **staleness check**: it re-runs the extractor and compares
fingerprints against `dataset_meta.json`. If VACA's source has changed since the
build, verification fails — a stale dataset cannot be mistaken for a current one.

## The exemplars

`exemplars/<language>/` holds one small program per coding language: read all of
stdin, print `words=<count> distinct=<distinct>`. They are the generation ground
truth, so they are held to a real standard — `verify_exemplars.py` compiles each
one with the toolchain VACA's gate uses **and runs it**, comparing output exactly.
A syntactically valid but wrong program cannot pass as ground truth.

They also deliberately encode the traps `languageGuidance.ts` warns about — no
`@main` in `main.swift`, no `System.console()` in Java, no `<stdbool.h>`-less
`bool` in C, no `.characters` in Swift, no guessed `github.com/...` in Go, no
`bits/stdc++.h` in C++ — and the verifier checks for those, ignoring them when
they appear only in the explanatory comments.

## The probe

`probe.py` asks a model to write each language **under the exact conditions VACA
generates under** — the same task plus the same `languageGuidanceBlock()` VACA
injects — then gates and runs the result:

- `KNOWN` — compiled, ran, produced the right output, no contract violation
- `PARTIAL` — compiled but wrong, unrunnable, or broke the contract
- `UNKNOWN` — did not compile
- `UNVERIFIABLE` — the toolchain is not installed on this machine

Two models are probed by default: `vaca-r20-q4` (the fine-tuned model VACA
ships) and `qwen2.5-coder:14b` (its base), which separates "the fine-tune broke
it" from "the base never knew it". Results land in
`reports/language-probe.json`, and every non-`KNOWN` language becomes a row in
`training/dataset/language-gaps.jsonl` whose answer is the verified exemplar.

## Extending it

Add a language by adding one file under `exemplars/<language>/`. If
`SUPPORTED_CODING_LANGUAGES` gains a language and it has no exemplar,
`verify_exemplars.py` reports `MISSING` rather than silently skipping it.
