#!/usr/bin/env python3
"""
talk.py — voice-to-text for talking to your coding assistant.

  Global hotkeys (work from any window, via pynput):
    Ctrl+Z  → START recording (speak into the mic)
    Enter   → STOP recording, transcribe, and type the text into the
              focused window (the chat box). Also copied to clipboard.

Usage:
  tools/voice/.venv/bin/python tools/voice/talk.py
  tools/voice/.venv/bin/python tools/voice/talk.py --model small --device cuda
  tools/voice/.venv/bin/python tools/voice/talk.py --source auto

Requires: ffmpeg, xdotool, xclip (all present on this machine).
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import wave

from pynput import keyboard

# ── Config (overridable via CLI; use a dict so main() can update it) ────────
CONFIG = {
    "model": "medium",   # medium ≈ 1.5GB, notably better accuracy on tricky
                          # phrases (switched from small per user request)
    "device": "cuda",    # RTX 3060 — faster-whisper CTranslate2 backend
}
COMPUTE = "float16"
SAMPLE_RATE = 16000
MAX_SECONDS = 60         # safety cap per utterance

# Auto-stop on silence (no Enter needed): after you finish speaking and stay
# quiet for AUTO_STOP_SILENCE seconds, the recording finalizes + transcribes.
AUTO_STOP_SILENCE = 0.8   # seconds of quiet after speech → auto-transcribe
SPEECH_RMS = 250          # RMS above this = speech (Blue Mic measured ~4k speaking)
IDLE_ABORT = 8.0          # if never any speech in this long, cancel silently
POLL_INTERVAL = 0.1       # monitor loop cadence (seconds)

SOURCE_HINT = "Blue Microphones"   # matched against pactl source names

# Ensure evdev_listener (same directory) is importable regardless of cwd
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)

VENV_PY = os.path.join(_THIS_DIR, ".venv", "bin", "python")
for tool in ("ffmpeg", "xdotool", "xclip"):
    if not shutil.which(tool):
        print(f"❌ missing required tool: {tool}")
        sys.exit(1)


def find_source() -> str:
    """Return the best PulseAudio/PipeWire source name for the Blue Mic."""
    try:
        out = subprocess.run(["pactl", "list", "sources", "short"],
                             capture_output=True, text=True, timeout=10).stdout
    except Exception:
        return "default"
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) > 1 and SOURCE_HINT.lower() in parts[1].lower():
            return parts[1]
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) > 1 and parts[1].startswith("alsa_input"):
            return parts[1]
    return "default"


def start_ffmpeg(source: str, out_wav: str) -> subprocess.Popen:
    """Begin recording from the PipeWire/Pulse source into a wav file."""
    return subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error",
         "-f", "pulse", "-i", source,
         "-ar", str(SAMPLE_RATE), "-ac", "1",
         "-t", str(MAX_SECONDS),
         out_wav],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def get_rms(path: str) -> float:
    with wave.open(path) as w:
        import numpy as np
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
        return float(np.sqrt(np.mean(data.astype(float) ** 2))) if data.size else 0.0


_MODEL_CACHE = {}

# Actual device/compute in use (cuda/float16 or cpu/int8 after fallback).
_ACTIVE = {"device": None, "compute": None}


def _load_model():
    """Load Whisper, trying CUDA first and falling back to CPU (int8) when
    VRAM is full (e.g. dspark holds ~22GB with the 14B Q8). Returns the model
    or raises. Caches per (model, device)."""
    from faster_whisper import WhisperModel
    attempts = [(CONFIG["device"], COMPUTE)]
    if CONFIG["device"] == "cuda":
        attempts.append(("cpu", "int8"))
    last_err = None
    for dev, comp in attempts:
        key = (CONFIG["model"], dev)
        if key in _MODEL_CACHE:
            _ACTIVE["device"], _ACTIVE["compute"] = dev, comp
            return _MODEL_CACHE[key]
        try:
            m = WhisperModel(CONFIG["model"], device=dev, compute_type=comp)
            _MODEL_CACHE[key] = m
            _ACTIVE["device"], _ACTIVE["compute"] = dev, comp
            print(f"   model      : {CONFIG['model']} ({dev}, {comp}) — loaded & cached (ready)",
                  flush=True)
            return m
        except Exception as e:
            last_err = e
            note = "trying cpu/int8" if dev == "cuda" else "giving up"
            print(f"   ⚠️  {dev} load failed ({e}); {note}", flush=True)
    raise last_err


def preload_model():
    """Load the Whisper model into memory in the background so the FIRST
    utterance doesn't pay the ~2s load cost."""
    def _load():
        try:
            _load_model()
        except Exception as e:
            print(f"   ⚠️  model preload failed: {e}", flush=True)
    threading.Thread(target=_load, daemon=True).start()


