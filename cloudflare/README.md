# Public deployment

The same Cloudflare Worker serves `web/dist` and routes `/relay` WebSockets to
one hibernating Durable Object per six-character session. No gameplay runs on
the relay; no webcam images are sent. Room state lives only in socket attachments,
not a database. SQLite-backed Durable Objects are required for Workers Free,
but this implementation performs no database reads or writes.

From the repository root:

```powershell
npm --prefix web ci
npm --prefix web run build
npx wrangler login
npx wrangler deploy
```

Do not enable a paid plan. Cloudflare's free quotas apply; this is a small demo,
not an unlimited service. The built frontend uses same-origin WSS automatically.
`npm run dev` / `npm run dev:phone` still use the existing local relay and CV proxy.

The game shows a session code, phone QR and local tracker commands in phone setup.
For public webcam input, set `MOTION_RELAY_URL` to `wss://<public-host>/relay` and
`MOTION_SESSION` to the displayed code, then run the existing Python tracker.
Unset those variables to return to local CV mode. Keep session codes private:
they provide pairing/isolation, not account authentication.

Relay limits: one phone, one tracker and two game channels per session; 4 KB
messages; 150 messages/second per socket. Unknown roles/types and malformed
messages are rejected. Controller payloads remain unchanged. When all sockets
close, no session state remains. Worker redeployments can disconnect sockets;
clients reconnect automatically.
