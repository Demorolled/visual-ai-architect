#!/usr/bin/env python3
"""Send a training job to an agent box running agent_worker.py, and collect the adapter.

HTTP only — no SSH, no shared filesystem. Used from the command line and importable by
the desktop app.

    export VACA_AGENT=http://agentbox.local:8811     # or pass --host every time

    python3 training/remote/remote_job.py health
    python3 training/remote/remote_job.py gpus
    python3 training/remote/remote_job.py submit \
        --base Qwen/Qwen2.5-Coder-7B-Instruct \
        --output-name role-reasoning \
        --file training/selfplay/corpus/vaca-domain.jsonl \
        --epochs 2
    python3 training/remote/remote_job.py wait <job_id>      # follow progress
    python3 training/remote/remote_job.py fetch <job_id> --out llm-training-app/data/exports/
"""
import argparse
import json
import os
import sys
import time
import zipfile
from pathlib import Path

import httpx

DEFAULT_HOST = os.environ.get("VACA_AGENT", "http://127.0.0.1:8811")
TIMEOUT = httpx.Timeout(30.0, read=600.0)


class AgentError(RuntimeError):
    pass


def _url(host: str, path: str) -> str:
    return f"{host.rstrip('/')}{path}"


def health(host: str) -> dict:
    with httpx.Client(timeout=TIMEOUT) as c:
        r = c.get(_url(host, "/health"))
    if r.status_code != 200:
        raise AgentError(f"health failed: HTTP {r.status_code} {r.text[:200]}")
    return r.json()


def gpus(host: str) -> dict:
    with httpx.Client(timeout=TIMEOUT) as c:
        r = c.get(_url(host, "/gpus"))
    if r.status_code != 200:
        raise AgentError(f"gpus failed: HTTP {r.status_code} {r.text[:200]}")
    return r.json()


def submit(host: str, base_model: str, files, output_name=None, **overrides) -> dict:
    """Upload dataset files + config. Returns the worker's response (job_id, ...)."""
    paths = [Path(f) for f in files]
    missing = [str(p) for p in paths if not p.is_file()]
    if missing:
        raise AgentError(f"no such data file(s): {missing}")

    # The engine keys off "model_name"; a bare "base_model" makes it fall through to
    # *simulated* training, which reports a falling loss and saves no adapter at all.
    config = {"base_model": base_model, "model_name": base_model}
    if output_name:
        config["output_name"] = output_name
    config.update({k: v for k, v in overrides.items() if v is not None})

    opened = [p.open("rb") for p in paths]
    try:
        multipart = [("files", (p.name, fh, "application/octet-stream"))
                     for p, fh in zip(paths, opened)]
        with httpx.Client(timeout=TIMEOUT) as c:
            r = c.post(_url(host, "/jobs"),
                       data={"payload": json.dumps(config)}, files=multipart)
    finally:
        for fh in opened:
            fh.close()
    if r.status_code != 200:
        raise AgentError(f"submit failed: HTTP {r.status_code} {r.text[:300]}")
    return r.json()


def status(host: str, job_id: str) -> dict:
    with httpx.Client(timeout=TIMEOUT) as c:
        r = c.get(_url(host, f"/jobs/{job_id}"))
    if r.status_code == 404:
        raise AgentError(f"no such job: {job_id}")
    if r.status_code != 200:
        raise AgentError(f"status failed: HTTP {r.status_code} {r.text[:200]}")
    return r.json()


def wait(host: str, job_id: str, poll: float = 5.0, verbose: bool = True) -> dict:
    """Block until the job finishes; returns its final record."""
    last = None
    while True:
        js = status(host, job_id)
        if verbose:
            p = js.get("progress") or {}
            line = (f"[{js['status']}] epoch {p.get('epoch')} "
                    f"step {p.get('step')}/{p.get('total_steps')} "
                    f"loss {(js.get('metrics') or {}).get('loss')}")
            if line != last:
                print(line, flush=True)
                last = line
        if js["status"] in ("completed", "failed", "stopped"):
            return js
        time.sleep(poll)


