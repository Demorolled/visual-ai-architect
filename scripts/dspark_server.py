#!/usr/bin/env python3
"""
DSpark Server — speculative-decoding (DSpark-style) OpenAI-compatible server.

DSpark accelerates generation by pairing a small DRAFT model (predicts tokens
in parallel) with the TARGET model (verifies them in a single pass). This is
the same mechanism DeepSeek's DSpark framework uses, implemented locally with
llama.cpp's draft_model support — no cloud API, no huge downloads.

Uses the models you ALREADY have in Ollama (resolved from manifests):
  - target: qwen2.5-7b-instruct-uncensored (4.7 GB)
  - draft:  qwen2.5-coder:0.5b (380 MB, same Qwen2.5 tokenizer)

Exposes OpenAI-compatible endpoints:
  GET  /v1/models
  POST /v1/chat/completions
  POST /v1/completions
  GET  /v1/health

Usage:
    python scripts/dspark_server.py --port 8000 --n-ctx 16384 --n-gpu-layers -1
"""

import argparse
import os
import sys
import json
import time
import signal
import threading
from collections import deque
from typing import Optional, List, Any, Dict

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


# ── Model resolution helpers ────────────────────────────────────────────────

OLLAMA_MODEL_DIRS = [
    os.path.expanduser('~/.ollama/models'),
    '/usr/share/ollama/.ollama/models',
    '/var/lib/ollama/models',
]


def resolve_gguf(model_name: str) -> Optional[str]:
    """Resolve a model name like 'qwen2.5-7b-instruct-uncensored:latest' or
    'qwen2.5-coder:0.5b' to its GGUF blob path via Ollama manifests."""
    # Normalize: 'library/qwen2.5-coder:0.5b' -> namespace 'library', name, tag
    ns = 'library'
    rest = model_name
    if '/' in rest:
        ns, rest = rest.split('/', 1)
    if ':' in rest:
        name, tag = rest.split(':', 1)
    else:
        name, tag = rest, 'latest'

    for base in OLLAMA_MODEL_DIRS:
        manifest = os.path.join(base, 'manifests', 'registry.ollama.ai', ns, name, tag)
        if not os.path.isfile(manifest):
            continue
        try:
            with open(manifest) as f:
                data = json.load(f)
            for layer in data.get('layers', []):
                if 'model' in layer.get('mediaType', ''):
                    digest = layer['digest'].replace('sha256:', '')
                    blob = os.path.join(base, 'blobs', f'sha256-{digest}')
                    if os.path.isfile(blob):
                        return blob
        except Exception as e:
            print(f"[DSpark] Failed to parse manifest {manifest}: {e}", file=sys.stderr)
    return None


# ── Request models ──────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: str = 'default'
    messages: List[ChatMessage]
    max_tokens: Optional[int] = 2048
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 0.9
    top_k: Optional[int] = 40
    stream: Optional[bool] = False


class CompletionRequest(BaseModel):
    model: str = 'default'
    prompt: str
    max_tokens: Optional[int] = 2048
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 0.9
    stream: Optional[bool] = False


# ── App factory ─────────────────────────────────────────────────────────────

class LlamaModelDraft:
    """A real-model drafter for llama-cpp-python 0.3.x speculative decoding.

    The library calls draft(input_ids) and expects a numpy array of draft token
    ids back. We run the small draft Llama greedily on the same token ids and
    return its raw predicted tokens. Speculative decoding is lossless — the
    target model verifies every draft token, so any mismatch is re-computed.
    """

    def __init__(self, draft_llm, num_pred_tokens: int = 16):
        self.draft_llm = draft_llm
        self.num_pred_tokens = num_pred_tokens

    def __call__(self, input_ids, **kwargs):
        import numpy as np
        try:
            ids = np.asarray(input_ids)
            prompt_list = ids.astype(np.int32).tolist()
            if len(prompt_list) == 0:
                return np.array([], dtype=np.int32)
            output = self.draft_llm.create_completion(
                prompt=prompt_list,
                max_tokens=self.num_pred_tokens,
                temperature=0.0,
                stream=False,
            )
            text = output.get('choices', [{}])[0].get('text', '') or ''
            tokens = self.draft_llm.tokenize(text.encode('utf-8'), add_bos=False)
            return np.asarray(tokens, dtype=np.int32)
        except Exception as e:
            # Never let the drafter kill generation — empty draft = no proposals.
            print(f'[DSpark] Draft pass failed (falling back to no draft): {e}', flush=True)
            return np.array([], dtype=np.int32)


