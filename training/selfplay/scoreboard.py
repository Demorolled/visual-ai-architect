#!/usr/bin/env python3
"""scoreboard.py — live dashboard for the self-play loop.

Shows everything the loop produces: pass / fail / cheating / learned /
improvements, and exactly what it is training on.

It is a read-only aggregator over the on-disk artifacts, so it works while the
loop runs and survives restarts:

  work/state.json                  round history (orchestrator)
  work/r<NN>/audit.json            judge + anti-cheat verdicts
  work/r<NN>/play/status.json      puzzle game scoreboard (puzzle_trainer)
  work/r<NN>/play/episodes.jsonl   per-episode rewards
  work/r<NN>/play/train-puzzle-*.jsonl   learned SFT rows
  work/r<NN>/play/dpo-puzzle-*.jsonl     DPO corrections (learned from misses)
  work/r<NN>/play/opt-puzzle-*.jsonl     tune-up improvements
  corpus/r<NN>/train.jsonl         what the next QLoRA round trains on
  models/r<NN>/                    exported student

Usage:
    python3 -m training.selfplay.scoreboard --port 8300
    python3 -m training.selfplay.scoreboard --port 8300 --open   # prints URL only
"""
from __future__ import annotations

import argparse
import html
import json
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .config import SelfPlayConfig, load_config

REFRESH_MS = 3000
TAIL_ROWS = 8          # rows shown in the sample panels
LOG_TAIL_BYTES = 6000


# ── readers (tolerant: missing file → empty) ─────────────────────────────────
def _json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _rows(path: Path | None) -> list:
    if path is None:
        return []
    out = []
    try:
        for line in path.open(encoding="utf-8"):
            line = line.strip()
            if line:
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except OSError:
        pass
    return out


