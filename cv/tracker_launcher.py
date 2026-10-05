"""Small desktop shell around the verified tracker; no duplicate CV pipeline."""
import argparse
import json
import os
from pathlib import Path
import re
import sys
import threading
import traceback
import tkinter as tk
from tkinter import ttk
import webbrowser

PUBLIC_GAME = "https://motion-cricket.motion-cricket.workers.dev"
PUBLIC_RELAY = "wss://motion-cricket.motion-cricket.workers.dev/relay"
SESSION_PATTERN = re.compile(r"[A-HJ-NP-Z2-9]{6}")


def valid_session(value):
    return bool(SESSION_PATTERN.fullmatch(value.strip().upper()))


class Launcher:
    def __init__(self, root):
        self.root = root
        self.worker = None
        self.stop = threading.Event()
        self.calibrate = threading.Event()
        self.latest_status = "Not connected"
        self.closing = False
        root.title("Motion Cricket Tracker")
        root.resizable(False, False)
        body = ttk.Frame(root, padding=20)
        body.grid()
        ttk.Label(body, text="MOTION CRICKET TRACKER", font=("Segoe UI", 14, "bold")).grid(sticky="w")
        ttk.Label(body, text="Enter the session code from the public game.").grid(sticky="w", pady=(8, 16))
        ttk.Label(body, text="Session code").grid(sticky="w")
        self.session = tk.StringVar()
        self.session_entry = ttk.Entry(body, textvariable=self.session, width=34)
        self.session_entry.grid(sticky="ew", pady=(4, 12))
        ttk.Label(body, text="Camera").grid(sticky="w")
        self.camera = ttk.Combobox(body, values=["Camera 0 (default)", "Camera 1", "Camera 2"], state="readonly")
        self.camera.current(0)
        self.camera.grid(sticky="ew", pady=(4, 12))
        self.connect_button = ttk.Button(body, text="CONNECT", command=self.connect)
        self.connect_button.grid(sticky="ew")
        self.status = tk.StringVar(value=self.latest_status)
        ttk.Label(body, textvariable=self.status, wraplength=360).grid(sticky="w", pady=16)
        self.calibrate_button = ttk.Button(body, text="CALIBRATE", command=self.calibrate.set, state="disabled")
        self.calibrate_button.grid(sticky="ew")
        ttk.Label(body, text="Keep your right arm visible. C calibrates; ESC stops.").grid(sticky="w", pady=(12, 4))
        ttk.Button(body, text="Open public game", command=lambda: webbrowser.open(PUBLIC_GAME)).grid(sticky="w")
        root.protocol("WM_DELETE_WINDOW", self.close)
        root.after(100, self.poll)

    def connect(self):
        if self.worker and self.worker.is_alive():
            self.stop.set()
            self.latest_status = "Stopping…"
            return
        session = self.session.get().strip().upper()
        if not valid_session(session):
            self.latest_status = "Enter a valid six-character game session code."
            self.status.set(self.latest_status)
            return
        self.session.set(session)
        self.stop.clear()
        self.calibrate.clear()
        self.latest_status = "Starting camera"
        self.session_entry.configure(state="disabled")
        self.camera.configure(state="disabled")
        self.connect_button.configure(text="DISCONNECT")
        self.calibrate_button.configure(state="normal")
        self.worker = threading.Thread(target=self.run_tracker, args=(session, self.camera.current()), daemon=False)
        self.worker.start()

    def run_tracker(self, session, camera):
        try:
            from main import main
            from websocket_bridge import WebSocketBridge
            bridge = WebSocketBridge()
            bridge.relay_url, bridge.session = PUBLIC_RELAY, session
            main(camera_index=camera, stop_event=self.stop, calibrate_event=self.calibrate,
                 on_status=self.update_status, bridge=bridge)
            self.latest_status = "Stopped"
        except Exception as error:
            traceback.print_exc()
            self.latest_status = f"Error: {error}"

    def update_status(self, text):
        self.latest_status = text  # One replaceable status; Tk is touched only on its own thread.

    def poll(self):
        self.status.set(self.latest_status)
        running = self.worker is not None and self.worker.is_alive()
        if not running:
            if self.closing:
                self.root.destroy()
                return
            self.session_entry.configure(state="normal")
            self.camera.configure(state="readonly")
            self.connect_button.configure(text="CONNECT")
            self.calibrate_button.configure(state="disabled")
        self.root.after(100, self.poll)

    def close(self):
        self.closing = True
        self.stop.set()
        self.latest_status = "Stopping…"
        self.connect_button.configure(state="disabled")
        self.calibrate_button.configure(state="disabled")


def self_test(report):
    """Packaging smoke check: native initialization, one blank image, no webcam."""
    import cv2
    import mediapipe as mp
    import numpy as np
    import websockets
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision
    from main import MODEL_PATH
    assert MODEL_PATH.is_file(), "Bundled pose model missing"
    assert valid_session("K7P4AB") and not valid_session("ABC123") and not valid_session("bad"), "Session validation failed"
    options = vision.PoseLandmarkerOptions(base_options=python.BaseOptions(model_asset_path=str(MODEL_PATH)),
                                          running_mode=vision.RunningMode.VIDEO, num_poses=1)
    with vision.PoseLandmarker.create_from_options(options) as landmarker:
        landmarker.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB,
                                   data=np.zeros((480, 640, 3), dtype=np.uint8)), 1)
    root = tk.Tk()
    app = Launcher(root)
    app.session.set("bad")
    app.connect()
    assert app.worker is None and "valid" in app.status.get()
    app.session.set("K7P4AB")
    root.update()
    root.destroy()
    result = {"ok": True, "frozen": bool(getattr(sys, "frozen", False)), "model": str(MODEL_PATH),
              "python": sys.version, "prefix": sys.prefix, "cv2": cv2.__version__,
              "mediapipe": mp.__version__, "numpy": np.__version__, "websockets": websockets.__version__,
              "launcher": "opened/closed; invalid session rejected; valid session accepted",
              "native_landmarker": "initialized; blank image processed; no webcam opened"}
    Path(report).write_text(json.dumps(result, indent=2), encoding="utf-8")


def launch():
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test-report", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.self_test_report:
        self_test(args.self_test_report)
        return
    root = tk.Tk()
    Launcher(root)
    root.mainloop()


if __name__ == "__main__":
    # Windowed builds have no stdout/stderr; retain diagnostics in a user-writable location.
    if getattr(sys, "frozen", False):
        log_dir = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "MotionCricketTracker"
        log_dir.mkdir(parents=True, exist_ok=True)
        sys.stdout = sys.stderr = (log_dir / "tracker.log").open("a", encoding="utf-8", buffering=1)
    try:
        launch()
    except Exception:
        traceback.print_exc()
        raise
