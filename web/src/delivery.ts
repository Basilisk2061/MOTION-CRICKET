import { Quaternion, Vector3 } from 'three'
import { pointVelocity } from './phone'
import { MatchResult, poweredExit, swingPower, type Glove } from './matchResult'
import { MATCH as M } from './gameplayTuning'
import {

  DELIVERY,

  GAMEPLAY as T,

  BLADE_MIN as bladeMin,

  BLADE_MAX as bladeMax,

  BAT_HITBOX_WIDTH_MULTIPLIER,

  BAT_HITBOX_THICKNESS_MULTIPLIER,

  BAT_HITBOX_LENGTH_PADDING,

  BALL_HIT_RADIUS_PADDING,

  SWING_CONTINUITY as C,

  BEGINNER as B,

} from './gameplayTuning'


import type { SwingContactContext } from './swingContinuity'
import { bowlerPose, releaseTime } from './bowling'
import { generateDelivery, type BowlingPlan, type BowlerType, type Variation } from './bowlingVariation'
import type { Tactic } from './bowlingTactics'
export { DELIVERY } from './gameplayTuning'


export type BatPose = {

  position: Vector3

  rotation: Quaternion

}



export type BatMotion = {

  handleVelocity: Vector3

  angularVelocity: Vector3

}



export type BallState =

  | 'READY'

  | 'BOWLING'

  | 'AFTER_BOUNCE'

  | 'HIT'

  | 'MISSED'

  | 'FOLLOWING'

  | 'COMPLETE'



export type CameraState =

  | 'BATSMAN_VIEW'

  | 'BALL_FOLLOW'

  | 'RETURNING'



export type HitQuality = 'SWEET' | 'GOOD' | 'EDGE'



export function hitQuality(

  point: Vector3,

  speed: number,

  assisted: boolean,

  faceContact: number,

): HitQuality {

  if (

    assisted ||

    Math.abs(point.x) > .055 ||

    point.y < -.70 ||

    point.y > -.23 ||

    faceContact < .5

  ) {

    return 'EDGE'

  }



  return (

    Math.abs(point.x) < T.sweetX &&

    Math.abs(point.y - T.sweetY) < T.sweetHalfLength &&

    speed > T.sweetMinimumSpeed

  )

    ? 'SWEET'

    : 'GOOD'

}



export function beginnerQuality(

  local: Vector3,

  speed: number,

  orientation: number,

  historyAge: number,

  context: SwingContactContext,

) {

  const timing = Math.max(0, 1 - historyAge / B.TIMING_GRACE_MS)



  const proximity = Math.max(

    0,

    1 -

      Math.hypot(

        local.x / (bladeMax.x + B.CORRIDOR_X),

        (local.y - T.sweetY) /

          ((bladeMax.y - bladeMin.y) / 2 + B.CORRIDOR_Y),

      ),

  )



  const tracking =

    context.source === 'PREDICTED'

      ? B.PREDICTED_RELIABILITY

      : context.level === 'DEGRADED'

        ? B.DEGRADED_RELIABILITY

        : 1



  const score =

    timing * B.QUALITY_TIMING_WEIGHT +

    proximity * B.QUALITY_PROXIMITY_WEIGHT +

    orientation * B.QUALITY_ORIENTATION_WEIGHT +

    Math.min(1, speed / B.QUALITY_SPEED) * B.QUALITY_SPEED_WEIGHT +

    tracking * B.QUALITY_TRACKING_WEIGHT



  const sweet =

    score >= B.SWEET_THRESHOLD &&

    proximity >= B.SWEET_MIN_PROXIMITY &&

    orientation >= B.SWEET_MIN_ORIENTATION &&

    timing >= B.SWEET_MIN_TIMING &&

    context.source === 'MEASURED'



  return {

    score,

    quality: (

      sweet

        ? 'SWEET'

        : score >= B.GOOD_THRESHOLD

          ? 'GOOD'

          : 'EDGE'

    ) as HitQuality,

  }

}



// Segment against a sphere-expanded blade box,

// in the moving bat's local frame.

