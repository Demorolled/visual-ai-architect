#!/usr/bin/env python3
"""
uinput_typer.py — type text via the kernel (uinput virtual keyboard).

xdotool injects X11 events, which native Wayland windows (Chrome/Electron on
GNOME Wayland) never receive. Typing through /dev/uinput inserts events at the
kernel level, so the compositor treats them as real physical keys — works in
Wayland, X11, and TTYs alike.

Requires write access to /dev/uinput (root, or `uinput` group / world-writable
device — this machine has /dev/uinput as crw-rw-rw-).

Layout: US QWERTY. Extend SHIFTED if you use a different layout.
"""
import threading
import time

from evdev import UInput, ecodes as e

# US QWERTY: plain char -> (keycode, needs_shift)
_UNSHIFTED = {
    "a": (e.KEY_A, 0), "b": (e.KEY_B, 0), "c": (e.KEY_C, 0), "d": (e.KEY_D, 0),
    "e": (e.KEY_E, 0), "f": (e.KEY_F, 0), "g": (e.KEY_G, 0), "h": (e.KEY_H, 0),
    "i": (e.KEY_I, 0), "j": (e.KEY_J, 0), "k": (e.KEY_K, 0), "l": (e.KEY_L, 0),
    "m": (e.KEY_M, 0), "n": (e.KEY_N, 0), "o": (e.KEY_O, 0), "p": (e.KEY_P, 0),
    "q": (e.KEY_Q, 0), "r": (e.KEY_R, 0), "s": (e.KEY_S, 0), "t": (e.KEY_T, 0),
    "u": (e.KEY_U, 0), "v": (e.KEY_V, 0), "w": (e.KEY_W, 0), "x": (e.KEY_X, 0),
    "y": (e.KEY_Y, 0), "z": (e.KEY_Z, 0),
    "0": (e.KEY_0, 0), "1": (e.KEY_1, 0), "2": (e.KEY_2, 0), "3": (e.KEY_3, 0),
    "4": (e.KEY_4, 0), "5": (e.KEY_5, 0), "6": (e.KEY_6, 0), "7": (e.KEY_7, 0),
    "8": (e.KEY_8, 0), "9": (e.KEY_9, 0),
    " ": (e.KEY_SPACE, 0), "\t": (e.KEY_TAB, 0), "\n": (e.KEY_ENTER, 0),
    "-": (e.KEY_MINUS, 0), "=": (e.KEY_EQUAL, 0),
    "[": (e.KEY_LEFTBRACE, 0), "]": (e.KEY_RIGHTBRACE, 0),
    ";": (e.KEY_SEMICOLON, 0), "'": (e.KEY_APOSTROPHE, 0),
    "`": (e.KEY_GRAVE, 0), "\\": (e.KEY_BACKSLASH, 0),
    ",": (e.KEY_COMMA, 0), ".": (e.KEY_DOT, 0), "/": (e.KEY_SLASH, 0),
}
_SHIFTED = {
    "A": "a", "B": "b", "C": "c", "D": "d", "E": "e", "F": "f", "G": "g",
    "H": "h", "I": "i", "J": "j", "K": "k", "L": "l", "M": "m", "N": "n",
    "O": "o", "P": "p", "Q": "q", "R": "r", "S": "s", "T": "t", "U": "u",
    "V": "v", "W": "w", "X": "x", "Y": "y", "Z": "z",
    "!": "1", "@": "2", "#": "3", "$": "4", "%": "5", "^": "6", "&": "7",
    "*": "8", "(": "9", ")": "0",
    "_": "-", "+": "=", "{": "[", "}": "]", ":": ";", '"': "'",
    "~": "`", "|": "\\", "<": ",", ">": ".", "?": "/",
}


_UI = None       # persistent device — created once so the compositor has
                  # registered it before the FIRST utterance's keystrokes fire
                  # (a fresh UInput per call ate the opening characters).
_UI_LOCK = threading.Lock()


def _get_ui() -> UInput | None:
    global _UI
    if _UI is not None:
        return _UI
    with _UI_LOCK:
        if _UI is not None:
            return _UI
        try:
            _UI = UInput()
            time.sleep(0.1)  # let the compositor pick up the new device
            return _UI
        except Exception:
            return None


def type_text(text: str, delay: float = 0.001) -> bool:
    """Type `text` through a uinput virtual keyboard. Returns True on success."""
    ui = _get_ui()
    if ui is None:
        return False
    try:
        for ch in text:
            if ch in _SHIFTED:
                base = _SHIFTED[ch]
                code = _UNSHIFTED[base][0]
                ui.write(e.EV_KEY, e.KEY_LEFTSHIFT, 1)
                ui.syn()
                ui.write(e.EV_KEY, code, 1)
                ui.write(e.EV_KEY, code, 0)
                ui.syn()
                ui.write(e.EV_KEY, e.KEY_LEFTSHIFT, 0)
                ui.syn()
            elif ch in _UNSHIFTED:
                code = _UNSHIFTED[ch][0]
                ui.write(e.EV_KEY, code, 1)
                ui.write(e.EV_KEY, code, 0)
                ui.syn()
            else:
                # Unmappable char — skip (keeps the flow moving)
                continue
            if delay:
                time.sleep(delay)
        return True
    except Exception:
        return False  # keep the device open across calls (no close)


if __name__ == "__main__":
    import sys
    ok = type_text(" ".join(sys.argv[1:]) if len(sys.argv) > 1 else "hello from uinput")
    print("✅ typed" if ok else "❌ failed")
