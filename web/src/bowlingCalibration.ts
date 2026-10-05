import { Quaternion } from 'three'
export class BowlingCalibration {
 reference: Quaternion | null = null
 id = 0
 capture(raw: Quaternion) {
  if (!raw.toArray().every(Number.isFinite) || raw.lengthSq()<.01) return false
  this.reference=raw.clone().normalize(); this.id++; return true
 }
 relative(raw: Quaternion) { return this.reference?.clone().invert().multiply(raw).normalize() ?? null }
}