export function sweptContact(

  from: Vector3,

  to: Vector3,

  a: BatPose,

  b: BatPose,

  forgiving = true,

  nearMiss = false,

  assistMultiplier = 1,

  corridor = false,

) {

  const p = from

    .clone()

    .sub(a.position)

    .applyQuaternion(a.rotation.clone().invert())



  const q = to

    .clone()

    .sub(b.position)

    .applyQuaternion(b.rotation.clone().invert())



  const delta = q.clone().sub(p)



  const minimum = bladeMin.clone()

  const maximum = bladeMax.clone()



  const radius =

    DELIVERY.radius +

    (forgiving ? BALL_HIT_RADIUS_PADDING : 0)



  const assistDistance =

    T.nearMissDistance * assistMultiplier



  if (corridor) {

    minimum.x -= B.CORRIDOR_X

    maximum.x += B.CORRIDOR_X



    minimum.y -= B.CORRIDOR_Y

    maximum.y += B.CORRIDOR_Y



    minimum.z -= B.CORRIDOR_DEPTH

    maximum.z += B.CORRIDOR_DEPTH

  } else if (forgiving) {

    minimum.x *= BAT_HITBOX_WIDTH_MULTIPLIER

    maximum.x *= BAT_HITBOX_WIDTH_MULTIPLIER



    minimum.z *= BAT_HITBOX_THICKNESS_MULTIPLIER

    maximum.z *= BAT_HITBOX_THICKNESS_MULTIPLIER



    minimum.y -= BAT_HITBOX_LENGTH_PADDING / 2

    maximum.y += BAT_HITBOX_LENGTH_PADDING / 2

  }



  if (nearMiss && !corridor) {

    // Only assist approach-side/side-edge passes,

    // never an already-behind ball.

    if (

      Math.abs(delta.z) < 1e-8 ||

      p.z * Math.sign(delta.z) > maximum.z

    ) {

      return null

    }



    minimum.x -= assistDistance

    maximum.x += assistDistance



    minimum.y -= assistDistance

    maximum.y += assistDistance

  }



  let enter = 0

  let leave = 1



  const normal = new Vector3(0, 0, -1)



  for (const axis of ['x', 'y', 'z'] as const) {

    const low = minimum[axis] - radius

    const high = maximum[axis] + radius



    if (Math.abs(delta[axis]) < 1e-9) {

      if (p[axis] < low || p[axis] > high) {

        return null

      }



      continue

    }



    const t1 = (low - p[axis]) / delta[axis]

    const t2 = (high - p[axis]) / delta[axis]



    const near = Math.min(t1, t2)

    const far = Math.max(t1, t2)



    if (near > enter) {

      enter = near



      normal.set(0, 0, 0)

      normal[axis] = t1 < t2 ? -1 : 1

    }



    leave = Math.min(leave, far)



    if (enter > leave) {

      return null

    }

  }



  const local = p.addScaledVector(delta, enter)



  if (corridor) {

    const dx =

      Math.max(

        0,

        Math.abs(local.x) - bladeMax.x - radius,

      ) / B.CORRIDOR_X



    const dy =

      Math.max(

        0,

        bladeMin.y - radius - local.y,

        local.y - bladeMax.y - radius,

      ) / B.CORRIDOR_Y



    if (Math.hypot(dx, dy) > 1) {

      return null

    }



    // Use blade face at virtual contact,

    // not corridor boundary normal.

    normal.set(0, 0, p.z > 0 ? 1 : -1)

  }



  if (nearMiss) {

    const dx = Math.max(

      minimum.x + assistDistance - radius - local.x,

      0,

      local.x - (maximum.x - assistDistance + radius),

    )



    const dy = Math.max(

      minimum.y + assistDistance - radius - local.y,

      0,

      local.y - (maximum.y - assistDistance + radius),

    )



    if (

      Math.hypot(dx, dy) >

      assistDistance + 1e-8

    ) {

      return null

    }

  }



  return {

    fraction: enter,

    local,

    normal,

  }

}



export function inBattingZone(point: Vector3) {

  return point

    .toArray()

    .every(

      (v, i) =>

        v >= C.BATTING_INTERACTION_ZONE.min[i] &&

        v <= C.BATTING_INTERACTION_ZONE.max[i],

    )

}



export function contactAssistMultiplier(

  context?: SwingContactContext,

) {

  if (!context?.swingActive) {

    return 1

  }



  if (

    context.level === 'SWING-LOSS' &&

    context.source === 'PREDICTED' &&

    context.predictionAgeMs <= C.CV_PREDICTION_MAX_MS

  ) {

    return C.SWING_LOSS_ASSIST_MULT

  }



  return context.level === 'DEGRADED'

    ? C.DEGRADED_ASSIST_MULT

    : 1

}



