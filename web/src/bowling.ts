import { Vector3 } from 'three'
import { DELIVERY, GAMEPLAY as T } from './gameplayTuning'

export type BowlerState = 'READY' | 'PAUSE' | 'RUN_UP' | 'GATHER' | 'BOWLING_ARM_ROTATION' | 'RELEASE' | 'FOLLOW_THROUGH'
export function releaseTime(pause: number) { return pause + T.runSeconds + T.gatherSeconds + T.armSeconds }
const clamp = (v: number) => Math.max(0, Math.min(1, v))
export function bowlerPose(time: number, pause: number, ready = false) {
  const run = clamp((time - pause) / T.runSeconds)
  const gather = clamp((time - pause - T.runSeconds) / T.gatherSeconds)
  const arm = clamp((time - pause - T.runSeconds - T.gatherSeconds) / T.armSeconds)
  const follow = clamp((time - releaseTime(pause)) / T.followThroughSeconds)
  const state: BowlerState = ready ? 'READY' : time < pause ? 'PAUSE' : run < 1 ? 'RUN_UP'
    : gather < 1 ? 'GATHER' : time < releaseTime(pause) ? 'BOWLING_ARM_ROTATION' : follow < .08 ? 'RELEASE' : 'FOLLOW_THROUGH'
  const stride = state === 'RUN_UP' ? Math.sin(run * Math.PI * 10) * .65 : Math.sin(follow * Math.PI) * .4
  const lean = .06 + follow * .28
  const angle = gather < 1 ? stride * -.7 + gather * .3 : .3 + arm * (Math.PI + .22 - .3) + follow * 1.5
  const root = new Vector3(T.bowlerX, 0, T.bowlerStartZ + (T.bowlerCreaseZ - T.bowlerStartZ) * run + follow * 1.2)
  const hand = new Vector3(0, -T.armLength * Math.cos(angle), -T.armLength * Math.sin(angle))
    .add(new Vector3(.22, T.shoulderY, 0)).applyAxisAngle(new Vector3(1, 0, 0), lean).add(root)
  return { state, root, lean, angle, stride, hand }
}

export function chooseDelivery(random: () => number, beginner: boolean, release: Vector3) {
  const band = random(), tier = band < .7 ? 0 : band < .9 ? 1 : 2
  const between = (range: readonly number[]) => range[0] + random() * (range[1] - range[0])
  const speed = between(T.speedRanges[tier]) * (beginner ? T.beginnerSpeedMultiplier : 1)
  const targetX = .32 + (random() * 2 - 1) * T.lineRanges[tier]
  const bounceZ = between(T.bounceRanges[tier])
  const height = between(T.contactHeightRanges[tier])
  const floor = T.groundY + DELIVERY.radius
  const t1 = (bounceZ - release.z) / speed, t2 = (-.65 - bounceZ) / speed
  const vy = (floor - release.y + .5 * DELIVERY.gravity * t1 * t1) / t1
  const rebound = (height - floor + .5 * DELIVERY.gravity * t2 * t2) / t2
  const incoming = DELIVERY.gravity * t1 - vy
  return { velocity: new Vector3((targetX - release.x) / (t1 + t2), vy, speed),
    bounce: rebound / incoming, bounceZ, targetX, height, tier }
}
