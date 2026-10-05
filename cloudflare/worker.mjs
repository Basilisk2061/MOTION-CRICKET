// One ephemeral room per code. Attachments survive hibernation; no stored gameplay.
export const SESSION = /^[A-HJ-NP-Z2-9]{6}$/
const TYPES = {
  phone: ['phone-controller', 'REQUEST_BOWL', 'BOWLING_POSE', 'BOWLING_RELEASE', 'transport-ping'],
  tracker: ['controller', 'bat'],
  game: ['bowl-ready', 'bowling-lab-state', 'transport-ping'],
}
export function connection(url) {
  const session = url.searchParams.get('session'), role = url.searchParams.get('role')
  const channel = role === 'game' ? url.searchParams.get('channel') : role
  return SESSION.test(session ?? '') && role in TYPES && ['cv', 'phone', 'tracker'].includes(channel)
    && (role !== 'game' || ['cv', 'phone'].includes(channel)) ? { session, role, channel } : null
}
export function validMessage(role, data) {
  if (typeof data !== 'string' || new TextEncoder().encode(data).length > 4096) return null
  try {
    const m = JSON.parse(data)
    if (!m || !TYPES[role]?.includes(m.type)) return null
    if (m.type === 'transport-ping' && (!Number.isSafeInteger(m.sequence) || m.sequence < 1)) return null
    if (['controller', 'bat', 'phone-controller', 'BOWLING_POSE', 'BOWLING_RELEASE'].includes(m.type)
      && !Number.isFinite(m.timestamp)) return null
    if (m.type === 'bowl-ready' && typeof m.ready !== 'boolean') return null
    if (m.type === 'bowling-lab-state' && (typeof m.active !== 'boolean' || typeof m.ready !== 'boolean')) return null
    return m
  } catch { return null }
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/health') return Response.json({ ok: true })
    if (url.pathname !== '/relay') return env.ASSETS.fetch(request)
    const c = connection(url)
    if (!c) return new Response('Invalid session or role', { status: 400 })
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 })
    if (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) return new Response('Origin rejected', { status: 403 })
    return env.ROOMS.get(env.ROOMS.idFromName(c.session)).fetch(request)
  },
}
export class Room {
  constructor(ctx) { this.ctx = ctx }
  // Temporary, memory-only diagnostics. No timers or persistent room state.
  debugEvent(event) {
    const targets = this.sockets().filter(ws => { const a = ws.deserializeAttachment(); return a.role === 'game' && a.channel === 'cv' && a.debug })
    if (!targets.length) return
    if (!this.debug) this.debug = { epoch: Date.now(), at: 0, trackerIn: 0, phoneIn: 0, cvOut: 0, phoneOut: 0, drops: 0, errors: 0 }
    const message = JSON.stringify({ type: 'relay-debug', session: targets[0].deserializeAttachment().session, timestamp: Date.now(), ...event })
    for (const ws of targets) { try { if ((ws.bufferedAmount ?? 0) < 4096) ws.send(message) } catch { /* Diagnostics must not affect forwarding. */ } }
  }
  debugSummary() {
    if (!this.debug || Date.now() - this.debug.at < 1000) return
    this.debug.at = Date.now()
    this.debugEvent({ event: 'COUNTERS', ...this.debug })
  }
  sockets() { return this.ctx.getWebSockets().filter(ws => ws.readyState === 1) }
  send(ws, data) {
    try {
      if (ws.readyState === 1 && (ws.bufferedAmount ?? 0) < 4096) {
        ws.send(typeof data === 'string' ? data : JSON.stringify(data))
        if (this.debug && typeof data === 'string') {
          const a = ws.deserializeAttachment()
          if (a.role === 'game') this.debug[a.channel === 'cv' ? 'cvOut' : 'phoneOut']++
        }
      } else if (this.debug) this.debug.drops++
    } catch {
      if (this.debug) { this.debug.errors++; this.debugEvent({ event: 'FORWARD_EXCEPTION', role: ws.deserializeAttachment().role }) }
      ws.close(1011, 'Connection unavailable')
    }
  }
  games() { return this.sockets().filter(ws => ws.deserializeAttachment().channel === 'phone' && ws.deserializeAttachment().role === 'game') }
  phoneStatus() {
    const connected = this.sockets().some(ws => ws.deserializeAttachment().role === 'phone')
    for (const game of this.games()) this.send(game, { type: 'phone-status', connected })
  }
  fetch(request) {
    const c = connection(new URL(request.url))
    if (!c) return new Response('Invalid connection', { status: 400 })
    // Only explicit heartbeat participants have leases. Never evict a healthy peer/other role.
    const sockets = this.sockets().filter(ws => {
      const a = ws.deserializeAttachment()
      if (a.role === c.role && a.channel === c.channel && a.healthAt && Date.now()-a.healthAt > 6000) {
        this.debugEvent({ event: 'STALE_REPLACEMENT', role: a.role, channel: a.channel })
        try { ws.close(4000, 'Transport heartbeat stale') } catch { /* Already dead. */ }
        return false
      }
      return true
    })
    if (sockets.length >= 4 || sockets.some(ws => { const a = ws.deserializeAttachment(); return a.role === c.role && a.channel === c.channel }))
      return new Response('Role already connected', { status: 409 })
    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ ...c, debug: new URL(request.url).searchParams.get('motionDebug') === '1', ready: false, labActive: false, labReady: false, rateAt: Date.now(), count: 0 })
    this.debugEvent({ event: 'JOIN', role: c.role, channel: c.channel })
    this.phoneStatus()
    if (c.role === 'phone') for (const game of this.games()) {
      const a = game.deserializeAttachment()
      this.send(server, { type: 'bowl-ready', ready: a.ready })
      this.send(server, { type: 'bowling-lab-state', active: a.labActive, ready: a.labReady })
    }
    return new Response(null, { status: 101, webSocket: client })
  }
  webSocketMessage(ws, data) {
    if (!this.debug) this.debugEvent({ event: 'ROOM_ACTIVE / COUNTERS_RESET' })
    const a = ws.deserializeAttachment(), m = validMessage(a.role, data)
    if (!m) { ws.close(1008, 'Invalid message'); return }
    const now = Date.now()
    if (now - a.rateAt >= 1000) { a.rateAt = now; a.count = 0 }
    if (++a.count > 150) { ws.close(1008, 'Rate limit'); return }
    if (m.type === 'transport-ping') {
      a.healthAt = now; ws.serializeAttachment(a)
      this.send(ws, { type: 'transport-pong', sequence: m.sequence })
      this.debugSummary()
      return
    }
    if (this.debug && (a.role === 'tracker' || a.role === 'phone')) this.debug[a.role === 'tracker' ? 'trackerIn' : 'phoneIn']++
    ws.serializeAttachment(a)
    if (a.role === 'game') {
      if (a.channel !== 'phone') { ws.close(1008, 'Invalid channel'); return }
      if (m.type === 'bowl-ready') a.ready = m.ready
      if (m.type === 'bowling-lab-state') { a.labActive = m.active; a.labReady = m.ready }
      ws.serializeAttachment(a)
      for (const peer of this.sockets()) if (peer.deserializeAttachment().role === 'phone') this.send(peer, data)
      this.debugSummary()
      return
    }
    for (const peer of this.sockets()) {
      const p = peer.deserializeAttachment()
      if (p.role !== 'game' || p.channel !== (a.role === 'tracker' ? 'cv' : 'phone')) continue
      if (m.type === 'BOWLING_POSE' && !p.labActive) continue
      if (m.type === 'BOWLING_RELEASE') {
        if (!p.labActive || !p.labReady) continue
        p.labReady = false; peer.serializeAttachment(p)
      }
      this.send(peer, data)
    }
    this.debugSummary()
  }
  webSocketClose(ws, code, reason) { this.debugEvent({ event: 'CLOSE', role: ws.deserializeAttachment().role, code, reason }); ws.close(code); this.phoneStatus() }
  webSocketError(ws) { this.debugEvent({ event: 'ERROR', role: ws.deserializeAttachment().role }); ws.close(1011, 'Socket error'); this.phoneStatus() }
}