type SweepRecord = {

  before: BatPose

  after: BatPose

  at: number

  dt: number

  motion?: BatMotion

}



const copyPose = (p: BatPose): BatPose => ({

  position: p.position.clone(),

  rotation: p.rotation.clone(),

})



type ContactCandidate = {

  contact: NonNullable<

    ReturnType<typeof sweptContact>

  >

  a: BatPose

  b: BatPose

  dt: number

  motion?: BatMotion

  historyAge?: number

}



function plausibleContact(

  candidate: ContactCandidate,

  start: Vector3,

  end: Vector3,

) {

  const { contact, a, b } = candidate



  const rotation = a.rotation

    .clone()

    .slerp(b.rotation, contact.fraction)



  const bladePoint = contact.local

    .clone()

    .clamp(bladeMin, bladeMax)

    .applyQuaternion(rotation)

    .add(

      a.position

        .clone()

        .lerp(b.position, contact.fraction),

    )



  return (

    bladePoint.distanceTo(

      start.clone().lerp(end, contact.fraction),

    ) <= C.SWING_INTENT_MAX_DISTANCE

  )

}



export class Delivery {

  position = new Vector3(...DELIVERY.release)

  previous = this.position.clone()



  velocity = new Vector3()



  state: BallState = 'READY'

  camera: CameraState = 'BATSMAN_VIEW'



  outcome: 'HIT' | 'MISSED' | null = null



  delay = 0

  age = 0



  bounced = false

  visible = false



  beginner = true

  deliveryBeginner = true



  bowlingTime = 0

  pause = .4

  released = false



  bounceResponse = DELIVERY.bounce

  bouncePosition = new Vector3()

  bounceId = 0



  quality: HitQuality | null = null



  assistedHit = false



  match = new MatchResult()



  // ============================================================

// FIELDING BALL OWNERSHIP

// ============================================================



/*

 * When true, normal Delivery physics temporarily stops.

 *

 * This allows a fielder to physically hold the SAME cricket

 * ball instead of creating a fake second ball.

 */

fieldingHeld = false



/*

 * World-space position where the fielder is holding the ball.

 */

fieldingHoldPosition = new Vector3()



/*

 * True after a fielder has released a return throw.

 *

 * Useful later for keeper/bowler receiving logic.

 */

fieldingReturn = false
  private fieldingReturnAge=0
  private fieldingReturnDuration=0



  beginnerCorridor = false



  timing: 'EARLY' | 'GOOD' | 'LATE' = 'EARLY'



  qualityScore = 0



  contactKind:

    | 'PHYSICAL'

    | 'ASSISTED'

    | 'MISS' = 'MISS'



  plan: BowlingPlan | null = null
  bowlerType: BowlerType = 'FAST'
  tactic: Tactic | undefined
  private lastVariation?: Variation
  private variationRepeats = 0



  private contactHistory: SweepRecord[] = []



  clearContactHistory() {

    this.contactHistory = []

  }



  constructor(

    private random: () => number = Math.random,

  ) {}



  start() {

    if (this.state !== 'READY') {

      return

    }



    this.deliveryBeginner = this.beginner



    this.match = new MatchResult()




    // Reset fielding ownership for the new delivery.
    this.fieldingHeld = false
    this.fieldingReturn = false
    this.fieldingHoldPosition.set(0, 0, 0)

    this.clearContactHistory()



    this.beginnerCorridor = false

    this.timing = 'EARLY'

    this.qualityScore = 0

    this.contactKind = 'MISS'



    this.pause =

      T.pauseRange[0] +

      this.random() *

        (T.pauseRange[1] - T.pauseRange[0])



    this.bowlingTime = 0

    this.released = false

    this.quality = null

    this.assistedHit = false



    const release = bowlerPose(

      releaseTime(this.pause),

      this.pause,

    ).hand



    this.plan = generateDelivery(this.bowlerType, this.random, this.deliveryBeginner, release, this.lastVariation, this.variationRepeats, undefined, this.tactic)
    this.variationRepeats = this.plan.variation === this.lastVariation ? this.variationRepeats + 1 : 1
    this.lastVariation = this.plan.variation



    this.bounceResponse = this.plan.bounce



    this.position.copy(

      bowlerPose(0, this.pause).hand,

    )



    this.previous.copy(this.position)



    this.velocity.copy(this.plan.velocity)



    this.state = 'BOWLING'

    this.delay = 0



    this.bounced = false

    this.outcome = null

    this.visible = true

  }



