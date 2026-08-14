# Build-Ladder e18 — Python Log Summary Tool

> **Build:** FAIL (recorded) · **Tier:** extreme · **Date:** 2026-08-09

## What it is

A python tool that parses a generated log (timestamps + levels), prints counts by hour,
and prints the most frequent error line.

## Why it broke

- Fresh generation: `SyntaxError: unterminated f-string` at line 34 — python syntax
  errors slip through because there is no tsc-equivalent gate for python.
- Retest after the planner fix: the model made it an argparse CLI requiring a filename
  argument instead of generating its own log (exit 2 run bare).

## Fix / corrected pattern

Self-contained generator + summarizer: writes a deterministic sample.log, counts by
level and by hour, prints the most frequent ERROR line. Verified PASS. Corrected code
recorded.

## Lesson for VACA

Python files must be syntax-checked before export (a py_compile gate like the tsc gate
for TS). A "parses a generated log" request means the tool should generate the log
itself, not demand a file argument.

---
*VACA build-ladder campaign — 2026-08-09*
