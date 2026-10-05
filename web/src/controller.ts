import { useCallback, useEffect, useRef, useState } from 'react'
import { Vector3 } from 'three'
import { watchTransport, isTransportHeartbeat } from './transportHealth'
import { parsePhone, socketURL, type PhoneMessage } from './phone'
import { parseBowlingRelease, parseBowlingPose, type BowlingPose, type BowlingRelease } from './bowlingController'

export type XYZ = { x: number; y: number; z: number }
export type ControllerMessage = {
  type: 'controller'; timestamp: number; calibrated: boolean
  state: 'ACTIVE' | 'DEGRADED' | 'LOST'
  position: XYZ | null; speed: number | null; confidence: number | null
  velocity: XYZ | null; forearmDirection: XYZ | null; referenceForearmDirection: XYZ | null
  sampleAccepted: boolean
  trackingSource?: 'WRIST' | 'ARM_ESTIMATE' | 'PREDICTED' | 'LOST'
  lastReliableTimestamp?: number | null
  telemetry?: Record<string, number>
  calibrationState: string; calibrationCountdown: number
}
export const POSITION_SCALE = 0.45 // scene metres per calibrated shoulder width
export const DEPTH_SCALE = 0.25 // modest depth; CV is already filtered
export const HANDLE_RANGE = new Vector3(.65, .55, .20)
export const BASE_RIGHT_HAND_POSITION: [number, number, number] = [0.32, 1.05, -0.65]
export const STALE_MS = 500

export type BatMessage = {
  type: 'bat'; timestamp: number; state: 'TRACKED' | 'PARTIAL' | 'LOST'
  handlePosition: XYZ | null; axis: XYZ | null; speed: number; confidence: number
}
export function parseBat(raw: string): BatMessage | null {
  try {
    const m = JSON.parse(raw)
    const vector = (v: XYZ | null) => v && [v.x, v.y, v.z].every(Number.isFinite)
      ? { x: v.x, y: v.y, z: v.z } : null
    if (m?.type !== 'bat' || !Number.isFinite(m.timestamp)
      || !['TRACKED', 'PARTIAL', 'LOST'].includes(m.state)) return null
    return { type: 'bat', timestamp: m.timestamp, state: m.state,
      handlePosition: vector(m.handlePosition), axis: vector(m.axis),
      speed: Number.isFinite(m.speed) ? m.speed : 0,
      confidence: Number.isFinite(m.confidence) ? m.confidence : 0 }
  } catch { return null }
}

// Directions use only the handedness conversion, never the diagnostic depth gain.
export function toPlayerDirection(p: XYZ) { return new Vector3(p.x, p.y, -p.z) }

// Fixed batter frame: right +X, up +Y, forward +Z.
// Player space: right +X, up +Y, down the pitch -Z.
// Camera depth is NOT substituted for calibrated forward.
export function toPlayerPosition(p: XYZ, target = new Vector3()) {
  return target.set(p.x * POSITION_SCALE, p.y * POSITION_SCALE, -p.z * DEPTH_SCALE)
    .clamp(HANDLE_RANGE.clone().negate(), HANDLE_RANGE).add(new Vector3(...BASE_RIGHT_HAND_POSITION))
}
export function toPlayerVelocity(v: XYZ, p: XYZ) {
  const result = new Vector3(v.x * POSITION_SCALE, v.y * POSITION_SCALE, -v.z * DEPTH_SCALE)
  const offset = new Vector3(p.x * POSITION_SCALE, p.y * POSITION_SCALE, -p.z * DEPTH_SCALE)
  for (const axis of ['x', 'y', 'z'] as const) {
    if (Math.abs(offset[axis]) >= HANDLE_RANGE[axis] && offset[axis] * result[axis] > 0) result[axis] = 0
  }
  return result
}
export function cvPositionStatus(connected: boolean, snapshot: { message: ControllerMessage; received: number } | null, now: number) {
  if (!connected) return 'DISCONNECTED'
  if (!snapshot || now - snapshot.received > STALE_MS) return 'STALE'
  const m = snapshot.message
  if (!m.calibrated) return 'NOT_CALIBRATED'
  if (m.state === 'LOST' || !m.position) return 'LOST'
  if (!m.sampleAccepted) {
    const age=m.lastReliableTimestamp==null?Infinity:(m.timestamp-m.lastReliableTimestamp)*1000+Math.max(0,now-snapshot.received)
    if((m.trackingSource==='ARM_ESTIMATE'||m.trackingSource==='PREDICTED') && age>=0 && age<=180) return 'DEGRADED'
    return 'REJECTED / HOLD'
  }
  return m.state // DEGRADED can still contain an accepted, filtered sample.
}
export function stepHandle(displayed: Vector3, target: Vector3, dt: number, speed: number) {
  if (displayed.distanceTo(target) < .0015) return displayed
  const alpha = 1 - Math.exp(-dt / (speed > .5 ? .012 : .025))
  const step = target.clone().sub(displayed).multiplyScalar(alpha).clampLength(0, 4 * dt)
  return displayed.add(step)
}