def transcribe(path: str) -> str:
    model = _load_model()
    # vad_filter=False: Silero VAD trims the START/END of speech (first
    # syllable gets eaten). We already gate on our own RMS silence detection,
    # so let whisper see the full audio — keeps every word.
    segments, _info = model.transcribe(path, language="en",
                                       vad_filter=False,
                                       beam_size=1,
                                       condition_on_previous_text=False)
    text = "".join(seg.text for seg in segments).strip()
    return sanitize_text(text)


def sanitize_text(text: str) -> str:
    """Strip control chars / NULs (whisper can emit garbage when it hears
    non-speech like TTS echo). Returns '' if nothing printable remains."""
    clean = "".join(
        ch for ch in text
        if ch == "\n" or (ord(ch) >= 32 and ord(ch) != 127)
    )
    return " ".join(clean.split()).strip()


def find_listener():
    """Pick a working global hotkey backend: evdev (Wayland-proof) → pynput.
    Returns (start_fn, stop_fn, label).
    """
    try:
        import evdev_listener  # same dir
        _l = evdev_listener.EvdevListener()
        _paths = _l._device_paths()
        if _paths:
            # evdev needs /dev/input read access — try opening one
            import evdev
            try:
                d = evdev.InputDevice(_paths[0])
                d.close()
                print("   listener   : evdev (kernel-level, Wayland-proof)")
                return evdev_listener.EvdevListener, "evdev"
            except PermissionError:
                pass
    except Exception:
        pass
    print("   listener   : pynput (X11 only — Wayland apps will NOT trigger)")
    from pynput import keyboard
    return keyboard.Listener, "pynput"


def type_into_focused(text: str) -> None:
    """Type the transcript into whichever window is focused (the chat box).

    Order: uinput (kernel-level → works in Wayland) → xdotool (X11) → clipboard.
    """
    # 1) uinput virtual keyboard — Wayland-proof, kernel-level.
    try:
        import uinput_typer  # same dir
        if uinput_typer.type_text(text):
            return
    except Exception:
        pass
    # 2) xdotool (X11 fallback).
    try:
        subprocess.run(["xdotool", "type", "--clearmodifiers", "--delay", "12", text],
                       check=True, timeout=30, capture_output=True)
        return
    except Exception:
        pass
    # 3) Clipboard fallback.
    try:
        subprocess.run(["xclip", "-selection", "clipboard"], input=text.encode(),
                       check=True, timeout=10)
        print("   (text on clipboard — paste with Ctrl+V / Ctrl+Shift+V)")
    except Exception:
        pass


def _tail_rms(path: str, tail_seconds: float = 0.25) -> float:
    """Read the last `tail_seconds` of a still-growing wav (S16_LE mono) as
    raw bytes and return RMS — avoids wave.open() which needs a valid header.
    Returns 0.0 if the file isn't writable/readable yet."""
    try:
        sz = os.path.getsize(path)
    except OSError:
        return 0.0
    if sz <= 44:
        return 0.0
    n_bytes = int(tail_seconds * SAMPLE_RATE * 2)
    with open(path, "rb") as f:
        f.seek(max(44, sz - n_bytes))
        raw = f.read()
    import numpy as np
    data = np.frombuffer(raw, dtype=np.int16)
    return float(np.sqrt(np.mean(data.astype(float) ** 2))) if data.size else 0.0


