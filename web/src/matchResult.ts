import { Vector3 } from 'three'
import { wicketImpact, type WicketImpact } from './wicketImpact'
import { MATCH as M, DELIVERY, GAMEPLAY } from './gameplayTuning'
import { KEEPER_REACH } from './keeperInterception'

export type Result =
  | 'DOT'
  | '1 RUN'
  | '2 RUNS'
  | '3 RUNS'
  | 'FOUR'
  | 'SIX'
  | 'BOWLED'
  | 'CAUGHT'
  | 'CAUGHT BEHIND'

export type Glove = {
  position: Vector3
  active: boolean
  keeperInterception?: boolean
  diving?: boolean
}

export function swingPower(omega: number) {
  return (
    1 -
    Math.exp(
      -M.POWER_RATE *
        Math.max(
          0,
          omega - M.POWER_DEAD_ZONE,
        ),
    )
  )
}

export function poweredExit(
  velocity: Vector3,
  omega: number,
  quality: 'SWEET' | 'GOOD' | 'EDGE',
  beginner: boolean,
  swingActive = false,
) {
  if (!swingActive) return 0

  const power = swingPower(omega)
  const speed = velocity.length()
  const loft = speed > 0 && velocity.y / speed >= M.LOFT_MIN_VERTICAL_RATIO
  const earned = loft && speed >= M.LOFT_MIN_PHYSICAL_SPEED && quality !== 'EDGE'
    ? Math.pow(Math.max(0, (power - M.LOFT_MIN_POWER) / (1 - M.LOFT_MIN_POWER)), 1.5)
      * (quality === 'SWEET' ? 1 : .5) : 0
  const headroom = (M.LOFT_MAX_EXIT_SPEED - M.MAX_EXIT_SPEED) * Math.min(1, earned)

  if (speed > 1e-8) {
    velocity.setLength(
      Math.min(
        M.MAX_EXIT_SPEED + headroom,
        Math.max(
          speed + headroom,
          (
            beginner
              ? M.ATTACK_SPEED
              : M.STRICT_ATTACK_SPEED
          ) *
            power *
            M.QUALITY_POWER[quality],
        ),
      ),
    )
  }

  return power
}

function segmentSphere(
  a: Vector3,
  b: Vector3,
  center: Vector3,
  radius: number,
) {
  const delta =
    b.clone().sub(a)

  const t =
    Math.max(
      0,
      Math.min(
        1,
        center
          .clone()
          .sub(a)
          .dot(delta) /
          (delta.lengthSq() || 1),
      ),
    )

  return (
    a
      .clone()
      .addScaledVector(delta, t)
      .distanceToSquared(center) <=
    radius * radius
  )
}

export function wicketHit(
  a: Vector3,
  b: Vector3,
) {
  const dz = b.z - a.z

  if (Math.abs(dz) < 1e-9) {
    return false
  }

  const t =
    (M.WICKET_Z - a.z) / dz

  if (t < 0 || t > 1) {
    return false
  }

  const p =
    a.clone().lerp(b, t)

  const r = DELIVERY.radius

  const stump =
    p.y >= GAMEPLAY.groundY - r &&
    p.y <=
      GAMEPLAY.groundY +
        M.STUMP_HEIGHT +
        r &&
    M.STUMP_X.some(
      x =>
        Math.abs(p.x - x) <=
        M.STUMP_RADIUS + r,
    )

  const bail =
    Math.abs(p.x) <= .11 + r &&
    Math.abs(
      p.y -
        (
          GAMEPLAY.groundY +
          M.BAIL_HEIGHT
        ),
    ) <=
      .012 + r

  return stump || bail
}

export class MatchResult {
  wicketImpact:WicketImpact|null=null
  endReason: 'NONE' | 'BOUNDARY' | 'WICKET' | 'CATCH' | 'FIELDER_COLLECTION' | 'OUT_OF_PLAY' | 'FAILSAFE' = 'NONE'
  physicsSettled = false
  private keeperContactCooldown = 0
  result: Result | null = null

  hit = false
  groundAfterHit = false
  held = false
  stopped = false

  distance = 0
  age = 0
  omega = 0
  power = 0
  exitSpeed = 0
  contactSpeed = 0
  launchY = 0
  launchAngle = 0
  firstBounceDistance: number | null = null
  recordFirstBounce(position: Vector3) {
    if (this.firstBounceDistance === null)
      this.firstBounceDistance = Math.hypot(position.x - this.origin.x, position.z - this.origin.z)
  }

  private origin =
    new Vector3()
  get shotOrigin() { return this.origin.clone() }

  private boundaryDistance =
    M.BOUNDARY_RADIUS as number

  registerHit(position: Vector3) {
    this.hit = true

    this.origin.copy(position)

    this.groundAfterHit = false
    this.age = 0
  }

  // ==========================================================
  // FIELDER CATCH
  // ==========================================================

  registerFielderCatch() {
    // Already decided.
    if (this.result) {
      return false
    }

    // Can't catch a ball that wasn't hit.
    if (!this.hit) {
      return false
    }

    // Once the ball has bounced it is no longer a legal catch.
    if (this.groundAfterHit) {
      return false
    }

    this.result = 'CAUGHT'
    this.endReason = 'CATCH'

    this.held = true
    this.stopped = true

    return true
  }

