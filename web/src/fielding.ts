import { Vector3 } from 'three'

// ============================================================
// TYPES
// ============================================================

export type FielderState =
  | 'READY'
  | 'REACTING'
  | 'CHASING'
  | 'COLLECTING'
  | 'THROWING'
  | 'RECOVERING'

export type FielderRole =
  | 'SLIP' | 'SECOND_SLIP' | 'GULLY' | 'FINE_LEG' | 'SHORT_COVER' | 'SHORT_MID_WICKET'
  | 'DEEP_SQUARE' | 'DEEP_POINT' | 'LONG_OFF' | 'LONG_ON'
  | 'POINT'
  | 'COVER'
  | 'MID_OFF'
  | 'MID_ON'
  | 'MID_WICKET'
  | 'SQUARE_LEG'
  | 'THIRD_MAN'
  | 'DEEP_COVER'
  | 'DEEP_MID_WICKET'

export type Fielder = {
  id: number
  role: FielderRole

  position: Vector3
  homePosition: Vector3
  target: Vector3

  state: FielderState
  runSpeed: number

  reactionDelay: number
  reactionAge: number

  facing: number
  active: boolean
  distanceToBall: number
  handLocal: Vector3
  captureLocal: Vector3
  renderedPosition?: Vector3
}

const FIELD_UP = new Vector3(0,1,0)
const THROW_HAND = new Vector3(.40,1.52,-.34)
export function fielderAttachment(fielder: Fielder) {
  return fielder.handLocal.clone().applyAxisAngle(FIELD_UP,fielder.facing).add(fielder.position)
}
function captureAttachment(fielder: Fielder, ball: Vector3) {
  fielder.captureLocal.copy(ball).sub(fielder.position).applyAxisAngle(FIELD_UP,-fielder.facing)
  fielder.handLocal.copy(fielder.captureLocal)
  return fielderAttachment(fielder)
}

export type FieldingUpdate = {
  active: boolean

  collecting: boolean
  collected: boolean
  captureBall: boolean

  // true only when the ball is intercepted in the air
  caught: boolean

  fielder: Fielder | null
  holdPosition: Vector3 | null
}

export function fielderInteraction(distance: number, speed: number, airborne: boolean) {
  if (distance > (airborne ? FIELDING.CATCH_RADIUS : FIELDING.COLLECTION_RADIUS)) return 'BEAT'
  if (airborne) {
    if ((speed <= 18 && distance <= .45) || (speed <= 24 && distance <= .18)) return 'CLEAN'
    return distance <= .18 ? 'BLOCK' : 'DEFLECT'
  }
  if ((speed <= 8 && distance <= .60) || (speed <= 14 && distance <= .22)) return 'CLEAN'
  if (distance <= .18) return 'BLOCK'
  return 'DEFLECT'
}

export function fieldingClosestApproach(from: Vector3, to: Vector3, start: Vector3, end: Vector3) {
  const relative = from.clone().sub(start)
  const delta = to.clone().sub(end).sub(relative)
  // Minimize the existing height-aware volume in each band, in relative 3D space.
  // Below the hand column, vertical separation must participate in closest approach.
  const bands = [[0, FIELDING.COLLECTION_HEIGHT], [FIELDING.COLLECTION_HEIGHT, .65],
    [.65, FIELDING.CATCH_MAX_HEIGHT]]
  let closest: { point: Vector3, center: Vector3, distance: number, airborne: boolean, time: number } | null = null
  for (let index = 0; index < bands.length; index++) {
    const [bottom, top] = bands[index]
    let low = 0, high = 1
    if (Math.abs(delta.y) < 1e-9) {
      if (relative.y < bottom || relative.y > top) continue
    } else {
      const a = (bottom-relative.y)/delta.y, b = (top-relative.y)/delta.y
      low = Math.max(0, Math.min(a,b)); high = Math.min(1, Math.max(a,b))
      if (low > high) continue
    }
    const offset = relative.clone(), direction = delta.clone()
    if (index === 1) offset.y -= .65
    else { offset.y = 0; direction.y = 0 }
    const t = Math.max(low, Math.min(high,
      direction.lengthSq() > 1e-9 ? -offset.dot(direction)/direction.lengthSq() : low))
    const distance = offset.addScaledVector(direction,t).length()
    if (!closest || distance < closest.distance) {
      closest = { point: from.clone().lerp(to,t), center: start.clone().lerp(end,t),
        distance, airborne: index > 0, time: t }
    }
  }
  return closest
}

