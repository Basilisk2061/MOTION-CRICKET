# Motion-Cricket web game

React + Vite + TypeScript / Three.js browser game and phone motion controller.
See the [project README](../README.md) for architecture, CV setup and controls,
and [PHONE_CONTROLLER.md](PHONE_CONTROLLER.md) for trusted local HTTPS.

```powershell
npm ci
npm run dev
```

For phone sensors, set `MOTION_TLS_KEY` and `MOTION_TLS_CERT` to your local
development certificate files and run `npm run dev:phone`.

Focused tests live in `tests/`. Typecheck with `npx tsc --noEmit`; build with
`npm run build`. Preview does not include the development phone relay.

World coordinates: +X batsman's right/leg side, +Y up, -Z down the pitch.
The bat's root is its handle pivot; the blade extends along local -Y.
