import { PUBLIC_RELAY } from './publicSession'

export const HEALTH_INTERVAL_MS = 1000
export const HEALTH_TIMEOUT_MS = 6000 // Tolerate Internet jitter, not a 20-second half-open socket.

export function isTransportHeartbeat(data: unknown) {
  if (typeof data !== 'string') return false
  try { return JSON.parse(data)?.type === 'transport-pong' } catch { return false }
}

// Health traffic never enters controller state. Reconnect owners keep their existing retry policy.
export function watchTransport(ws: WebSocket, enabled = PUBLIC_RELAY) {
  if (!enabled) return () => {}
  let sequence = 0, acknowledged = 0, aliveAt = performance.now(), opened = false, stopped = false
  const onOpen = () => { opened = true; aliveAt = performance.now() }
  const onMessage = (event: MessageEvent) => {
    if (!isTransportHeartbeat(event.data)) return
    const m = JSON.parse(event.data)
    if (Number.isInteger(m.sequence) && m.sequence > acknowledged && m.sequence <= sequence) {
      acknowledged = m.sequence; aliveAt = performance.now()
    }
  }
  const stop = () => {
    if (stopped) return
    stopped = true; clearInterval(timer)
    ws.removeEventListener('open', onOpen); ws.removeEventListener('message', onMessage)
    ws.removeEventListener('close', stop)
  }
  const fail = () => {
    stop()
    // A browser close handshake can also hang: retire this socket immediately for the owner.
    const closed = ws.onclose
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null
    ws.close(4000, 'Transport heartbeat stale')
    closed?.call(ws, new CloseEvent('close', { code: 4000, reason: 'Transport heartbeat stale' }))
  }
  ws.addEventListener('open', onOpen); ws.addEventListener('message', onMessage)
  ws.addEventListener('close', stop)
  const timer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      if (performance.now()-aliveAt > HEALTH_TIMEOUT_MS) { fail(); return }
      if (ws.bufferedAmount < 4096) {
        try { ws.send(JSON.stringify({ type: 'transport-ping', sequence: ++sequence })) } catch { fail() }
      }
    } else if (!opened && performance.now()-aliveAt > 10000) fail()
  }, HEALTH_INTERVAL_MS)
  return stop
}