def fetch(host: str, job_id: str, out_dir: str) -> Path:
    """Download the finished adapter as a zip and unpack it."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=TIMEOUT) as c:
        with c.stream("GET", _url(host, f"/jobs/{job_id}/adapter")) as r:
            body = r.read()          # must read the stream before touching .text
            if r.status_code != 200:
                raise AgentError(
                    f"fetch failed: HTTP {r.status_code} {body[:200].decode('utf-8', 'replace')}")
            name = r.headers.get("X-Adapter-Name", f"job-{job_id}")
            blob = body
    target = out / name
    import io
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        zf.extractall(target)
    return target


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default=DEFAULT_HOST,
                    help=f"agent worker base URL (default {DEFAULT_HOST}, or $VACA_AGENT)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("health")
    sub.add_parser("gpus")
    sub.add_parser("list")

    s = sub.add_parser("submit")
    s.add_argument("--base", required=True, help="HF repo id or local path of the base model")
    s.add_argument("--file", action="append", required=True, help="dataset file (repeatable)")
    s.add_argument("--output-name", default=None)
    s.add_argument("--epochs", type=int, default=None)
    s.add_argument("--lr", type=float, default=None)
    s.add_argument("--batch", type=int, default=None)
    s.add_argument("--grad-accum", type=int, default=None)
    s.add_argument("--max-length", type=int, default=None)
    s.add_argument("--gpu", type=int, action="append", default=None,
                   help="GPU index to use (repeatable); default is the worker's setting")
    s.add_argument("--wait", action="store_true", help="block until the job finishes")

    w = sub.add_parser("wait")
    w.add_argument("job_id")
    w.add_argument("--poll", type=float, default=5.0)

    g = sub.add_parser("status")
    g.add_argument("job_id")

    f = sub.add_parser("fetch")
    f.add_argument("job_id")
    f.add_argument("--out", default="llm-training-app/data/exports")

    args = ap.parse_args()

    try:
        if args.cmd == "health":
            print(json.dumps(health(args.host), indent=2))
        elif args.cmd == "gpus":
            print(json.dumps(gpus(args.host), indent=2))
        elif args.cmd == "list":
            print(json.dumps(status_list(args.host), indent=2))
        elif args.cmd == "submit":
            res = submit(args.host, args.base, args.file, args.output_name,
                         epochs=args.epochs, learning_rate=args.lr, batch_size=args.batch,
                         gradient_accumulation_steps=args.grad_accum,
                         max_length=args.max_length, gpu_devices=args.gpu)
            print(json.dumps(res, indent=2))
            if args.wait and res.get("job_id"):
                js = wait(args.host, res["job_id"])
                print(json.dumps({k: js[k] for k in ("status", "error", "progress")
                                  if k in js}, indent=2))
                return 0 if js["status"] == "completed" else 1
        elif args.cmd == "wait":
            js = wait(args.host, args.job_id, poll=args.poll)
            print(json.dumps({k: js.get(k) for k in ("status", "error", "progress", "metrics")},
                             indent=2))
            return 0 if js["status"] == "completed" else 1
        elif args.cmd == "status":
            print(json.dumps(status(args.host, args.job_id), indent=2))
        elif args.cmd == "fetch":
            target = fetch(args.host, args.job_id, args.out)
            print(f"adapter unpacked into {target}")
    except AgentError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    except httpx.ConnectError:
        print(f"error: cannot reach the agent worker at {args.host}\n"
              f"       start it there with: training/remote/agent_worker.py --host 0.0.0.0",
              file=sys.stderr)
        return 2
    return 0


def status_list(host: str) -> dict:
    with httpx.Client(timeout=TIMEOUT) as c:
        r = c.get(_url(host, "/jobs"))
    if r.status_code != 200:
        raise AgentError(f"list failed: HTTP {r.status_code} {r.text[:200]}")
    return r.json()


if __name__ == "__main__":
    sys.exit(main())