// ============================================================
// TUNING
// ============================================================

export const FIELDING = {
  INNER_RUN_SPEED: 6.2,
  DEEP_RUN_SPEED: 6.8,

  REACTION_MIN: 0.18,
  REACTION_MAX: 0.38,

  COLLECTION_RADIUS: 0.72,
  COLLECTION_HEIGHT: 0.42,
  COLLECTION_TIME: 0.38,
  PICKUP_HOLD_TIME: 0.55,
  CATCH_HOLD_TIME: 0.75,

  CATCH_RADIUS: 0.62,
  CATCH_MAX_HEIGHT: 2.15,
  ACTIVE_INTERCEPTION_REACH: 1.0,

  THROW_SPEED: 23,
  RETURN_RECEIVE_RADIUS: 0.55,

  RUN_SECONDS: 2.85,

  PREDICTION_STEP: 0.10,
  PREDICTION_MAX_TIME: 3.0,
  PREDICTION_DRAG: 0.88,

  TARGET_RESPONSE: 0.10,
  DIRECT_CHASE_DISTANCE: 5.0,

  // Re-evaluate who should chase while the ball is still free.
  REASSIGN_INTERVAL: 0.10,

  // Replacement must be clearly better.
  SWITCH_ADVANTAGE: 0.22,

  // Once this close, keep current fielder committed.
  SWITCH_LOCK_DISTANCE: 1.25,
} as const

// ============================================================
// FIELD SETUP
// ============================================================

type FielderSetup = {
  role: FielderRole
  position: [number, number, number]
  speed: number
}

const FIELD_SETUP: FielderSetup[] = [
  {
    role: 'POINT',
    position: [-12, 0, -4.8],
    speed: FIELDING.INNER_RUN_SPEED,
  },

  {
    role: 'COVER',
    position: [-13.2, 0, -13.2],
    speed: FIELDING.INNER_RUN_SPEED,
  },

  {
    role: 'MID_OFF',
    position: [-7.2, 0, -19.2],
    speed: FIELDING.INNER_RUN_SPEED,
  },

  {
    role: 'MID_ON',
    position: [7.2, 0, -19.2],
    speed: FIELDING.INNER_RUN_SPEED,
  },

  {
    role: 'MID_WICKET',
    position: [13.2, 0, -12],
    speed: FIELDING.INNER_RUN_SPEED,
  },

  {
    role: 'SQUARE_LEG',
    position: [14.4, 0, -3.6],
    speed: FIELDING.INNER_RUN_SPEED,
  },

  {
    role: 'THIRD_MAN',
    position: [-19.8, 0, 8.8],
    speed: FIELDING.DEEP_RUN_SPEED,
  },

  {
    role: 'DEEP_COVER',
    position: [-26.4, 0, -19.8],
    speed: FIELDING.DEEP_RUN_SPEED,
  },

  {
    role: 'DEEP_MID_WICKET',
    position: [26.4, 0, -18.7],
    speed: FIELDING.DEEP_RUN_SPEED,
  },
]

// ============================================================
// HELPERS
// ============================================================

function reactionFor(index: number) {
  const range =
    FIELDING.REACTION_MAX -
    FIELDING.REACTION_MIN

  const factor =
    ((index * 37) % 100) / 100

  return (
    FIELDING.REACTION_MIN +
    range * factor
  )
}

