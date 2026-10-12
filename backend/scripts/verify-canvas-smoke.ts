/**
 * verify-canvas-smoke.ts — end-to-end proof that a BROKEN GUI build is detected
 * by the real behavioral smoke gate and REPAIRED by the canvas code path.
 *
 * This is the safe half of the live verification: it uses the REAL probes
 * (scripts/smoke-test-html.py when available, else the TS browser engine with
 * real Chrome) and the REAL `runStagedBehavioralSmoke` the canvas path now
 * calls — only the LLM repair call is stubbed, so no model server is needed.
 *
 * Run:  cd backend && npx tsx scripts/verify-canvas-smoke.ts
 *
 * Scenario: a board app whose primary button calls `startGame()`, a function
 * that is never defined. Chrome throws "startGame is not defined" on click, so
 * the gate must FAIL; the repair call returns a working app, so the loop must
 * re-probe and PASS, and the repaired content must be written back onto the
 * caller's file object (that writeback is what the canvas path relies on).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  runStagedBehavioralSmoke,
  runRenderSmoke,
} from '../src/sandbox/behavioralSmoke.js';

// ── The broken build: a GUI app with a dangling inline handler ───────────────
const BROKEN = `<!doctype html>
<html>
<head><title>Broken Board</title></head>
<body>
  <h1>Board</h1>
  <div id="board"></div>
  <button id="start" onclick="startGame()">Start</button>
  <script>
    // startGame is referenced by the button but never defined — the classic
    // "compiles but crashes on click" class the behavioral gate exists for.
    const board = document.getElementById('board');
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.textContent = '.';
      board.appendChild(cell);
    }
  </script>
</body>
</html>`;

// ── The repaired build: the handler now exists and works ────────────────────
const FIXED = `<!doctype html>
<html>
<head><title>Fixed Board</title></head>
<body>
  <h1>Board</h1>
  <div id="board"></div>
  <button id="start" onclick="startGame()">Start</button>
  <script>
    function startGame() {
      const board = document.getElementById('board');
      board.innerHTML = '';
      for (let i = 0; i < 9; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.textContent = String(i);
        board.appendChild(cell);
      }
      document.getElementById('start').textContent = 'Restarted';
    }
    const board = document.getElementById('board');
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.textContent = '.';
      board.appendChild(cell);
    }
  </script>
</body>
</html>`;

async function main(): Promise<number> {
  const files = [{ path: 'index.html', content: BROKEN }];

  // 1) The raw probe must FAIL on the broken build (real Chrome, real gate).
  //    The probe reads the entry from disk, so stage it first — probing a
  //    non-existent path just returns 'skipped' and never launches Chrome.
  console.log('[verify] probing the BROKEN build with the real gate…');
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'vaca-verify-'));
  fs.writeFileSync(path.join(stage, 'index.html'), BROKEN, 'utf-8');
  const direct = await runRenderSmoke(stage, files, 45_000);
  fs.rmSync(stage, { recursive: true, force: true });
  console.log(`[verify] direct probe: status=${direct.status} detail=${direct.detail}`);
  if (direct.status === 'unavailable') {
    console.log('[verify] RESULT: INCONCLUSIVE — no browser engine available on this box '
      + '(need playwright or Chrome). The wiring is unit-tested; re-run where Chrome exists.');
    return 2;
  }
  if (direct.status !== 'failed') {
    console.log(`[verify] RESULT: FAIL — the gate did NOT flag the broken build (${direct.status}).`);
    return 1;
  }
  console.log('[verify] ✓ the gate flagged the broken build');

  // 2) Drive it through the CANVAS path (staged + bounded repair).
  console.log('[verify] driving the canvas path (staged gate + repair)…');
  let repairCalls = 0;
  const res = await runStagedBehavioralSmoke({
    files,
    request: 'build a 3x3 board game with a start button',
    contractFiles: [{ path: 'index.html', summary: 'board UI', language: 'html' } as any],
    timeoutMs: 45_000,
    tag: 'verify',
    maxRepairRounds: 2,
    repairCall: async (prompt: string) => {
      repairCalls += 1;
      console.log(`[verify] repair call #${repairCalls} (prompt ${prompt.length} chars)`);
      return FIXED;
    },
  });

  console.log(`[verify] final renderSmoke=${res.renderSmoke.status} (${res.renderSmoke.detail})`);
  console.log(`[verify] repairedPaths=${JSON.stringify(res.repairedPaths)}`);
  console.log(`[verify] repairCalls=${repairCalls}`);

  const ok = res.renderSmoke.status === 'passed'
    && repairCalls >= 1
    && res.repairedPaths.includes('index.html')
    && files[0].content.includes('function startGame');

  if (!ok) {
    console.log('[verify] RESULT: FAIL — the canvas path did not repair the build end-to-end.');
    return 1;
  }
  console.log('[verify] RESULT: PASS — broken GUI build detected, repaired, and re-verified '
    + 'through the canvas path.');
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => {
  console.error('[verify] threw:', e);
  process.exit(1);
});
