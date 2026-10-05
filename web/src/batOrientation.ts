import { Euler, Quaternion, Vector3 } from 'three'
import { toPlayerDirection, type ControllerMessage } from './controller'

const LONG_AXIS = new Vector3(0, -1, 0)
const FACE = new Vector3(0, 0, 1)
// Player-space neutral: blade down, slightly outward/right and behind the grip.
// Independent of physical webcam angle and virtual eye/camera rotation.
export const NEUTRAL_BAT_EULER = [-.28, -.20, .22] as const
const STANCE = new Quaternion().setFromEuler(new Euler(...NEUTRAL_BAT_EULER))
const RAD = Math.PI / 180
const MOVE_ON = .65, MOVE_OFF = .35 // shoulder widths per second

export class BatOrientation {
  target = STANCE.clone()
  current = STANCE.clone()
  forearm: Vector3 | null = null
  velocity = new Vector3()
  velocityActive = false
  handSpeed = 0
  forearmAngleChange = 0
  forearmStatus: 'STABLE' | 'UPDATING' | 'REJECTED' = 'STABLE'
  batAngularChange = 0
  relativeForearmAngle = 0
  private swingRoll = 0
  private reference: Vector3 | null = null
  private history: { t: number; p: Vector3 }[] = []
  private lastTime: number | null = null
  private updating = false
  private pending: Vector3 | null = null
  private pendingCount = 0

  clearReference() {
    this.reference = null
    this.pause()
  }

  pause() {
    this.history = []
    this.velocity.set(0, 0, 0)
    this.velocityActive = false
    this.handSpeed = 0
    this.lastTime = null
    this.pending = null
    this.pendingCount = 0
    this.forearmStatus = 'REJECTED'
    this.batAngularChange = 0
  }

  update(message: ControllerMessage) {
    const dt = this.lastTime === null ? 1 / 30 : message.timestamp - this.lastTime
    if (dt <= 0 || dt > .25) this.pause()
    this.lastTime = message.timestamp
    const step = Math.max(.001, Math.min(dt, .1))
    if (!message.sampleAccepted || !message.position || !message.forearmDirection) {
      this.pause()
      return
    }
    const next = toPlayerDirection(message.forearmDirection)
    if (!Number.isFinite(next.lengthSq()) || next.lengthSq() < 1e-8) {
      this.pause()
      return
    }
    next.normalize()
    const ref = message.referenceForearmDirection
      ? toPlayerDirection(message.referenceForearmDirection) : this.reference?.clone() ?? next.clone()
    if (ref.lengthSq() < 1e-8) { this.pause(); return }
    ref.normalize()
    if (!this.reference || this.reference.distanceToSquared(ref) > 1e-6) {
      this.reference = ref.clone()
      this.forearm = ref.clone()
      this.target.copy(STANCE)
      this.history = []
      this.updating = false
      this.swingRoll = 0
    }

    // Regression over <=120 ms of accepted positions, never predicted samples.
    this.history.push({ t: message.timestamp, p: toPlayerDirection(message.position) })
    this.history = this.history.filter(s => message.timestamp - s.t <= .12).slice(-12)
    if (this.history.length >= 3 && message.timestamp - this.history[0].t >= .06) {
      const mean = this.history.reduce((sum, s) => sum + s.t, 0) / this.history.length
      const slope = new Vector3()
      let denominator = 0
      for (const sample of this.history) {
        const t = sample.t - mean
        slope.addScaledVector(sample.p, t)
        denominator += t * t
      }
      slope.divideScalar(denominator)
      this.handSpeed = slope.length()
      this.velocityActive = this.handSpeed >= (this.velocityActive ? MOVE_OFF : MOVE_ON)
      this.velocity.copy(this.velocityActive ? slope : new Vector3())
    } else {
      this.velocityActive = false
      this.velocity.set(0, 0, 0)
      this.handSpeed = 0
    }

    const stable = this.forearm!
    const angle = stable.angleTo(next)
    this.forearmAngleChange = angle / RAD
    // Large single-frame jumps need motion or three consistent observations.
    if (angle > (this.velocityActive ? 120 : 60) * RAD) {
      this.pendingCount = this.pending && this.pending.angleTo(next) < 12 * RAD
        ? this.pendingCount + 1 : 1
      this.pending = next.clone()
      if (this.pendingCount < 3) {
        this.forearmStatus = 'REJECTED'
        return
      }
    } else {
      this.pending = null
      this.pendingCount = 0
    }
    const deadband = this.updating ? 2 : 4
    if (angle <= deadband * RAD) {
      this.updating = false
      this.forearmStatus = 'STABLE'
      // A near-reference stance has a repeatable neutral, not accumulated drift.
      if (!this.velocityActive && next.angleTo(this.reference!) <= 4 * RAD) {
        this.forearm = this.reference!.clone()
      }
      return
    }
    this.updating = true
    this.forearmStatus = 'UPDATING'
    const tau = this.velocityActive ? .035 : .16
    const rotation = new Quaternion().setFromUnitVectors(stable, next)
    const fraction = Math.min(1 - Math.exp(-step / tau), step * 10 / Math.max(angle, 1e-6))
    const partial = new Quaternion().slerp(rotation, fraction)
    this.forearm = stable.clone().applyQuaternion(partial).normalize()
  }

  step(dt: number, _speed: number) {
    dt = Math.min(dt, .05)
    const before = this.current.clone()
    if (this.reference && this.forearm) {
      this.relativeForearmAngle = this.reference.angleTo(this.forearm) / RAD
      // World/player-space delta acts BEFORE the local neutral orientation.
      const relative = new Quaternion().setFromUnitVectors(this.reference, this.forearm)
      this.target.copy(relative).multiply(STANCE).normalize()
    }
    const axis = LONG_AXIS.clone().applyQuaternion(this.target)
    const desiredFace = this.velocity.clone().addScaledVector(axis, -this.velocity.dot(axis))
    if (this.velocityActive && this.forearmStatus !== 'REJECTED' && desiredFace.length() > .5) {
      desiredFace.normalize()
      const face = FACE.clone().applyQuaternion(this.target)
      if (desiredFace.dot(face) < 0) desiredFace.negate()
      const roll = Math.atan2(axis.dot(face.clone().cross(desiredFace)), face.dot(desiredFace))
      const desired = Math.max(-.35, Math.min(.35, roll))
      this.swingRoll += (desired - this.swingRoll) * (1 - Math.exp(-dt / .08))
    } else {
      this.swingRoll *= Math.exp(-dt / .12)
    }
    if (Math.abs(this.swingRoll) < .001) this.swingRoll = 0
    this.target.premultiply(new Quaternion().setFromAxisAngle(axis, this.swingRoll)).normalize()
    const distance = this.current.angleTo(this.target)
    const tau = this.velocityActive ? .025 : .10
    const alpha = 1 - Math.exp(-dt / tau)
    const bounded = distance > 1e-6 ? Math.min(alpha, dt * 12 / distance) : alpha
    if (distance < .1 * RAD) this.current.copy(this.target)
    else this.current.slerp(this.target, bounded).normalize()
    this.batAngularChange = before.angleTo(this.current) / RAD
    return this.current
  }
}