function flatDistance(
  a: Vector3,
  b: Vector3,
) {
  return Math.hypot(
    a.x - b.x,
    a.z - b.z,
  )
}

function predictBallPosition(
  position: Vector3,
  velocity: Vector3,
  time: number,
) {
  const predicted =
    position.clone()

  const drag =
    Math.pow(
      FIELDING.PREDICTION_DRAG,
      time,
    )

  const horizontalScale =
    time *
    (
      0.55 +
      0.45 * drag
    )

  predicted.x +=
    velocity.x *
    horizontalScale

  predicted.z +=
    velocity.z *
    horizontalScale

  predicted.y +=
    velocity.y * time -
    0.5 *
      9.81 *
      time *
      time

  predicted.y =
    Math.max(
      0,
      predicted.y,
    )

  return predicted
}

type Intercept = {
  position: Vector3
  time: number
}

// ============================================================
// FIELDING CONTROLLER
// ============================================================

export class FieldingController {
  fielders: Fielder[]

  // There can NEVER be more than one active fielder.
  activeFielder:
    Fielder | null = null

  ballCollected = false
  returnInProgress = false

  private collectionAge = 0
  private collectionIsCatch = false
  private shotStarted = false
  private reassignmentAge = 0
  private interactionCooldown = 0
  private previousBall: Vector3 | null = null
  private cooldownFielder = -1
  debugEnabled = false
  debugContact: {
    from: Vector3; to: Vector3; start: Vector3; end: Vector3; center: Vector3;
    closest: Vector3; target: Vector3; contact: Vector3 | null;
    distance: number; reach: number; speed: number; height: number; lateral: number;
    zone: string; result: string; state: FielderState; active: boolean;
  } | null = null
  private debugAge = 0
  private contactTrace: Record<string, unknown> | null = null
  private frameDt = 0

  finishDebugFrame(position: Vector3) {
    if (this.contactTrace) this.contactTrace.ballPositionAfterFielding = position.toArray()
  }

  recordPhysicsStep(before: Vector3, after: Vector3) {
    if (this.debugEnabled && this.contactTrace) console.debug('FIELDING TRACE', {
      ...this.contactTrace, ballPositionNextPhysicsStep: before.toArray(), ballAfterNextPhysics: after.toArray(),
    })
    this.contactTrace = null
  }

