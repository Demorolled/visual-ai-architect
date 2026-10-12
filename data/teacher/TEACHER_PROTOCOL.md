# Teacher Protocol — Buffy (teacher) ↔ VACA (student)

> The user sends build requests to the TEACHER (this terminal). The teacher
> shapes the request into an exact `goal`/`purpose` and drives VACA's REAL
> builder pipeline (`POST /api/blueprint/build`) — the same path the UI uses.
> The teacher monitors every module, diagnoses failures, fixes the PIPELINE
> root cause first (never just patches the output), and records everything.

## Roles

| Role | Who | Job |
|------|-----|-----|
| **Product Owner** | the user | sends the raw request ("I want a chess game with 3D pieces…") |
| **Teacher** | Buffy (this terminal) | shapes the request → instructs the app → grades the build → fixes pipeline root causes → records |
| **Student** | VACA (backend + dspark 14B) | plans the architecture, generates each module, runs tsc gates, drift-check |

## The loop (per request)

1. **Receive** — the user sends a raw request.
2. **Shape** — teacher converts it into the exact build payload:
   `{ goal, purpose, targetOS, scale }` (goal = blueprint-matchable noun phrase,
   purpose = the user's feature details verbatim where useful).
3. **Instruct** — `POST /api/blueprint/build` through `scripts/teacher-build.py`.
4. **Monitor** — capture: matched blueprint + score, per-file tsc errors,
   `tsCompileClean`, validated count, drift (missing/unexpected modules),
   research + internal-knowledge injection flags, duration, dspark tokens.
5. **Grade** — PASS = all modules validated AND tsc clean AND drift clean.
   FAIL otherwise. Every FAIL gets a **root-cause classification**.
6. **Fix pipeline first** — diagnose the failure; fix the pipeline code
   (prompt, matcher, contract builder, gate, intent detector) so future
   builds don't fail the same way. Only regenerate/patch output as a
   fallback, clearly labeled.
7. **Record** — append one session object to `data/teacher/sessions.jsonl`
   and write the failure + fix to `data/monitor/INCORRECTIONS.md` (I-NNN).

## Failure taxonomy (for step 5)

- **MISROUTE** — wrong blueprint / no blueprint (matcher failed).
- **CONTRACT** — modules reference undeclared globals / invented sibling
  contracts (wiring-graph leakage).
- **SYNTAX** — raw TS errors (typo, wrong type, missing import).
- **TRUNCATION** — file cut off mid-generation.
- **GATE** — quality/anti-fence gate rejected valid output.
- **STACK** — wrong language / framework / platform assumption.
- **INTENT** — frontend/backend intent detector missed the request.
- **LLM-ONLY** — model quality issue, no pipeline bug (regen may help).

## Verdict format (sessions.jsonl)

```json
{
  "ts": "ISO",
  "seq": 1,
  "userRequest": "raw text",
  "goal": "shaped goal",
  "purpose": "shaped purpose",
  "matchedBlueprint": "app_type",
  "matchScore": 0.9,
  "grade": "PASS" | "FAIL",
  "rootCause": "MISROUTE" | "CONTRACT" | ... | null,
  "pipelineFix": "what changed in the pipeline" | null,
  "tsCompileClean": true,
  "totalErrors": 0,
  "validatedCount": 5,
  "totalFiles": 5,
  "driftClean": true,
  "researchInjected": true,
  "internalKnowledgeInjected": true,
  "durationMs": 123456,
  "notes": "human-readable summary"
}
```

## How to run

```bash
# One build through the real pipeline, teacher capture, appended to sessions.jsonl
python3 scripts/teacher-build.py "a todo list app with tasks, due dates, and projects"

# With an explicit purpose / OS / scale
python3 scripts/teacher-build.py "void raider" --purpose "classic arcade space shooter" --os linux --scale medium

# Skip the post-build runtime smoke (faster)
python3 scripts/teacher-build.py "goal" --no-smoke
```

Every run appends a session record and dumps the full raw response to
`data/teacher/sessions/<seq>.json` for deep-dive analysis.