def _count(path: Path | None) -> int:
    if path is None:
        return 0
    n = 0
    try:
        with path.open(encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    n += 1
    except OSError:
        return 0
    return n


def _newest(pattern_dir: Path, pattern: str) -> Path | None:
    try:
        files = sorted(pattern_dir.glob(pattern), key=lambda p: p.stat().st_mtime)
    except OSError:
        return None
    return files[-1] if files else None


def _round_dirs(work: Path) -> list:
    try:
        dirs = [d for d in work.glob("r*") if d.is_dir()]
    except OSError:
        return []
    return sorted(dirs, key=lambda d: int(re.sub(r"\D", "", d.name) or 0))


def _tail_log(path: Path) -> list:
    try:
        data = path.read_bytes()[-LOG_TAIL_BYTES:]
    except OSError:
        return []
    text = data.decode("utf-8", "replace")
    return [ln for ln in text.splitlines() if ln.strip()][-40:]


# ── aggregation ──────────────────────────────────────────────────────────────
def gather(cfg: SelfPlayConfig) -> dict:
    work = Path(cfg.paths.work_dir)
    corpus_root = Path(cfg.paths.corpus_dir)
    models_root = Path(cfg.paths.models_dir)

    state = _json(work / "state.json")
    completed = state.get("completed_rounds", []) or []
    hist = {h.get("round"): h for h in (state.get("history") or [])}
    results = []

    for d in _round_dirs(work):
        try:
            rnd = int(re.sub(r"\D", "", d.name))
        except ValueError:
            continue
        play = d / "play"
        st = _json(play / "status.json")
        audit = _json(d / "audit.json")
        sft = _newest(play, "train-puzzle-*.jsonl")
        dpo = _newest(play, "dpo-puzzle-*.jsonl")
        opt = _newest(play, "opt-puzzle-*.jsonl")
        eps = play / "episodes.jsonl"

        opt_rows = _rows(opt) if opt else []
        improvements = sum(1 for r in opt_rows if r.get("valid") and (r.get("reward") or 0) > 0)
        opt_bad = sum(1 for r in opt_rows if not r.get("valid"))

        correct = st.get("correct")
        wrong = st.get("wrong")
        if correct is None and eps.exists():
            ep_rows = _rows(eps)
            correct = sum(1 for r in ep_rows if r.get("correct"))
            wrong = sum(1 for r in ep_rows if r.get("correct") is False)

        corpus = corpus_root / f"r{rnd}"
        model = models_root / f"r{rnd}" / "final"

        results.append({
            "round": rnd,
            "done": rnd in completed,
            "score": st.get("score"),
            "acc": st.get("acc"),
            "recent_acc": st.get("recent_acc"),
            "pass": correct,
            "fail": wrong,
            "puzzles": st.get("puzzles"),
            "cheated": audit.get("cheated"),
            "killed": audit.get("killed"),
            "audit_sampled": audit.get("sampled"),
            "judge_unreachable": audit.get("judge_unreachable"),
            "learned": _count(sft) if sft else 0,
            "dpo": _count(dpo) if dpo else 0,
            "improvements": improvements,
            "opt_bad": opt_bad,
            "elapsed_s": (hist.get(rnd) or {}).get("elapsed_s"),
            "tier": st.get("tier"),
            "corpus_rows": _count(corpus / "train.jsonl"),
            "model_ready": model.exists(),
        })

    # Totals (None-safe).
    def total(key):
        vals = [r[key] for r in results if isinstance(r.get(key), (int, float))]
        return sum(vals) if vals else 0

    latest = results[-1] if results else None
    current_round = (max(completed) + 1) if completed else cfg.start_round

    # What it's training on: the newest corpus with rows, + a readable sample.
    train_on = {"round": None, "rows": 0, "sample": [], "sources": {}}
    if results:
        for r in reversed(results):
            tr = corpus_root / f"r{r['round']}" / "train.jsonl"
            if tr.exists() and _count(tr):
                rows = _rows(tr)
                srcs = {}
                for row in rows:
                    s = str(row.get("source", "?"))[:40]
                    srcs[s] = srcs.get(s, 0) + 1
                train_on = {
                    "round": r["round"],
                    "rows": len(rows),
                    "sources": dict(sorted(srcs.items(), key=lambda kv: -kv[1])[:8]),
                    "sample": [
                        {
                            "instruction": str(row.get("instruction", ""))[:400],
                            "output": str(row.get("output", ""))[:400],
                            "source": str(row.get("source", "")),
                        }
                        for row in rows[-TAIL_ROWS:]
                    ],
                }
                break

    # Recent episodes + improvements for the panels.
    recent_eps, recent_impr = [], []
    if results:
        play = work / f"r{results[-1]['round']}" / "play"
        for row in _rows(play / "episodes.jsonl")[-TAIL_ROWS:]:
            recent_eps.append({
                "app": str(row.get("app", ""))[:40],
                "purpose": str(row.get("purpose", ""))[:40],
                "pick": row.get("chosen"),
                "correct": row.get("correct"),
                "reward": row.get("reward"),
            })
        for row in _rows(_newest(play, "opt-puzzle-*.jsonl"))[-TAIL_ROWS:]:
            recent_impr.append({
                "app": str(row.get("app", ""))[:40],
                "action": str(row.get("action", ""))[:40],
                "valid": row.get("valid"),
                "reward": row.get("reward"),
                "reason": str(row.get("reason", ""))[:80],
            })

    return {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "student": cfg.endpoints.student_model,
        "student_url": cfg.endpoints.student_url,
        "judge": cfg.endpoints.judge_model,
        "judge_url": cfg.endpoints.judge_url,
        "current_round": current_round,
        "highest_round": results[-1]["round"] if results else None,
        "totals": {
            "pass": total("pass"),
            "fail": total("fail"),
            "cheated": total("cheated"),
            "killed": total("killed"),
            "learned": total("learned"),
            "dpo": total("dpo"),
            "improvements": total("improvements"),
            "opt_bad": total("opt_bad"),
            "rounds": len(results),
        },
        "rounds": results[::-1],      # newest first
        "train_on": train_on,
        "recent_episodes": recent_eps,
        "recent_improvements": recent_impr,
        "log": _tail_log(work / "selfplay.log"),
    }


# ── HTML (dark dashboard; data injected via textContent, never innerHTML) ────
_PAGE = """<!doctype html><html><head><meta charset="utf-8">
<title>VACA self-play scoreboard</title>
<style>
 :root{--bg:#0d0d1a;--card:#16162400;background:#161624;--c:#1e1e2e;--line:#2e2e44;
       --fg:#e6e6f0;--dim:#8a8aa0;--ok:#4ade80;--bad:#f87171;--warn:#fbbf24;--accent:#00d9ff;}
 *{box-sizing:border-box}
 body{margin:0;background:var(--bg);color:var(--fg);
      font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
 header{padding:12px 18px;border-bottom:1px solid var(--line);display:flex;
        gap:18px;flex-wrap:wrap;align-items:baseline}
 h1{font-size:15px;margin:0;color:var(--accent);letter-spacing:.5px}
 .meta{color:var(--dim);font-size:12px}
 .wrap{padding:14px 18px;display:flex;flex-direction:column;gap:14px}
 .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
 .tile{background:var(--c);border:1px solid var(--line);border-radius:8px;padding:10px 12px}
 .tile .n{font-size:26px;font-weight:700;line-height:1.1}
 .tile .l{color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.6px}
 .ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}.accent{color:var(--accent)}
 .card{background:var(--c);border:1px solid var(--line);border-radius:8px;padding:12px 14px}
 .card h2{font-size:12px;margin:0 0 8px;color:var(--accent);text-transform:uppercase;letter-spacing:.7px}
 table{width:100%;border-collapse:collapse;font-size:12px}
 th,td{text-align:left;padding:4px 8px;border-bottom:1px solid var(--line);white-space:nowrap;
       overflow:hidden;text-overflow:ellipsis;max-width:340px}
 th{color:var(--dim);font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:.5px}
 .pill{display:inline-block;padding:1px 7px;border-radius:99px;font-size:11px}
 pre{margin:0;max-height:180px;overflow:auto;color:var(--dim);font-size:11px;white-space:pre-wrap}
 .row{display:flex;gap:10px;flex-wrap:wrap}
 .row .card{flex:1;min-width:320px}
</style></head><body>
<header>
  <h1>🎮 VACA SELF-PLAY</h1>
  <span class="meta" id="hdr">connecting…</span>
  <span class="meta" id="clock"></span>
</header>
<div class="wrap" id="app">loading…</div>
<script>
const $ = (t, cls) => { const e = document.createElement(t); if (cls) e.className = cls; return e; };
function num(v){ return (v===null||v===undefined) ? "–" : v; }
function tile(n, label, cls){ const d=$("div","tile"); const a=$("div","n "+(cls||""));
  a.textContent=num(n); const b=$("div","l"); b.textContent=label; d.append(a,b); return d; }
function table(cols, rows, cellFn){
  const t=$("table"); const tr=$("tr"); cols.forEach(c=>{const th=$("th"); th.textContent=c; tr.append(th);});
  t.append(tr);
  rows.forEach(r=>{ const x=$("tr"); cellFn(r).forEach(v=>{
    const td=$("td"); if(v && v.nodeType) td.append(v); else td.textContent = num(v); x.append(td); }); t.append(x); });
  return t;
}
function card(title){ const c=$("div","card"); const h=$("h2"); h.textContent=title; c.append(h); return c; }
function render(d){
  const tot=d.totals;
  document.getElementById("hdr").textContent =
    `round ${d.current_round} · student ${d.student} @ ${d.student_url} · judge ${d.judge} @ ${d.judge_url}`;
  document.getElementById("clock").textContent = "updated " + d.ts;
  const app=document.getElementById("app"); app.replaceChildren();

  const tiles=$("div","tiles");
  tiles.append(
    tile(tot.pass,"pass","ok"), tile(tot.fail,"fail","bad"),
    tile(tot.cheated,"cheating caught","bad"), tile(tot.killed,"rows killed","warn"),
    tile(tot.learned,"rows learned","accent"), tile(tot.dpo,"dpo corrections"),
    tile(tot.improvements,"improvements","ok"), tile(tot.rounds,"rounds done"),
  );
  app.append(tiles);

  const rc=card("Per-round");
  rc.append(table(
    ["round","state","score","acc","pass","fail","cheat","learned","dpo","impr","corpus","model","elapsed"],
    d.rounds,
    r=>[r.round, r.done?"✅":"…", r.score, r.acc!=null?r.acc+"%":"–", r.pass, r.fail,
        r.cheated, r.learned, r.dpo, r.improvements, r.corpus_rows,
        r.model_ready?"yes":"–",
        r.elapsed_s!=null?Math.round(r.elapsed_s)+"s":"–"]));
  app.append(rc);

  const row=$("div","row");
  const on=card("What it's training on (round " + num(d.train_on.round) + ")");
  const mix=$("div","meta"); mix.textContent =
    `${d.train_on.rows} rows · sources: ` +
    (Object.keys(d.train_on.sources).length
      ? Object.entries(d.train_on.sources).map(([k,v])=>`${k}=${v}`).join(", ") : "–");
  on.append(mix);
  d.train_on.sample.slice().reverse().forEach(s=>{
    const b=$("pre"); b.textContent = `▸ ${s.source}\n${s.instruction}\n→ ${s.output}`; on.append(b);
  });
  row.append(on);

  const imp=card("Improvements (tune-ups)");
  imp.append(table(["app","action","valid","reward","reason"], d.recent_improvements,
    r=>[r.app, r.action, r.valid?"ok":"no", r.reward, r.reason]));
  row.append(imp);
  app.append(row);

  const row2=$("div","row");
  const eps=card("Recent episodes");
  eps.append(table(["app","purpose","pick","correct","reward"], d.recent_episodes,
    r=>[r.app, r.purpose, r.pick, r.correct?"✔":"✘", r.reward]));
  row2.append(eps);
  if (d.log && d.log.length){
    const lg=card("Loop log"); const p=$("pre"); p.textContent=d.log.join("\n"); lg.append(p); row2.append(lg);
  }
  app.append(row2);
}
async function tick(){
  try{ const r=await fetch("/api/data?t="+Date.now()); render(await r.json()); }
  catch(e){ document.getElementById("hdr").textContent="scoreboard: waiting for data… ("+e+")"; }
}
tick(); setInterval(tick, __REFRESH__);
</script></body></html>"""


def _handler_factory(cfg: SelfPlayConfig):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):  # quiet
            pass

        def do_GET(self):
            if self.path.startswith("/api/data"):
                body = json.dumps(gather(cfg)).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)
            elif self.path in ("/", "/index.html"):
                body = _PAGE.replace("__REFRESH__", str(REFRESH_MS)).encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_response(404)
                self.end_headers()

    return Handler


def serve(cfg: SelfPlayConfig, port: int, host: str = "0.0.0.0") -> ThreadingHTTPServer:
    srv = ThreadingHTTPServer((host, port), _handler_factory(cfg))
    return srv


def main() -> int:
    ap = argparse.ArgumentParser(description="Self-play scoreboard (live dashboard)")
    ap.add_argument("--config", default=None)
    ap.add_argument("--port", type=int, default=8300)
    ap.add_argument("--host", default="0.0.0.0")
    args = ap.parse_args()
    cfg = load_config(args.config)
    srv = serve(cfg, args.port, args.host)
    print(f"📺 scoreboard: http://{args.host}:{args.port}  (Ctrl-C to stop)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n⏹ scoreboard stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