  private resolveContact(previousBall: Vector3, ball: Vector3, velocity: Vector3,
    active: Fielder, activeStart: Vector3): FieldingUpdate | null {
    let contact: { fielder: Fielder, approach: NonNullable<ReturnType<typeof fieldingClosestApproach>>,
      eligible: boolean, radius: number } | null = null
    const activeApproach = fieldingClosestApproach(previousBall, ball, activeStart, active.position)
    for (const fielder of this.fielders) {
      if (fielder.id === this.cooldownFielder && this.interactionCooldown > 0) continue
      const approach = fielder === active ? activeApproach
        : fieldingClosestApproach(previousBall, ball, fielder.position, fielder.position)
      if (!approach) continue
      const eligible = fielder === active && active.state === 'CHASING'
      const radius = eligible ? FIELDING.ACTIVE_INTERCEPTION_REACH
        : approach.airborne ? FIELDING.CATCH_RADIUS : FIELDING.COLLECTION_RADIUS
      if (approach.distance <= radius && (!contact || approach.time < contact.approach.time))
        contact = { fielder, approach, eligible, radius }
    }
    const approach = contact?.approach ?? activeApproach ?? {
      point: ball.clone(), center: active.position.clone(), distance: ball.distanceTo(active.position),
      airborne: ball.y > FIELDING.COLLECTION_HEIGHT, time: 1,
    }
    const contactFielder = contact?.fielder ?? active
    const localContact = approach?.point.clone().sub(approach.center)
      .applyAxisAngle(FIELD_UP, -contactFielder.facing)
    // Feet/legs span +/- .208 to .218; close down central stance through hip height.
    const inVisualStance = localContact && localContact.y >= 0 && localContact.y <= .92
      && Math.hypot(localContact.x, localContact.z) <= .22
    let outcome: ReturnType<typeof fielderInteraction> = 'BEAT'
    if (contact) {
      const normalRadius = contact.approach.airborne ? FIELDING.CATCH_RADIUS : FIELDING.COLLECTION_RADIUS
      outcome = contact.eligible && contact.approach.distance <= normalRadius
        ? fielderInteraction(contact.approach.distance, velocity.length(), contact.approach.airborne)
        : contact.approach.distance <= .18 ? 'BLOCK' : 'DEFLECT'
      // Reacted reach is not magnetic possession: only slow, manageable balls
      // may be secured outside the central clean-contact region.
      if (contact.eligible && velocity.length() <= (contact.approach.airborne ? 12 : 5)) outcome = 'CLEAN'
      // Hand-column vertical distance must not turn a central leg impact into a glance.
      if (inVisualStance && outcome === 'DEFLECT') outcome = 'BLOCK'
    }
    if (this.debugEnabled && approach) {
      const reach = !contact && !activeApproach ? 0 : contact?.radius ?? (active.state === 'CHASING' ? FIELDING.ACTIVE_INTERCEPTION_REACH
        : approach.airborne ? FIELDING.CATCH_RADIUS : FIELDING.COLLECTION_RADIUS)
      this.debugContact = { from: previousBall.clone(), to: ball.clone(),
        start: contactFielder === active ? activeStart.clone() : contactFielder.position.clone(),
        end: contactFielder.position.clone(), center: approach.center.clone(), closest: approach.point.clone(),
        target: active.target.clone(), contact: contact ? approach.point.clone() : null,
        distance: approach.distance, reach, speed: velocity.length(), height: approach.point.y,
        lateral: localContact?.x ?? 0, state: contactFielder.state, active: contactFielder === active,
        zone: !contact ? 'NONE' : inVisualStance ? 'LOWER_BODY' : approach.distance >
          (approach.airborne ? FIELDING.CATCH_RADIUS : FIELDING.COLLECTION_RADIUS) ? 'STRETCH'
          : approach.point.y <= 1.67 && approach.distance <= .225 ? 'BODY'
          : approach.airborne ? 'HAND_REACH' : 'NORMAL_REACH',
        result: outcome === 'CLEAN' ? approach.airborne ? 'CATCH' : 'COLLECT'
          : outcome === 'BEAT' ? 'MISS' : outcome === 'DEFLECT' && approach.airborne ? 'PARRY' : outcome }
    }
    if (this.debugEnabled && (contact || (this.debugAge >= .5 && approach && approach.distance < 1.5))) {
      this.debugAge = 0
      this.contactTrace = { ballPrev: previousBall.toArray(), ballCurrent: ball.toArray(),
        fielderPrev: activeStart.toArray(), fielderCurrent: active.position.toArray(),
        closestApproach: approach?.distance, contactHeight: approach?.point.y,
        contactRadius: contact?.radius ?? (active.state === 'CHASING' ? FIELDING.ACTIVE_INTERCEPTION_REACH : FIELDING.CATCH_RADIUS),
        contactDetected: !!contact, contactType: outcome === 'CLEAN' ? (approach?.airborne ? 'CATCH' : 'COLLECT')
          : outcome === 'DEFLECT' ? 'PARRY' : outcome === 'BEAT' ? 'NONE' : outcome,
        ballSpeedAtContact: velocity.length(), fieldingState: active.state, activeFielder: active.id,
        frameDt: this.frameDt, contactFielder: contact?.fielder.id, contactPosition: contact?.approach.point.toArray(),
        contactFielderPosition: contact?.approach.center.toArray() }
      this.contactTrace.contactZone = !contact ? 'NONE' : inVisualStance ? 'LOWER_BODY'
        : approach && approach.distance > (approach.airborne ? FIELDING.CATCH_RADIUS : FIELDING.COLLECTION_RADIUS)
          ? 'STRETCH' : approach?.airborne ? 'HAND_REACH' : 'NORMAL'
      this.contactTrace.lateralOffsetFromFielder = localContact?.x
    }
    if (!contact) return null
    ball.copy(contact.approach.point)
    this.previousBall = ball.clone()
    if (outcome !== 'CLEAN') {
      this.cooldownFielder = contact.fielder.id
      return this.looseInteraction(contact.fielder, ball, velocity, contact.approach.airborne,
        outcome, contact.approach.distance, contact.approach.center)
    }
    active.state = 'COLLECTING'
    this.collectionAge = 0
    this.collectionIsCatch = contact.approach.airborne
    const holdPosition = captureAttachment(active, ball)
    return { active: true, collecting: true, collected: false, captureBall: true,
      caught: contact.approach.airborne, fielder: active, holdPosition }
  }