def create_app(target_path: str, draft_path: Optional[str], n_gpu_layers: int, n_ctx: int,
               n_threads: Optional[int], tensor_split: Optional[list] = None,
               split_mode: str = 'layer', n_batch: int = 512, model_id: Optional[str] = None,
               draft_gpu_layers: int = -1, draft_num_pred_tokens: int = 16,
               draft_mode: str = 'none'):
    from llama_cpp import Llama
    from llama_cpp.llama_speculative import LlamaPromptLookupDecoding

    split_mode_map = {'none': 0, 'layer': 1, 'row': 2}

    print(f"[DSpark] Target model: {target_path}", flush=True)
    print(f"[DSpark] Draft mode:   {draft_mode}", flush=True)
    if draft_mode == 'model':
        print(f"[DSpark] Draft model:  {draft_path}", flush=True)
    print(f"[DSpark] GPU layers: {n_gpu_layers} (target) / {draft_gpu_layers} (draft), "
          f"Context: {n_ctx}, Batch: {n_batch}", flush=True)
    if tensor_split:
        print(f"[DSpark] Tensor split: {tensor_split}", flush=True)

    # Draft must be a LlamaDraftModel-style callable that returns raw token ids.
    if draft_mode == 'lookup':
        # Built-in n-gram lookup drafter — zero extra model, minimal overhead.
        draft_wrapper = LlamaPromptLookupDecoding(num_pred_tokens=draft_num_pred_tokens)
        print(f"[DSpark] Using built-in prompt-lookup drafter", flush=True)
    elif draft_mode == 'none':
        draft_wrapper = None
        print(f"[DSpark] Speculative decoding DISABLED (--draft-mode none)", flush=True)
    else:
        draft_llm = Llama(
            model_path=draft_path,
            n_gpu_layers=draft_gpu_layers,
            n_ctx=n_ctx,
            n_batch=n_batch,
            n_threads=n_threads,
            verbose=False,
        )
        print(f"[DSpark] Draft model loaded ({os.path.basename(draft_path)})", flush=True)
        draft_wrapper = LlamaModelDraft(draft_llm, num_pred_tokens=draft_num_pred_tokens)

    gpu_kwargs = {}
    if tensor_split:
        gpu_kwargs['tensor_split'] = tensor_split
    if split_mode != 'layer':
        gpu_kwargs['split_mode'] = split_mode_map.get(split_mode, 1)

    try:
        llm = Llama(
            model_path=target_path,
            draft_model=draft_wrapper,
            n_gpu_layers=n_gpu_layers,
            n_ctx=n_ctx,
            n_batch=n_batch,
            n_threads=n_threads,
            verbose=False,
            **gpu_kwargs,
        )
    except TypeError as e:
        if gpu_kwargs:
            print(f"[DSpark] Multi-GPU kwargs not supported, retrying single-GPU: {e}", flush=True)
            llm = Llama(
                model_path=target_path,
                draft_model=draft_wrapper,
                n_gpu_layers=n_gpu_layers,
                n_ctx=n_ctx,
                n_batch=n_batch,
                n_threads=n_threads,
                verbose=False,
            )
        else:
            raise

    target_id = model_id or os.path.basename(target_path)
    app = FastAPI(title='DSpark Speculative Decoding Server')

    app.add_middleware(
        CORSMiddleware,
        allow_origins=['*'],
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
    )

    # ── Throughput stats (rolling window, exposed via /health) ──
    # Each completion records (completion_tokens, elapsed_seconds). Tokens/sec is
    # computed over the recent window so the status UI shows real-world throughput
    # for the current draft mode.
    _stats_lock = threading.Lock()
    _stat_window: 'deque[tuple[int, float]]' = deque(maxlen=20)
    _total_completion_tokens = 0
    _total_requests = 0

    def _record_stats(completion_tokens: int, elapsed: float):
        nonlocal _total_completion_tokens, _total_requests
        with _stats_lock:
            _stat_window.append((completion_tokens, elapsed))
            _total_completion_tokens += completion_tokens
            _total_requests += 1

    def _stats_snapshot() -> Dict[str, Any]:
        with _stats_lock:
            if not _stat_window:
                return {
                    'tokens_per_sec': None,
                    'avg_latency_ms': None,
                    'total_completion_tokens': _total_completion_tokens,
                    'requests': _total_requests,
                }
            total_tokens = sum(t for t, _ in _stat_window)
            total_elapsed = sum(e for _, e in _stat_window)
            tps = total_tokens / total_elapsed if total_elapsed > 0 else 0.0
            avg_ms = (total_elapsed / len(_stat_window)) * 1000
            return {
                'tokens_per_sec': round(tps, 2),
                'avg_latency_ms': round(avg_ms, 1),
                'total_completion_tokens': _total_completion_tokens,
                'requests': _total_requests,
            }

    @app.get('/health')
    @app.get('/v1/health')
    async def health():
        body = {
            'status': 'ok',
            'model': target_id,
            'draft_mode': draft_mode,
            'speculative_decoding': draft_mode != 'none',
            'stats': _stats_snapshot(),
        }
        if draft_mode == 'model':
            body['draft'] = os.path.basename(draft_path)
        return body

    @app.get('/v1/models')
    async def list_models():
        return {
            'object': 'list',
            'data': [
                {
                    'id': target_id,
                    'object': 'model',
                    'created': int(os.path.getmtime(target_path)),
                    'owned_by': 'dspark-server',
                }
            ],
        }

    @app.post('/v1/chat/completions')
    async def chat_completions(req: ChatCompletionRequest):
        start_time = time.time()
        output = llm.create_chat_completion(
            messages=[m.model_dump() for m in req.messages],
            max_tokens=req.max_tokens,
            temperature=req.temperature,
            top_p=req.top_p,
            top_k=req.top_k,
        )
        elapsed = time.time() - start_time

        content = output['choices'][0]['message']['content'] if output.get('choices') else ''
        prompt_tokens = output.get('usage', {}).get('prompt_tokens', 0)
        completion_tokens = output.get('usage', {}).get('completion_tokens', 0)
        tps = completion_tokens / elapsed if elapsed > 0 else 0
        _record_stats(completion_tokens, elapsed)
        accel = ", draft-accelerated" if draft_mode != 'none' else ""
        print(f"[DSpark] chat: {completion_tokens} tokens in {elapsed:.2f}s ({tps:.1f} tok/s{accel})",
              flush=True)

        return {
            'id': f'chatcmpl-{int(time.time())}',
            'object': 'chat.completion',
            'created': int(time.time()),
            'model': target_id,
            'choices': [
                {
                    'index': 0,
                    'message': {'role': 'assistant', 'content': content},
                    'finish_reason': 'stop',
                }
            ],
            'usage': {
                'prompt_tokens': prompt_tokens,
                'completion_tokens': completion_tokens,
                'total_tokens': prompt_tokens + completion_tokens,
            },
        }

    @app.post('/v1/completions')
    async def completions(req: CompletionRequest):
        start_time = time.time()
        output = llm(
            req.prompt,
            max_tokens=req.max_tokens,
            temperature=req.temperature,
            top_p=req.top_p,
            top_k=req.top_k or 40,
            stop=['</s>'],
            echo=False,
        )
        elapsed = time.time() - start_time

        content = output['choices'][0]['text'] if output.get('choices') else ''
        prompt_tokens = output.get('usage', {}).get('prompt_tokens', 0)
        completion_tokens = output.get('usage', {}).get('completion_tokens', 0)
        tps = completion_tokens / elapsed if elapsed > 0 else 0
        _record_stats(completion_tokens, elapsed)
        print(f"[DSpark] completion: {completion_tokens} tokens in {elapsed:.2f}s ({tps:.1f} tok/s)",
              flush=True)

        return {
            'id': f'cmpl-{int(time.time())}',
            'object': 'text_completion',
            'created': int(time.time()),
            'model': target_id,
            'choices': [
                {
                    'index': 0,
                    'text': content,
                    'finish_reason': 'stop',
                }
            ],
            'usage': {
                'prompt_tokens': prompt_tokens,
                'completion_tokens': completion_tokens,
                'total_tokens': prompt_tokens + completion_tokens,
            },
        }

    return app