class TalkApp:
    def __init__(self, source: str):
        self.source = source
        self.recording = False
        self.proc: subprocess.Popen | None = None
        self.tmp: tempfile.TemporaryDirectory | None = None
        self.ctrl = False
        self._model = None
        self._stop_monitor = threading.Event()
        self._monitor: threading.Thread | None = None

    # ── recording ──────────────────────────────────────────────────────────
    def begin(self) -> None:
        if self.recording:
            return
        self.tmp = tempfile.TemporaryDirectory(prefix="talk-")
        self.wav = os.path.join(self.tmp.name, "capture.wav")
        self.proc = start_ffmpeg(self.source, self.wav)
        self.recording = True
        self._stop_monitor.clear()
        self._monitor = threading.Thread(target=self._monitor_loop, daemon=True)
        self._monitor.start()
        print("\n🎙️  RECORDING… (speak — auto-sends after a pause, or Enter)")
        sys.stdout.flush()

    def _monitor_loop(self) -> None:
        """Auto-finalize when the user stops speaking: track level, and once
        speech has been heard, a AUTO_STOP_SILENCE gap ends the recording.
        Also aborts if nothing was ever said (IDLE_ABORT)."""
        heard_speech = False
        last_speech_at = time.time()
        started_at = time.time()
        while not self._stop_monitor.is_set():
            if not self.recording:
                return
            rms = _tail_rms(self.wav)
            now = time.time()
            if rms >= SPEECH_RMS:
                heard_speech = True
                last_speech_at = now
            elif heard_speech and (now - last_speech_at) >= AUTO_STOP_SILENCE:
                # User paused long enough → finalize without Enter.
                self.end()
                return
            if not heard_speech and (now - started_at) >= IDLE_ABORT:
                self.end()  # end() itself prints "silence" for empty capture
                return
            self._stop_monitor.wait(POLL_INTERVAL)

    def end(self) -> None:
        if not self.recording:
            return
        self.recording = False
        self._stop_monitor.set()
        if self.proc:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except Exception:
                self.proc.kill()
        wav, tmp = self.wav, self.tmp
        self.wav = self.tmp = self.proc = None
        print("⏹  Transcribing…")
        sys.stdout.flush()

        try:
            rms = get_rms(wav)
            if rms < 200:
                print("   (silence — nothing heard, no text)")
            else:
                t0 = time.time()
                text = transcribe(wav)
                dt = time.time() - t0
                if text:
                    print(f"\n📝  {text}\n    [{dt:.1f}s]")
                    type_into_focused(text)
                else:
                    print("   (nothing recognized)")
        except Exception as e:
            print(f"   ⚠️  transcription error: {e}")
        finally:
            tmp.cleanup()

    # ── global keys (pynput fallback) ─────────────────────────────────────
    def on_press(self, key) -> None:
        try:
            if key == keyboard.Key.ctrl_l or key == keyboard.Key.ctrl_r:
                self.ctrl = True
            elif key == keyboard.Key.enter:
                if self.recording:
                    self.end()
            elif isinstance(key, keyboard.KeyCode):
                # pynput reports Ctrl+Z as a plain 'z' while Ctrl is held on
                # this X11/XWayland setup (NOT as '\x1a') — match both.
                ch = key.char
                if ch is not None and ch.lower() == "z" and self.ctrl:
                    self.begin()
        except Exception:
            pass

    def on_release(self, key) -> None:
        if key in (keyboard.Key.ctrl_l, keyboard.Key.ctrl_r):
            self.ctrl = False

    def run(self) -> None:
        print(f"🗣️  talk.py — voice → chat box")
        print(f"    mic source : {self.source}")
        print(f"    model      : {CONFIG['model']} ({CONFIG['device']}, {COMPUTE})")
        print(f"    Ctrl+Z     : start recording")
        print(f"    auto       : stops + transcribes ~1s after you pause")
        print(f"    Enter      : stop immediately (manual override)")
        print(f"    Ctrl+C     : quit\n")

        preload_model()  # warm the STT model in the background

        listener_cls, label = find_listener()
        if label == "evdev":
            # Wayland-proof: read kernel input devices directly.
            from evdev_listener import EvdevListener
            l = EvdevListener(on_ctrl_z=self.begin, on_enter=self.end, verbose=False)
            try:
                l.run()
            except RuntimeError as e:
                print(f"   ⚠️  evdev failed ({e}) — falling back to pynput")
                self._run_pynput()
        else:
            self._run_pynput()

    def _run_pynput(self) -> None:
        with keyboard.Listener(on_press=self.on_press,
                               on_release=self.on_release) as listener:
            listener.join()


def main():
    ap = argparse.ArgumentParser(description="Push-to-talk voice → chat text")
    ap.add_argument("--model", default=CONFIG["model"], choices=["tiny", "base", "small", "medium", "large-v3"])
    ap.add_argument("--device", default=CONFIG["device"], choices=["cuda", "cpu"])
    ap.add_argument("--source", default="auto")
    args = ap.parse_args()

    CONFIG["model"], CONFIG["device"] = args.model, args.device

    source = find_source() if args.source == "auto" else args.source
    app = TalkApp(source)
    app.run()


if __name__ == "__main__":
    main()
