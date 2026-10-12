#!/usr/bin/env python3
"""Model quality comparison harness.

Runs an identical prompt battery against two endpoints (e.g. the 14B Q4 on
:8000 and the 7B R16 on :8001) and saves both outputs to a results dir for
side-by-side comparison. Prompts target measurable ability: code correctness
(tsc-compilable), algorithmic reasoning, instruction adherence, multi-step
logic, and VACA-style module generation.

Usage:
  python3 tools/bench/model-quality-compare.py --tag round1 \\
      --a 14b --url-a http://127.0.0.1:8000 \\
      --b 7b  --url-b http://127.0.0.1:8001
"""
import argparse, json, os, re, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "results")

BATTERY = [
    {
        "id": "ts_fibonacci",
        "desc": "TypeScript function, compilable",
        "prompt": ("Write a complete TypeScript file that exports a function "
                   "`fibonacci(n: number): number[]` returning the first n "
                   "Fibonacci numbers (n >= 0). Handle edge cases. No imports, "
                   "no comments explaining what to do — just the code."),
        "check": "tsc",
    },
    {
        "id": "ts_url_parser",
        "desc": "TypeScript URL query parser with types",
        "prompt": ("Write a complete TypeScript file that exports a function "
                   "`parseQuery(url: string): Record<string, string>` that "
                   "parses the query string of a URL (handles ?, &, =, and "
                   "decodes values). Include the type signature. No imports."),
        "check": "tsc",
    },
    {
        "id": "py_water_jug",
        "desc": "Python water-jug solver (BFS)",
        "prompt": ("Write a Python function `water_jug(cap_a, cap_b, target)` "
                   "that returns the shortest sequence of states solving the "
                   "classic water jug puzzle using BFS, or None if impossible. "
                   "Return a list of (a, b) tuples. Just the code."),
        "check": "run",
    },
    {
        "id": "logic_puzzle",
        "desc": "Multi-step logic reasoning",
        "prompt": ("Solve this step by step: A, B, and C each have a different "
                   "favorite color among red, blue, green. A does not like red. "
                   "B does not like blue. The person who likes green is not B. "
                   "What color does each person like? Show your reasoning "
                   "briefly, then give the final answer as 'A: X, B: Y, C: Z'."),
        "check": "reason",
    },
    {
        "id": "instruction_follow",
        "desc": "Strict instruction adherence",
        "prompt": ("Respond with EXACTLY one line: the word 'COMPLIANT' "
                   "followed by the number 42. Nothing else, no explanation."),
        "check": "format",
    },
    {
        "id": "module_contract",
        "desc": "VACA-style module respecting a contract",
        "prompt": ("You are generating ONE module of a todo-list app: the "
                   "module named `task_store`. The sibling module `data_store` "
                   "sends it data via the contract `data_store -> task_store : "
                   "data`. Implement task_store as a TypeScript module that "
                   "exports exactly `addTask`, `listTasks`, and `deleteTask` "
                   "using an in-memory array. Do NOT implement other modules. "
                   "Just the code."),
        "check": "tsc",
    },
]


def call(url: str, prompt: str, model: str, max_tokens: int = 500,
         temperature: float = 0.2) -> dict:
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }).encode()
    req = urllib.request.Request(url + "/v1/chat/completions", data=body,
                                 headers={"Content-Type": "application/json"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=300) as r:
        resp = json.loads(r.read())
    dt = time.time() - t0
    content = resp["choices"][0]["message"]["content"]
    usage = resp.get("usage", {})
    return {"content": content, "elapsed": dt,
            "completion_tokens": usage.get("completion_tokens", 0)}


def extract_code(text: str) -> str:
    """Pull code out of a response (strip markdown fences if present)."""
    m = re.search(r"```(?:ts|typescript|python|py)?\s*\n(.*?)```", text, re.S)
    if m:
        return m.group(1).strip()
    return text.strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", required=True)
    ap.add_argument("--a", required=True)
    ap.add_argument("--url-a", required=True)
    ap.add_argument("--b", required=True)
    ap.add_argument("--url-b", required=True)
    ap.add_argument("--model-id", default="x")
    args = ap.parse_args()

    os.makedirs(OUT, exist_ok=True)
    tag = args.tag
    results = {"tag": tag, "a": args.a, "url_a": args.url_a,
               "b": args.b, "url_b": args.url_b, "tests": []}

    for item in BATTERY:
        print(f"\n=== [{item['id']}] {item['desc']} ===")
        row = {"id": item["id"], "desc": item["desc"], "prompt": item["prompt"]}
        for label, url in (("a", args.url_a), ("b", args.url_b)):
            try:
                r = call(url, item["prompt"], args.model_id)
                row[label] = {"content": r["content"], "elapsed": round(r["elapsed"], 1),
                              "tokens": r["completion_tokens"]}
                code = extract_code(r["content"])
                row[label + "_code"] = code
                print(f"  {label} ({args.a if label=='a' else args.b}): "
                      f"{r['completion_tokens']} tok in {r['elapsed']:.1f}s")
            except Exception as e:
                row[label] = {"error": str(e)}
                print(f"  {label}: ERROR {e}")
        results["tests"].append(row)

    # Write raw results
    raw = os.path.join(OUT, f"{tag}-raw.json")
    with open(raw, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n✅ raw results: {raw}")

    # Write code files for tsc/run checks
    code_dir = os.path.join(OUT, tag)
    os.makedirs(code_dir, exist_ok=True)
    for row in results["tests"]:
        for label in ("a", "b"):
            ck = row.get(label + "_code")
            if not ck:
                continue
            ext = ".ts" if any(k in row["id"] for k in ("ts_", "module")) else ".py"
            p = os.path.join(code_dir, f"{row['id']}.{label}{ext}")
            with open(p, "w") as f:
                f.write(ck)
    print(f"📁 code files: {code_dir}")
    return results


if __name__ == "__main__":
    sys.exit(main())