def main():
    parser = argparse.ArgumentParser(description='DSpark speculative decoding server (OpenAI-compatible)')
    parser.add_argument('--target', default='qwen2.5-7b-instruct-uncensored:latest',
                        help='Target model name (Ollama) or GGUF path')
    parser.add_argument('--draft', default='qwen2.5-coder:0.5b',
                        help='Draft model name (Ollama) or GGUF path')
    parser.add_argument('--port', type=int, default=8000, help='Server port (default: 8000)')
    parser.add_argument('--host', default='127.0.0.1', help='Bind address (default: 127.0.0.1)')
    parser.add_argument('--n-gpu-layers', type=int, default=-1,
                        help='GPU layers for target (-1 = all, 0 = CPU)')
    parser.add_argument('--draft-gpu-layers', type=int, default=-1,
                        help='GPU layers for draft model (-1 = all, 0 = CPU; default: -1)')
    parser.add_argument('--draft-num-pred-tokens', type=int, default=16,
                        help='Tokens drafted per speculative step (default: 16)')
    parser.add_argument('--draft-mode', type=str, default='none',
                        choices=['model', 'lookup', 'none'],
                        help='Drafter: model (qwen2.5-coder:0.5b), lookup (built-in n-gram), none (off, default)')
    parser.add_argument('--n-ctx', type=int, default=16384, help='Context size (default: 16384)')
    parser.add_argument('--n-batch', type=int, default=512, help='Batch size (default: 512)')
    parser.add_argument('--n-threads', type=int, default=0, help='CPU threads (0 = auto)')
    parser.add_argument('--model-id', type=str, default='qwen2.5-7b-instruct-uncensored-dspark',
                        help='Model id reported by the API (default: qwen2.5-7b-instruct-uncensored-dspark)')
    parser.add_argument('--tensor-split', type=str, default=None,
                        help="GPU memory split, e.g. '0.5,0.5' for 2 GPUs")
    parser.add_argument('--split-mode', type=str, default='layer',
                        choices=['none', 'layer', 'row'])

    args = parser.parse_args()

    def resolve(name: str, kind: str) -> str:
        if os.path.isfile(name):
            return os.path.abspath(name)
        path = resolve_gguf(name)
        if not path:
            print(f"ERROR: Could not resolve {kind} model '{name}'. "
                  f"Is it installed via `ollama pull {name.split(':')[0]}`?", file=sys.stderr)
            sys.exit(1)
        return path

    target_path = resolve(args.target, 'target')
    # Draft model is only needed for --draft-mode model; don't require it otherwise.
    draft_path: Optional[str] = None
    if args.draft_mode == 'model':
        draft_path = resolve(args.draft, 'draft')

    n_threads = args.n_threads if args.n_threads > 0 else None
    tensor_split = None
    if args.tensor_split:
        try:
            tensor_split = [float(x) for x in args.tensor_split.split(',')]
        except ValueError:
            print('ERROR: --tensor-split must be comma-separated floats, e.g. 0.5,0.5', file=sys.stderr)
            sys.exit(1)

    app = create_app(
        target_path=target_path,
        draft_path=draft_path,
        n_gpu_layers=args.n_gpu_layers,
        n_ctx=args.n_ctx,
        n_threads=n_threads,
        tensor_split=tensor_split,
        split_mode=args.split_mode,
        n_batch=args.n_batch,
        model_id=args.model_id,
        draft_gpu_layers=args.draft_gpu_layers,
        draft_num_pred_tokens=args.draft_num_pred_tokens,
        draft_mode=args.draft_mode,
    )

    # Graceful shutdown
    def _handle_signal(signum, frame):
        print('\n[DSpark] Shutting down...', flush=True)
        sys.exit(0)

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    uvicorn.run(app, host=args.host, port=args.port, log_level='warning')


if __name__ == '__main__':
    main()
