// One ephemeral room per code. Attachments survive hibernation; no stored gameplay.
export const SESSION = /^[A-HJ-NP-Z2-9]{6}$/
const TYPES = {
  phone: ['phone-controller', 'REQUEST_BOWL', 'BOWLING_POSE', 'BOWLING_RELEASE', 'transport-ping'],
  tracker: ['controller', 'bat', 'transport-ping'],
  game: ['bowl-ready', 'bowling-lab-state', 'transport-ping', 'transport-ack', 'transport-resync'],
}
const MOTION_TIMEOUT = 6000, WINDOW = 8
const metadata = m => m && /^[a-f0-9]{32}$/.test(m.epoch ?? '') && Number.isSafeInteger(m.sequence) && m.sequence > 0
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
    if (m.type === 'transport-ack' && !metadata(m)) return null
    if (m.type === 'transport-resync' && (!metadata({epoch:m.epoch,sequence:1}) || !metadata({epoch:m.previousEpoch,sequence:1}))) return null
    if (m._transport && !metadata(m._transport)) return null
    if (m.motion && !metadata(m.motion)) return null
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
  sockets() { return this.ctx.getWebSockets().filter(ws => ws.readyState === 1 && !ws.deserializeAttachment().retired) }
  retire(ws, reason) {
    const a = ws.deserializeAttachment(); a.retired = true; ws.serializeAttachment(a)
    try { ws.close(4000, reason) } catch { /* Already disconnected. */ }
  }
  source(channel) { return this.sockets().find(ws => ws.deserializeAttachment().role === (channel === 'cv' ? 'tracker' : 'phone')) }
  recipient(role) { return this.sockets().find(ws => { const a = ws.deserializeAttachment(); return a.role === 'game' && a.channel === (role === 'tracker' ? 'cv' : 'phone') }) }
  motionStatus(ws) {
    const a = ws.deserializeAttachment(), source = a.role === 'game' ? this.source(a.channel) : ws
    if (!source) return null
    const s = source.deserializeAttachment(), game = this.recipient(s.role)
    if (!s.epoch || !s.produced) return null
    return { epoch: s.epoch, sequence: s.produced, received: s.received ?? 0, acknowledged: s.ack ?? 0,
      expected: !!game && Date.now() - s.producedAt < 6000 }
  }
  stalled(a) { return a.pendingAt && Date.now()-a.pendingAt > MOTION_TIMEOUT && Date.now()-a.producedAt < MOTION_TIMEOUT }
  pump(source) {
    const s = source.deserializeAttachment(), game = this.recipient(s.role)
    if (!game) { s.latest = {}; s.pendingAt = null; source.serializeAttachment(s); return }
    const g = game.deserializeAttachment()
    if (s.requiredEpoch) {
      if (Date.now()-s.recoveryAt > MOTION_TIMEOUT) { this.retire(game, 'Motion delivery stalled'); this.retire(source, 'Motion delivery stalled') }
      return
    }
    if (g.epoch !== s.epoch) { g.epoch = s.epoch; g.inflight = [] }
    if (this.stalled(s)) {
      this.retire(game, 'Motion delivery stalled'); s.latest = {}; s.pendingAt = null
      source.serializeAttachment(s); this.retire(source, 'Motion delivery stalled'); return
    }
    for (const entry of Object.values(s.latest ?? {}).sort((a,b)=>a.sequence-b.sequence)) {
      if ((g.inflight ?? []).length >= (g.recovery ? 2 : WINDOW)) break
      if (Date.now()-entry.at > 500 || entry.sequence <= (s.ack ?? 0)) { delete s.latest[entry.kind]; continue }
      if (this.send(game, entry.data)) {
        (g.inflight ??= []).push(entry.sequence); delete s.latest[entry.kind]; s.pendingAt ??= Date.now()
      }
    }
    game.serializeAttachment(g); source.serializeAttachment(s)
  }
  send(ws, data) {
    try {
      if (ws.readyState === 1 && (ws.bufferedAmount ?? 0) < 4096) {
        ws.send(typeof data === 'string' ? data : JSON.stringify(data))
        if (this.debug && typeof data === 'string') {
          const a = ws.deserializeAttachment()
          if (a.role === 'game') this.debug[a.channel === 'cv' ? 'cvOut' : 'phoneOut']++
        }
        return true
      } else if (this.debug) this.debug.drops++
    } catch {
      if (this.debug) { this.debug.errors++; this.debugEvent({ event: 'FORWARD_EXCEPTION', role: ws.deserializeAttachment().role }) }
      ws.close(1011, 'Connection unavailable')
    }
    return false
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
      if (a.role === c.role && a.channel === c.channel && Date.now()-(a.healthAt ?? a.joinedAt ?? Date.now()) > 6000) {
        this.debugEvent({ event: 'STALE_REPLACEMENT', role: a.role, channel: a.channel })
        this.retire(ws, 'Transport heartbeat stale')
        return false
      }
      return true
    })
    if (sockets.length >= 4 || sockets.some(ws => { const a = ws.deserializeAttachment(); return a.role === c.role && a.channel === c.channel }))
      return new Response('Role already connected', { status: 409 })
    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ ...c, joinedAt: Date.now(), debug: new URL(request.url).searchParams.get('motionDebug') === '1', ready: false, labActive: false, labReady: false, rateAt: Date.now(), count: 0 })
    if (c.role === 'game') {
      const source = this.source(c.channel)
      if (source) {
        const a = source.deserializeAttachment(); a.latest = {}; a.pendingAt = null; source.serializeAttachment(a)
      }
    }
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
    if (!this.sockets().includes(ws)) return // Retired generations cannot reclaim roles or forward samples.
    if (!this.debug) this.debugEvent({ event: 'ROOM_ACTIVE / COUNTERS_RESET' })
    const a = ws.deserializeAttachment(), m = validMessage(a.role, data)
    if (!m) { ws.close(1008, 'Invalid message'); return }
    const now = Date.now()
    if (now - a.rateAt >= 1000) { a.rateAt = now; a.count = 0 }
    if (++a.count > 150) { ws.close(1008, 'Rate limit'); return }
    if (m.type === 'transport-ping') {
      a.healthAt = now; ws.serializeAttachment(a)
      if (a.role !== 'game' && m.motion) {
        if (!a.epoch) a.epoch = m.motion.epoch
        if (a.epoch === m.motion.epoch && m.motion.sequence > (a.produced ?? 0)) {
          a.produced = m.motion.sequence; a.producedAt = now
        }
        if (this.recipient(a.role) && a.produced > (a.ack ?? 0)) a.pendingAt ??= now
        ws.serializeAttachment(a)
      }
      const motion = this.motionStatus(ws)
      this.send(ws, { type: 'transport-pong', sequence: m.sequence, ...(motion ? { motion } : {}) })
      const source = a.role === 'game' ? this.source(a.channel) : ws
      if (source) this.pump(source)
      this.debugSummary()
      return
    }
    if (m.type === 'transport-ack') {
      const source = this.source(a.channel)
      if (!source) return
      const s = source.deserializeAttachment()
      if (s.epoch !== m.epoch || a.epoch !== m.epoch || !a.inflight?.includes(m.sequence)) return
      if (m.sequence > (s.ack ?? 0)) { s.ack = m.sequence; s.pendingAt = null }
      a.inflight = a.inflight.filter(sequence => sequence > m.sequence)
      a.recovery = false // Fresh current-epoch end-to-end progress restores steady-state credit.
      ws.serializeAttachment(a); source.serializeAttachment(s); this.pump(source)
      return
    }
    if (m.type === 'transport-resync') {
      const source = this.source(a.channel)
      if (!source) return
      const s = source.deserializeAttachment()
      if (a.epoch === m.epoch && s.requiredEpoch === m.epoch) {
        this.send(source, {type:'transport-resync',epoch:m.epoch}); return
      }
      if (a.epoch !== m.previousEpoch || m.epoch === m.previousEpoch) return
      a.epoch = m.epoch; a.inflight = []; a.recovery = true
      s.requiredEpoch = m.epoch; s.recoveryAt = now; s.latest = {}; s.pendingAt = null
      ws.serializeAttachment(a); source.serializeAttachment(s)
      this.send(source, {type:'transport-resync',epoch:m.epoch})
      return
    }
    if (m._transport && ['controller', 'bat', 'phone-controller'].includes(m.type)) {
      const meta = m._transport
      if (a.requiredEpoch ? meta.epoch !== a.requiredEpoch : (a.epoch && a.epoch !== meta.epoch)) return
      if (!a.requiredEpoch && meta.sequence <= (a.received ?? 0)) return
    }
    if (m._transport && ['controller', 'bat', 'phone-controller'].includes(m.type)) {
      const meta = m._transport
      if (a.requiredEpoch ? meta.epoch !== a.requiredEpoch : (a.epoch && a.epoch !== meta.epoch)) return
      if (!a.requiredEpoch && meta.sequence <= (a.received ?? 0)) return
    }
    if (this.debug && (a.role === 'tracker' || a.role === 'phone')) this.debug[a.role === 'tracker' ? 'trackerIn' : 'phoneIn']++
    if (a.role !== 'game') a.healthAt = now // Legacy producers also prove their application lease with actual samples.
    ws.serializeAttachment(a)
    if (m._transport && ['controller', 'bat', 'phone-controller'].includes(m.type)) {
      const meta = m._transport
      if (a.requiredEpoch) {
        if (meta.epoch !== a.requiredEpoch) return
        a.epoch = meta.epoch; a.received = a.produced = a.ack = 0
        a.pendingAt = null; a.latest = {}; delete a.requiredEpoch
      }
      if (a.epoch && a.epoch !== meta.epoch) return
      if (meta.sequence <= (a.received ?? 0)) return
      a.epoch = meta.epoch; a.received = meta.sequence
      if (meta.sequence > (a.produced ?? 0)) { a.produced = meta.sequence; a.producedAt = now }
      a.latest ??= {}; a.latest[m.type] = { kind: m.type, sequence: meta.sequence, data, at: now }
      ws.serializeAttachment(a); this.pump(ws); this.debugSummary(); return
    }
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
