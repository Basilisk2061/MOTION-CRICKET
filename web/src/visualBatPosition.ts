import { Vector3 } from 'three'

export const VISUAL_DEADBAND = .012
export const MIN_DEADBAND = .010
export const MAX_DEADBAND = .020
const RESPONSE_SECONDS = .006

export class VisualBatPosition {
  readonly position = new Vector3()
  private anchor = new Vector3()
  private lastTarget = new Vector3()
  private initialized = false
  private moving = false
  private sampleElapsed = 0
  private lastStep = new Vector3()
  private microJitter = 0
  deadband = VISUAL_DEADBAND

  update(target: Vector3, dt: number): Vector3 {
    if (![target.x, target.y, target.z, dt].every(Number.isFinite) || dt <= 0)
      return this.position
    if (!this.initialized) {
      this.position.copy(target)
      this.anchor.copy(target)
      this.lastTarget.copy(target)
      this.initialized = true
      return this.position
    }
    this.sampleElapsed += dt
    const step = target.distanceTo(this.lastTarget)
    const newTarget = step > 1e-9
    const speed = newTarget ? step / this.sampleElapsed : 0
    if (newTarget) {
      const delta = target.clone().sub(this.lastTarget)
      // Learn noise only inside the stationary envelope, not coherent travel.
      if (!this.moving && target.distanceTo(this.anchor) <= this.deadband) {
        const calm = step < .003
        if (calm || delta.dot(this.lastStep) <= 0) {
          const alpha = -Math.expm1(-this.sampleElapsed / .25)
          this.microJitter += alpha * ((calm ? 0 : step) - this.microJitter)
          const desired = Math.max(MIN_DEADBAND, Math.min(MAX_DEADBAND,
            MIN_DEADBAND + this.microJitter * .75))
          this.deadband += alpha * (desired - this.deadband)
        }
      }
      this.lastStep.copy(delta)
      this.lastTarget.copy(target)
      this.sampleElapsed = 0
    }
    // Deadband affects the mesh only; release on the very first excursion.
    if (!this.moving && target.distanceTo(this.anchor) <= this.deadband)
      return this.position
    this.moving = true
    this.position.lerp(target, speed >= 1 ? 1 : -Math.expm1(-dt / RESPONSE_SECONDS))
    if ((newTarget ? speed < .08 : this.sampleElapsed >= .05)
        && this.position.distanceTo(target) < .001) {
      this.anchor.copy(this.position)
      this.moving = false
    }
    return this.position
  }
}