export function parseController(raw: string): ControllerMessage | null {
  try {
    const m = JSON.parse(raw)
    if (!m || m.type !== 'controller' || !Number.isFinite(m.timestamp)
      || typeof m.calibrated !== 'boolean'
      || !['ACTIVE', 'DEGRADED', 'LOST'].includes(m.state)) return null
    const p = m.position
    const vector = (v: XYZ | null) => v && ['x', 'y', 'z'].every(k => Number.isFinite(v[k as keyof XYZ]))
      ? { x: v.x, y: v.y, z: v.z } : null
    return {
      type: 'controller', timestamp: m.timestamp, calibrated: m.calibrated, state: m.state,
      position: p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]))
        ? { x: p.x, y: p.y, z: p.z } : null,
      speed: Number.isFinite(m.speed) ? m.speed : null,
      confidence: Number.isFinite(m.confidence) ? m.confidence : null,
      velocity: vector(m.velocity),
      forearmDirection: vector(m.forearmDirection),
      referenceForearmDirection: vector(m.referenceForearmDirection),
      sampleAccepted: m.sampleAccepted === true,
      trackingSource: ['WRIST','ARM_ESTIMATE','PREDICTED','LOST'].includes(m.trackingSource)?m.trackingSource:undefined,
      lastReliableTimestamp: Number.isFinite(m.lastReliableTimestamp)?m.lastReliableTimestamp:null,
      telemetry: Object.fromEntries(Object.entries(m.telemetry??{}).filter(([,v])=>typeof v==='number'&&Number.isFinite(v))) as Record<string,number>,
      calibrationState: typeof m.calibrationState === 'string' ? m.calibrationState : (m.calibrated ? 'CALIBRATED' : 'NOT_CALIBRATED'),
      calibrationCountdown: Number.isFinite(m.calibrationCountdown) ? m.calibrationCountdown : 0,
    }
  } catch { return null }
}

