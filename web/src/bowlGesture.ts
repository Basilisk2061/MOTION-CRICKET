import { Quaternion, Vector3 } from 'three'
export const BOWL_GESTURE = { upwardDegrees: 45, hold: 1000, cooldown: 1500, maxSampleGap: 250 }
export class BowlGesture {
 state: 'IDLE' | 'HOLDING' | 'DISARMED' = 'IDLE'
 angle = 0
 batUp = false
 holdMs = 0
 armed = true
 private raisedAt: number | null = null
 private lastTrigger = -Infinity
 private lastSample = -Infinity
 reset() { this.state = 'IDLE'; this.holdMs = 0; this.armed = true; this.raisedAt = null; this.lastSample = -Infinity }
 pause() { this.raisedAt = null; this.holdMs = 0; this.state = this.armed ? 'IDLE' : 'DISARMED' }
 update(now: number, current: Quaternion, _neutral: Quaternion, sample: number, enabled = true) {
  if (![now, sample, ...current.toArray()].every(Number.isFinite)) { this.raisedAt = null; this.holdMs = 0; return false }
  if (sample <= this.lastSample) return false
  if (sample - this.lastSample > BOWL_GESTURE.maxSampleGap) this.raisedAt = null
  this.lastSample = sample
  const blade = new Vector3(0,-1,0).applyQuaternion(current)
  this.angle = Math.asin(Math.max(-1, Math.min(1, blade.y))) * 180 / Math.PI
  this.batUp = blade.y >= Math.sin(BOWL_GESTURE.upwardDegrees * Math.PI / 180)
  if (!this.batUp) { this.armed = true; this.raisedAt = null; this.holdMs = 0; this.state = 'IDLE'; return false }
  if (!enabled || !this.armed || now - this.lastTrigger < BOWL_GESTURE.cooldown) {
   this.raisedAt = null; this.holdMs = 0; this.state = this.armed ? 'IDLE' : 'DISARMED'; return false
  }
  this.raisedAt ??= now
  this.state = 'HOLDING'; this.holdMs = now - this.raisedAt
  if (this.holdMs < BOWL_GESTURE.hold) return false
  this.lastTrigger = now; this.armed = false; this.state = 'DISARMED'; this.raisedAt = null; this.holdMs = 0
  return true
 }
}
