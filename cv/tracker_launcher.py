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


def display_status(text, running):
    """Presentation of the existing status callback, never a second tracking state."""
    camera = 'READY' if 'Camera ready' in text else 'STARTING' if text == 'Starting camera' else 'NOT OPEN'
    game = 'RELAY CONNECTED' if 'Game connected' in text else 'CONNECTING' if running else 'NOT CONNECTED'
    tracking = 'ACTIVE' if '\nTracking |' in text else 'ARM NOT VISIBLE' if 'Right hand not visible' in text else 'WAITING'
    calibration = text.rsplit('|', 1)[-1].strip() if 'Camera ready' in text else 'NEEDED'
    calibration = 'READY' if calibration == 'CALIBRATED' else calibration.replace('_', ' ')
    return {'CAMERA': camera, 'GAME': game, 'TRACKING': tracking, 'CALIBRATION': calibration}


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
        root.configure(bg='#0d0d0d')
        style = ttk.Style(root)
        style.theme_use('clam')
        style.configure('Tracker.TCombobox', fieldbackground='#191919', background='#242424',
                        foreground='#f3f3f1', arrowcolor='#ddd', bordercolor='#424242',
                        padding=10, font=('Segoe UI', 11))
        style.map('Tracker.TCombobox', fieldbackground=[('readonly', '#191919'), ('disabled', '#151515')],
                  foreground=[('disabled', '#777'), ('readonly', '#f3f3f1')])
        root.option_add('*TCombobox*Listbox.background', '#191919')
        root.option_add('*TCombobox*Listbox.foreground', '#f3f3f1')
        body = tk.Frame(root, bg='#0d0d0d', padx=30, pady=20)
        body.grid()
        body.columnconfigure(0, minsize=380)
        def label(text, **options):
            return tk.Label(body, text=text, bg='#0d0d0d', fg='#aaa', font=('Segoe UI', 10), **options)
        header = tk.Frame(body, bg='#0d0d0d')
        header.grid(sticky='ew')
        tk.Label(header, text='MOTION\nCRICKET', justify='left', bg='#0d0d0d', fg='#f3f3f1',
                 font=('Segoe UI', 26, 'bold'), anchor='w').pack(side='left')
        tk.Label(header, text='TRACKER\nWINDOWS / PORTABLE', justify='right', bg='#0d0d0d', fg='#aaa',
                 font=('Segoe UI', 8), anchor='e').pack(side='right', anchor='s', pady=8)
        label('Connect your webcam to the game.').grid(sticky='w', pady=(8, 16))
        label('SESSION CODE').grid(sticky='w')
        self.session = tk.StringVar()
        self.session_entry = tk.Entry(body, textvariable=self.session, width=20, justify='center',
                                      font=('Consolas', 22, 'bold'), bg='#191919', fg='#f3f3f1',
                                      insertbackground='#fff', disabledbackground='#151515', disabledforeground='#c5c5c1',
                                      relief='flat', highlightthickness=1, highlightbackground='#424242', highlightcolor='#fff')
        self.session_entry.grid(sticky="ew", pady=(8, 14), ipady=7)
        self.session_entry.bind('<Return>', lambda event: self.connect())
        label('CAMERA').grid(sticky="w")
        self.camera = ttk.Combobox(body, values=["Camera 0 (default)", "Camera 1", "Camera 2"],
                                   state="readonly", style='Tracker.TCombobox')
        self.camera.current(0)
        self.camera.grid(sticky="ew", pady=(8, 14))
        self.connect_button = tk.Button(body, text="CONNECT", command=self.connect, bg='#f3f3f1', fg='#101010',
                                        activebackground='#d8d8d6', activeforeground='#101010', relief='flat', bd=0,
                                        font=('Segoe UI', 11, 'bold'), pady=10, cursor='hand2')
        self.connect_button.grid(sticky="ew")
        status_panel = tk.Frame(body, bg='#0d0d0d', pady=12)
        status_panel.grid(sticky='ew')
        status_panel.columnconfigure(1, weight=1)
        self.status_rows = {}
        for index, (name, value) in enumerate(display_status(self.latest_status, False).items()):
            tk.Label(status_panel, text='•  '+name, bg='#0d0d0d', fg='#999',
                     font=('Segoe UI', 9), anchor='w').grid(row=index, column=0, sticky='w', pady=3)
            variable = tk.StringVar(value=value)
            self.status_rows[name] = variable
            tk.Label(status_panel, textvariable=variable, bg='#0d0d0d', fg='#eee',
                     font=('Segoe UI', 9, 'bold'), anchor='e').grid(row=index, column=1, sticky='e', pady=3)
        self.status = tk.StringVar(value=self.latest_status)
        tk.Label(body, textvariable=self.status, wraplength=380, justify='left', bg='#0d0d0d', fg='#aaa',
                 font=('Segoe UI', 9)).grid(sticky='w', pady=(0, 12))
        self.calibrate_button = tk.Button(body, text="CALIBRATE", command=self.calibrate.set, state="disabled",
                                          bg='#222', fg='#eee', activebackground='#333', activeforeground='#fff',
                                          disabledforeground='#777', relief='flat', bd=0, font=('Segoe UI', 10, 'bold'), pady=9)
        self.calibrate_button.grid(sticky="ew")
        label('Keep your right arm visible.\nC = calibrate in webcam window    ESC = stop', justify='left').grid(sticky="w", pady=(12, 10))
        links = tk.Frame(body, bg='#0d0d0d')
        links.grid(sticky='ew')
        for text, command in [('OPEN MOTION CRICKET ↗', lambda: webbrowser.open(PUBLIC_GAME)), ('HOW TO CONNECT', self.show_help)]:
            tk.Button(links, text=text, command=command, bg='#0d0d0d', fg='#ccc', activebackground='#0d0d0d',
                      activeforeground='#fff', relief='flat', bd=0, font=('Segoe UI', 8, 'bold'), cursor='hand2').pack(side='left', padx=(0, 18))
        root.bind('<Escape>', lambda event: self.stop.set())
        root.protocol("WM_DELETE_WINDOW", self.close)
        root.after(100, self.poll)

    def show_help(self):
        window = tk.Toplevel(self.root)
        window.title('How to connect')
        window.configure(bg='#101010')
        window.resizable(False, False)
        tk.Label(window, text='YOUR SETUP. SIX STEPS.', bg='#101010', fg='#fff',
                 font=('Segoe UI', 16, 'bold')).pack(anchor='w', padx=26, pady=(26, 16))
        tk.Label(window, text='1   Open Motion Cricket in your browser.\n2   Enter its six-character game code here.\n3   Select your camera and choose CONNECT.\n4   Stand naturally, right-handed and side-on.\n5   Keep your right arm visible. CALIBRATE.\n6   Calibrate your phone in the same grip. Play.',
                 justify='left', bg='#101010', fg='#ccc', font=('Segoe UI', 11)).pack(padx=26, pady=(0, 20))
        tk.Button(window, text='GOT IT', command=window.destroy, bg='#eee', fg='#111',
                  relief='flat', padx=24, pady=9).pack(anchor='e', padx=26, pady=(0, 24))
        window.bind('<Escape>', lambda event: window.destroy())

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
        running = self.worker is not None and self.worker.is_alive()
        self.status.set(self.latest_status if 'Camera ready' not in self.latest_status else 'Webcam preview running. Keep this window open.')
        for name, value in display_status(self.latest_status, running).items():
            self.status_rows[name].set(value)
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