  private looseInteraction(active: Fielder, ball: Vector3, velocity: Vector3, airborne: boolean,
    outcome: 'BLOCK' | 'DEFLECT' | 'BEAT', distance = 0,
    center = active.position): FieldingUpdate {
    this.interactionCooldown = outcome === 'DEFLECT' ? .30 : 0
    if (outcome === 'BLOCK') {
      // Kill a central impact without possession or a synthetic sideways kick.
      const horizontal = Math.hypot(velocity.x, velocity.z)
      const retained = Math.min(horizontal * .04, 1.2)
      const factor = horizontal > 0 ? retained / horizontal : 0
      velocity.x *= factor; velocity.z *= factor
      velocity.y = airborne ? Math.min(-.8, velocity.y * .1) : Math.min(0, velocity.y * .1)
    } else if (outcome === 'DEFLECT') {
      const sideways = new Vector3(-velocity.z, 0, velocity.x).normalize()
      const side = sideways.dot(ball.clone().sub(center)) >= 0 ? 1 : -1
      const speed = velocity.length()
      const glancing = Math.max(0, Math.min(1, (distance - .18) / (FIELDING.ACTIVE_INTERCEPTION_REACH - .18)))
      velocity.multiplyScalar(.55 + .30 * glancing)
      velocity.addScaledVector(sideways, side * Math.min(3, speed * .12) * (1 - .5 * glancing))
      if (airborne) velocity.y = Math.min(-.8, velocity.y)
    }
    // No possession: the same live ball can be chased again after the contact.
    return { active: true, collecting: false, collected: false, captureBall: false,
      caught: false, fielder: active, holdPosition: null }
  }

  constructor() {
    this.fielders =
      FIELD_SETUP.map(
        (
          setup,
          index,
        ): Fielder => ({
          id: index,
          role: setup.role,

          position:
            new Vector3(
              ...setup.position,
            ),

          homePosition:
            new Vector3(
              ...setup.position,
            ),

          target:
            new Vector3(
              ...setup.position,
            ),

          state: 'READY',
          runSpeed: setup.speed,

          reactionDelay:
            reactionFor(index),

          reactionAge: 0,

          facing: 0,
          active: false,

          distanceToBall:
            Infinity,
          handLocal: new Vector3(.40,1.52,-.34),
          captureLocal: new Vector3(),
        }),
      )
  }

  // ==========================================================
  // RESET
  // ==========================================================

  reset() {
    this.debugContact = null
    this.contactTrace = null
    this.cooldownFielder = -1
    this.previousBall = null
    this.interactionCooldown = 0
    this.activeFielder = null

    this.ballCollected = false
    this.returnInProgress = false

    this.collectionAge = 0
    this.reassignmentAge = 0
    this.shotStarted = false

    for (
      const fielder of
      this.fielders
    ) {
      fielder.position.copy(
        fielder.homePosition,
      )

      fielder.target.copy(
        fielder.homePosition,
      )

      fielder.state = 'READY'
      fielder.reactionAge = 0
      fielder.facing = 0
      fielder.active = false

      fielder.distanceToBall =
        Infinity
    }
  }

