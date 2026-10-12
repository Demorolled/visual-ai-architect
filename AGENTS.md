# AGENTS.md — working rules for AI agents in this repo

Read this before starting work. It is short on purpose.

## Output budget (hard rule)

**The bug this guards:** on 2026-09-30 a single working session produced a
**21 MB** chat transcript — 24 messages, of which **8 AI messages were ~2.5 MB
each (99.8% of the file)**. The Freebuff client re-renders that transcript
whenever anything changes, so the screen stopped updating, clicks stopped
registering, and the client spun at ~93% CPU. The cause was not the codebase:
it was agents printing entire files, raw JSON blobs, and full library sections
into the transcript.

Everything an agent prints is stored forever and is re-rendered on every
update. Bloat is not free.

### Rules

1. **Cap every command's output.** Pipe anything that could be large through
   the helper:
   ```bash
   some-command | scripts/cap.sh          # 40 head lines, 10 tail lines, ~6 KB
   some-command | scripts/cap.sh 20 5     # tighter
   ```
2. **Never print a whole file.** `cat`, `head -1000`, and dumping source into
   the transcript are all forbidden when a summary answers the question.
3. **Summarise structured data, don't dump it.** For JSON/JSONL print the
   byte size, the top-level keys, counts, and at most ~3 sample items:
   ```bash
   python3 -c "import json;d=json.load(open('x.json'));print(len(d), list(d)[:8])"
   ```
   Never print full rows of a corpus, dataset, or manifest.
4. **Measure before you look.** `wc -l`, `wc -c`, `--stat`, `-l` and `-c`
   flags cost nothing; a 3 MB dump costs a lot.
5. **Logs: extract, don't paste.** Show only failing tests, lines matching
   `error|fail|ERROR|Traceback`, or a `tail`. Never a full build/test log.
6. **Diffs: prefer `--stat`.** Show full hunks only for the specific change
   being discussed, and only a few lines of context.
7. **Write findings as prose, not as evidence dumps.** The user needs the
   conclusion and the numbers that support it, not the raw payload.

### If output must be large

Write it to a file under `training/selfplay/logs/` or `/tmp`, then report the
**path, size, and a small summary** instead of the contents.

## Reporting style

- State the conclusion first, then the supporting numbers.
- Tables and counts over raw dumps.
- If a command produced a lot of output, say what it contained in one line
  rather than showing it.

## Repo conventions worth knowing

- Tests live next to their source as `*.test.ts` (Vitest); backend is strict
  TypeScript ESM (relative imports need `.js` extensions).
- Comments in this codebase explain **the bug a line guards** — follow that
  habit.
- `NEXT_SESSION.md` and `LLM_ORIENTATION.md` are the reliable orientation
  docs; the root `README.md` is thin and partly stale.
