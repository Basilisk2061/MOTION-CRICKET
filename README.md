# Motion-Cricket

A motion-controlled browser cricket prototype: physically bat using webcam
right-hand tracking for position and smartphone motion sensors for bat orientation.

## Features

- Browser-based 3D cricket with motion-controlled batting and swept bat–ball collision.
- AI fast/spin bowling, swing, turn, length-dependent bounce and varied field plans.
- Dynamic fielding, wicketkeeper interception and animated stump/bail impacts.
- Player-controlled **Bowling Lab** with target-based bowling and automatic physical
  bowling-motion release detection.
- Automatic FOUR, SIX and wicket replays using recorded game-space transforms,
  not re-simulated deliveries or webcam video.
- Beginner Assist, game modes and a compact batting HUD.

## How It Works

```text
Webcam → Python / MediaPipe right-wrist tracking → local WebSocket → bat position
Phone  → browser motion sensors → secure WebSocket relay       → bat orientation
                       React / Three.js browser game
```

The CV bridge listens on `ws://127.0.0.1:8765`. The Vite development server proxies
it through `/cv-ws` and runs the same-origin phone relay at `/phone-ws`.
Phone motion requires trusted HTTPS and a phone/laptop on the same trusted LAN.

## Tech Stack

React, Vite, TypeScript, Three.js / React Three Fiber, Python, OpenCV, MediaPipe,
NumPy and WebSockets. The repository contains `cv/` for tracking and `web/` for
the game, phone controller and Bowling Lab.

## Local Development

Install Node.js with npm and Python compatible with the pinned CV dependencies.
The commands below use Windows PowerShell from the cloned repository root.
Virtual environments, certificates and installed dependencies are intentionally
not included in Git.

### Webcam tracking

Create a fresh environment on your own machine:

```powershell
python -m venv cv/.venv
.\cv\.venv\Scripts\python.exe -m pip install -r .\cv\requirements.txt
.\cv\.venv\Scripts\python.exe .\cv\main.py
```

The required `cv/pose_landmarker_lite.task` model is included. A default webcam
is required. Press **C** in the CV window for position calibration; **ESC** exits.

### Desktop development

In another terminal:

```powershell
cd web
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. This is the desktop/debug server; phone sensor
testing needs the secure mode below.

### Phone-enabled development

Follow [the trusted HTTPS setup](web/PHONE_CONTROLLER.md). From `web/`, set these
variables to **your own** local certificate/key files in each new shell:

```powershell
$env:MOTION_TLS_KEY = '<path-to-your-local-private-key.pem>'
$env:MOTION_TLS_CERT = '<path-to-your-local-certificate.pem>'
npm run dev:phone
```

Open the laptop game at `https://localhost:5173` and connect the phone using the
LAN `/controller` URL/QR shown by the game. Never commit private keys or local
certificates. The development relay has no authentication: use a trusted LAN,
not a public-facing server or port-forwarded connection.

### Checks and build

From `web/`:

```powershell
npm run test:phone
node tests/replay.cjs
npx tsc --noEmit
npm run build
```

Other focused regression tests are under `web/tests` and `cv/test_*.py`.
Some older tests contain expectations from earlier tuning; the entire suite is
not currently claimed green. `npm run preview` previews build output but does
not run the development phone relay. Public deployment is not set up yet.

## Controls / Setup

1. Start CV and the phone-enabled web server. Grant webcam/sensor permissions.
2. Hold the phone securely in a comfortable batting stance and calibrate bat
   orientation in the phone controller; calibrate webcam position separately.
3. Webcam tracking supplies right-hand position; the phone supplies orientation.
   Start with gentle movements and keep the phone secure—never throw it.
4. Use **SPACE** or the calibrated phone bowl-call gesture to request a delivery
   when the game is ready. **SPACE / ESC** skips an active replay.
5. Open Bowling Lab from the menu for its separate calibration, target selection
   and physical bowling-motion controls.

Leave room around you; avoid vigorous swings near people or objects.

## Privacy

Webcam frames are processed locally by the Python CV application. The CV bridge
sends controller values, not webcam images/video. Phone motion data is relayed
between the phone and local browser game. Replay stores bounded, in-memory
game-space visual transforms, not webcam video or raw phone sensor recordings.

## Status

Active development / prototype. Tracking and phone sensor behavior need physical
testing across devices, lighting and networks. Replay camera framing also needs
visual playtesting. Screenshots and public deployment instructions will be added
when available.

No project license has been selected yet. Third-party dependencies and bundled
assets remain subject to their respective terms.