  // ==========================================================
  // START
  // ==========================================================

  startFielding(
    ballPosition: Vector3,
    ballVelocity: Vector3,
    shotOrigin = ballPosition,
  ) {
    if (this.shotStarted) {
      return
    }

    this.shotStarted = true
    this.previousBall = shotOrigin.clone()

    this.ballCollected = false
    this.returnInProgress = false

    this.collectionAge = 0
    this.reassignmentAge = 0

    this.activeFielder = null

    for (
      const fielder of
      this.fielders
    ) {
      fielder.state = 'READY'
      fielder.reactionAge = 0
      fielder.active = false

      fielder.target.copy(
        fielder.homePosition,
      )

      fielder.distanceToBall =
        flatDistance(
          fielder.position,
          ballPosition,
        )
    }

    const best =
      this.findBestFielder(
        ballPosition,
        ballVelocity,
      )

    if (best) {
      this.activateFielder(
        best.fielder,
        best.intercept.position,
        true,
      )
    }
  }

  // ==========================================================
  // INTERCEPTION
  // ==========================================================

  private findReachableIntercept(
    fielder: Fielder,
    ballPosition: Vector3,
    ballVelocity: Vector3,
    includeReaction: boolean,
  ): Intercept {
    let bestPosition:
      Vector3 | null = null

    let bestTime =
      Infinity

    const reactionRemaining =
      includeReaction
        ? Math.max(
            0,
            fielder.reactionDelay -
              fielder.reactionAge,
          )
        : 0

    for (
      let time =
        FIELDING.PREDICTION_STEP;

      time <=
      FIELDING.PREDICTION_MAX_TIME;

      time +=
        FIELDING.PREDICTION_STEP
    ) {
      const predicted =
        predictBallPosition(
          ballPosition,
          ballVelocity,
          time,
        )

      const distance =
        flatDistance(
          fielder.position,
          predicted,
        )

      const availableRunTime =
        Math.max(
          0,
          time -
            reactionRemaining,
        )

      const reachableDistance =
        fielder.runSpeed *
        availableRunTime

      if (
        distance <=
        reachableDistance +
          FIELDING.COLLECTION_RADIUS
      ) {
        bestPosition =
          predicted

        bestTime =
          time

        break
      }
    }

    // Even if no intercept is technically reachable inside
    // the prediction window, keep chasing instead of freezing.
    if (!bestPosition) {
      const fallbackTime = 1.0

      bestPosition =
        predictBallPosition(
          ballPosition,
          ballVelocity,
          fallbackTime,
        )

      const distance =
        flatDistance(
          fielder.position,
          bestPosition,
        )

      bestTime =
        reactionRemaining +
        distance /
          Math.max(
            0.1,
            fielder.runSpeed,
          )
    }

    bestPosition.y = 0

    return {
      position:
        bestPosition,

      time:
        bestTime,
    }
  }

  private findBestFielder(
    ballPosition: Vector3,
    ballVelocity: Vector3,
  ) {
    let best:
      {
        fielder: Fielder
        intercept: Intercept
      }
      | null = null

    for (
      const fielder of
      this.fielders
    ) {
      const intercept =
        this.findReachableIntercept(
          fielder,
          ballPosition,
          ballVelocity,

          fielder.state ===
            'READY',
        )

      if (
        !best ||
        intercept.time <
          best.intercept.time
      ) {
        best = {
          fielder,
          intercept,
        }
      }
    }

    return best
  }

  // ==========================================================
  // EXACTLY ONE ACTIVE FIELDER
  // ==========================================================

  private activateFielder(
    next: Fielder,
    target: Vector3,
    useReaction: boolean,
  ) {
    for (
      const fielder of
      this.fielders
    ) {
      if (fielder === next) {
        continue
      }

      fielder.active = false
      fielder.state = 'READY'
      fielder.reactionAge = 0

      // Do NOT teleport a fielder back home when assignment changes.
      fielder.target.copy(
        fielder.position,
      )
    }

    this.activeFielder =
      next

    next.active = true
    next.target.copy(target)

    if (useReaction) {
      next.state = 'REACTING'
      next.reactionAge = 0
    } else {
      next.state = 'CHASING'

      // A replacement shouldn't perform another reaction delay.
      next.reactionAge =
        next.reactionDelay
    }
  }

