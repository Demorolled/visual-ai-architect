#!/usr/bin/env python3
"""
System Awareness Daemon for the Veronica Terminal
==================================================

A background daemon that monitors the Linux system (processes, active windows,
CPU/memory/disk usage) and feeds this data into the Visual AI Architect backend.

The daemon:
  - Polls system state every 5 seconds
  - Captures top CPU & memory processes, active window title, system load
  - POSTs data to the backend REST API
  - Runs as a daemon: nohup, auto-restart on error, graceful shutdown on SIGTERM

Usage:
  python3 system_monitor.py                    # Foreground (test mode)
  python3 system_monitor.py --daemon           # Background daemon
  python3 system_monitor.py --stop             # Stop running daemon
  python3 system_monitor.py --status           # Check if running

Requires: psutil, requests
"""

import os
import sys
import time
import json
import signal
import atexit
import logging
import argparse
import subprocess
from datetime import datetime
from pathlib import Path

# Configure logging
LOG_DIR = Path(__file__).parent / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / "system_monitor.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(str(LOG_FILE)),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("system-monitor")

# PID file for daemon tracking
PID_FILE = Path(__file__).parent / ".system_monitor.pid"

# Default backend URL
DEFAULT_BACKEND_URL = "http://localhost:3001"

# Poll interval in seconds
POLL_INTERVAL = 5

# ─── Process & System Data Collection ──────────────────────────────────────

# Known user-facing applications for Wayland process-based detection
# These are apps users typically interact with directly (not background daemons)
USER_FACING_PROCESSES = {
    # Browsers
    'firefox', 'firefox-esr', 'firefox-bin', 'chrome', 'chromium', 'chromium-browser',
    'brave', 'brave-browser', 'opera', 'edge', 'msedge', 'vivaldi', 'thorium',
    # Editors / IDEs
    'code', 'code-oss', 'codium', 'vim', 'nvim', 'neovim', 'emacs', 'emacs-nox',
    'gedit', 'kate', 'sublime_text', 'atom', 'notepadqq', 'geany', 'mousepad',
    'nano', 'micro', 'helix', 'zed', 'zeditor',
    # Terminals
    'gnome-terminal', 'gnome-terminal-server', 'konsole', 'xfce4-terminal', 'lxterminal',
    'alacritty', 'kitty', 'wezterm', 'foot', 'footclient', 'st', 'st-256color',
    'urxvt', 'rxvt', 'rxvt-unicode', 'terminator', 'tilix', 'termite',
    'cool-retro-term', 'deepin-terminal', 'pantheon-terminal', 'guake',
    'tmux', 'screen',
    # File managers
    'nautilus', 'thunar', 'dolphin', 'nemo', 'pcmanfm', 'caja', 'konqueror',
    'ranger', 'lf', 'nnn', 'vifm', 'joshuto',
    # Communication
    'slack', 'discord', 'telegram', 'telegram-desktop', 'signal', 'element',
    'thunderbird', 'evolution', 'geary', 'mailspring', 'rambox',
    'whatsapp-nativefier', 'ferdium',
    # Multimedia
    'vlc', 'mpv', 'totem', 'rhythmbox', 'spotify', 'audacity', 'kdenlive',
    'obs', 'obs-studio', 'gimp', 'inkscape', 'blender',
    # Design / Creative
    'figma', 'gimp', 'inkscape', 'krita', 'mypaint', 'pinta',
    # Document / Office
    'libreoffice', 'onlyoffice', 'wps', 'evince', 'okular', 'zathura',
    # System
    'gnome-shell', 'kwin_x11', 'kwin_wayland', 'plasma_session', 'cinnamon',
    'muffin', 'xfwm4', 'openbox', 'i3', 'sway', 'hyprland',
    # Other common apps
    'obsidian', 'logseq', 'notion', 'todoist',
    'steam', 'lutris', 'heroic',
    'docker', 'docker-desktop',
    'postman', 'insomnia',
    'mysql-workbench', 'sqlectron', 'dbeaver', 'tableplus',
}