export function useController() {
  // Opt-in transport diagnostics only: append ?motionDebug=1 to the game URL.
  const debugTransport = new URLSearchParams(location.search).get('motionDebug') === '1'
  const logTransport = (channel: string, event: string) => {
    if (debugTransport) console.info(`[${new Date().toISOString()}] GAME WS ${channel} ${event}`)
  }
  const debugCounts = useRef({ cvRaw: 0, cvAccepted: 0, phoneRaw: 0, phoneAccepted: 0, cvRawAt: 0, phoneRawAt: 0 })
  const relayDiagnostic = (data: unknown) => {
    if (!debugTransport || typeof data !== 'string') return false
    try {
      const m = JSON.parse(data)
      if (m.type !== 'relay-debug') return false
      console.info(`[${new Date().toISOString()}] RELAY`, m)
      return true
    } catch { return false }
  }
  const telemetry=useRef({rxHz:0,sampleDtMs:0})
  const phone = useRef<{ message: PhoneMessage; received: number } | null>(null)
  const phoneConnected = useRef(false)
  const bowlRequests = useRef(0)
  const phoneSocket = useRef<WebSocket | null>(null)
  const bowlStatusSent = useRef({ ready: false, at: -Infinity })
  const bowlingRelease=useRef<{message:BowlingRelease;received:number;sequence:number}|null>(null)
  const bowlingPose=useRef<{message:BowlingPose;received:number}|null>(null)
  const labStatusSent=useRef({active:false,ready:false,at:-Infinity})
  const publishBowlingLab=useCallback((active:boolean,ready:boolean,now=performance.now())=>{
    const ws=phoneSocket.current,last=labStatusSent.current
    if(ws?.readyState!==WebSocket.OPEN || ws.bufferedAmount>4096)return
    if(active!==last.active || ready!==last.ready || now-last.at>=250){
      ws.send(JSON.stringify({type:'bowling-lab-state',active,ready}));labStatusSent.current={active,ready,at:now}
    }
  },[])
  const publishBowlReady = (ready: boolean, now: number) => {
    const ws = phoneSocket.current, last = bowlStatusSent.current
    if (ws?.readyState !== WebSocket.OPEN || ws.bufferedAmount > 4096) return
    if (ready !== last.ready || now - last.at >= 250) {
      ws.send(JSON.stringify({ type: 'bowl-ready', ready }))
      bowlStatusSent.current = { ready, at: now }
    }
  }
  const bat = useRef<{ message: BatMessage; received: number; sequence: number } | null>(null)
  const latest = useRef<{ message: ControllerMessage; received: number; sequence: number } | null>(null)
  const connected = useRef(false)
  const [display, setDisplay] = useState<{ connected: boolean; message: ControllerMessage | null; stale: boolean }>({
    connected: false, message: null, stale: true,
  })
  useEffect(() => {
    let disposed = false
    let socket: WebSocket | undefined
    let retry: ReturnType<typeof setTimeout>
    let sequence = 0
    let rxCount=0,rxSince=performance.now()
    let opened = false
    let stopHealth = () => {}
    const connect = () => {
      if (disposed) return
      logTransport('CV', 'RECONNECT ATTEMPT / CONNECT')
      socket = new WebSocket(socketURL('/cv-ws'))
      stopHealth = watchTransport(socket)
      socket.onopen = () => { connected.current = true; logTransport('CV', opened ? 'OPEN / RECONNECTED' : 'OPEN'); opened = true }
      socket.onmessage = event => {
        if (isTransportHeartbeat(event.data)) return
        if (relayDiagnostic(event.data)) return
        if (debugTransport) { debugCounts.current.cvRaw++; debugCounts.current.cvRawAt = performance.now() }
        const marker = typeof event.data === 'string' ? parseBat(event.data) : null
        if (marker) bat.current = { message: marker, received: performance.now(), sequence: ++sequence }
        const message = typeof event.data === 'string' ? parseController(event.data) : null
        if (message && (!latest.current || message.timestamp>latest.current.message.timestamp)) {
          if (debugTransport) debugCounts.current.cvAccepted++
          const now=performance.now()
          telemetry.current.sampleDtMs=latest.current?(message.timestamp-latest.current.message.timestamp)*1000:0
          rxCount++
          if(now-rxSince>=1000){telemetry.current.rxHz=rxCount*1000/(now-rxSince);rxCount=0;rxSince=now}
          latest.current = { message, received: performance.now(), sequence: ++sequence }
        }
      }
      socket.onerror = () => { logTransport('CV', 'ERROR'); socket?.close() }
      socket.onclose = event => {
        logTransport('CV', `CLOSE code=${event.code} reason=${JSON.stringify(event.reason)} clean=${event.wasClean}`)
        connected.current = false
        latest.current = null
        telemetry.current.rxHz=0;rxCount=0;rxSince=performance.now()
        bat.current = null
        if (!disposed) { logTransport('CV', 'RECONNECT SCHEDULED 1000ms'); retry = setTimeout(connect, 1000) }
      }
    }
    connect()
    const diagnostic = debugTransport ? setInterval(() => {
      const now = performance.now()
      const age = (received: number | undefined) => received === undefined ? 'NONE' : `${Math.round(now - received)}ms`
      const state = (ws: WebSocket | null | undefined) => ws ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.readyState] : 'NONE'
      logTransport('STATUS', `CV=${state(socket)} PHONE=${state(phoneSocket.current)} CV age=${age(latest.current?.received)} PHONE age=${age(phone.current?.received)}`)
      const c = debugCounts.current
      logTransport('COUNTS', `CV raw=${c.cvRaw} accepted=${c.cvAccepted} rawAge=${age(c.cvRawAt || undefined)} PHONE raw=${c.phoneRaw} accepted=${c.phoneAccepted} rawAge=${age(c.phoneRawAt || undefined)} (raw includes non-controller messages)`)
    }, 1000) : undefined
    // The render loop reads the newest snapshot; UI updates at only 10 Hz.
    const ui = setInterval(() => setDisplay({
      connected: connected.current,
      message: latest.current?.message ?? null,
      stale: !latest.current || performance.now() - latest.current.received > STALE_MS,
    }), 100)
    return () => {
      disposed = true
      stopHealth()
      clearTimeout(retry)
      clearInterval(ui)
      clearInterval(diagnostic)
      connected.current = false
      latest.current = null
      bat.current = null
      if (socket) {
        socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null
        socket.close()
      }
    }
  }, [])
  useEffect(() => {
    let disposed = false, socket: WebSocket, retry: ReturnType<typeof setTimeout>
    let opened = false
    let stopHealth = () => {}
    const connect = () => {
      if (disposed) return
      logTransport('PHONE', 'RECONNECT ATTEMPT / CONNECT')
      socket = new WebSocket(socketURL('/phone-ws?role=game'))
      stopHealth = watchTransport(socket)
      phoneSocket.current = socket
      socket.onopen = () => { logTransport('PHONE', opened ? 'OPEN / RECONNECTED' : 'OPEN'); opened = true }
      socket.onmessage = event => {
        if (isTransportHeartbeat(event.data)) return
        if (relayDiagnostic(event.data)) return
        if (debugTransport) { debugCounts.current.phoneRaw++; debugCounts.current.phoneRawAt = performance.now() }
        if (typeof event.data !== 'string') return
        const message = parsePhone(event.data)
        if (message) { if (debugTransport) debugCounts.current.phoneAccepted++; phone.current = { message, received: performance.now() }; return }
        try {
          const status = JSON.parse(event.data)
          const pose=parseBowlingPose(status)
          if(pose)bowlingPose.current={message:pose,received:performance.now()}
          const release=parseBowlingRelease(status)
          if(release)bowlingRelease.current={message:release,received:performance.now(),sequence:(bowlingRelease.current?.sequence??0)+1}
          if (status.type === 'REQUEST_BOWL') bowlRequests.current++
          if (status.type === 'phone-status') {
            phoneConnected.current = status.connected === true
            if (!phoneConnected.current) phone.current = null
          }
        } catch { /* Ignore unrelated messages. */ }
      }
      socket.onerror = () => { logTransport('PHONE', 'ERROR'); socket.close() }
      socket.onclose = event => {
        logTransport('PHONE', `CLOSE code=${event.code} reason=${JSON.stringify(event.reason)} clean=${event.wasClean}`)
        phoneConnected.current = false; phone.current = null
        if (!disposed) { logTransport('PHONE', 'RECONNECT SCHEDULED 1000ms'); retry = setTimeout(connect, 1000) }
      }
    }
    connect()
    return () => { disposed = true; stopHealth(); clearTimeout(retry); socket?.close(); phoneSocket.current = null }
  }, [])
  return { latest, bat, phone, phoneConnected, connected, display, telemetry, bowlRequests, publishBowlReady,
    bowlingRelease,bowlingPose,publishBowlingLab }
}
