import { PUBLIC_RELAY } from './publicSession'
import { MotionProgress, motionSequence, transportEpoch, RECOVERY_GAP_MS, type MotionSequence } from './motionTransport'

export const HEALTH_INTERVAL_MS = 1000
export const HEALTH_TIMEOUT_MS = 6000 // Tolerate Internet jitter, not a 20-second half-open socket.

export function isTransportHeartbeat(data: unknown) {
  if (typeof data !== 'string') return false
  try { return JSON.parse(data)?.type === 'transport-pong' } catch { return false }
}

// Health traffic never enters controller state. Reconnect owners keep their existing retry policy.
export function watchTransport(ws: WebSocket, enabled = PUBLIC_RELAY, producer?: () => MotionSequence | null, generation = 0, reconnects = 0, stallRecoveries = 0, stream: 'CV' | 'PHONE' = 'CV') {
  const progress = new MotionProgress()
  const retiredEpochs = new Set<string>()
  let ackTimer: ReturnType<typeof setTimeout> | undefined
  let relayReceived = 0, relayAcknowledged = 0
  let lastAck = ''
  let lastAppliedAt: number | null = null, recoveryEpoch = '', recoveryPrevious = '', recoveryCount = stallRecoveries
  let recoveryStartedAt = 0
  let minimumHeartbeatRTT = Infinity
  const pingTimes = new Map<number, number>()
  const sendRecovery = () => {
    if (!stopped && recoveryEpoch && ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 4096) {
      try { ws.send(JSON.stringify({type:'transport-resync', epoch:recoveryEpoch, previousEpoch:recoveryPrevious})) } catch { fail() }
    }
  }
  const recover = (again = false) => {
    if ((recoveryEpoch && !again) || !progress.epoch) return
    recoveryPrevious = progress.epoch; retiredEpochs.add(recoveryPrevious)
    recoveryEpoch = transportEpoch(); recoveryCount++
    recoveryStartedAt = performance.now()
    progress.reset(recoveryEpoch, performance.now()); lastAppliedAt = null
    clearTimeout(ackTimer); ackTimer = undefined; lastAck = ''
    sendRecovery()
  }
  const sendAck = () => {
    const key = `${progress.epoch}:${progress.applied}`
    if (!stopped && progress.applied && key !== lastAck && ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 4096) {
      try {
        ws.send(JSON.stringify({ type: 'transport-ack', epoch: progress.epoch, sequence: progress.applied }))
        lastAck = key
      } catch { fail() }
    }
  }
  const accept = (data: unknown) => {
    if (!enabled || typeof data !== 'string') return true
    let m
    try { m = motionSequence(JSON.parse(data)._transport) } catch { return true }
    if (!m) return true // Rolling deployment / local payload compatibility.
    if (retiredEpochs.has(m.epoch)) return false
    if (recoveryEpoch && m.epoch !== recoveryEpoch) return false
    // A recovery response can itself be delayed. Bound its age using only local
    // challenge timing; never accept a seconds-old packet just because its epoch is new.
    const recoveryBudget = Math.max(RECOVERY_GAP_MS, Number.isFinite(minimumHeartbeatRTT) ? 2*minimumHeartbeatRTT+200 : RECOVERY_GAP_MS)
    if (recoveryEpoch && performance.now()-recoveryStartedAt > recoveryBudget) { recover(true); return false }
    // No cross-device clock subtraction: use this receiver's monotonic arrival gap.
    if (!producer && !recoveryEpoch && lastAppliedAt !== null && performance.now()-lastAppliedAt > RECOVERY_GAP_MS) {
      recover(); return false
    }
    if (progress.epoch && progress.epoch !== m.epoch) {
      retiredEpochs.add(progress.epoch)
      progress.observe(m, 0, false, performance.now())
    }
    if (m.sequence <= progress.applied) return false
    progress.epoch = m.epoch; progress.applied = m.sequence
    lastAppliedAt = performance.now(); recoveryEpoch = ''
    if (!ackTimer) ackTimer = setTimeout(() => {
      ackTimer = undefined
      sendAck()
    }, 50)
    return true
  }
  if (!enabled) return Object.assign(() => {}, { accept, recoveries: () => recoveryCount })
  let sequence = 0, acknowledged = 0, aliveAt = performance.now(), opened = false, stopped = false
  const onOpen = () => { opened = true; aliveAt = performance.now() }
  const onMessage = (event: MessageEvent) => {
    if (!isTransportHeartbeat(event.data)) return
    const m = JSON.parse(event.data)
    if (Number.isInteger(m.sequence) && m.sequence > acknowledged && m.sequence <= sequence) {
      const pingAt = pingTimes.get(m.sequence)
      if (pingAt !== undefined) minimumHeartbeatRTT = Math.min(minimumHeartbeatRTT, performance.now()-pingAt)
      for (const key of pingTimes.keys()) if (key <= m.sequence) pingTimes.delete(key)
      acknowledged = m.sequence; aliveAt = performance.now()
      const motion = m.motion
      const meta = motionSequence(motion)
      const producerEpoch = producer?.()?.epoch
      if (meta && !retiredEpochs.has(meta.epoch) && (!recoveryEpoch || meta.epoch === recoveryEpoch) && (!producerEpoch || meta.epoch === producerEpoch)) {
        relayReceived = motion.received; relayAcknowledged = motion.acknowledged
        if (progress.epoch && progress.epoch !== meta.epoch) {
          retiredEpochs.add(progress.epoch); progress.applied = 0
        }
        const delivered = producer ? motion.acknowledged : progress.applied
        progress.observe(meta, delivered, motion.expected === true, performance.now())
      }
    }
  }
  const stop = () => {
    if (stopped) return
    stopped = true; clearInterval(timer); clearTimeout(ackTimer)
    ws.removeEventListener('open', onOpen); ws.removeEventListener('message', onMessage)
    ws.removeEventListener('close', stop)
  }
  const fail = (reason = 'Transport heartbeat stale') => {
    if (stopped) return
    if (reason === 'Motion delivery stalled' && typeof location !== 'undefined' && new URLSearchParams(location.search).get('motionDebug') === '1')
      console.info(`[MOTION TRANSPORT ${stream}] STALLED`, {stream, generation, epoch:progress.epoch, stallRecoveries: recoveryCount+1})
    stop()
    // A browser close handshake can also hang: retire this socket immediately for the owner.
    const closed = ws.onclose
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null
    ws.close(4000, reason)
    closed?.call(ws, new CloseEvent('close', { code: 4000, reason }))
  }
  ws.addEventListener('open', onOpen); ws.addEventListener('message', onMessage)
  ws.addEventListener('close', stop)
  const timer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('motionDebug') === '1')
        console.info(`[MOTION TRANSPORT ${stream}]`, {stream, socket: ws.readyState, generation, epoch:progress.epoch, reconnects, stallRecoveries:recoveryCount, producer: progress.produced,
          relayReceived, applied: progress.applied, acknowledged: relayAcknowledged, motionAge: performance.now()-progress.progressAt,
          heartbeatAge: performance.now()-aliveAt, heartbeat:performance.now()-aliveAt>HEALTH_TIMEOUT_MS?'STALE':'HEALTHY',
          stalled:!!recoveryEpoch||progress.stalled(performance.now()), recovering:!!recoveryEpoch,
          direction:producer?'PRODUCER':'GAME', motion:recoveryEpoch||progress.stalled(performance.now())?'STALLED':'HEALTHY'})
      if (performance.now()-aliveAt > HEALTH_TIMEOUT_MS) { fail(); return }
      if (recoveryEpoch && performance.now()-recoveryStartedAt > HEALTH_TIMEOUT_MS) { fail('Motion delivery stalled'); return }
      if (progress.stalled(performance.now())) { fail('Motion delivery stalled'); return }
      if (!producer && lastAppliedAt !== null && performance.now()-lastAppliedAt > RECOVERY_GAP_MS && progress.produced > progress.applied)
        recover()
      sendRecovery()
      if (!producer) sendAck() // Retry a cumulative ACK suppressed by temporary outbound congestion.
      if (stopped) return
      if (ws.bufferedAmount < 4096) {
        try {
          pingTimes.set(++sequence, performance.now())
          ws.send(JSON.stringify({ type: 'transport-ping', sequence, ...(producer?.() ? { motion: producer() } : {}) }))
        } catch { fail() }
      }
    } else if (!opened && performance.now()-aliveAt > 10000) fail()
  }, HEALTH_INTERVAL_MS)
  return Object.assign(stop, { accept, progress, recoveries: () => recoveryCount, heartbeatAge: () => performance.now()-aliveAt })
}