  step(

    dt: number,

    before: BatPose,

    after: BatPose,

    canHit: boolean,

    motion?: BatMotion,

    context?: SwingContactContext,

    glove?: Glove,

  ) {

    const frameDt = dt



    if (context) {

      canHit =

        canHit &&

        !context.reacquiring &&

        (

          this.deliveryBeginner

            ? context.swingActive &&

              context.source !== 'HELD' &&

              (

                context.source !== 'PREDICTED' ||

                context.predictionAgeMs <=

                  C.CV_PREDICTION_MAX_MS

              )

            : context.source === 'MEASURED' ||

              context.swingActive

        )



      this.contactHistory =

        this.contactHistory.filter(

          s =>

            context.now - s.at <=

            (

              this.deliveryBeginner

                ? B.TIMING_GRACE_MS

                : C.CONTACT_HISTORY_MS

            ),

        )

    }



    const keepHistory = !!(

      context?.swingActive &&

      canHit &&

      this.deliveryBeginner

    )



    if (!keepHistory) {

      this.clearContactHistory()

    }



    if (this.state === 'READY') {

      return

    }



    this.bowlingTime += dt



    if (this.camera === 'RETURNING') {

      this.age += dt



      if (this.age >= DELIVERY.returnSeconds) {

        this.camera = 'BATSMAN_VIEW'

        this.state = 'READY'

        this.visible = false

      }



      return

    }



    if (this.camera === 'BALL_FOLLOW') {

      this.age += dt



      if (this.age > .12) {

        this.state = 'FOLLOWING'

      }



      if (

        this.age >= DELIVERY.followSeconds &&

        this.match.result && !this.fieldingReturn

      ) {

        this.camera = 'RETURNING'

        this.state = 'COMPLETE'

        this.age = 0

        return

      }

    }



    // ============================================================
    // FIELDER CURRENTLY OWNS THE BALL
    // ============================================================
    if(this.fieldingReturn) {
      this.previous.copy(this.position)
      const step=Math.min(dt,this.fieldingReturnDuration-this.fieldingReturnAge)
      this.position.addScaledVector(this.velocity,step)
      this.position.y-=.5*DELIVERY.gravity*step*step
      this.velocity.y-=DELIVERY.gravity*step
      this.fieldingReturnAge+=step
      if(this.fieldingReturnAge>=this.fieldingReturnDuration) this.finishFieldReturn(this.position)
      return
    }
    if (this.fieldingHeld) {
      this.previous.copy(this.position)
      this.position.copy(this.fieldingHoldPosition)
      this.velocity.set(0, 0, 0)

      return
    }

    if (this.match.stopped) {

      if (this.match.held && glove) {

        this.position.copy(glove.position)

      }



      this.velocity.set(0, 0, 0)

      return

    }



    if (!this.released) {

      const release = releaseTime(this.pause)



      this.position.copy(

        bowlerPose(

          Math.min(this.bowlingTime, release),

          this.pause,

        ).hand,

      )



      this.previous.copy(this.position)



      if (this.bowlingTime < release) {

        return

      }



      this.released = true



      // Start at exact animated hand pose.

      dt = Math.min(

        dt,

        this.bowlingTime - release,

      )



      if (dt <= 0) {

        return

      }

    }



    this.previous.copy(this.position)



    // Subdivide translation and rotation.

    const steps = Math.max(

      1,

      Math.ceil(dt / (1 / 240)),

      Math.ceil(

        before.rotation.angleTo(after.rotation) /

          .04,

      ),

    )



    const h = dt / steps



    const pose = (t: number): BatPose => ({

      position: before.position

        .clone()

        .lerp(after.position, t),



      rotation: before.rotation

        .clone()

        .slerp(after.rotation, t),

    })



    for (let i = 0; i < steps; i++) {

      const start = this.position.clone()
      const gravity = !this.outcome && !this.bounced && this.plan ? this.plan.flightGravity : DELIVERY.gravity
      if (!this.outcome && !this.bounced && this.plan) {
        this.position.x -= .5 * this.plan.swingAcceleration * h * h
        this.velocity.x += this.plan.swingAcceleration * h
      }



      this.position.addScaledVector(

        this.velocity,

        h,

      )



      this.position.y -=

        .5 * gravity * h * h



      this.velocity.y -= gravity * h



      const floor =

        T.groundY + DELIVERY.radius



      if (

        this.match.hit &&

        this.position.y <= floor

      ) {

        this.match.recordFirstBounce(this.position)
        this.match.groundAfterHit = true



        this.position.y = floor



        if (

          this.velocity.y <

          -M.BOUNCE_MIN_SPEED

        ) {

          this.velocity.y =

            -this.velocity.y * M.SHOT_BOUNCE



          this.bouncePosition.copy(

            this.position,

          )



          this.bounceId++

        } else {

          this.velocity.y = 0

        }



        const speed = Math.hypot(

          this.velocity.x,

          this.velocity.z,

        )



        const factor =

          speed > 0

            ? Math.max(

                0,

                speed -

                  M.GROUND_DECELERATION * h,

              ) / speed

            : 0



        this.velocity.x *= factor

        this.velocity.z *= factor

      } else if (

        !this.bounced &&

        this.position.y <= floor

      ) {

        this.position.y = floor



        this.velocity.y =

          Math.abs(this.velocity.y) *

          this.bounceResponse



        this.bounced = true
        if (!this.outcome && this.plan) {
          this.velocity.x += this.plan.spinImpulse
          this.velocity.z += this.plan.forwardImpulse
        }



        this.bouncePosition.copy(

          this.position,

        )



        this.bounceId++



        if (!this.outcome) {

          this.state = 'AFTER_BOUNCE'

        }

      } else if (

        this.bounced &&

        this.position.y < floor

      ) {

        this.position.y = floor

        this.velocity.y = 0



        this.velocity.x *= Math.exp(-h)

        this.velocity.z *= Math.exp(-h)

      }



      const beginnerPhone =

        this.deliveryBeginner && !!context



      const contactRegion =

        inBattingZone(this.position) &&

        this.position.z >= B.CONTACT_MIN_Z &&

        this.position.z <= B.CONTACT_MAX_Z



      if (!this.outcome && beginnerPhone) {

        this.beginnerCorridor =

          contactRegion &&

          !!sweptContact(

            this.position,

            this.position,

            after,

            after,

            false,

            false,

            1,

            true,

          )



        this.timing =

          this.position.z > B.CONTACT_MAX_Z

            ? 'LATE'

            : this.beginnerCorridor

              ? 'GOOD'

              : this.position.z <

                  after.position.z

                ? 'EARLY'

                : 'LATE'

      }



      if (

        canHit &&

        !this.outcome &&

        (

          !context ||

          inBattingZone(start) ||

          inBattingZone(this.position)

        )

      ) {

        const a = pose(i / steps)

        const b = pose((i + 1) / steps)



        const orientation = Math.abs(

          new Vector3(0, 0, 1)

            .applyQuaternion(b.rotation)

            .dot(

              this.velocity

                .clone()

                .normalize(),

            ),

        )



        if (

          beginnerPhone &&

          (

            !contactRegion ||

            this.velocity.z <= 0 ||

            orientation <

              B.MIN_FACE_SUITABILITY

          )

        ) {

          this.match.update(

            start,

            this.position,

            this.velocity,

            h,

            glove,

          )



          if (

            this.match.result === 'BOWLED'

          ) {

            this.finish('MISSED')

          }



          if (

            this.position.z >

            DELIVERY.missPlane

          ) {

            this.finish('MISSED')

          }



          if (this.match.stopped) {

            break

          }



          continue

        }



        const swingSpeed = motion

          ? motion.handleVelocity.length() +

            motion.angularVelocity.length() *

              .65

          : a.position.distanceTo(

                b.position,

              ) /

                h +

            a.rotation.angleTo(b.rotation) *

              .65 /

              h



        let assisted = false



        const forgiving =

          this.deliveryBeginner &&

          (!context || context.swingActive)



        const multiplier =

          contactAssistMultiplier(context)



        let contact = sweptContact(

          start,

          this.position,

          a,

          b,

          forgiving,

        )



        let candidate: ContactCandidate | null =

          contact

            ? {

                contact,

                a,

                b,

                dt: h,

                motion,

              }

            : null



        const intent = context

          ? context.swingActive

          : swingSpeed >=

            T.minimumAssistSpeed



        if (

          !candidate &&

          forgiving &&

          intent &&

          this.position.z <

            DELIVERY.missPlane &&

          this.velocity.z > 0

        ) {

          contact = beginnerPhone

            ? sweptContact(

                start,

                this.position,

                a,

                b,

                false,

                false,

                1,

                true,

              )

            : sweptContact(

                start,

                this.position,

                a,

                b,

                true,

                true,

                multiplier,

              )



          if (contact) {

            const near = {

              contact,

              a,

              b,

              dt: h,

              motion,

            }



            if (

              beginnerPhone ||

              plausibleContact(

                near,

                start,

                this.position,

              )

            ) {

              candidate = near

            }

          }



          // Recent real/predicted swings only.

          if (!candidate && keepHistory) {

            history:

            for (

              const sweep of [

                ...this.contactHistory,

              ].reverse()

            ) {

              const count = Math.max(

                1,

                Math.ceil(

                  sweep.before.rotation.angleTo(

                    sweep.after.rotation,

                  ) /

                    C.CONTACT_HISTORY_ANGLE_STEP,

                ),

              )



              for (

                let j = 0;

                j < count;

                j++

              ) {

                const oldPose = (

                  t: number,

                ) => ({

                  position:

                    sweep.before.position

                      .clone()

                      .lerp(

                        sweep.after.position,

                        t,

                      ),



                  rotation:

                    sweep.before.rotation

                      .clone()

                      .slerp(

                        sweep.after.rotation,

                        t,

                      ),

                })



                const oldA = oldPose(

                  j / count,

                )



                const oldB = oldPose(

                  (j + 1) / count,

                )



                const oldOrientation =

                  Math.abs(

                    new Vector3(0, 0, 1)

                      .applyQuaternion(

                        oldB.rotation,

                      )

                      .dot(

                        this.velocity

                          .clone()

                          .normalize(),

                      ),

                  )



                if (

                  beginnerPhone &&

                  oldOrientation <

                    B.MIN_FACE_SUITABILITY

                ) {

                  continue

                }



                const hit =

                  beginnerPhone

                    ? sweptContact(

                        start,

                        this.position,

                        oldA,

                        oldB,

                        false,

                        false,

                        1,

                        true,

                      )

                    : sweptContact(

                        start,

                        this.position,

                        oldA,

                        oldB,

                        true,

                        true,

                        multiplier,

                      )



                if (hit) {

                  const recent = {

                    contact: hit,

                    a: oldA,

                    b: oldB,

                    dt:

                      sweep.dt / count,

                    motion:

                      sweep.motion,

                    historyAge:

                      context!.now -

                      sweep.at,

                  }



                  if (

                    beginnerPhone ||

                    plausibleContact(

                      recent,

                      start,

                      this.position,

                    )

                  ) {

                    candidate = recent

                    break history

                  }

                }

              }

            }

          }



          assisted = !!candidate

        }



        if (candidate) {

          const {

            contact,

            a: contactA,

            b: contactB,

            motion: contactMotion,

          } = candidate



          const rotation =

            contactA.rotation

              .clone()

              .slerp(

                contactB.rotation,

                contact.fraction,

              )



          this.assistedHit =

            assisted ||

            (

              forgiving &&

              !sweptContact(

                start,

                this.position,

                a,

                b,

                false,

              )

            )



          if (

            beginnerPhone &&

            this.assistedHit

          ) {

            contact.normal.set(0, 0, 1)

          }



          const faceContact =

            Math.abs(contact.normal.z)



          const normal =

            contact.normal.applyQuaternion(

              rotation,

            )



          const point =

            contact.local

              .clone()

              .clamp(

                bladeMin,

                bladeMax,

              )



          const batVelocity =

            contactMotion

              ? pointVelocity(

                  contactMotion.handleVelocity,

                  contactMotion.angularVelocity,

                  point

                    .clone()

                    .applyQuaternion(rotation),

                )

              : point

                  .clone()

                  .applyQuaternion(

                    contactB.rotation,

                  )

                  .add(contactB.position)

                  .sub(

                    point

                      .clone()

                      .applyQuaternion(

                        contactA.rotation,

                      )

                      .add(

                        contactA.position,

                      ),

                  )

                  .divideScalar(

                    candidate.dt,

                  )



          const relative =

            this.velocity

              .clone()

              .sub(batVelocity)



          this.quality = hitQuality(

            contact.local,

            batVelocity.length(),

            assisted,

            faceContact,

          )



          if (

            beginnerPhone &&

            context

          ) {

            const suitability =

              Math.abs(

                new Vector3(0, 0, 1)

                  .applyQuaternion(rotation)

                  .dot(

                    this.velocity

                      .clone()

                      .normalize(),

                  ),

              )



            const result =

              beginnerQuality(

                contact.local,

                batVelocity.length(),

                suitability,

                candidate.historyAge ?? 0,

                context,

              )



            this.quality =

              result.quality



            this.qualityScore =

              result.score



            this.beginnerCorridor =

              true



            this.timing = 'GOOD'

          }



          this.contactKind =

            this.assistedHit

              ? 'ASSISTED'

              : 'PHYSICAL'



          if (

            relative.dot(normal) > 0

          ) {

            normal.negate()

          }



          // Used only for Beginner power-floor calculation.

          const fullResponse =

            relative

              .clone()

              .addScaledVector(

                normal,

                -(1 +

                  T.restitution.SWEET) *

                  relative.dot(normal),

              )

              .add(batVelocity)

              .addScaledVector(

                batVelocity,

                T.swingTransfer.SWEET,

              )

              .length()



          // --------------------------------------------------

          // BASE PHYSICAL COLLISION RESPONSE

          // --------------------------------------------------



          relative.addScaledVector(

            normal,

            -(1 +

              T.restitution[

                this.quality

              ]) *

              relative.dot(normal),

          )



          const physicalVelocity =

            relative

              .clone()

              .add(batVelocity)

              .addScaledVector(

                batVelocity,

                T.swingTransfer[

                  this.quality

                ],

              )



          // --------------------------------------------------

          // CLEAN-SHOT DIRECTION ASSIST

          //

          // SWEET/GOOD contacts should primarily follow the

          // player's actual swing direction.

          //

          // This prevents tiny contact-normal inaccuracies from

          // sending an otherwise clean shot behind the batsman.

          //

          // EDGE remains primarily physical and can genuinely

          // travel behind toward the wicketkeeper.

          // --------------------------------------------------



          if (

            (

              this.quality === 'SWEET' ||

              this.quality === 'GOOD'

            ) &&

            batVelocity.lengthSq() >

              0.01

          ) {

            const speed =

              physicalVelocity.length()



            const physicalDirection =

              physicalVelocity

                .clone()

                .normalize()



            // Use handle translation to determine LEFT/RIGHT intent.

// Contact-point velocity still supplies vertical/forward character,

// but its rotational X component must not force clean shots left.

const handleDirection =

  contactMotion?.handleVelocity.clone() ??

  new Vector3()



const contactDirection =

  batVelocity.clone()



let intendedDirection = contactDirection.clone()



if (handleDirection.lengthSq() > 0.01) {

  // X is taken primarily from actual hand movement.

  intendedDirection.x =

    handleDirection.x * 1.35 +

    contactDirection.x * 0.15



  // Keep vertical shot character from the complete bat motion.

  intendedDirection.y =

    contactDirection.y



  // A clean cricket shot must travel away from the batsman.

  // In this scene the bowler/field is negative Z.

  intendedDirection.z =

    -Math.max(

      0.35,

      Math.abs(contactDirection.z),

    )

} else {

  // No reliable translational direction:

  // use bat movement but force clean contact forward.

  intendedDirection.z =

    -Math.max(

      0.35,

      Math.abs(intendedDirection.z),

    )

}



intendedDirection.normalize()



const swingAuthority =

  this.quality === 'SWEET'

    ? 0.88

    : 0.78



const shotDirection =

  physicalDirection

    .multiplyScalar(1 - swingAuthority)

    .addScaledVector(

      intendedDirection,

      swingAuthority,

    )

    .normalize()



            this.velocity

              .copy(shotDirection)

              .multiplyScalar(speed)

          } else {

            this.velocity.copy(

              physicalVelocity,

            )

          }



          // Genuine edge deviation.

          if (

            this.quality === 'EDGE'

          ) {

            this.velocity.add(

              new Vector3(

                point.x * 7,

                .15,

                0,

              ).applyQuaternion(

                rotation,

              ),

            )

          }



          const activePower =

            context?.swingActive

              ? swingPower(

                  contactMotion

                    ?.angularVelocity

                    .length() ?? 0,

                )

              : 0



          if (

            beginnerPhone &&

            activePower > 0 &&

            this.quality !== 'SWEET'

          ) {

            const minimum =

              fullResponse *

              activePower *

              (

                this.quality ===

                'GOOD'

                  ? B.GOOD_POWER_FLOOR

                  : B.EDGE_POWER_FLOOR

              )



            if (

              this.velocity.lengthSq() >

                1e-8 &&

              this.velocity.length() <

                minimum

            ) {

              this.velocity.setLength(

                minimum,

              )

            }

          }



          this.velocity.clampLength(

            0,

            T.maxShotSpeed,

          )



          this.match.omega =

            contactMotion

              ?.angularVelocity

              .length() ?? 0



          this.match.power =

            poweredExit(

              this.velocity,

              this.match.omega,

              this.quality,

              this.deliveryBeginner,

              context?.swingActive ===

                true,

            )



          this.match.contactSpeed = batVelocity.length()
          this.match.launchY = this.velocity.y
          this.match.launchAngle = Math.atan2(this.velocity.y, Math.hypot(this.velocity.x, this.velocity.z)) * 180 / Math.PI
          this.match.exitSpeed =

            this.velocity.length()



          if (!this.assistedHit) {

            const impact =

              start

                .clone()

                .lerp(

                  this.position,

                  contact.fraction,

                )



            this.position

              .copy(impact)

              .addScaledVector(

                normal,

                .01,

              )

          }



          this.finish('HIT')



          this.match.registerHit(

            this.position,

          )

        }

      }



      this.match.update(

        start,

        this.position,

        this.velocity,

        h,

        glove,

      )



      if (

        this.match.result ===

          'BOWLED' &&

        !this.outcome

      ) {

        this.finish('MISSED')

      }



      if (

        !this.outcome &&

        this.position.z >

          DELIVERY.missPlane

      ) {

        this.finish('MISSED')

      }



      if (this.match.stopped) {

        break

      }

    }



    if (

      keepHistory &&

      context &&

      !this.outcome

    ) {

      this.contactHistory.push({

        before: copyPose(before),

        after: copyPose(after),

        at: context.now,

        dt: frameDt,



        motion: motion

          ? {

              handleVelocity:

                motion.handleVelocity.clone(),



              angularVelocity:

                motion.angularVelocity.clone(),

            }

          : undefined,

      })



      if (

        this.contactHistory.length >

        (

          this.deliveryBeginner

            ? B.HISTORY_COUNT

            : C.CONTACT_HISTORY_COUNT

        )

      ) {

        this.contactHistory.shift()

      }

    }

  }



