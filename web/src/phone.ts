import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { PUBLIC_RELAY, relaySocketURL } from './publicSession'

export const PHONE_STALE_MS = 350
export const PHONE_TO_BAT = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI)
const RAD = Math.PI / 180
export type Vec = { x: number; y: number; z: number }
export type PhoneMessage = {
  type: 'phone-controller'; timestamp: number; calibrated: boolean; calibrationId: number
  orientation: Vec & { w: number }; angularVelocity: Vec; acceleration: Vec | null
  accelerationMagnitude: number | null; swingSpeed: number; sensorHz: number; screenAngle: number
}

// W3C device axes are fixed to the physical phone, NOT the rotated page.
// Thus UI portrait/landscape changes must not add another screen-angle rotation.
export function deviceQuaternion(alpha: number, beta: number, gamma: number) {
  return new Quaternion().setFromEuler(new Euler(beta * RAD, gamma * RAD, alpha * RAD, 'ZXY'))
}
export function worldToPlayer(neutral: Quaternion) {
  // Device-world +Z is vertical. Neutral screen-facing-you defines player +Z
  // (back toward the batsman); gravity fixes +Y independently of grip tilt.
  const up = new Vector3(0, 0, 1)
  const back = new Vector3(0, 0, 1).applyQuaternion(neutral)
  back.addScaledVector(up, -back.dot(up))
  if (back.lengthSq() < .01) {
    // Face nearly horizontal: use the physical right edge to resolve yaw.
    const right = new Vector3(1, 0, 0).applyQuaternion(neutral)
    right.addScaledVector(up, -right.dot(up)).normalize()
    back.crossVectors(right, up)
  }
  back.normalize()
  const right = new Vector3().crossVectors(up, back).normalize()
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, back)).invert()
}
export function relativeBat(neutral: Quaternion, current: Quaternion) {
  const basis = worldToPlayer(neutral)
  const neutralBat = basis.clone().multiply(neutral).multiply(PHONE_TO_BAT.clone().invert())
  const relative = neutral.clone().invert().multiply(current)
  // Preserve measured neutral tilt, then apply the relative change. The fixed
  // 180-degree mount maps blade -Y to phone top +Y, NOT player-world axes.
  return neutralBat.multiply(PHONE_TO_BAT).multiply(relative)
    .multiply(PHONE_TO_BAT.clone().invert()).normalize()
}
export function gyroToBat(rate: { alpha: number; beta: number; gamma: number }, rotation: Quaternion) {
  return new Vector3(rate.beta, rate.gamma, rate.alpha).multiplyScalar(RAD)
    .applyQuaternion(PHONE_TO_BAT).applyQuaternion(rotation)
}
export function quaternionVelocity(previous: Quaternion, current: Quaternion, dt: number) {
  const q = current.clone().multiply(previous.clone().invert()).normalize()
  if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w)
  const sine = Math.hypot(q.x, q.y, q.z)
  if (dt <= 0 || dt > .2 || sine < 1e-8) return new Vector3()
  return new Vector3(q.x, q.y, q.z).multiplyScalar(2 * Math.atan2(sine, q.w) / (sine * dt))
}
export function pointVelocity(handle: Vector3, omega: Vector3, offset: Vector3) {
  return handle.clone().add(omega.clone().cross(offset))
}
export function phoneStatus(connected: boolean, received: number | null, now: number) {
  return !connected ? 'DISCONNECTED' : received === null || now - received > PHONE_STALE_MS ? 'STALE' : 'CONNECTED'
}
export function parsePhone(raw: string): PhoneMessage | null {
  try {
    const m = JSON.parse(raw)
    const vector = (v: Vec | null) => !!v && [v.x, v.y, v.z].every(Number.isFinite)
    if (m?.type !== 'phone-controller' || typeof m.calibrated !== 'boolean'
      || ![m.timestamp, m.calibrationId, m.swingSpeed, m.sensorHz, m.screenAngle].every(Number.isFinite)
      || !vector(m.orientation) || !Number.isFinite(m.orientation.w) || !vector(m.angularVelocity)
      || (m.acceleration !== null && !vector(m.acceleration))
      || (m.accelerationMagnitude !== null && !Number.isFinite(m.accelerationMagnitude))) return null
    const length = Math.hypot(m.orientation.x, m.orientation.y, m.orientation.z, m.orientation.w)
    if (length < .9 || length > 1.1) return null
    return m as PhoneMessage
  } catch { return null }
}
export function socketURL(path: string) {
  if (PUBLIC_RELAY) return relaySocketURL(path)
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${path}`
}
