# Phone controller — local development

No CV changes are required. Phone orientation is authoritative in PHONE mode;
the existing CV controller supplies position only. Without CV, the handle stays
at its last position (initially the existing neutral handle position). Marker
debug remains selectable. No accelerometer position integration is performed.

## One-time trusted HTTPS setup (Windows PowerShell)

Find the laptop's active LAN IPv4 address with `ipconfig`. The phone and laptop
must share that trusted LAN, not an isolated guest network. Do not use virtual
adapter addresses. Replace the placeholder below with your active LAN address.

Install [mkcert](https://github.com/FiloSottile/mkcert), then reopen PowerShell if
its executable is not yet on PATH:

```powershell
winget install --id FiloSottile.mkcert --exact
```

Create a local development CA and certificate. These commands ask you to trust
that CA; this is an explicit local trust change, not a certificate-warning bypass.
Private keys stay outside the project/web-served directory.

```powershell
mkcert -install
$motionCertDir = Join-Path $env:LOCALAPPDATA 'MotionCricket\certs'
$motionLanIp = '<your-active-LAN-IPv4-address>'
New-Item -ItemType Directory -Force -Path $motionCertDir
mkcert -key-file "$motionCertDir\lan-key.pem" -cert-file "$motionCertDir\lan.pem" localhost 127.0.0.1 $motionLanIp
mkcert -CAROOT
```

From the directory printed by `mkcert -CAROOT`, transfer **only `rootCA.pem`** to
your phone (rename the public copy `rootCA.crt` if its installer requires it).
Never transfer `rootCA-key.pem` or `lan-key.pem`.

- iPhone/iPad: install the downloaded profile in Settings, then enable full trust
  under General → About → Certificate Trust Settings for that CA.
- Android: install it as a **CA certificate** in Security/Credentials settings
  (exact labels vary), then reopen Chrome. Only trust your own development CA.

Remove the development CA from the phone when no longer needed. Simply clicking
through an HTTPS warning is not the supported setup. See
[mkcert mobile trust instructions](https://github.com/FiloSottile/mkcert#mobile-devices).

## Run

Terminal 1, optional webcam position (existing calibration controls unchanged):

```powershell
# From your cloned repository root
.\cv\.venv\Scripts\python.exe .\cv\main.py
```

Terminal 2, **set these variables each new shell**:

```powershell
cd web
$env:MOTION_TLS_KEY = "$env:LOCALAPPDATA\MotionCricket\certs\lan-key.pem"
$env:MOTION_TLS_CERT = "$env:LOCALAPPDATA\MotionCricket\certs\lan.pem"
npm run dev:phone
```

Allow Node through Windows Firewall for your **private** LAN if prompted. No
port forwarding/public exposure is needed. The development relay has no user
authentication: use a trusted LAN only. Port 5173 must be available.

- Laptop game: **https://localhost:5173/**
- Phone: **https://<your-active-LAN-IPv4-address>:5173/controller** (or use the game's QR)

The certificate must include the current LAN IP; regenerate it if that IP changes.
`npm run dev` remains loopback HTTP for desktop/marker debugging, not phone sensor
testing. `npm run preview` does not run the relay; use the dev command above.

## Physical procedure

1. Open the phone URL, keep it visible/unlocked, tap **START / ENABLE MOTION**.
2. Grant orientation and motion permissions. Wait for Sensors AVAILABLE.
3. Hold the phone securely in your normal stance. Physical phone **top edge**
   points along the imaginary blade, physical screen is the blade face. Face the
   screen toward you during calibration to define yaw; do not calibrate face-up.
4. Tap **CALIBRATE BAT**. Neutral preserves your measured grip tilt (not forced bat-down).
5. In the laptop select PHONE (default). Hold still, slowly backlift, return,
   then rotate left/right. No vigorous swinging is needed. Recalibrate if drift
   appears. CV `C` remains a separate position calibration, if using webcam.
6. Press SPACE with the laptop game focused. Test misses with bat out of the
   ball path, then gentle hits. Camera follows only after contact or a passed ball.

## Math and contract

`phone.ts` centralizes the mapping. Browser alpha/beta/gamma become a quaternion
using intrinsic Z-X-Y, then `Qrelative = inverse(Qneutral) * Qcurrent`.
Phase 6.1 uses a gravity-aligned player basis W: device-world vertical maps to
player +Y; the horizontal neutral screen normal defines +Z toward the player.
`QneutralBat = W * Qneutral * inverse(B)` and
`Qbat = QneutralBat * B * Qrelative * inverse(B) = W * Qcurrent * inverse(B)`.
B is the fixed 180°-Z phone-to-model mount, not a player-world basis:

- physical phone +Y (top) → bat -Y (handle toward blade);
- phone +Z (out of screen) → blade face +Z;
- phone +X maps through the calibrated player basis, not a fixed player-left
  sign flip. Player up is +Y, right +X, down pitch -Z. Absolute player yaw cannot
  be inferred from a single IMU stance: the screen-facing-you reference matters.

The APIs use the phone's fixed natural-orientation axes. Portrait/landscape UI
changes therefore do **not** receive an extra rotation. Screen angle is shown
for diagnosis; do not reinterpret it as device orientation. Reference:
[W3C device orientation/motion coordinate definitions](https://www.w3.org/TR/orientation-event/).

`DeviceMotion.rotationRate` beta/gamma/alpha maps to device X/Y/Z, deg/s → rad/s,
then to the same player frame. If missing, quaternion differences estimate
angular velocity. Small dead zones/light filtering reduce rest noise; fast
rotation bypasses that filtering. Swing speed is `|omega| * 0.65m`, an estimate,
not measured translational speed. Acceleration is diagnostic only.

Phone → same-origin `/phone-ws?role=phone` → Vite relay → game. HTTPS uses WSS.
Latest samples only, capped near 60/s; slow-client samples are dropped. One phone
at a time. Close its page before using a different phone. Broken connections are
heartbeat-checked; reconnect may take up to about 10 seconds.

Messages: `type: "phone-controller"`, epoch-ms `timestamp`, `calibrated`,
`calibrationId`, `orientation: {x,y,z,w}` (relative player frame),
`angularVelocity: {x,y,z}` (rad/s, player frame), `acceleration: {x,y,z}|null`
(m/s², player frame), `accelerationMagnitude|null`, `swingSpeed` (m/s estimate),
`sensorHz`, `screenAngle` (degrees). Freshness uses laptop receive time, not
cross-device clock subtraction. No fresh sample for 350ms → STALE; disconnected
socket → DISCONNECTED. Orientation holds, and collisions stop while stale.

Vite proxies `/cv-ws` to existing loopback `ws://127.0.0.1:8765`; Python is
unchanged. Position loss never changes phone rotation. On calibration/source
changes/reacquisition, contact is disabled until the bat has caught up.
Swept collision is retained. Contact velocity is `v_handle + omega × r`, using
mapped accepted CV velocity and phone angular velocity in the player frame.

Accepted ACTIVE **or DEGRADED** CV samples drive PHONE-mode position. Rejected,
uncalibrated, LOST or stale samples hold. X/Y scale remains .45; depth is .25
(no longer diagnostic 1.5). Offsets are bounded to ±.65/.55/.20 metres, with
1.5mm render dead zone and 12–25ms interpolation, capped at 4m/s for catch-up.
Axis / position debug shows blade changes plus CV raw, target and displayed XYZ.

## Tests / limitations

```powershell
npm run test:phone
npm run build
```

Tests cover neutral/return, wrap, axes, screen-frame invariance, angular conversion,
rigid-body point velocity, stale/malformed messages, swept hit/miss camera gates,
and live relay latest-only delivery/disconnect/reconnect.

Physical phone behavior is not yet verified. Sensor availability, rate, permission
UI and background suspension vary by browser/device; use current Safari on iOS
or Chrome on Android. Orientation is required; motion is optional. Permission
denial or missing events is reported, not treated as valid data. Yaw may drift
or jump when browser sensor fusion changes reference; recalibrate. Keep the page
foreground. Trusted HTTPS is required for supported sensor operation:
[browser permission requirements](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static).

This is a development-only controller, not a full 6-DoF tracker or production
server. The production build still warns about its Three.js bundle size.