  // ==========================================================
  // DYNAMIC REASSIGNMENT
  // ==========================================================

  private maybeReassign(
    ballPosition: Vector3,
    ballVelocity: Vector3,
  ) {
    const current =
      this.activeFielder

    if (
      !current ||
      this.ballCollected ||
      current.state ===
        'COLLECTING' ||
      current.state ===
        'THROWING'
    ) {
      return
    }

    const currentDistance =
      flatDistance(
        current.position,
        ballPosition,
      )

    // Don't switch when current fielder is already close.
    if (
      currentDistance <=
      FIELDING.SWITCH_LOCK_DISTANCE
    ) {
      return
    }

    const currentIntercept =
      this.findReachableIntercept(
        current,
        ballPosition,
        ballVelocity,

        current.state ===
          'REACTING',
      )

    let replacement:
      {
        fielder: Fielder
        intercept: Intercept
      }
      | null = null

    for (
      const fielder of
      this.fielders
    ) {
      if (fielder === current) {
        continue
      }

      const intercept =
        this.findReachableIntercept(
          fielder,
          ballPosition,
          ballVelocity,
          false,
        )

      if (
        !replacement ||
        intercept.time <
          replacement.intercept.time
      ) {
        replacement = {
          fielder,
          intercept,
        }
      }
    }

    if (!replacement) {
      return
    }

    // Switch only if the new player has a meaningful advantage.
    if (
      replacement.intercept.time +
        FIELDING.SWITCH_ADVANTAGE >=
      currentIntercept.time
    ) {
      return
    }

    this.activateFielder(
      replacement.fielder,
      replacement.intercept.position,
      false,
    )
  }

  // ==========================================================
  // UPDATE
  // ==========================================================

