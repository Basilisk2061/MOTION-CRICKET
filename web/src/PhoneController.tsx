import { useEffect, useRef, useState } from 'react'
import { Quaternion, Vector3 } from 'three'
import { deviceQuaternion, gyroToBat, quaternionVelocity, relativeBat, socketURL, PHONE_TO_BAT, type PhoneMessage } from './phone'
import { BowlGesture } from './bowlGesture'
import { BowlingController } from './bowlingController'
import PhoneBowlingPanel from './PhoneBowlingPanel'
import { PUBLIC_RELAY, currentSession } from './publicSession'

type PermissionAPI = { requestPermission?: () => Promise<string> }
const vector = (v: { x: number | null; y: number | null; z: number | null } | null) =>
  v && [v.x, v.y, v.z].every(n => typeof n === 'number' && Number.isFinite(n))
    ? new Vector3(v.x!, v.y!, v.z!) : null

export default function PhoneController() {
  const [enabled, setEnabled] = useState(false)
  const [notice, setNotice] = useState('Tap ENABLE MOTION to request sensor access.')
  const [, refresh] = useState(0)
  const socket = useRef<WebSocket | null>(null)
  const connected = useRef(false)
  const gameReady = useRef({ ready: false, at: -Infinity })
  const gesture = useRef(new BowlGesture())
  const gestureNeutral = useRef(new Quaternion())
  const bowling = useRef(new BowlingController())
  const lab = useRef({active:false,ready:false,at:0})
  const data = useRef({ raw: null as Quaternion | null, neutral: null as Quaternion | null,
    rotation: new Quaternion(), omega: new Vector3(), motionAt: 0,
    rate: null as DeviceMotionEventRotationRate | null, acceleration: null as Vector3 | null,
    accelerationGravity: null as Vector3 | null, at: 0, hz: 0, sequence: 0, calibrationId: 0,
    message: null as PhoneMessage | null })

  useEffect(() => {
    if (PUBLIC_RELAY && !currentSession()) { setNotice('Open the session link or QR code from the desktop game.'); return }
    let disposed = false, retry: ReturnType<typeof setTimeout>, frame = 0, sent = -1, sentAt = 0, poseAt=0
    const connect = () => {
      if (disposed) return
      const ws = new WebSocket(socketURL('/phone-ws?role=phone'))
      socket.current = ws
      ws.onopen = () => { connected.current = true; sent = -1 }
      ws.onmessage = event => {
        try {
          const m = JSON.parse(event.data)
          if(m.type==='bowling-lab-state')lab.current={active:m.active===true,ready:m.ready===true,at:performance.now()}
          if (m.type === 'bowl-ready' && typeof m.ready === 'boolean')
            gameReady.current = { ready: m.ready, at: performance.now() }
        } catch { /* Ignore unrelated messages. */ }
      }
      ws.onerror = () => ws.close()
      ws.onclose = event => {
        connected.current = false
        lab.current={active:false,ready:false,at:0}
        gameReady.current.ready = false
        if (event.code === 1008) setNotice('Another phone is connected. Close its controller page first.')
        if (!disposed) retry = setTimeout(connect, 1000)
      }
    }
    const tick = (now: number) => {
      const d = data.current, ws = socket.current
      const labAvailable=lab.current.active&&now-lab.current.at<1500&&now-d.at<200&&!document.hidden
      if(!labAvailable||!connected.current)bowling.current.cancel()
      if(labAvailable&&lab.current.ready&&ws?.readyState===WebSocket.OPEN&&ws.bufferedAmount<4096){
       const release=bowling.current.takeAutomaticRelease()
       if(release&&Date.now()-release.timestamp<200){ws.send(JSON.stringify(release));lab.current.ready=false}
      }
      if(lab.current.active && !document.hidden && ws?.readyState===WebSocket.OPEN && ws.bufferedAmount<4096
        && now-d.at<200 && now-poseAt>=1000/30){
       const pose=bowling.current.pose()
       if(pose){ws.send(JSON.stringify(pose));poseAt=now}
      }
      if (!document.hidden && ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 4096
        && d.message && now - d.at < 200 && sent !== d.sequence && now - sentAt >= 1000 / 60) {
        ws.send(JSON.stringify(d.message)); sent = d.sequence; sentAt = now
      }
      frame = requestAnimationFrame(tick)
    }
    connect(); frame = requestAnimationFrame(tick)
    const ui = setInterval(() => refresh(n => n + 1), 100)
    return () => {
      disposed = true; clearTimeout(retry); clearInterval(ui); cancelAnimationFrame(frame)
      connected.current = false; socket.current?.close()
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    const motion = (event: DeviceMotionEvent) => {
      const d = data.current
      d.rate = event.rotationRate; d.motionAt = performance.now()
      d.acceleration = vector(event.acceleration)
      d.accelerationGravity = vector(event.accelerationIncludingGravity)
    }
    const orientation = (event: DeviceOrientationEvent) => {
      if (![event.alpha, event.beta, event.gamma].every(n => typeof n === 'number' && Number.isFinite(n))) return
      const d = data.current, now = performance.now(), dt = (now - d.at) / 1000
      d.raw = deviceQuaternion(event.alpha!, event.beta!, event.gamma!)
      const bowlingRate=d.rate
      const rawGyro=bowlingRate && now-d.motionAt<200 && [bowlingRate.alpha,bowlingRate.beta,bowlingRate.gamma].every(n=>typeof n==='number'&&Number.isFinite(n))
        ? new Vector3(bowlingRate.beta!,bowlingRate.gamma!,bowlingRate.alpha!).multiplyScalar(Math.PI/180):null
      bowling.current.sample(d.raw,rawGyro,Date.now())
      const next = d.neutral ? relativeBat(d.neutral, d.raw) : new Quaternion()
      gesture.current.update(now, next, gestureNeutral.current, now,
        connected.current && !!d.neutral && gameReady.current.ready && now - gameReady.current.at < 1000)
      const rate = d.rate
      const gyro = rate && now - d.motionAt < 200 && [rate.alpha, rate.beta, rate.gamma].every(n => typeof n === 'number' && Number.isFinite(n))
        ? gyroToBat({ alpha: rate.alpha!, beta: rate.beta!, gamma: rate.gamma! }, next)
        : quaternionVelocity(d.rotation, next, dt)
      if (gyro.length() < .035 || !d.neutral || dt > .2) gyro.set(0, 0, 0)
      d.omega.lerp(gyro, gyro.length() > 1 ? 1 : .65)
      if (d.omega.length() < .035) d.omega.set(0, 0, 0)
      if (next.angleTo(d.rotation) > .0015) d.rotation.copy(next)
      if (dt > 0 && dt < .2) d.hz = d.hz ? d.hz * .9 + .1 / dt : 1 / dt
      const acceleration = now - d.motionAt < 200 ? d.acceleration?.clone()
        .applyQuaternion(PHONE_TO_BAT).applyQuaternion(d.rotation) ?? null : null
      if (acceleration && acceleration.length() < .15) acceleration.set(0, 0, 0)
      d.at = now; d.sequence++
      d.message = { type: 'phone-controller', timestamp: Date.now(), calibrated: !!d.neutral,
        calibrationId: d.calibrationId, orientation: { x: d.rotation.x, y: d.rotation.y, z: d.rotation.z, w: d.rotation.w },
        angularVelocity: { x: d.omega.x, y: d.omega.y, z: d.omega.z },
        acceleration: acceleration ? { x: acceleration.x, y: acceleration.y, z: acceleration.z } : null,
        accelerationMagnitude: acceleration?.length() ?? null, swingSpeed: d.omega.length() * .65,
        sensorHz: d.hz, screenAngle: screen.orientation?.angle ?? (window as Window & { orientation?: number }).orientation ?? 0 }
    }
    window.addEventListener('deviceorientation', orientation)
    window.addEventListener('devicemotion', motion)
    return () => { window.removeEventListener('deviceorientation', orientation); window.removeEventListener('devicemotion', motion) }
  }, [enabled])

  const enable = async () => {
    if (!window.isSecureContext) { setNotice('UNAVAILABLE: use trusted HTTPS, not a plain HTTP LAN URL.'); return }
    if (!('DeviceOrientationEvent' in window)) { setNotice('UNAVAILABLE: orientation API missing.'); return }
    try {
      // Invoke both permission prompts synchronously inside the button gesture.
      const orientation = (DeviceOrientationEvent as unknown as PermissionAPI).requestPermission?.() ?? Promise.resolve('granted')
      const motion = 'DeviceMotionEvent' in window
        ? (DeviceMotionEvent as unknown as PermissionAPI).requestPermission?.() ?? Promise.resolve('granted')
        : Promise.resolve('unavailable')
      const [a, b] = await Promise.allSettled([orientation, motion])
      if (a.status !== 'fulfilled' || a.value !== 'granted') { setNotice('PERMISSION REQUIRED: orientation access denied. Check browser site settings.'); return }
      setEnabled(true)
      setNotice(b.status === 'fulfilled' && b.value === 'granted'
        ? 'Waiting for sensor events. Keep this page visible.'
        : 'Motion unavailable/denied: angular speed will use orientation differences.')
    } catch (error) { setNotice(`Sensor permission failed: ${String(error)}`) }
  }
  const calibrate = () => {
    const d = data.current
    if (!d.raw || performance.now() - d.at > 350) return
    d.neutral = d.raw.clone(); d.rotation.copy(relativeBat(d.neutral, d.raw)); d.omega.set(0, 0, 0)
    gestureNeutral.current.copy(d.rotation); gesture.current.reset()
    d.calibrationId = Date.now(); setNotice('CALIBRATED. Start with slow, controlled movements.')
  }
  const d = data.current, fresh = !!d.raw && performance.now() - d.at < 350
  const ready = connected.current && fresh && !!d.neutral
  const canBowl = ready && gameReady.current.ready && performance.now() - gameReady.current.at < 1000
  const labActive=lab.current.active && performance.now()-lab.current.at<1500
  const bowl = () => {
    const ws = socket.current
    if (canBowl && ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 4096) {
      ws.send(JSON.stringify({ type: 'REQUEST_BOWL' }))
      gameReady.current.ready = false
      refresh(n => n + 1)
    }
  }
  if(labActive)return <><PhoneBowlingPanel controller={bowling.current} connected={connected.current} fresh={fresh}
    enabled={enabled} ready={lab.current.ready} enable={enable}
    calibrate={()=>{if(fresh && d.raw){bowling.current.calibrate(d.raw);refresh(n=>n+1)}}}/>
    <details className="phone-diagnostics"><summary>Bowling IMU diagnostics</summary>
      <p>RAW ORIENTATION: {d.raw?.toArray().map(n=>n.toFixed(3)).join(' / ') ?? '--'}</p>
      <p>ANGULAR VELOCITY (deg/s, device): {d.rate?[d.rate.beta,d.rate.gamma,d.rate.alpha].map(n=>n?.toFixed(2)??'--').join(' / '):'orientation-derived'}</p>
    </details></>
  return <div className="phone-controller">
    <div className="phone-heading">
      <span className="eyebrow">Motion Cricket</span>
      <p className="phone-connection"><span className={`status-dot ${connected.current ? 'connected' : ''}`} />
        {connected.current ? 'Connected' : 'Waiting for game'}</p>
    </div>
    <section className="phone-stage">
      <span className="eyebrow">Bat controller</span>
      <h1>{ready ? 'Ready' : !enabled ? 'Take control' : !fresh ? 'Waiting for motion' : 'Ready your bat'}</h1>
      <p>{ready ? 'Phone is controlling bat.' : !enabled ? 'Enable motion to use your phone as the bat handle.'
        : !fresh ? 'Keep this page visible and check sensor access.' : 'Hold the phone naturally in your batting stance.'}</p>
      {!enabled ? <button className="phone-primary" onClick={enable}>Enable motion</button>
        : !d.neutral ? <button className="phone-primary" onClick={calibrate} disabled={!fresh}>Calibrate</button>
        : <>
          <button className="phone-primary" onClick={bowl} disabled={!canBowl}>BOWL</button>
          <button className="phone-secondary" onClick={calibrate} disabled={!fresh}>Recalibrate</button>
        </>}
      {canBowl && gesture.current.state === 'HOLDING' && <div className="bowl-progress" role="status">Calling bowler…<progress max={1000} value={gesture.current.holdMs} /></div>}
      {!ready && <p className="phone-notice" role="status">{notice}</p>}
    </section>
    <details className="phone-diagnostics">
      <summary>Sensor details</summary>
      <p>{notice}</p>
      <p>Bat-up: {gesture.current.batUp ? 'YES' : 'NO'} · {gesture.current.angle.toFixed(0)}° upward</p>
      <p>Hold: {gesture.current.holdMs.toFixed(0)} / 1000 ms</p>
      <p>Gesture armed: {gesture.current.armed ? 'YES' : 'NO'}</p>
      <p>Calibration: {d.neutral ? 'YES' : 'NO'} · {fresh ? d.hz.toFixed(0) : '0'} Hz</p>
      <p>Rotation: {d.rotation.toArray().map(n => n.toFixed(2)).join(', ')}</p>
      <p>Angular speed: {fresh ? d.omega.length().toFixed(2) : '--'} rad/s</p>
      <p>Swing estimate: {fresh ? d.message?.swingSpeed.toFixed(2) : '--'} m/s</p>
      <p>Acceleration: {d.message?.accelerationMagnitude?.toFixed(2) ?? '--'} m/s²</p>
      <p>Screen: {d.message?.screenAngle ?? 0}°</p>
      <p>Phone top points toward blade; screen is the blade face.</p>
      {enabled && <button onClick={enable}>Retry sensor access</button>}
    </details>
  </div>
}