  finalizeDistance(reason: MatchResult['endReason'] = 'FIELDER_COLLECTION') {
    if (this.result) return
    this.endReason = reason

    if (!this.hit) {
      this.result = 'DOT'
      return
    }

    const fraction =
      this.distance /
      this.boundaryDistance

    this.result =
      fraction <
      M.RUN_THRESHOLDS[0]
        ? 'DOT'
        : fraction <
            M.RUN_THRESHOLDS[1]
          ? '1 RUN'
          : fraction <
              M.RUN_THRESHOLDS[2]
            ? '2 RUNS'
            : '3 RUNS'
  }

  update(
    from: Vector3,
    position: Vector3,
    velocity: Vector3,
    dt: number,
    glove?: Glove,
  ) {
    if (this.result) return

    this.age += dt
    this.keeperContactCooldown=Math.max(0,this.keeperContactCooldown-dt)
    this.physicsSettled = this.hit && this.groundAfterHit && velocity.length() < M.STOP_SPEED

    // Recovery only: ordinary stopped balls stay live for the pursuing fielder.
    if (![position.x, position.y, position.z, velocity.x, velocity.y, velocity.z].every(Number.isFinite)
      || (this.hit && this.age >= 120)) {
      if (![position.x, position.y, position.z].every(Number.isFinite)) position.copy(this.origin)
      velocity.set(0, 0, 0)
      this.stopped = true
      this.finalizeDistance('FAILSAFE')
      return
    }

    // ========================================================
    // BOWLED
    // ========================================================

    if (
      !this.hit &&
      wicketHit(from, position)
    ) {
      this.result = 'BOWLED'
      const t=(M.WICKET_Z-from.z)/(position.z-from.z)
      this.wicketImpact=wicketImpact(from.clone().lerp(position,t),velocity,this.age,GAMEPLAY.groundY,M.STUMP_X)
      this.endReason = 'WICKET'
      this.stopped = true

      velocity.set(0, 0, 0)

      position.z = M.WICKET_Z

      return
    }

    // ========================================================
    // HIT / DISTANCE / BOUNDARY
    // ========================================================

    if (this.hit) {
      const offset =
        position
          .clone()
          .sub(this.origin)

      offset.y = 0

      this.distance =
        Math.max(
          this.distance,
          offset.length(),
        )

      if (
        offset.lengthSq() >
        1e-8
      ) {
        const d =
          offset.normalize()

        const oz =
          this.origin.z -
          M.BOUNDARY_CENTER_Z

        const s =
          M.BOUNDARY_Z_SCALE

        const a =
          d.x * d.x +
          d.z * d.z /
            (s * s)

        const b =
          2 *
          (
            this.origin.x * d.x +
            oz * d.z /
              (s * s)
          )

        const c =
          this.origin.x *
            this.origin.x +
          oz * oz /
            (s * s) -
          M.BOUNDARY_RADIUS *
            M.BOUNDARY_RADIUS

        this.boundaryDistance =
          (
            -b +
            Math.sqrt(
              Math.max(
                0,
                b * b -
                  4 * a * c,
              ),
            )
          ) /
          (2 * a)
      }

      if (
        Math.hypot(
          position.x,
          (
            position.z -
            M.BOUNDARY_CENTER_Z
          ) /
            M.BOUNDARY_Z_SCALE,
        ) >=
        M.BOUNDARY_RADIUS
      ) {
        this.result =
          this.groundAfterHit
            ? 'FOUR'
            : 'SIX'
        this.endReason = 'BOUNDARY'

        return
      }
    }

    // ========================================================
    // WICKET KEEPER
    // ========================================================

    if (
      glove?.active &&
      this.keeperContactCooldown===0 &&
      velocity.lengthSq() > .0001 &&
      from.z <=
        glove.position.z +
          M.GLOVE_RADIUS +
          DELIVERY.radius &&
      Math.abs(
        glove.position.x,
      ) <= (glove.keeperInterception ? KEEPER_REACH.diveShift+KEEPER_REACH.diveArm : M.GLOVE_MAX_X) &&
      glove.position.z >= 2 && glove.position.z <= 6.4 &&
      glove.position.y >=
        M.GLOVE_MIN_Y &&
      glove.position.y <=
        (glove.keeperInterception ? KEEPER_REACH.maxHeight : M.GLOVE_MAX_Y) &&
      segmentSphere(
        from,
        position,
        glove.position,
        M.GLOVE_RADIUS +
          DELIVERY.radius,
      )
    ) {
      if(glove.keeperInterception && this.hit && velocity.length()>
        (glove.diving?KEEPER_REACH.diveCleanSpeed:KEEPER_REACH.cleanSpeed)) {
        // A hard glove contact is a live parry, not an automatic dismissal.
        velocity.multiplyScalar(.35)
        velocity.y=-Math.max(.8,Math.abs(velocity.y))
        this.keeperContactCooldown=.20
        return
      }
      this.held = true
      this.stopped = true

      position.copy(
        glove.position,
      )

      velocity.set(0, 0, 0)

      if (
        this.hit &&
        !this.groundAfterHit
      ) {
        this.result =
          'CAUGHT BEHIND'
        this.endReason = 'CATCH'
      } else {
        this.finalizeDistance('OUT_OF_PLAY')
      }

      return
    }

    // ========================================================
    // FALLBACK RESULT
    // ========================================================

    if (
      (!this.hit && this.age >= M.RESULT_TIMEOUT) ||

      (
        !this.hit &&
        position.z >
          M.GLOVE_PLANE + 6
      )
    ) {
      this.finalizeDistance('OUT_OF_PLAY')
    }
  }
}
