#!/usr/bin/env python3
"""
=============================================================================
  Evaluate VACA's vision model — accuracy AND text-retention
  =======================================================
  Runs the held-out test split against an OpenAI-compatible /v1 endpoint
  (llama-server, Ollama, DSpark — whatever serves the fine-tuned model) and
  reports three things:

    1. image-task accuracy   — normalized exact-match + token-F1 on image rows
    2. text-retention        — the same metrics on text rows, so a fine-tune
                               that broke VACA's text behaviour is visible
                               (catastrophic-forgetting check)
    3. a per-row dump        — so failures can be read, not just counted

  Uses only the stdlib (urllib) so it runs on any host with no extra installs.

  Usage:
      python3 training/vlm/eval_vlm.py --dataset training/dataset/vlm \
          --image-root data/vlm/images --model vaca-vision-r3 \
          --base-url http://127.0.0.1:8000/v1 --json-out training/vlm/out/eval.json

      # compare against the untouched base to prove the fine-tune helped:
      python3 training/vlm/eval_vlm.py --dataset ... --image-root ... \
          --model Qwen2.5-VL-7B-Instruct --base-url http://127.0.0.1:8001/v1

      python3 training/vlm/eval_vlm.py --dataset ... --image-root ... --dry-run
=============================================================================
"""

import argparse
import base64
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

IMAGE_MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
              ".webp": "image/webp", ".gif": "image/gif", ".bmp": "image/bmp"}


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def token_f1(pred: str, gold: str) -> float:
    p, g = norm(pred).split(), norm(gold).split()
    if not p or not g:
        return float(norm(pred) == norm(gold))
    common = 0
    gcount = {}
    for t in g:
        gcount[t] = gcount.get(t, 0) + 1
    for t in p:
        if gcount.get(t, 0) > 0:
            gcount[t] -= 1
            common += 1
    if common == 0:
        return 0.0
    precision = common / len(p)
    recall = common / len(g)
    return 2 * precision * recall / (precision + recall)


def read_jsonl(path: Path) -> list:
    if not path.exists():
        sys.exit(f"❌ not found: {path}")
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def to_request(row: dict, image_root: Path) -> dict:
    """Convert a dataset row into a chat-completions payload with image data."""
    parts = []
    for m in row["messages"]:
        if m["role"] != "user":
            continue
        for p in m["content"]:
            if p["type"] == "text":
                parts.append({"type": "text", "text": p["text"]})
            elif p["type"] == "image":
                img = Path(p["image"])
                img = img if img.is_absolute() else image_root / img
                mime = IMAGE_MIME.get(img.suffix.lower(), "image/png")
                b64 = base64.b64encode(img.read_bytes()).decode()
                parts.append({"type": "image_url",
                              "image_url": {"url": f"data:{mime};base64,{b64}"}})
    gold = ""
    for m in row["messages"]:
        if m["role"] == "assistant":
            gold = "".join(p.get("text", "") for p in m["content"])
    return {"prompt_parts": parts, "gold": gold, "modality": row.get("modality", "text")}


def call(base_url: str, model: str, parts: list, timeout: float) -> str:
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": parts}],
        "temperature": 0.0,
        "max_tokens": 512,
    }).encode()
    req = urllib.request.Request(
        base_url.rstrip("/") + "/chat/completions",
        data=body, headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read().decode())
        return data["choices"][0]["message"]["content"]
    except urllib.error.URLError as e:
        sys.exit(f"❌ request to {base_url} failed: {e}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Evaluate the VACA vision model.")
    ap.add_argument("--dataset", type=Path, required=True, help="dir with test.jsonl")
    ap.add_argument("--image-root", type=Path, required=True)
    ap.add_argument("--base-url", default="http://127.0.0.1:8000/v1")
    ap.add_argument("--model", default="vaca-vision-r3")
    ap.add_argument("--limit", type=int, default=0, help="evaluate only the first N rows")
    ap.add_argument("--timeout", type=float, default=120.0)
    ap.add_argument("--json-out", type=Path, default=None)
    ap.add_argument("--dry-run", action="store_true", help="build requests; do not call")
    args = ap.parse_args()

    rows = read_jsonl(args.dataset / "test.jsonl")
    if not rows:
        sys.exit(f"❌ {args.dataset}/test.jsonl is empty — build a bigger test split.")
    if args.limit:
        rows = rows[: args.limit]
    reqs = [to_request(r, args.image_root) for r in rows]

    n_img = sum(1 for r in reqs if r["modality"] == "image")
    print(f"📋 eval: {len(reqs)} rows (image={n_img} text={len(reqs) - n_img}) "
          f"-> {args.base_url} model={args.model}")
    if n_img == 0:
        print("⚠️  No image rows in the test split — vision accuracy cannot be measured.")

    if args.dry_run:
        print("🔎 --dry-run: requests built OK (images encoded); nothing sent.")
        print(f"   sample prompt parts: {[p['type'] for p in reqs[0]['prompt_parts']]}")
        return

    results = []
    for i, r in enumerate(reqs, 1):
        pred = call(args.base_url, args.model, r["prompt_parts"], args.timeout)
        em = float(norm(pred) == norm(r["gold"]))
        f1 = token_f1(pred, r["gold"])
        results.append({"i": i, "modality": r["modality"], "exact_match": em,
                        "token_f1": f1, "gold": r["gold"][:200], "pred": pred[:200]})
        print(f"  [{i}/{len(reqs)}] {r['modality']:<5} EM={em:.0f} F1={f1:.2f}")

    def agg(rs):
        if not rs:
            return {"n": 0, "exact_match": 0.0, "token_f1": 0.0}
        return {"n": len(rs),
                "exact_match": sum(x["exact_match"] for x in rs) / len(rs),
                "token_f1": sum(x["token_f1"] for x in rs) / len(rs)}

    summary = {
        "model": args.model, "base_url": args.base_url,
        "image": agg([x for x in results if x["modality"] == "image"]),
        "text": agg([x for x in results if x["modality"] == "text"]),
        "overall": agg(results),
    }
    print("\n📊 summary")
    for k in ("image", "text", "overall"):
        s = summary[k]
        print(f"   {k:<7} n={s['n']:<4} EM={s['exact_match']:.3f}  F1={s['token_f1']:.3f}")
    if summary["text"]["n"] and summary["text"]["token_f1"] < 0.5:
        print("   ⚠️  text retention is low — the fine-tune may have forgotten VACA's "
              "text behaviour (add more text rows to the training mix).")

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(
            json.dumps({"summary": summary, "rows": results}, indent=2) + "\n",
            encoding="utf-8")
        print(f"   wrote {args.json_out}")


if __name__ == "__main__":
    main()
