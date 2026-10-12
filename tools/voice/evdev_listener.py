#!/usr/bin/env python3
"""
evdev_listener.py — Wayland-proof global hotkey listener.

pynput listens on the X11 side (XTEST), which misses keypresses in native
Wayland windows (Chrome/Electron on GNOME Wayland). This listener reads the
kernel input devices directly, so it sees EVERY keypress regardless of which
display server or window has focus.

Requires read access to /dev/input/event* → run as root or add the user to
the `input` group:
    sudo usermod -aG input $USER     # then log out/in, or:
    sudo setcap cap_dac_read_search=+ep /path/to/python   # alternative

Usage (called by talk.py):
    from evdev_listener import EvdevListener
    l = EvdevListener(on_ctrl_z=begin, on_enter=end)
    l.run()          # blocks
"""
import os
import threading
import time

from evdev import InputDevice, categorize, ecodes


class EvdevListener:
    def __init__(self, on_ctrl_z=None, on_enter=None, verbose=False):
        self.on_ctrl_z = on_ctrl_z
        self.on_enter = on_enter
        self.verbose = verbose
        self._stop = threading.Event()
        # Per-device modifier state (evdev has no built-in modifier tracking)
        self._ctrl_pressed = {}
        self._mods_lock = threading.Lock()

    def _device_paths(self):
        """Pick keyboard-ish devices (have KEY_A + KEY_ENTER) and prefer
        non-virtual ones.

        NOTE: we glob + open directly instead of evdev.list_devices(), because
        that helper requires READ **and WRITE** access (os.access W_OK) which
        fails under a read-only capability (cap_dac_read_search). Opening with
        O_RDONLY|O_NONBLOCK is all we need for a passive listener.
        """
        import glob
        out = []
        for path in glob.glob("/dev/input/event*"):
            try:
                dev = InputDevice(path)
                caps = dev.capabilities(verbose=False)
                keys = caps.get(ecodes.EV_KEY, [])
                if not keys:
                    dev.close()
                    continue
                if ecodes.KEY_A in keys and ecodes.KEY_ENTER in keys:
                    name = dev.name
                    if any(v in name.lower() for v in ("virtual", "synthetic")):
                        dev.close()
                        continue
                    out.append(path)
                dev.close()
            except PermissionError:
                continue  # not readable by us — skip silently
            except Exception:
                continue
        return out

    def run(self):
        paths = self._device_paths()
        if not paths:
            raise RuntimeError("no keyboard input devices found")
        if self.verbose:
            print(f"   evdev devices: {len(paths)}")
        # Dedup: physical keyboards may appear multiple times (usb-0:1.1 etc.)
        # Reading the same key from two devices is harmless (idempotent begin/end).
        threads = []
        for p in paths:
            t = threading.Thread(target=self._read_loop_safe, args=(p,), daemon=True)
            t.start()
            threads.append(t)
        try:
            while not self._stop.is_set():
                self._stop.wait(1)
        finally:
            self._stop.set()

    def _read_loop_safe(self, path):
        """Wrapper so an unexpected error in one device thread is logged and
        the loop retries instead of silently killing the hotkey listener."""
        while not self._stop.is_set():
            try:
                self._read_loop(path)
            except Exception as e:
                if self.verbose:
                    print(f"   [evdev] {path} error: {e} — restarting loop", flush=True)
                time.sleep(1)

    def _read_loop(self, path):
        # IMPORTANT: do NOT grab() — that would steal keys from apps.
        # evdev broadcasts events to all readers; passive read is enough.
        dev = InputDevice(path)
        ctrl = False
        try:
            for event in dev.read_loop():
                if event.type != ecodes.EV_KEY:
                    continue
                data = categorize(event)
                code = data.scancode
                # Track modifier state on BOTH down and up
                if code in (ecodes.KEY_LEFTCTRL, ecodes.KEY_RIGHTCTRL):
                    ctrl = data.keystate in (1, 2)  # down or repeat = held
                    with self._mods_lock:
                        self._ctrl_pressed[path] = ctrl
                    continue
                if data.keystate != 1:  # only key-down triggers hotkeys
                    continue
                if self.verbose:
                    name = ecodes.KEY.get(code, "?")
                    print(f"   [evdev] {name} (ctrl={'Y' if ctrl else 'N'})", flush=True)
                if code == ecodes.KEY_ENTER:
                    if self.on_enter:
                        self.on_enter()
                elif code in (ecodes.KEY_Z, getattr(ecodes, "KEY_Z_102", -1)):
                    if ctrl:
                        if self.on_ctrl_z:
                            self.on_ctrl_z()
        finally:
            dev.close()


if __name__ == "__main__":
    import sys

    def b():
        print(">>> CTRL+Z pressed (record)")

    def e():
        print(">>> ENTER pressed (stop)")

    print("evdev listener test — Ctrl+Z / Enter (Ctrl+C to quit)")
    EvdevListener(on_ctrl_z=b, on_enter=e, verbose=True).run()