def _get_active_window_process_based() -> str:
    """
    Wayland fallback: detect the most likely active app using process analysis.

    On Wayland, X11 window detection tools (xprop, xdotool) don't work.
    This heuristic looks for user-facing processes that have been recently
    active (high CPU) and picks the most likely foreground application.

    Returns a descriptive string like "Firefox" or "VS Code" or "(unknown)".
    """
    try:
        import psutil
        user_apps = []

        for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'create_time', 'username']):
            try:
                pinfo = proc.info
                name = (pinfo['name'] or '').lower()

                # Skip kernel/system processes and our own daemon
                if not name or name in ('systemd', 'kworker', 'kthreadd', 'python3', 'system_monitor'):
                    continue
                if pinfo['username'] != psutil.Process().username() and pinfo['username'] not in ('root',):
                    continue

                # Check if this is a known user-facing app
                is_user_facing = False
                for pattern in USER_FACING_PROCESSES:
                    if name == pattern or name.startswith(pattern):
                        is_user_facing = True
                        break

                if not is_user_facing:
                    # Also catch any GUI app by checking for display connection
                    try:
                        env = proc.environ()
                        if 'DISPLAY' in env or 'WAYLAND_DISPLAY' in env:
                            is_user_facing = True
                    except (psutil.AccessDenied, psutil.ZombieProcess, OSError):
                        pass

                if is_user_facing:
                    user_apps.append({
                        'name': name,
                        'cpu': pinfo['cpu_percent'] or 0,
                        'create_time': pinfo['create_time'] or 0,
                    })
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue

        if not user_apps:
            return "(unknown)"

        # Score: favor high CPU (recent activity) + recently started
        now = time.time()
        for app in user_apps:
            age_hours = (now - app['create_time']) / 3600 if app['create_time'] else 24
            recency_score = max(0, 1 - (age_hours / 24))  # 0-1, newer = higher
            app['score'] = app['cpu'] * 0.7 + recency_score * 30 * 0.3

        # Sort by score descending
        user_apps.sort(key=lambda a: a['score'], reverse=True)

        # Pick the best one
        best = user_apps[0]
        app_name = best['name'].capitalize()

        # Add context if there are other notable apps
        if len(user_apps) > 1 and user_apps[1]['cpu'] > 2:
            second = user_apps[1]['name'].capitalize()
            app_name = f"{app_name} (+ {second})"

        return app_name

    except Exception as e:
        log.debug(f"Process-based window detection failed: {e}")
        return "(unknown)"