  // ============================================================
  // FIELDING CONTROL
  // ============================================================

  holdBallForFielder(worldPosition: Vector3) {
    this.fieldingHeld = true
    this.fieldingReturn = false
    this.fieldingHoldPosition.copy(worldPosition)
    this.position.copy(worldPosition)
    this.previous.copy(worldPosition)
    this.velocity.set(0, 0, 0)
  }

  moveHeldBall(worldPosition: Vector3) {
    if (!this.fieldingHeld) return
    this.fieldingHoldPosition.copy(worldPosition)
    this.position.copy(worldPosition)
    this.previous.copy(worldPosition)
    this.velocity.set(0, 0, 0)
  }

  releaseFieldThrow(worldPosition: Vector3, throwVelocity: Vector3, seconds=1) {
    this.fieldingHeld = false
    this.fieldingReturn = true
    this.fieldingReturnAge=0;this.fieldingReturnDuration=seconds
    this.position.copy(worldPosition)
    this.previous.copy(worldPosition)
    this.velocity.copy(throwVelocity)
  }

  finishFieldReturn(worldPosition: Vector3) {
    this.fieldingHeld = false
    this.fieldingReturn = false
    this.position.copy(worldPosition)
    this.previous.copy(worldPosition)
    this.velocity.set(0, 0, 0)
    this.match.stopped = true
  }

  private finish(

    outcome: 'HIT' | 'MISSED',

  ) {

    this.outcome = outcome

    this.state = outcome

    this.camera = 'BALL_FOLLOW'

    this.age = 0

  }

}
