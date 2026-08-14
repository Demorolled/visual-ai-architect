# Claims Audit — Round 3 (after codegen improvements shipped)

**Date:** August 7, 2026
**Script:** `scripts/audit-claims.py` (unchanged from Round 2)
**Target:** live backend on :3001 (NEW code — restarted to pick up the session's
codegen changes) + DSpark R6 model on :8000

## Score: 115/140 (82%) — all 14 probes PASS

| Claim | Score |
|---|---|
| read named files | 9/10 |
| search codebase | 9/10 |
| create file in chat-files | 9/10 |
| write memory | 9/10 |
| recall memory | 8/10 |
| **code generation** | **8/10** |
| blueprint generation | 9/10 |
| self-analysis | 8/10 |
| LLM integration | 8/10 |
| WebSocket | 8/10 |
| TTS | 7/10 |
| emotional response | 8/10 |
| emotion | 8/10 |
| project mgmt | 7/10 |

**Overall: 115/140 (82%)** — identical to Round 2, confirming **no regression**
from the codegen changes (token auto-chunking, import-only patches, P0 `files`
array, live progress streaming). The codegen claim probe returned real working
code (e.g. a correct memoized `fibonacci`).

## ⚠️ Audit integrity note (the 44% scare)

The first post-restart run scored **62/140 (44%)** — a false alarm. The backend
had been restarted inside a short-lived shell session, and the process died when
that session was torn down (background processes don't survive a shell
process-group kill; `nohup` does not help). Most probes then failed instantly
with `Connection refused` (WebSocket/TTS/project mgmt) or empty responses.
Verified: direct DSpark inference worked fine (53 tok/s, `Reply with exactly:
OK` → "OK"), the backend log showed zero errors, and re-running after the
backend was moved to a **detached tmux session** (`vaca-backend`) returned the
true 82%.

**Lesson:** the backend must run in a detached session (tmux or `setsid`) — a
`server.pid`-tracked background job spawned from a short-lived shell is not
enough.

## Where things stand

- All 14 claims PASS at the Round-2 level; the emotion claim stays honored
  (8/10) and the codegen claim holds (8/10).
- The codegen internals shipped this session (Section 45.5, Change 31g) are
  reliability/robustness work — they don't change the claims, they harden the
  paths the probes exercise.
- Artifacts: probe log in `data/claims-audit.json`, prior report
  `data/claims-audit-report-round2.md`.