def get_top_cpu_processes(count: int = 15) -> list[dict]:
    """Get the top CPU-consuming processes."""
    processes = []
    try:
        import psutil
        for proc in psutil.process_iter(["pid", "name", "cpu_percent", "memory_percent", "status", "create_time"]):
            try:
                pinfo = proc.info
                processes.append({
                    "pid": pinfo["pid"],
                    "name": pinfo["name"] or "?",
                    "cpu_percent": round(pinfo["cpu_percent"] or 0, 1),
                    "memory_percent": round(pinfo["memory_percent"] or 0, 1),
                    "status": pinfo["status"] or "?",
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
    except ImportError:
        return [{"error": "psutil not installed"}]

    # Sort by CPU descending
    processes.sort(key=lambda p: p["cpu_percent"], reverse=True)
    return processes[:count]


def get_top_memory_processes(count: int = 5) -> list[dict]:
    """Get the top memory-consuming processes."""
    processes = []
    try:
        import psutil
        for proc in psutil.process_iter(["pid", "name", "memory_percent", "memory_info", "status"]):
            try:
                pinfo = proc.info
                mem_mb = round((pinfo["memory_info"].rss if pinfo["memory_info"] else 0) / (1024 * 1024), 1)
                processes.append({
                    "pid": pinfo["pid"],
                    "name": pinfo["name"] or "?",
                    "memory_percent": round(pinfo["memory_percent"] or 0, 1),
                    "memory_mb": mem_mb,
                    "status": pinfo["status"] or "?",
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
    except ImportError:
        return [{"error": "psutil not installed"}]

    processes.sort(key=lambda p: p["memory_percent"], reverse=True)
    return processes[:count]


def get_active_window_title() -> str:
    """Get the title of the currently focused window on Linux."""
    # 1. Try pure xprop first (X11 / XWayland, no xdotool needed)
    try:
        title = _get_active_window_pure_xprop()
        if title:
            return title.strip()
    except Exception:
        pass

    # 2. Try xdotool if available (X11 / XWayland)
    try:
        result = subprocess.run(
            ["xdotool", "getactivewindow", "getwindowname"],
            capture_output=True, text=True, timeout=2
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # 3. Try local compiled xdotool if installed
    local_xdotool = Path(__file__).parent / ".xdotool"
    if local_xdotool.exists():
        try:
            result = subprocess.run(
                [str(local_xdotool), "getactivewindow", "getwindowname"],
                capture_output=True, text=True, timeout=2
            )
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout.strip()
        except Exception:
            pass

    # 4. Wayland fallback: process-based heuristic (works on both X11 and Wayland)
    log.debug("X11 window detection unavailable — using process-based heuristic")
    return _get_active_window_process_based()


def _get_active_window_pure_xprop() -> str | None:
    """
    Get active window title using ONLY xprop (no xdotool needed).

    This queries the X11 root window's _NET_ACTIVE_WINDOW property to find
    the currently focused window's ID, then fetches its WM_NAME.

    Works with: xprop (usually pre-installed on Linux)
    Does NOT need: xdotool, wmctrl, or any other X11 utilities
    """
    try:
        # Step 1: Get active window ID from root window
        # _NET_ACTIVE_WINDOW is an EWMH property on the root window
        result = subprocess.run(
            ["xprop", "-root", "_NET_ACTIVE_WINDOW"],
            capture_output=True, text=True, timeout=2
        )
        if result.returncode != 0:
            log.debug("xprop -root failed")
            return None

        # Parse: _NET_ACTIVE_WINDOW(WINDOW): window id # 0x1234567
        wid = None
        for line in result.stdout.split("\n"):
            if "_NET_ACTIVE_WINDOW" in line and "window id #" in line:
                parts = line.strip().split()
                if parts:
                    wid = parts[-1]  # Last token is the window ID
                break

        if not wid or wid == "0x0":
            log.debug("No active window found")
            return None

        # Step 2: Get WM_NAME for that window
        result = subprocess.run(
            ["xprop", "-id", wid, "WM_NAME"],
            capture_output=True, text=True, timeout=2
        )
        if result.returncode != 0:
            return None

        # Parse: WM_NAME(STRING) = "My Window Title"
        # Or: WM_NAME(UTF8_STRING) = "My Title"
        for line in result.stdout.split("\n"):
            if 'WM_NAME' in line and '=' in line:
                title = line.split("=", 1)[1].strip().strip('"')
                if title and title != "0x0":
                    return title

    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        log.debug(f"xprop not available: {e}")
    except Exception as e:
        log.debug(f"Error in xprop window detection: {e}")

    return None


def get_system_load() -> dict:
    """Get overall system load metrics."""
    try:
        import psutil
        return {
            "cpu_percent": psutil.cpu_percent(interval=0.5),
            "cpu_count": psutil.cpu_count(),
            "cpu_per_core": psutil.cpu_percent(interval=0.3, percpu=True),
            "ram_percent": psutil.virtual_memory().percent,
            "ram_used_gb": round(psutil.virtual_memory().used / (1024**3), 1),
            "ram_total_gb": round(psutil.virtual_memory().total / (1024**3), 1),
            "disk_percent": psutil.disk_usage("/").percent,
            "disk_used_gb": round(psutil.disk_usage("/").used / (1024**3), 1),
            "disk_total_gb": round(psutil.disk_usage("/").total / (1024**3), 1),
            "boot_time": datetime.fromtimestamp(psutil.boot_time()).isoformat(),
            "uptime_hours": round((time.time() - psutil.boot_time()) / 3600, 1),
        }
    except ImportError:
        return {"error": "psutil not installed"}


def collect_system_state() -> dict:
    """Collect all system state into a single payload."""
    import psutil
    active_window = get_active_window_title()

    return {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "active_window": active_window,
        "active_window_basename": os.path.basename(active_window.split(" — ")[0].split(" - ")[0]) if active_window else "",
        "process_count": len(psutil.pids()),
        "top_cpu": get_top_cpu_processes(15),
        "top_memory": get_top_memory_processes(5),
        "load": get_system_load(),
    }


# ─── Screenshot Capture (on-demand via mss) ───────────────────────────

def capture_screenshot() -> str | None:
    """
    Capture a screenshot using Python MSS and return it as a base64 PNG string.

    Uses the `mss` library which works on both X11 and Wayland.
    Returns None if the capture fails.
    """
    try:
        import mss
        import base64
        from io import BytesIO

        with mss.mss() as sct:
            # Capture the second monitor (index 2) where Davinci is running
            # Falls back to primary if only one monitor is connected
            monitor = sct.monitors[2] if len(sct.monitors) > 2 else sct.monitors[1]
            im = sct.grab(monitor)

            # Convert to PNG bytes using mss's built-in PNG encoder
            buf = BytesIO()
            mss.tools.to_png(im.rgb, im.size, output=buf)
            png_bytes = buf.getvalue()

            # Encode as base64
            b64 = base64.b64encode(png_bytes).decode('utf-8')
            log.info(f"Screenshot captured: {im.size[0]}x{im.size[1]}, {len(png_bytes) // 1024}KB")
            return b64

    except ImportError:
        log.error("mss library not installed — cannot capture screenshot")
        return None
    except Exception as e:
        log.error(f"Screenshot capture failed: {e}")
        return None


# ─── HTTP Communication ────────────────────────────────────────────────────

def post_to_backend(state: dict, backend_url: str) -> bool:
    """POST system state to the backend. Returns True on success."""
    import requests
    try:
        url = f"{backend_url.rstrip('/')}/api/system-monitor/report"
        resp = requests.post(url, json=state, timeout=5)
        if resp.status_code == 200:
            return True
        else:
            log.warning(f"Backend returned {resp.status_code}: {resp.text[:200]}")
            return False
    except requests.ConnectionError:
        return False
    except Exception as e:
        log.warning(f"Failed to POST to backend: {e}")
        return False


# ─── Daemon Lifecycle ──────────────────────────────────────────────────────

running = True


def signal_handler(signum, frame):
    """Handle termination signals gracefully."""
    global running
    log.info(f"Received signal {signum}, shutting down...")
    running = False


def cleanup():
    """Remove PID file on exit."""
    if PID_FILE.exists():
        PID_FILE.unlink()
        log.info("PID file removed")


def write_pid():
    """Write current PID to PID file."""
    PID_FILE.write_text(str(os.getpid()))
    log.info(f"PID {os.getpid()} written to {PID_FILE}")


def is_running() -> bool:
    """Check if daemon is already running."""
    if not PID_FILE.exists():
        return False
    try:
        pid = int(PID_FILE.read_text().strip())
        # Check if process exists
        os.kill(pid, 0)
        return True
    except (ValueError, ProcessLookupError, OSError):
        # Stale PID file
        PID_FILE.unlink(missing_ok=True)
        return False


def stop_daemon():
    """Stop the running daemon."""
    if not PID_FILE.exists():
        print("No PID file found. Daemon is not running.")
        return
    try:
        pid = int(PID_FILE.read_text().strip())
        os.kill(pid, signal.SIGTERM)
        print(f"Sent SIGTERM to PID {pid}")
        # Wait for it to die
        for _ in range(10):
            try:
                os.kill(pid, 0)
                time.sleep(0.3)
            except ProcessLookupError:
                break
        if PID_FILE.exists():
            PID_FILE.unlink()
        print("Daemon stopped.")
    except ProcessLookupError:
        print(f"PID {pid} not found (already stopped). Cleaning up.")
        PID_FILE.unlink(missing_ok=True)
    except Exception as e:
        print(f"Error stopping daemon: {e}")


def run_foreground(backend_url: str):
    """Run the monitor in the foreground (test mode)."""
    global running
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    atexit.register(cleanup)
    write_pid()

    log.info(f"System Awareness Daemon started (foreground)")
    log.info(f"Backend URL: {backend_url}")
    log.info(f"Poll interval: {POLL_INTERVAL}s")
    log.info(f"Log file: {LOG_FILE}")
    log.info("Press Ctrl+C to stop")

    consecutive_errors = 0

    while running:
        try:
            state = collect_system_state()

            if post_to_backend(state, backend_url):
                consecutive_errors = 0
                log.debug(f"Reported: CPU {state['load']['cpu_percent']}% | "
                          f"RAM {state['load']['ram_percent']}% | "
                          f"Window: {state['active_window'][:50]}")
            else:
                consecutive_errors += 1
                if consecutive_errors == 1:
                    log.info("Backend not reachable yet — will retry...")
                elif consecutive_errors % 12 == 0:  # Every ~60s
                    log.info(f"Still waiting for backend... ({consecutive_errors} attempts)")

        except Exception as e:
            log.error(f"Error in poll cycle: {e}", exc_info=True)
            consecutive_errors += 1

        # Wait for the next interval (but wake up immediately if stopping)
        for _ in range(POLL_INTERVAL):
            if not running:
                break
            time.sleep(1)

    log.info("Daemon stopped gracefully")


def run_daemon(backend_url: str):
    """Run the monitor as a background daemon."""
    if is_running():
        print("Daemon is already running. Use --stop to stop it first.")
        sys.exit(1)

    pid = os.fork()
    if pid > 0:
        # Parent process — exit
        print(f"System Awareness Daemon started (PID: {pid})")
        print(f"Backend URL: {backend_url}")
        print(f"Poll interval: {POLL_INTERVAL}s")
        print(f"Log file: {LOG_FILE}")
        print(f"Use --stop to stop")
        sys.exit(0)

    # Child process — become daemon
    os.setsid()
    # Second fork to fully detach
    pid2 = os.fork()
    if pid2 > 0:
        sys.exit(0)

    # Redirect stdio to /dev/null (logging goes to file)
    sys.stdout.flush()
    sys.stderr.flush()
    with open("/dev/null", "r") as f:
        os.dup2(f.fileno(), sys.stdin.fileno())
    with open("/dev/null", "w") as f:
        os.dup2(f.fileno(), sys.stdout.fileno())
        os.dup2(f.fileno(), sys.stderr.fileno())

    signal.signal(signal.SIGINT, signal.SIG_IGN)
    signal.signal(signal.SIGTERM, signal_handler)
    atexit.register(cleanup)
    write_pid()

    run_foreground(backend_url)


# ─── Entry Point ────────────────────────────────────────────────────────────

def main():
    global POLL_INTERVAL  # Must be first — Python 3.12+ requires global before any reference

    parser = argparse.ArgumentParser(
        description="System Awareness Daemon for Veronica Terminal",
    )
    parser.add_argument(
        "--daemon", action="store_true",
        help="Run as background daemon"
    )
    parser.add_argument(
        "--stop", action="store_true",
        help="Stop running daemon"
    )
    parser.add_argument(
        "--status", action="store_true",
        help="Check if daemon is running"
    )
    parser.add_argument(
        "--backend", type=str, default=DEFAULT_BACKEND_URL,
        help=f"Backend URL (default: {DEFAULT_BACKEND_URL})"
    )
    parser.add_argument(
        "--interval", type=int, default=POLL_INTERVAL,
        help=f"Poll interval in seconds (default: {POLL_INTERVAL})"
    )

    args = parser.parse_args()

    if args.stop:
        stop_daemon()
        return

    if args.status:
        if is_running():
            pid = int(PID_FILE.read_text().strip())
            print(f"● System Awareness Daemon is RUNNING (PID: {pid})")
            print(f"   Log file: {LOG_FILE}")
        else:
            print("○ System Awareness Daemon is NOT running")
        return

    if args.daemon:
        run_daemon(args.backend)
    else:
        POLL_INTERVAL = args.interval
        run_foreground(args.backend)


if __name__ == "__main__":
    main()
