import { Vector3 } from 'three'

export const TRAIL_STYLE = {
  incoming: { duration: .12, points: 24, opacity: .12 },
  hit: { duration: 4, points: 192, opacity: .42 },
}

export class BallTrailHistory {
  points: { p: Vector3; at: number }[] = []
  mode: keyof typeof TRAIL_STYLE = 'incoming'
  clear() { this.points = [] }
  setMode(mode: keyof typeof TRAIL_STYLE) {
    if (mode !== this.mode) { this.clear(); this.mode = mode }
  }
  add(position: Vector3, now: number, bounce = false) {
    if (bounce || !this.points.length || this.points.at(-1)!.p.distanceToSquared(position) > .0001)
      this.points.push({ p: position.clone(), at: now })
  }
  expire(now: number) {
    const style = TRAIL_STYLE[this.mode]
    this.points = this.points.filter(p => now - p.at < style.duration).slice(-style.points)
  }
}
