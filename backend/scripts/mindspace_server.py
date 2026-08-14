#!/usr/bin/env python3
"""
MindSpace Inference Server — serves the trained MindSpace model
as an OpenAI-compatible HTTP API for the visual-ai-architect backend.

Supports both text-only and vision-enabled models.
Accepts base64-encoded images in chat completion requests.

Usage:
    python mindspace_server.py [--port 8082] [--host 0.0.0.0]

Endpoints:
    GET  /health              → {"status": "ok", "model": "mindspace-...", ...}
    POST /v1/chat/completions → OpenAI-compatible chat completion
    GET  /v1/models           → List available models
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from io import BytesIO
from pathlib import Path
from typing import Optional
import urllib.parse

# ── Add MindSpace to path ────────────────────────────────────────────
MINDSAPCE_DIR = Path(__file__).resolve().parent.parent.parent / "MindSpace"
sys.path.insert(0, str(MINDSAPCE_DIR))

# Compiled model export paths — check 13M first, fall back to mindspace-2
EXPORT_DIRS = [
    MINDSAPCE_DIR / "data" / "exports" / "mindspace-13m",
    MINDSAPCE_DIR / "data" / "exports" / "mindspace-2",
]
EXPORT_DIR = EXPORT_DIRS[0]  # Will be updated to the first existing dir

# ── Lazy-loaded globals ──────────────────────────────────────────────
_model = None
_tokenizer = None
_config = None
_device = "cpu"
_model_loaded = False
_compiled_mode = False
_load_error: Optional[str] = None
_start_time = time.time()


def _resolve_device() -> str:
    try:
        import torch
        return "cuda" if torch.cuda.is_available() else "cpu"
    except ImportError:
        return "cpu"


# ── Standalone tokenizer (compiled model path) ────────────────────────

class _CompiledBPETokenizer:
    """BPE tokenizer wrapping HuggingFace tokenizers (standalone)."""
    def __init__(self, path: str | Path):
        try:
            from tokenizers import Tokenizer as HFTokenizer
        except ImportError:
            raise ImportError(
                "The 'tokenizers' package is required for BPE tokenizer. "
                "Install with: pip install tokenizers"
            )
        self._tok = HFTokenizer.from_file(str(path))
        self.vocab_size = self._tok.get_vocab_size()
        self.bos_id = 1
        self._eos_id = 2

    @property
    def eos_id(self) -> int:
        return self._eos_id

    def encode(self, text: str, add_bos: bool = True, add_eos: bool = False) -> list[int]:
        ids = self._tok.encode(text).ids
        if add_bos:
            ids = [self.bos_id] + ids
        if add_eos:
            ids = ids + [self.eos_id]
        return ids

    def decode(self, ids: list[int], skip_special: bool = True) -> str:
        if skip_special:
            ids = [i for i in ids if i not in (0, 1, 2, 3)]
        return self._tok.decode(ids, skip_special_tokens=True)


class _CompiledCharTokenizer:
    """Character-level tokenizer (standalone)."""
    SPECIAL_TOKENS = {"<pad>": 0, "<bos>": 1, "<eos>": 2, "<unk>": 3}

    def __init__(self, vocab_path: str | Path | None = None):
        self.stoi: dict[str, int] = dict(self.SPECIAL_TOKENS)
        self.itos: dict[int, str] = {v: k for k, v in self.SPECIAL_TOKENS.items()}
        if vocab_path and Path(vocab_path).exists():
            self._load(Path(vocab_path))

    def _load(self, path: Path):
        data = json.loads(path.read_text())
        if isinstance(data, dict):
            stoi = data.get("stoi", data)
            for k, v in stoi.items():
                if k not in self.SPECIAL_TOKENS:
                    self.stoi[k] = v
        elif isinstance(data, list):
            for i, c in enumerate(data):
                if c not in self.SPECIAL_TOKENS:
                    self.stoi[c] = i + len(self.SPECIAL_TOKENS)
        self.itos = {v: k for k, v in self.stoi.items()}

    @property
    def vocab_size(self) -> int:
        return len(self.stoi)

    @property
    def eos_id(self) -> int:
        return self.stoi.get("<eos>", 2)

    def encode(self, text: str, add_bos: bool = True, add_eos: bool = False) -> list[int]:
        ids = []
        if add_bos:
            ids.append(self.stoi.get("<bos>", 1))
        for ch in text:
            ids.append(self.stoi.get(ch, self.stoi.get("<unk>", 3)))
        if add_eos:
            ids.append(self.eos_id)
        return ids

    def decode(self, ids: list[int], skip_special: bool = True) -> str:
        special = {self.stoi.get("<pad>", 0), self.stoi.get("<bos>", 1),
                    self.stoi.get("<eos>", 2), self.stoi.get("<unk>", 3)}
        if skip_special:
            chars = [self.itos.get(i, "") for i in ids if i not in special]
        else:
            chars = [self.itos.get(i, "") for i in ids]
        return "".join(chars)


# ── Token sampling (compiled model path) ─────────────────────────────

def _sample_token(
    logits,  # type: ignore
    temperature: float = 0.8,
    top_k: int = 40,
    top_p: float = 0.9,
) -> int:
    """Sample one token from logits with temperature, top-k, top-p."""
    import torch
    logits = logits[0, -1, :] if logits.dim() == 3 else logits
    if temperature > 0:
        logits = logits / temperature
    else:
        return logits.argmax(dim=-1).item()
    if top_k > 0:
        k = min(top_k, logits.size(-1))
        values, _ = torch.topk(logits, k)
        logits = torch.where(logits < values[-1], float("-inf"), logits)
    if 0 < top_p < 1.0:
        sorted_logits, sorted_indices = logits.sort(descending=True)
        cumulative_probs = sorted_logits.softmax(dim=-1).cumsum(dim=-1)
        sorted_mask = cumulative_probs - sorted_logits.softmax(dim=-1) > top_p
        sorted_logits = sorted_logits.masked_fill(sorted_mask, float("-inf"))
        logits = sorted_logits.scatter(0, sorted_indices, sorted_logits)
    probs = torch.softmax(logits, dim=-1)
    return torch.multinomial(probs, 1).item()


# ── Model loading ────────────────────────────────────────────────────

def _load_model() -> bool:
    """Load the best MindSpace checkpoint. Returns True on success.

    Tries the compiled TorchScript model first (fast startup), then
    falls back to the WeightManager + InferenceEngine path.
    """
    global _model, _tokenizer, _config, _device, _model_loaded, _load_error, _compiled_mode

    if _model_loaded:
        return True

    import torch

    _device = _resolve_device()

    # ── Fast path: compiled TorchScript model ──────────────────────
    # Find the first export directory that has a compiled model
    compiled_path = None
    for exp_dir in EXPORT_DIRS:
        candidate = exp_dir / "compiled_model.pt"
        if candidate.exists():
            compiled_path = candidate
            global EXPORT_DIR
            EXPORT_DIR = exp_dir
            print(f"[MindSpace] Using export: {exp_dir.name}")
            break
    if compiled_path and compiled_path.exists():
        try:
            print(f"[MindSpace] Loading compiled model (fast path)...")
            _model = torch.jit.load(str(compiled_path), map_location=_device)
            _model.eval()
            _compiled_mode = True

            # Load model info
            info_path = EXPORT_DIR / "info.json"
            if info_path.exists():
                _config = json.loads(info_path.read_text())
            else:
                _config = {}

            # Load tokenizer
            bpe_path = EXPORT_DIR / "bpe_tokenizer.json"
            vocab_path = EXPORT_DIR / "vocab.json"
            if bpe_path.exists():
                _tokenizer = _CompiledBPETokenizer(bpe_path)
                print(f"[MindSpace] Tokenizer: BPE ({_tokenizer.vocab_size} tokens)")
            elif vocab_path.exists():
                _tokenizer = _CompiledCharTokenizer(vocab_path)
                print(f"[MindSpace] Tokenizer: Char-level ({_tokenizer.vocab_size} tokens)")
            else:
                _tokenizer = _CompiledCharTokenizer()
                print(f"[MindSpace] Tokenizer: Char-level (default)")

            _model_loaded = True
            params = _config.get("params", 0) if isinstance(_config, dict) else 0
            max_seq = _config.get("max_seq_len", 64) if isinstance(_config, dict) else 64
            print(f"[MindSpace] Loaded compiled model ({params:,} params, max_seq={max_seq})")
            print(f"[MindSpace] Device: {_device}")
            return True

        except Exception as e:
            import traceback
            print(f"[MindSpace] Compiled model load failed, falling back: {e}")
            print(traceback.format_exc())
            # Reset and fall through to legacy path
            _model = None
            _tokenizer = None
            _config = None
            _compiled_mode = False

    # ── Legacy path: WeightManager + InferenceEngine ───────────────
    try:
        from model.config import ModelConfig
        from model.rnn import MindSpaceRNN
        from model.transformer import MindSpaceTransformer
        from model.weights import WeightManager
        from inference.tokenizer import Tokenizer as MindSpaceTokenizer
        from inference.bpe_tokenizer import BPETokenizer
        from inference.engine import InferenceEngine
        from inference.sampling import SamplingConfig, Sampler

        checkpoint_dir = MINDSAPCE_DIR / "weights" / "checkpoints"
        vocab_path = MINDSAPCE_DIR / "weights" / "vocab.json"
        bpe_path = MINDSAPCE_DIR / "weights" / "bpe_tokenizer.json"
        best_path = MINDSAPCE_DIR / "weights" / "best" / "best.pt"

        # Try best.pt first, then latest checkpoint
        checkpoint_path = None
        if best_path.exists():
            checkpoint_path = best_path
        elif checkpoint_dir.exists():
            ckpts = sorted(checkpoint_dir.glob("*.pt"))
            if ckpts:
                checkpoint_path = ckpts[-1]

        if checkpoint_path is None or not checkpoint_path.exists():
            _load_error = f"No checkpoint found at {checkpoint_dir} or {best_path}"
            return False

        # Load checkpoint
        data = torch.load(str(checkpoint_path), map_location="cpu", weights_only=True)
        saved_config = data.get("config", {})
        _config = ModelConfig.from_dict(saved_config)

        # Build appropriate model based on config
        if _config.model_type == "transformer":
            _model = MindSpaceTransformer(_config).to(_device)
            model_name = "mindspace-transformer"
            if getattr(_config, "vision_enabled", False):
                model_name = "mindspace-vision"
        else:
            _model = MindSpaceRNN(_config).to(_device)
            model_name = "mindspace-rnn"

        wm = WeightManager(_model, _config, str(checkpoint_dir))
        step = wm.load(checkpoint_path)

        # Build tokenizer based on model type
        if _config.model_type == "transformer":
            if bpe_path.exists():
                _tokenizer = BPETokenizer.load(str(bpe_path))
            else:
                _tokenizer = BPETokenizer(vocab_size=_config.vocab_size)
                sample_data = MINDSAPCE_DIR / "data" / "sample.jsonl"
                if sample_data.exists():
                    texts = BPETokenizer.load_texts_from_jsonl([sample_data])
                    if texts:
                        _tokenizer.fit(texts)
                        (MINDSAPCE_DIR / "weights").mkdir(parents=True, exist_ok=True)
                        _tokenizer.save(str(bpe_path))
        else:
            if vocab_path.exists():
                _tokenizer = MindSpaceTokenizer.load_vocab(vocab_path)
            else:
                _tokenizer = MindSpaceTokenizer()
                sample_data = MINDSAPCE_DIR / "data" / "sample.jsonl"
                if sample_data.exists():
                    texts = MindSpaceTokenizer.load_texts_from_jsonl([sample_data])
                    if texts:
                        _tokenizer.fit(texts)
                        (MINDSAPCE_DIR / "weights").mkdir(parents=True, exist_ok=True)
                        _tokenizer.save_vocab(str(vocab_path))

        _model_loaded = True
        _compiled_mode = False
        print(f"[MindSpace] Loaded {model_name} checkpoint step {step} ({_model.num_params:,} params)")
        print(f"[MindSpace] Device: {_device}")
        if getattr(_config, "vision_enabled", False):
            print(f"[MindSpace] Vision encoder: {_config.vision_layers} layers, {_config.vision_heads} heads, {_config.image_size}px images")
        if _config.model_type == "transformer":
            print(f"[MindSpace] Config: embed={_config.embedding_dim}, heads={_config.num_heads}, layers={_config.num_layers}, ff={_config.feed_forward_dim}")
        else:
            print(f"[MindSpace] Config: embed={_config.embedding_dim}, hidden={_config.hidden_dim}, layers={_config.num_layers}")
        return True

    except Exception as e:
        import traceback
        _load_error = f"{e}\n{traceback.format_exc()}"
        print(f"[MindSpace] Load failed: {_load_error}")
        return False


def _process_base64_image(image_data: str) -> Optional[object]:
    """Convert a base64-encoded image string to a torch tensor.

    Supports: data:image/...;base64,... format or raw base64.
    Returns (1, 3, H, W) normalized tensor or None on failure.
    """
    try:
        import torch
        from PIL import Image
        from torchvision import transforms

        # Strip data URI prefix if present
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]

        # Decode base64
        img_bytes = base64.b64decode(image_data)
        img = Image.open(BytesIO(img_bytes)).convert("RGB")

        # Resize and normalize
        transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])

        tensor = transform(img).unsqueeze(0)  # (1, 3, 224, 224)
        return tensor.to(_device)

    except Exception as e:
        print(f"[MindSpace] Image processing error: {e}")
        return None


def _generate_compiled(
    prompt: str,
    max_tokens: int = 200,
    temperature: float = 0.8,
    top_k: int = 40,
    top_p: float = 0.9,
) -> str:
    """Generate text using the compiled TorchScript model (fast path)."""
    global _model, _tokenizer, _config

    import torch

    try:
        input_ids = _tokenizer.encode(prompt, add_bos=True, add_eos=False)
        generated = list(input_ids)
        max_ctx = _config.get("max_seq_len", 64) if isinstance(_config, dict) else 64

        for _ in range(max_tokens):
            context = generated[-max_ctx:]
            x = torch.tensor([context], dtype=torch.long, device=_device)

            logits = _model(x)
            if isinstance(logits, tuple):
                logits = logits[0]

            next_id = _sample_token(logits, temperature, top_k, top_p)

            if next_id == _tokenizer.eos_id:
                break

            generated.append(next_id)

        return _tokenizer.decode(generated)
    except Exception as e:
        print(f"[MindSpace] Compiled generation error: {e}")
        return ""


def _generate_legacy(
    prompt: str,
    max_tokens: int = 200,
    temperature: float = 0.8,
    top_k: int = 40,
    top_p: float = 0.9,
    images: Optional[list[str]] = None,
) -> str:
    """Generate text using the WeightManager + InferenceEngine path (legacy)."""
    global _model, _tokenizer, _config, _device

    from inference.engine import InferenceEngine
    from inference.sampling import SamplingConfig, Sampler

    engine = InferenceEngine(_model, _tokenizer, device=_device)
    sampling = SamplingConfig(temperature=temperature, top_k=top_k, top_p=top_p)

    # Process images if provided and vision is enabled
    import torch
    img_tensor = None
    has_vision = getattr(_config, "vision_enabled", False) if _config else False
    if images and has_vision:
        processed = []
        for img_data in images:
            tensor = _process_base64_image(img_data)
            if tensor is not None:
                processed.append(tensor)
        if processed:
            img_tensor = torch.cat(processed, dim=0)  # (N, 3, H, W)

    try:
        output = engine.generate(
            prompt,
            max_new_tokens=max_tokens,
            config=sampling,
            images=img_tensor,
        )
        return output
    except Exception as e:
        print(f"[MindSpace] Legacy generation error: {e}")
        return ""


def _generate(prompt: str, max_tokens: int = 200, temperature: float = 0.8,
              top_k: int = 40, top_p: float = 0.9, images: Optional[list[str]] = None) -> str:
    """Generate text with the loaded MindSpace model.

    Dispatches to compiled or legacy path based on which model is loaded.
    """
    if not _model_loaded:
        if not _load_model():
            return ""

    if _compiled_mode:
        return _generate_compiled(prompt, max_tokens, temperature, top_k, top_p)
    else:
        return _generate_legacy(prompt, max_tokens, temperature, top_k, top_p, images)


class MindSpaceHandler(BaseHTTPRequestHandler):
    """HTTP request handler for the MindSpace inference server."""

    def _send_json(self, data: dict, status: int = 200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, message: str, status: int = 500):
        self._send_json({"error": message}, status)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/health":
            has_vision = getattr(_config, "vision_enabled", False) if _config else False
            self._send_json({
                "status": "ok",
                "model": "mindspace-vision" if has_vision else "mindspace-transformer",
                "loaded": _model_loaded,
                "device": _device,
                "vision_enabled": has_vision,
                "error": _load_error,
                "uptime_seconds": round(time.time() - _start_time),
            })

        elif path == "/v1/models":
            has_vision = getattr(_config, "vision_enabled", False) if _config else False
            model_id = "mindspace-vision" if has_vision else "mindspace-transformer"
            self._send_json({
                "object": "list",
                "data": [
                    {
                        "id": model_id,
                        "object": "model",
                        "created": int(_start_time),
                        "owned_by": "local",
                    }
                ],
            })

        else:
            self._send_error("Not found", 404)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/v1/chat/completions":
            self._handle_chat_completion()
        else:
            self._send_error("Not found", 404)

    def _handle_chat_completion(self):
        """Handle OpenAI-compatible chat completion request.

        Supports vision via OpenAI's image_url content parts:
        {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "What's in this image?"},
                        {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}
                    ]
                }
            ]
        }
        """
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            self._send_error("Empty request body", 400)
            return

        body = self.rfile.read(content_length).decode("utf-8")
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self._send_error("Invalid JSON", 400)
            return

        messages = data.get("messages", [])
        if not messages:
            self._send_error("No messages provided", 400)
            return

        # Extract the last user message as prompt, with optional images
        prompt = ""
        images: list[str] = []
        for msg in messages:
            if msg.get("role") == "user":
                content = msg.get("content", "")
                if isinstance(content, list):
                    # Multi-modal content: text + images
                    for part in content:
                        if part.get("type") == "text":
                            prompt = part.get("text", "")
                        elif part.get("type") == "image_url":
                            url = part.get("image_url", {})
                            img_url = url.get("url", "")
                            if img_url:
                                images.append(img_url)
                else:
                    prompt = content
            elif msg.get("role") == "system":
                sys_content = msg.get("content", "")
                if isinstance(sys_content, str) and sys_content:
                    prompt = f"[System: {sys_content}]\n" + prompt

        if not prompt.strip():
            self._send_error("No user message found", 400)
            return

        # Generation parameters
        max_tokens = data.get("max_tokens", 200)
        temperature = data.get("temperature", 0.8)
        top_p = data.get("top_p", 0.9)

        # MindSpace-specific: top_k via OpenAI extra_body or default
        top_k = 40
        if "extra_body" in data and isinstance(data["extra_body"], dict):
            top_k = data["extra_body"].get("top_k", 40)

        # Ensure model is loaded
        if not _model_loaded:
            if not _load_model():
                self._send_error(f"Model not available: {_load_error}", 503)
                return

        # Generate
        try:
            output = _generate(prompt, max_tokens, temperature, top_k, top_p, images=images if images else None)
            # Strip the prompt from the output if it starts with it
            if output.startswith(prompt):
                generated = output[len(prompt):]
            else:
                generated = output

            model_id = "mindspace-vision" if (images and getattr(_config, "vision_enabled", False)) else "mindspace-transformer"

            self._send_json({
                "id": f"chatcmpl-{int(time.time())}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": model_id,
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": generated.strip() or output[:200],
                        },
                        "finish_reason": "stop",
                    }
                ],
                "usage": {
                    "prompt_tokens": len(prompt),
                    "completion_tokens": len(generated),
                    "total_tokens": len(prompt) + len(generated),
                },
            })
        except Exception as e:
            self._send_error(f"Generation failed: {e}", 500)

    def log_message(self, format, *args):
        """Suppress default HTTP server logging (too noisy)."""
        if os.environ.get("MINDSAPCE_DEBUG"):
            super().log_message(format, *args)


def main():
    parser = argparse.ArgumentParser(description="MindSpace Inference Server")
    parser.add_argument("--port", type=int, default=8082, help="Server port")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Bind address")
    parser.add_argument("--debug", action="store_true", help="Verbose logging")
    args = parser.parse_args()

    if args.debug:
        os.environ["MINDSAPCE_DEBUG"] = "1"

    print(f"[MindSpace] Starting inference server...")
    print(f"[MindSpace] Looking for checkpoints in: {MINDSAPCE_DIR / 'weights'}")

    # Try to load model on startup
    try:
        loaded = _load_model()
        if not loaded:
            print(f"[MindSpace] Model not loaded on startup: {_load_error}")
            print(f"[MindSpace] Server will attempt load on first request")
        else:
            print(f"[MindSpace] Model loaded successfully on startup")
            has_vision = getattr(_config, "vision_enabled", False) if _config else False
            if has_vision:
                print(f"[MindSpace] Vision encoder enabled — accepts image inputs")
    except Exception:
        print(f"[MindSpace] Deferred model load (will load on first request)")

    server = HTTPServer((args.host, args.port), MindSpaceHandler)
    print(f"[MindSpace] Server listening on http://{args.host}:{args.port}")
    print(f"[MindSpace] API endpoint: http://{args.host}:{args.port}/v1/chat/completions")
    print(f"[MindSpace] Health check:  http://{args.host}:{args.port}/health")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[MindSpace] Shutting down...")
        server.shutdown()


if __name__ == "__main__":
    main()