  update(
    dt: number,
    ballPosition: Vector3,
    ballVelocity: Vector3,
    ballInPlay: boolean,
  ): FieldingUpdate {
    const previousBall = this.previousBall?.clone() ?? ballPosition.clone()
    this.frameDt = dt
    this.debugAge += dt
    this.previousBall = ballPosition.clone()
    this.interactionCooldown = Math.max(0, this.interactionCooldown - dt)
    if (
      !ballInPlay ||
      !this.shotStarted ||
      !this.activeFielder
    ) {
      return {
        active: false,
        collecting: false,
        collected:
          this.ballCollected,
        captureBall: false,
        caught: false,
        fielder:
          this.activeFielder,
        holdPosition: this.activeFielder && ['COLLECTING','THROWING'].includes(this.activeFielder.state)
          ? fielderAttachment(this.activeFielder) : null,
      }
    }

    // --------------------------------------------------------
    // Re-evaluate who should chase.
    // --------------------------------------------------------

    if (!this.ballCollected) {
      this.reassignmentAge += dt

      if (
        this.reassignmentAge >=
        FIELDING.REASSIGN_INTERVAL
      ) {
        this.reassignmentAge = 0

        this.maybeReassign(
          ballPosition,
          ballVelocity,
        )
      }
    }

    // maybeReassign() can change activeFielder.
    const active =
      this.activeFielder

    if (!active) {
      return {
        active: false,
        collecting: false,
        collected:
          this.ballCollected,
        captureBall: false,
        caught: false,
        fielder: null,
        holdPosition: null,
      }
    }

    // Defensive guarantee: exactly one active player.
    const fielderStart = active.position.clone()
    for (
      const fielder of
      this.fielders
    ) {
      if (fielder === active) {
        fielder.active = true
        continue
      }

      fielder.active = false

      if (
        fielder.state !==
        'RECOVERING'
      ) {
        fielder.state = 'READY'
      }
    }

    // ========================================================
    // REACTION
    // ========================================================

    if (
      active.state ===
      'REACTING'
    ) {
      active.reactionAge += dt

      if (
        active.reactionAge <
        active.reactionDelay
      ) {
        const contact = this.resolveContact(previousBall, ballPosition, ballVelocity, active, fielderStart)
        if (contact) return contact
        return {
          active: true,
          collecting: false,
          collected: false,
          captureBall: false,
          caught: false,
          fielder: active,
          holdPosition: null,
        }
      }

      active.state =
        'CHASING'
    }

    // ========================================================
    // CHASING
    // ========================================================

    if (
      active.state ===
      'CHASING'
    ) {
      active.distanceToBall =
        flatDistance(
          active.position,
          ballPosition,
        )

      if (
        active.distanceToBall <=
        FIELDING.DIRECT_CHASE_DISTANCE && ballVelocity.length() <= 8
      ) {
        active.target.set(
          ballPosition.x,
          0,
          ballPosition.z,
        )
      } else {
        const intercept =
          this.findReachableIntercept(
            active,
            ballPosition,
            ballVelocity,
            false,
          )

        const response =
          1 -
          Math.exp(
            -dt /
              FIELDING.TARGET_RESPONSE,
          )

        active.target.lerp(
          intercept.position,
          response,
        )
      }

      // ------------------------------------------------------
      // ACTUAL WORLD MOVEMENT
      // ------------------------------------------------------

      const movement =
        active.target
          .clone()
          .sub(
            active.position,
          )

      movement.y = 0

      const distance =
        movement.length()

      if (distance > 0.001) {
        const direction =
          movement.normalize()

        const amount =
          Math.min(
            distance,
            active.runSpeed * dt,
          )

        active.position.addScaledVector(
          direction,
          amount,
        )

        active.facing =
          Math.atan2(
            direction.x,
            direction.z,
          )
      }

      active.distanceToBall =
        flatDistance(
          active.position,
          ballPosition,
        )

      // Only the owning, reacted CHASING fielder receives stretch reach.
      const contact = this.resolveContact(previousBall, ballPosition, ballVelocity, active, fielderStart)
      if (contact) return contact
    }

    // ========================================================
    // COLLECTING
    // ========================================================

    if (
      active.state ===
      'COLLECTING'
    ) {
      this.collectionAge += dt

      const progress=Math.min(1,this.collectionAge/FIELDING.COLLECTION_TIME)
      active.handLocal.copy(active.captureLocal).lerp(THROW_HAND,progress*progress*(3-2*progress))
      const holdPosition=fielderAttachment(active)

      if (
        this.collectionAge >=
        (this.collectionIsCatch ? FIELDING.CATCH_HOLD_TIME : FIELDING.COLLECTION_TIME + FIELDING.PICKUP_HOLD_TIME)
      ) {
        this.ballCollected = true
        this.returnInProgress = true

        active.state =
          'THROWING'

        const throwingPosition =
          fielderAttachment(active)

        return {
          active: true,
          collecting: false,
          collected: true,
          captureBall: false,
          caught: false,
          fielder: active,
          holdPosition:
            throwingPosition,
        }
      }

      return {
        active: true,
        collecting: true,
        collected: false,
        captureBall: false,
        caught: false,
        fielder: active,
        holdPosition,
      }
    }

    // ========================================================
    // THROWING
    // ========================================================

    if (
      active.state ===
      'THROWING'
    ) {
      const holdPosition =
        fielderAttachment(active)

      return {
        active: true,
        collecting: false,
        collected: true,
        captureBall: false,
        caught: false,
        fielder: active,
        holdPosition,
      }
    }

    // ========================================================
    // DEFAULT
    // ========================================================

    return {
      active: true,
      collecting: false,
      collected:
        this.ballCollected,
      captureBall: false,
      caught: false,
      fielder: active,
      holdPosition: null,
    }
  }
}
