# Windows tracker build

Use the existing project venv. Packaging tooling is separate from runtime requirements:

```powershell
.\cv\.venv\Scripts\python.exe -m pip install pyinstaller==6.22.3
.\cv\.venv\Scripts\python.exe -m PyInstaller --noconfirm --distpath dist --workpath build cv/MotionCricketTracker.spec
```

Distribute the entire `dist/MotionCricketTracker` folder, not just the EXE.
The ONEDIR bundle includes Python, Tk, OpenCV, NumPy, websockets, MediaPipe's
native libraries and `pose_landmarker_lite.task`. Model lookup uses the existing
module-relative `__file__` path, which PyInstaller preserves inside the bundle.
No source checkout or system Python is required on the player's machine.

Open the public game, enter its six-character session code in the launcher,
select Camera 0 unless another webcam is needed, and connect. CALIBRATE invokes
the same action as C in the existing CV window. Disconnect, ESC or closing the
launcher stops the existing loop and releases its resources. The verified
tracker is shared with `cv/main.py`; launcher controls do not replace its math.

The EXE is unsigned; normal Windows security prompts may appear. Do not disable
Defender or bypass security policies. Runtime logs are stored in the user's
local application-data `MotionCricketTracker` directory. Only existing controller
JSON is sent to the public relay; webcam frames remain local.

For a non-webcam packaged-runtime check, launch the EXE directly with
`--self-test-report <writable-report-path>`. It opens/closes the launcher, checks
session validation and initializes MediaPipe on a blank image. Physical tracking
and camera behavior must still be tested by a player.
