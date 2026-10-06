import { useEffect, useMemo, useRef, useState } from 'react'
import useAutoHideCursor from './useAutoHideCursor'

import { Canvas, useFrame, useThree } from '@react-three/fiber'

import {
  Group,
  Mesh,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three'

import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import CricketBat from './components/CricketBat'

import {
  BASE_RIGHT_HAND_POSITION,
  STALE_MS,
  toPlayerPosition,
  toPlayerVelocity,
  cvPositionStatus,
  useController,
} from './controller'

import { Delivery, DELIVERY } from './delivery'

import { phoneStatus } from './phone'

import {
  GAMEPLAY as T,
  constrainBatToGround,
} from './gameplayTuning'

import { bowlerPose } from './bowling'

import Bowler from './Bowler'

import Stadium from './Stadium'
import Wicket from './Wicket'

import GroundEffects from './GroundEffects'

import WicketKeeper from './WicketKeeper'

import MatchEffects from './MatchEffects'

import {
  KeeperPresentation,
  type KeeperState,
} from './keeperPresentation'

import {
  PostShotCamera,
  type PostCameraMode,
} from './postShotCamera'

import {
  PhoneSwing,
  HandleContinuity,
  assistLevel,
  type HandleSource,
  type AssistLevel,
} from './swingContinuity'

import Fielders from './Fielders'
import FieldingDebug from './FieldingDebug'
import FieldMap from './FieldMap'
import { OverTactics } from './overTactics'

import { FieldingController } from './fielding'
import { FIELDING } from './fielding'
import BallTrail from './BallTrail'
import { SessionScore } from './sessionScore'
import { BowlGesture } from './bowlGesture'
import { requestBowl } from './requestBowl'
import { GameModes, type GameMode } from './gameMode'
import ModeOverlay from './ModeOverlay'
import MainMenu from './MainMenu'
import GameMenu from './GameMenu'
import BowlingLab from './BowlingLab'
import BattingHud from './BattingHud'
import { HELP_KEYS, hasSeen, battingFeedback } from './battingHelp'
import { WicketPresentationHold } from './wicketLifecycle'
import type { MenuPage } from './menuNavigation'
import { VisualBatPosition } from './visualBatPosition'
import { ReplaySession } from './replayPlayback'
import ReplayDirector from './ReplayDirector'
import ReplayOverlay from './ReplayOverlay'


const EYES = new Vector3(
  0,
  1.68,
  .35,
)

const LOOK = new Vector3(
  0,
  1.35,
  -12,
)

const Z_AXIS = new Vector3(
  0,
  0,
  1,
)

// ============================================================
// PHONE LIFT, HOLD, RETURN GESTURE
// ============================================================

// Phone-only lift, hold and return gesture.

function Play({
  feed,
  game,
  orbit,
  source,
  axes,
  debug,
  session,
  modes,
  onScore,
  suspended,
  replay,
}: {
  replay: ReplaySession
  suspended: boolean
  session: SessionScore
  modes: GameModes
  onScore: () => void
  feed: ReturnType<typeof useController>
  game: Delivery
  orbit: boolean
  source: 'PHONE' | 'MARKER'

  axes: boolean

  debug: {
    displayed: Vector3
    target: Vector3
    bladeDelta: Vector3
    toe: Vector3
    toeHeight: number

    swing: boolean
    handle: HandleSource
    predictionMs: number
    renderFps: number
    handMode: string
    assist: AssistLevel
    reacquiring: boolean

    keeper: KeeperState
    postCamera: PostCameraMode
  }
}) {
  const suspendRef=useRef(suspended)
  suspendRef.current=suspended
  const bat =
    useRef<Group>(null)

  const ball =
    useRef<Mesh>(null)
  const replayBowler=useRef<Group>(null),replayKeeper=useRef<Group>(null),replayFielders=useRef<Group>(null),replayWicket=useRef<Group>(null)
  const replayEffects=useRef<Group>(null),replayTrail=useRef<Group>(null),replayGround=useRef<Group>(null)

  const {
    camera,
    gl,
  } = useThree()


  const target = useMemo(
    () =>
      new Vector3(
        ...BASE_RIGHT_HAND_POSITION,
      ),
    [],
  )


  const rotation = useMemo(
    () =>
      new Quaternion(),
    [],
  )


  const look = useMemo(
    () =>
      LOOK.clone(),
    [],
  )


  const keeper = useMemo(
    () =>
      new KeeperPresentation(),
    [game],
  )


  const postCamera = useMemo(
    () =>
      new PostShotCamera(),
    [],
  )


  const following =
    useRef(false)


  const lastSequence =
    useRef(-1)


  const authority =
    useRef('')


  const swing = useMemo(
    () =>
      new PhoneSwing(),
    [],
  )

  const bowlGesture = useMemo(
  () =>
    new BowlGesture(),
  [],
)


  const handle = useMemo(
    () =>
      new HandleContinuity(),
    [],
  )


  // ============================================================
  // FIELDING
  // ============================================================

  const fielding = useMemo(
    () =>
      new FieldingController(),
    [],
  )

  const fieldingStarted =
    useRef(false)
  const tactics = useMemo(()=>new OverTactics(),[game])

  useEffect(()=>{
    fielding.reset();fieldingStarted.current=false;postCamera.reset()
    keeper.position.set(0,0,3.4);keeper.reach.set(0,.56,2.92)
    camera.position.copy(EYES);look.copy(LOOK);camera.lookAt(LOOK)
  },[game,fielding,postCamera,keeper,camera,look])


  const neutralRotation = useMemo(
    () =>
      new Quaternion(),
    [],
  )


  const unconstrainedPosition =
    useMemo(
      () =>
        new Vector3(
          ...BASE_RIGHT_HAND_POSITION,
        ),
      [],
    )

  const visualBat = useRef<Group>(null)
  const visualPosition = useMemo(() => new VisualBatPosition(), [game])
  const visualInverseRotation = useMemo(() => new Quaternion(), [])


  // ============================================================
  // DEBUG ORBIT CAMERA
  // ============================================================

  useEffect(() => {
    if (!orbit) return

    camera.position.set(
      3,
      3,
      5,
    )

    const control =
      new OrbitControls(
        camera,
        gl.domElement,
      )

    control.target.set(
      0,
      1,
      -3,
    )

    control.update()

    return () =>
      control.dispose()

  }, [
    orbit,
    camera,
    gl,
  ])


  // ============================================================
  // SPACE = NEXT DELIVERY
  // ============================================================

  useEffect(() => {
    const key = (
      event: KeyboardEvent,
    ) => {
      if (
        !suspendRef.current &&
        !replay.inputBlocked &&
        event.code === 'Space' &&
        !event.repeat
      ) {
        event.preventDefault()

        requestBowl(game, session, true, modes.status)
      }
    }

    window.addEventListener(
      'keydown',
      key,
    )

    return () =>
      window.removeEventListener(
        'keydown',
        key,
      )

  }, [game,session,replay])


  // ============================================================
  // MAIN GAME LOOP
  // ============================================================

  useFrame((_, elapsed) => {
    if(suspendRef.current)return
    if(replay.blocked){
      feed.bowlRequests.current=0;feed.publishBowlReady(false,performance.now());bowlGesture.pause();return
    }
    if(elapsed>0) debug.renderFps += .05*(1/elapsed-debug.renderFps)
    if (
      !bat.current ||
      !ball.current
    ) {
      return
    }


    const dt =
      Math.min(
        elapsed,
        .05,
      )

    const now =
      performance.now()


    // ==========================================================
    // LEGACY MARKER TRACKING
    // ==========================================================

    const snapshot =
      feed.bat.current

    const m =
      snapshot?.message


    const markerTracked =
      !!(
        feed.connected.current &&
        snapshot &&
        performance.now() -
          snapshot.received <
          STALE_MS &&
        m?.state ===
          'TRACKED' &&
        m.handlePosition &&
        m.axis &&
        Math.hypot(
          m.axis.x,
          m.axis.y,
        ) > .001
      )


    const previous = {
      position:
        bat.current.position.clone(),

      rotation:
        bat.current.quaternion.clone(),
    }


    bat.current.position.copy(
      unconstrainedPosition,
    )


    // ==========================================================
    // PHONE TRACKING
    // ==========================================================

    const phone =
      feed.phone.current


    const phoneTracked =
      phoneStatus(
        feed.phoneConnected.current,
        phone?.received ?? null,
        performance.now(),
      ) === 'CONNECTED' &&
      !!phone?.message.calibrated


    const tracked =
      source === 'PHONE'
        ? phoneTracked
        : markerTracked


    const authorityKey =
      `${source}:${
        source === 'PHONE'
          ? phone?.message
              .calibrationId ?? 0
          : 0
      }`


    // ==========================================================
    // AUTHORITY / CALIBRATION CHANGE
    // ==========================================================

    if (
      authority.current !==
      authorityKey
    ) {
      following.current =
        false

      authority.current =
        authorityKey

      lastSequence.current =
        -1

      swing.reset()
      bowlGesture.reset()

      handle.reset(
        unconstrainedPosition,
      )

      game.clearContactHistory()


      if (
        phone?.message.calibrated
      ) {
        const q =
          phone.message.orientation

        neutralRotation
          .set(
            q.x,
            q.y,
            q.z,
            q.w,
          )
          .normalize()
      }
    }


    // ==========================================================
    // PHONE SWING STATE
    // ==========================================================

    const angular =
      phone?.message
        .angularVelocity


    const activeSwing =
      swing.update(
        now,

        phone?.received ??
          -Infinity,

        source === 'PHONE' &&
          phoneTracked,

        angular
          ? Math.hypot(
              angular.x,
              angular.y,
              angular.z,
            )
          : 0,

        phone?.message
          .swingSpeed ?? 0,
      )


    // ==========================================================
    // WEBCAM RIGHT-HAND POSITION
    // ==========================================================

    const cv =
      feed.latest.current

    const hand =
      cv?.message


    const cvStatus =
      cvPositionStatus(
        feed.connected.current,
        cv,
        performance.now(),
      )


    const positionActive =
      cvStatus === 'ACTIVE' ||
      cvStatus === 'DEGRADED'


    const handleVelocity =
      positionActive &&
      hand?.velocity &&
      hand.position

        ? toPlayerVelocity(
            hand.velocity,
            hand.position,
          )

        : new Vector3()


    // ==========================================================
    // PHONE CONTROLLER
    //
    // Webcam = handle XYZ
    // Phone = bat rotation
    // ==========================================================

    if (
      source === 'PHONE'
    ) {
      if (
        cvStatus ===
        'NOT_CALIBRATED'
      ) {
        handle.reset(
          unconstrainedPosition,
        )
      }


      handle.update(
        now,
        dt,

        positionActive &&
        hand?.position &&
        cv

          ? {
              received:
                cv.received,
              sampleId: hand.timestamp,
              sampleTime: hand.timestamp*1000,
              estimated: !hand.sampleAccepted,
              measurementAgeMs: hand.lastReliableTimestamp==null?Infinity:(hand.timestamp-hand.lastReliableTimestamp)*1000,

              position:
                toPlayerPosition(
                  hand.position,
                ),

              velocity:
                hand.velocity
                  ? handleVelocity
                  : null,
            }

          : null,

        activeSwing,
      )


      bat.current.position.copy(
        handle.position,
      )

      target.copy(
        handle.target,
      )

      handleVelocity.copy(
        handle.velocity,
      )


      // --------------------------------------------------------
      // PHONE ROTATION
      // --------------------------------------------------------

      if (
        phoneTracked &&
        phone
      ) {
        const q =
          phone.message
            .orientation

        rotation
          .set(
            q.x,
            q.y,
            q.z,
            q.w,
          )
          .normalize()


        bat.current.quaternion
          .slerp(
            rotation,

            1 -
              Math.exp(
                -dt / .02,
              ),
          )
      }

// --------------------------------------------------------
// PHONE LIFT, HOLD, RETURN -> START BOWLER
// --------------------------------------------------------

const phoneBowlAllowed = !!(phoneTracked && phone?.message.calibrated)
    if(modes.status==='PLAYING') tactics.update(game,session,fielding)
const bowlReady = !replay.inputBlocked && phoneBowlAllowed && game.state === 'READY' && !session.complete && modes.status === 'PLAYING'
feed.publishBowlReady(bowlReady, now)
if (feed.bowlRequests.current) {
  feed.bowlRequests.current = 0
  if(!replay.inputBlocked)requestBowl(game, session, phoneBowlAllowed, modes.status)
}
if (phoneTracked && phone) {
  const q=phone.message.orientation
  if(bowlGesture.update(now,new Quaternion(q.x,q.y,q.z,q.w).normalize(),neutralRotation,phone.received,
    !replay.inputBlocked && phoneBowlAllowed && game.state === 'READY' && !session.complete && modes.status === 'PLAYING')) requestBowl(game, session, phoneBowlAllowed, modes.status)
} else {
  bowlGesture.pause()
}

    // ==========================================================
    // LEGACY MARKER CONTROLLER
    // ==========================================================

    } else if (
      tracked &&
      m?.handlePosition &&
      m.axis
    ) {
      if (
        snapshot!.sequence !==
        lastSequence.current
      ) {
        target.set(
          m.handlePosition.x,
          m.handlePosition.y,
          m.handlePosition.z,
        )


        // Blade extends along local -Y.
        // Use only measured image-plane angle.

        rotation.setFromAxisAngle(
          Z_AXIS,

          Math.atan2(
            m.axis.x,
            -m.axis.y,
          ),
        )


        lastSequence.current =
          snapshot!.sequence
      }


      const alpha =
        1 -
        Math.exp(
          -dt / .035,
        )


      bat.current.position
        .lerp(
          target,
          alpha,
        )


      bat.current.quaternion
        .slerp(
          rotation,
          alpha,
        )
    }


    // ==========================================================
    // BAT GROUND CONSTRAINT
    // ==========================================================

    unconstrainedPosition.copy(
      bat.current.position,
    )


    const ground =
      constrainBatToGround(
        bat.current.position,
        bat.current.quaternion,
      )


    debug.toe.copy(
      ground.toe,
    )

    debug.toeHeight =
      ground.height


    const current = {
      position:
        bat.current.position.clone(),

      rotation:
        bat.current.quaternion.clone(),
    }

    // Offset only the single visible mesh; the parent remains authoritative.
    if (visualBat.current) {
      visualInverseRotation.copy(current.rotation).invert()
      visualBat.current.position.copy(visualPosition.update(current.position, dt))
        .sub(current.position).applyQuaternion(visualInverseRotation)
    }


    debug.displayed.copy(
      current.position,
    )

    debug.target.copy(
      target,
    )


    debug.bladeDelta
      .set(
        0,
        -1,
        0,
      )
      .applyQuaternion(
        current.rotation,
      )
      .sub(
        new Vector3(
          0,
          -1,
          0,
        ).applyQuaternion(
          neutralRotation,
        ),
      )


    const settled =
      unconstrainedPosition
        .distanceTo(
          target,
        ) < .12 &&

      bat.current.quaternion
        .angleTo(
          rotation,
        ) < .3


    // ==========================================================
    // CONTACT / ASSIST
    // ==========================================================

    const omega =
      phone?.message
        .angularVelocity


    const level =
      assistLevel(
        cvStatus,
        handle,
        activeSwing,
      )


    debug.swing =
      activeSwing

    debug.handle =
      handle.source

    debug.predictionMs =
      handle.predictionAgeMs
    debug.handMode=handle.mode

    debug.assist =
      level

    debug.reacquiring =
      handle.reacquiring ||
      handle.correctingThisFrame


    // ==========================================================
    // WICKET KEEPER
    // ==========================================================

    if (
      !game.fieldingHeld ||
      game.state === 'READY'
    ) {
      keeper.update(
        game,
        dt,
      )
      if(game.match.held && !game.fieldingHeld && !game.fieldingReturn)
        game.position.copy(keeper.reach)
    }


    // ==========================================================
    // DELIVERY PHYSICS
    //
    // IMPORTANT:
    // This is the original working bat/controller path.
    // Fielding is handled AFTER this.
    // ==========================================================

    fielding.debugEnabled = axes
    const ballBeforePhysics = axes ? game.position.clone() : null
game.step(
      dt,

      previous,

      current,

      tracked &&
        following.current &&
        elapsed < .1,

      source === 'PHONE' &&
      omega

        ? {
            handleVelocity:
              ground.lift > 0

                ? handleVelocity
                    .clone()
                    .setY(
                      Math.max(
                        0,
                        handleVelocity.y,
                      ),
                    )

                : handleVelocity,

            angularVelocity:
              new Vector3(
                omega.x,
                omega.y,
                omega.z,
              ),
          }

        : undefined,

      source === 'PHONE'

        ? {
            now,

            swingActive:
              activeSwing,

            source:
              handle.source,

            level,

            predictionAgeMs:
              handle
                .predictionAgeMs,

            reacquiring:
              handle.reacquiring ||
              handle
                .correctingThisFrame,
          }

        : undefined,

      {
        position:
          keeper.reach,
        keeperInterception: true,
        diving: keeper.state==='DIVE_LEFT'||keeper.state==='DIVE_RIGHT',

        active:
          !game.fieldingHeld && !game.fieldingReturn &&
          keeper.catchActive,
      },
    )


    // ==========================================================
    // FIELDING
    // ==========================================================
    //
    if (ballBeforePhysics) fielding.recordPhysicsStep(ballBeforePhysics, game.position)
    // Fielding begins only after Delivery has registered a hit.
    //
    // This code DOES NOT touch:
    //   - webcam tracking
    //   - phone orientation
    //   - HandleContinuity
    //   - bat position
    //   - bat quaternion
    //
    // It only observes/controls the cricket ball after contact.
    // ==========================================================

    if (
      game.match.hit &&
      !fieldingStarted.current
    ) {
      fieldingStarted.current =
        true


      fielding.startFielding(
        game.position,
        game.velocity,
        game.match.shotOrigin,
      )
    }


    // ----------------------------------------------------------
    // Reset fielders when a new delivery is ready.
    // ----------------------------------------------------------

    if (
      game.state === 'READY'
    ) {
      if (
        fieldingStarted.current
      ) {
        fielding.reset()

        fieldingStarted.current =
          false
      }

    } else {
      // --------------------------------------------------------
      // Update fielding controller.
      // --------------------------------------------------------

      const fieldingUpdate =
        fielding.update(
          dt,

          game.position,

          game.velocity,

          game.match.hit &&
            !game.match.result && !game.match.held,
        )


      // --------------------------------------------------------
      // The selected fielder reached the REAL Delivery ball.
      //
      // We do NOT create a fake ball.
      // --------------------------------------------------------

        if (
    fieldingUpdate
      .captureBall &&

    fieldingUpdate
      .holdPosition &&

    !game.fieldingHeld && !game.match.held
  ) {
    // ========================================================
    // AIRBORNE FIELDER CATCH
    // ========================================================

    if (
      fieldingUpdate.caught &&
      !game.match.groundAfterHit
    ) {
      const registered =
        game.match.registerFielderCatch()

      if (registered) {
        game.holdBallForFielder(
          fieldingUpdate
            .holdPosition,
        )
      }
  } else {
    // ======================================================
    // NORMAL GROUND-BALL COLLECTION
    // ======================================================

    game.holdBallForFielder(
      fieldingUpdate
        .holdPosition,
    )
  }
}


      // --------------------------------------------------------
      // Keep the SAME cricket ball attached to the fielder
      // during pickup / throwing preparation.
      // --------------------------------------------------------

      if (
        game.fieldingHeld &&
        fieldingUpdate
          .holdPosition
      ) {
        game.moveHeldBall(
          fieldingUpdate
            .holdPosition,
        )
      }
      if(game.fieldingHeld && fieldingUpdate.collected && !game.match.result) {
        game.match.finalizeDistance()
        const destination=new Vector3(0,1,.87)
        const seconds=Math.max(.25,game.position.distanceTo(destination)/FIELDING.THROW_SPEED)
        const velocity=destination.clone().sub(game.position).divideScalar(seconds)
        velocity.y+=.5*DELIVERY.gravity*seconds
        game.releaseFieldThrow(game.position.clone(),velocity,seconds)
      }
    }
if (modes.consume(game.match, game.state === 'COMPLETE' || game.state === 'READY')) onScore()


    // ==========================================================
    // TRACKING AUTHORITY
    // ==========================================================

    if (
      !tracked
    ) {
      following.current =
        false

    } else if (
      settled
    ) {
      following.current =
        true
    }


    // ==========================================================
    // BALL RENDERING
    // ==========================================================

    ball.current.position.copy(
      game.position,
    )
    if (axes) fielding.finishDebugFrame(game.position)


    ball.current.visible =
      game.visible


    ball.current.scale.setScalar(
      T.ballVisualScale,
    )


    // ==========================================================
    // DEBUG
    // ==========================================================

    debug.keeper =
      keeper.state


    debug.postCamera =
      postCamera.select(
        game,
        game.camera,
      )


    // ==========================================================
    // CAMERA
    // ==========================================================

    if (
      orbit
    ) {
      return
    }


    const holdingFielder =
      game.fieldingHeld
        ? fielding.activeFielder
        : null

    if (holdingFielder) {
      const alpha = 1 - Math.exp(-dt / .18)
      const fielderPosition = holdingFielder.position

      camera.position.lerp(
        fielderPosition.clone().add(
          new Vector3(3.6, 2.4, -3.4),
        ),
        alpha,
      )

      look.lerp(
        fielderPosition.clone().add(
          new Vector3(0, 1.15, 0),
        ),
        alpha,
      )

      camera.lookAt(look)
      return
    }


    if (
      postCamera.mode ===
        'KEEPER_FOLLOW' ||

      (
        postCamera.mode ===
          'RETURNING' &&

        postCamera
          .returningFromKeeper
      )
    ) {
      postCamera.update(
        camera as PerspectiveCamera,

        game,

        keeper.actionCenter,

        dt,

        postCamera.mode ===
          'RETURNING',
      )

      return
    }


    if (
      game.camera ===
      'BATSMAN_VIEW'
    ) {
      camera.position.copy(
        EYES,
      )

      look.copy(
        LOOK,
      )

    } else {
      const alpha =
        1 -
        Math.exp(
          -dt /
            (
              game.camera ===
              'RETURNING'

                ? .14
                : .3
            ),
        )


      const destination =
        game.camera ===
        'RETURNING'

          ? EYES.clone()

          : game.position
              .clone()
              .addScaledVector(
                game.velocity
                  .clone()
                  .normalize(),

                -3,
              )
              .add(
                new Vector3(
                  0,
                  1.5,
                  0,
                ),
              )


      destination.y =
        Math.max(
          destination.y,
          .5,
        )


      camera.position.lerp(
        destination,
        alpha,
      )


      look.lerp(
        game.camera ===
          'RETURNING'

          ? LOOK

          : game.position,

        alpha,
      )
    }


    camera.lookAt(
      look,
    )

  }, -1)


  // ============================================================
  // 3D OBJECTS
  // ============================================================

  return (
    <>
      <group
        ref={bat}
        position={
          BASE_RIGHT_HAND_POSITION
        }
      >
        <group ref={visualBat}>
          <CricketBat
            showPivot={axes}
          />
        </group>

        {axes && (
          <axesHelper
            args={[.35]}
          />
        )}
      </group>


      <mesh
        ref={ball}
        visible={false}
        castShadow
      >
        <sphereGeometry
          args={[
            DELIVERY.radius,
            20,
            12,
          ]}
        />

        <meshStandardMaterial
          color="#b91e28"
          roughness={.32}
          metalness={.04}
          emissive="#6f160e"
          emissiveIntensity={.35}
        />

        <mesh
          rotation={[
            Math.PI / 2,
            .4,
            0,
          ]}
        >
          <torusGeometry
            args={[
              DELIVERY.radius,
              .0012,
              4,
              24,
            ]}
          />

          <meshBasicMaterial
            color="#f1d8a5"
          />
        </mesh>
      </mesh>


      <group ref={replayBowler}><Bowler
        game={game}
      /></group>


      <group ref={replayKeeper}><WicketKeeper
        keeper={keeper}
      /></group>


      <group ref={replayFielders}><Fielders
        fielding={fielding}
      /></group>
      {axes && <FieldingDebug fielding={fielding} game={game} />}
      <FieldMap fielding={fielding} keeper={keeper} tactics={tactics} debug={axes} />


      <group ref={replayEffects}><MatchEffects
        game={game}
      /></group>
      <group ref={replayWicket}><Wicket z={.87} getImpact={()=>game.match.wicketImpact} ready={()=>game.state==='READY'} debug={axes} paused={()=>replay.blocked}/></group>
      <group ref={replayTrail}><BallTrail game={game} /></group>


      <group ref={replayGround}><GroundEffects
        game={game}
        toe={debug.toe}
      /></group>
      <ReplayDirector game={game} score={session} replay={replay} suspended={suspended}
        roots={[bat,ball,replayBowler,replayKeeper,replayFielders,replayWicket]}
        hidden={[replayEffects,replayTrail,replayGround]}/>
    </>
  )
}


// ============================================================
// APP
// ============================================================

export default function App() {
  const feed =
    useController()


  const [game,setGame]=useState(()=>new Delivery())
  const replay=useMemo(()=>new ReplaySession(),[game])
  const session=useMemo(()=>new SessionScore(),[])
  const modes=useMemo(()=>new GameModes(session),[session])
  const [menuPage,setMenuPage]=useState<MenuPage>('MAIN')
  const [bowlingLab,setBowlingLab]=useState(false)
  const [onboarding,setOnboarding]=useState(()=>!hasSeen(HELP_KEYS.tutorial))
  const [helpPaused,setHelpPaused]=useState(false)
  const suspended=onboarding||helpPaused
  useAutoHideCursor(modes.status==='PLAYING' && !suspended)
  useEffect(()=>{
    if(!suspended||modes.status==='MENU')return
    const block=()=>{feed.bowlRequests.current=0;feed.publishBowlReady(false,performance.now())}
    block();const timer=setInterval(block,100)
    return()=>{clearInterval(timer);feed.bowlRequests.current=0}
  },[suspended,feed.bowlRequests,modes.status])
  const [,setScoreRevision]=useState(0)
  const scoreChanged=()=>setScoreRevision(value=>value+1)
  const wicketHold=useMemo(()=>new WicketPresentationHold(),[game])
  const wicketHolding=wicketHold.active(game.match.wicketImpact,performance.now())
  useEffect(()=>{
    if(!wicketHolding)return
    const timer=setTimeout(scoreChanged,Math.ceil(wicketHold.remaining(performance.now()))+1)
    return()=>clearTimeout(timer)
  },[game.match.wicketImpact,wicketHolding])
  const [overAnnouncement, setOverAnnouncement] = useState(true)
  useEffect(() => {
    setOverAnnouncement(true)
    const timer = setTimeout(() => setOverAnnouncement(false), 1800)
    return () => clearTimeout(timer)
  }, [game, session.currentOver, modes.status])
  const playAgain=()=>{
    if (modes.mode) modes.choose(modes.mode)
    const next=new Delivery();next.beginner=beginner
    setOrbit(false);setGame(next);scoreChanged()
  }
  const chooseMode=(mode: GameMode)=>{
    modes.choose(mode)
    const next=new Delivery();next.beginner=beginner
    setOrbit(false);setGame(next);scoreChanged()
  }
  const changeMode=()=>{
    setHelpPaused(false)
    setMenuPage('MAIN');setBowlingLab(false)
    modes.menu()
    const next=new Delivery();next.beginner=beginner
    setOrbit(false);setGame(next);scoreChanged()
  }


  const [
    orbit,
    setOrbit,
  ] = useState(false)


  const [
    source,
    setSource,
  ] =
    useState<
      'PHONE' | 'MARKER'
    >('PHONE')


  const [
    axes,
    setAxes,
  ] = useState(false)


  const [
    beginner,
    setBeginner,
  ] = useState(true)


  const debug = useMemo(
    () => ({
      displayed:
        new Vector3(),

      target:
        new Vector3(),

      bladeDelta:
        new Vector3(),

      toe:
        new Vector3(),

      toeHeight:
        0,

      swing:
        false,

      handle:
        'HELD' as HandleSource,

      predictionMs:
        0,
      renderFps: 0,
      handMode: 'HELD',

      assist:
        'NORMAL' as AssistLevel,

      reacquiring:
        false,

      keeper:
        'READY' as KeeperState,

      postCamera:
        'BATSMAN' as PostCameraMode,
    }),
    [],
  )


  const positionStatus =
    cvPositionStatus(
      feed.connected.current,

      feed.latest.current,

      performance.now(),
    )


  const xyz = (
    v:
      | {
          x: number
          y: number
          z: number
        }
      | null
      | undefined,
  ) =>
    v
      ? `${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}`
      : '--'


  const phone =
    feed.phone.current


  const status =
    phoneStatus(
      feed.phoneConnected.current,

      phone?.received ??
        null,

      performance.now(),
    )


  const imu =
    phone?.message


  const m =
    feed.bat.current


  const markerState =
    feed.display.connected &&
    m &&
    performance.now() -
      m.received <
      STALE_MS

      ? m.message.state

      : 'LOST'


  if(modes.status==='MENU') {
    if(bowlingLab)return <BowlingLab feed={feed} onBack={()=>{setBowlingLab(false);setMenuPage('BOWLING')}}/>
    return <MainMenu page={menuPage} onNavigate={setMenuPage} onChoose={chooseMode}
      onLab={()=>setBowlingLab(true)} phoneConnected={feed.phoneConnected.current}
      setupStatus={{webcamConnected:feed.display.connected&&!feed.display.stale,webcamCalibrated:!!feed.display.message?.calibrated,
        phoneConnected:status==='CONNECTED',phoneCalibrated:!!imu?.calibrated}} onSetupDone={()=>setOnboarding(false)}/>
  }
  return (
    <main className="batting-view">
      {!onboarding && <GameMenu onSuspend={value=>{feed.bowlRequests.current=0;feed.publishBowlReady(false,performance.now());setHelpPaused(value)}} onMainMenu={()=>{setHelpPaused(false);changeMode()}}/>}
      {onboarding?<div className="batting-preplay" aria-hidden="true"><span>Motion Cricket</span><div className="preplay-crease"/></div>:<Canvas
        frameloop={helpPaused?'never':'always'}
        shadows

        dpr={[
          1,
          1.5,
        ]}

        camera={{
          position: [
            0,
            1.68,
            .35,
          ],

          fov:
            T.cameraFov,

          near:
            .03,

          far:
            180,
        }}
      >
        <Stadium animatedWicket />

        <Play
          feed={feed}
          game={game}
          orbit={orbit}
          source={source}
          axes={axes}
          debug={debug}
          session={session}
          modes={modes}
          onScore={scoreChanged}
          suspended={suspended}
          replay={replay}
        />
      </Canvas>}
      <ReplayOverlay session={replay}/>

      <>
      <BattingHud modes={modes} game={game} beginner={beginner}
        onAssist={value=>{setBeginner(value);game.beginner=value}}
        phoneStatus={status} calibrated={!!imu?.calibrated} debug={axes}
        webcamConnected={feed.display.connected&&!feed.display.stale} webcamCalibrated={!!feed.display.message?.calibrated}
        initialOnboarding={onboarding} onStart={()=>{feed.bowlRequests.current=0;const next=new Delivery();next.beginner=beginner;setGame(next);setOnboarding(false)}}
        onExit={changeMode} onSuspend={value=>{feed.bowlRequests.current=0;feed.publishBowlReady(false,performance.now());setHelpPaused(value)}}
        onDebug={()=>{setAxes(value=>!value);if(axes)setOrbit(false)}} />


      {axes && (
        <header
          className="controller-debug"
        >
          <p className="eyebrow">
            MOTION CRICKET / {source}
          </p>
          <p>Bowler: {game.plan?.bowler ?? session.bowlerType} | Delivery: {game.plan?.variation ?? '--'}<br />Speed: {game.plan?.speed.toFixed(2) ?? '--'} units/s | Line: {game.plan?.targetX.toFixed(2) ?? '--'} | Length: {game.plan?.bounceZ.toFixed(2) ?? '--'}<br />Swing: {game.plan?.swingAcceleration.toFixed(2) ?? '--'} | Turn: {game.plan?.spinImpulse.toFixed(2) ?? '--'} | Forward: {game.plan?.forwardImpulse.toFixed(2) ?? '--'}
          </p>
          <p>Contact: {game.quality ?? '--'} | Speed: {game.match.contactSpeed.toFixed(2)} | Omega: {game.match.omega.toFixed(2)}<br />Exit: {game.match.exitSpeed.toFixed(2)} | Vertical: {game.match.launchY.toFixed(2)} | Launch: {game.match.launchAngle.toFixed(1)}°<br />First bounce: {game.match.firstBounceDistance?.toFixed(1) ?? '--'} | Result: {game.match.result ?? '--'}</p>

          <p>
            WebSocket:{' '}
            {feed.display.connected
              ? 'CONNECTED'
              : 'DISCONNECTED'}
          </p>

          <p>
            CV POSITION:{' '}
            {positionStatus}
            {' | '}
            calibration:{' '}
            {feed.display
              .message
              ?.calibrationState ??
              '--'}
          </p>

          <p>
            Bat markers:{' '}
            {markerState}
          </p>

          <p>
            PHONE:{' '}
            {status}
            {' | '}
            CALIBRATION:{' '}
            {imu?.calibrated
              ? 'YES'
              : 'NO'}
          </p>

          <p>
            Sensor:{' '}
            {status ===
            'CONNECTED'
              ? imu?.sensorHz.toFixed(
                  0,
                )
              : '0'}{' '}
            Hz
            {' | '}
            angular:{' '}
            {imu
              ? Math.hypot(
                  imu.angularVelocity
                    .x,

                  imu.angularVelocity
                    .y,

                  imu.angularVelocity
                    .z,
                ).toFixed(2)

              : '--'}{' '}
            rad/s
          </p>

          <p>
            Swing estimate:{' '}
            {imu?.swingSpeed.toFixed(
              2,
            ) ?? '--'}{' '}
            m/s
          </p>


          {axes && (
            <>
              <p>
                PHONE SWING:{' '}
                {debug.swing
                  ? 'ACTIVE'
                  : 'IDLE'}
              </p>

              <p>
                BEGINNER CORRIDOR:{' '}
                {game.beginnerCorridor
                  ? 'IN'
                  : 'OUT'}
                {' | '}
                TIMING:{' '}
                {game.timing}
              </p>

              <p>
                QUALITY SCORE:{' '}
                {game.qualityScore.toFixed(
                  2,
                )}
                {' | '}
                CONTACT:{' '}
                {game.contactKind}
              </p>

              <p>
                PHONE OMEGA:{' '}
                {game.match.omega.toFixed(
                  1,
                )}{' '}
                rad/s
                {' | '}
                GAME SWING POWER:{' '}
                {(
                  game.match.power *
                  100
                ).toFixed(0)}
                %
              </p>

              <p>
                CONTACT:{' '}
                {game.quality ??
                  '--'}
                {' | '}
                BALL EXIT SPEED:{' '}
                {game.match.exitSpeed.toFixed(
                  1,
                )}{' '}
                m/s
              </p>

              <p>
                GROUND AFTER HIT:{' '}
                {game.match
                  .groundAfterHit
                  ? 'YES'
                  : 'NO'}
                {' | '}
                SHOT DISTANCE:{' '}
                {game.match.distance.toFixed(
                  1,
                )}{' '}
                m
              </p>

              <p>
                RESULT:{' '}
                {game.match.result ??
                  '--'}
              </p>

              <p>
                HANDLE:{' '}
                {debug.handle}

                {debug.handle ===
                'PREDICTED'
                  ? ` ${Math.round(
                      debug.predictionMs,
                    )}ms`
                  : ''}

                {debug.reacquiring
                  ? ' / REACQUIRING'
                  : ''}
              </p>

              <p>
                BODY SCALE: {feed.display.message?.telemetry?.bodyScale?.toFixed(3) ?? '--'} | CALIBRATION SCALE: {feed.display.message?.telemetry?.calibrationScale?.toFixed(3) ?? '--'}<br />
                IMAGE RATIO: {feed.display.message?.telemetry?.imageScaleRatio?.toFixed(3) ?? '--'} | APPLIED WORLD RATIO: {feed.display.message?.telemetry?.worldScaleRatio?.toFixed(3) ?? '--'}<br />
                SHOULDER / TORSO (image): {feed.display.message?.telemetry?.shoulderImageWidth?.toFixed(3) ?? '--'} / {feed.display.message?.telemetry?.torsoImageScale?.toFixed(3) ?? '--'}<br />
                RAW IMAGE DELTA: {(['X','Y'] as const).map(axis=>feed.display.message?.telemetry?.['rawImageDelta'+axis]?.toFixed(4) ?? '--').join(', ')}<br />
                RAW WORLD / NORMALIZED DELTA: {['rawDelta','normalizedDelta'].map(prefix=>['X','Y','Z'].map(axis=>feed.display.message?.telemetry?.[prefix+axis]?.toFixed(3) ?? '--').join(', ')).join(' / ')}<br />
                RAW / NORMALIZED JITTER XYZ: {['rawJitter','normalizedJitter'].map(prefix=>['X','Y','Z'].map(axis=>feed.display.message?.telemetry?.[prefix+axis]?.toFixed(4) ?? '--').join(', ')).join(' / ')}<br />
                CV RX: {feed.telemetry.current.rxHz.toFixed(0)} Hz | AGE: {feed.latest.current?Math.round(performance.now()-feed.latest.current.received):'--'} ms
                {' | '}SAMPLE DT: {feed.telemetry.current.sampleDtMs.toFixed(0)} ms | RENDER: {debug.renderFps.toFixed(0)} FPS<br />
                HAND: {debug.handMode} | PREDICTION: {Number.isFinite(debug.predictionMs)?debug.predictionMs.toFixed(0):'--'} ms<br />
                CV capture/output: {feed.display.message?.telemetry?.captureHz??'--'} / {feed.display.message?.telemetry?.inferenceHz??'--'} Hz
                {' | '}Inference: {feed.display.message?.telemetry?.inferenceMs??'--'} ms | WS: {feed.display.message?.telemetry?.sendHz??'--'} Hz
              </p>

              <p>
                ASSIST:{' '}
                {(
                  game.state ===
                  'READY'
                    ? game.beginner
                    : game.deliveryBeginner
                )
                  ? debug.assist
                  : 'OFF'}
              </p>

              <p>
                BAT TOE HEIGHT:{' '}
                {debug.toeHeight.toFixed(
                  3,
                )}{' '}
                m /{' '}
                {debug.toeHeight <
                T.toeContactHeight
                  ? 'CONTACT'

                  : debug.toeHeight <
                    T.toeNearHeight

                    ? 'NEAR'

                    : 'ABOVE'}
              </p>

              <p>
                BALL HEIGHT:{' '}
                {Math.max(
                  0,

                  game.position.y -
                    T.groundY -
                    DELIVERY.radius,
                ).toFixed(2)}{' '}
                m
              </p>

              <p>
                Blade change:
                {' '}RIGHT{' '}
                {debug.bladeDelta.x.toFixed(
                  2,
                )}
                {' / '}UP{' '}
                {debug.bladeDelta.y.toFixed(
                  2,
                )}
                {' / '}FORWARD{' '}
                {(
                  -debug.bladeDelta.z
                ).toFixed(2)}
              </p>

              <p>
                CV raw XYZ:{' '}
                {xyz(
                  feed.display
                    .message
                    ?.position,
                )}
              </p>

              <p>
                Handle target:{' '}
                {xyz(
                  debug.target,
                )}
                {' / '}
                displayed:{' '}
                {xyz(
                  debug.displayed,
                )}
              </p>

              <p>
                Bat axes: red +X,
                green +Y (handle cap),
                blue +Z (face)
              </p>
            </>
          )}


          <p>
            Ball:{' '}
            {game.state}

            {game.outcome
              ? ` (${game.outcome})`
              : ''}
          </p>

          <p>
            Bowler:{' '}
            {
              bowlerPose(
                game.bowlingTime,
                game.pause,
                game.state ===
                  'READY',
              ).state
            }
          </p>

          <p>
            Camera:{' '}
            {orbit
              ? 'DEBUG ORBIT'
              : game.camera}
          </p>

          <p>
            KEEPER STATE:{' '}
            {debug.keeper}
            {' | '}
            POST CAMERA:{' '}
            {debug.postCamera}
          </p>


          {source ===
            'MARKER' && (
            <p>
              Bat speed:{' '}
              {markerState ===
              'TRACKED'
                ? m?.message.speed.toFixed(
                    2,
                  )
                : '--'}{' '}
              m/s
              {' '}
              (projected handle)
            </p>
          )}


          <p>
            SPACE: delivery when
            READY. CV window C:
            re-centre.
          </p>

          <p>
            {source === 'PHONE'
              ? 'Phone rotation; webcam position or held handle. No acceleration integration.'
              : 'Marker axis only; fixed depth and blade roll.'}
          </p>
        </header>
      )}


      {!axes && (
        <header
          className="match-title"
        >
          <p className="eyebrow">
            MOTION CRICKET
          </p>

          <p>
            {game.state ===
            'READY'

              ? 'SPACE · Next delivery'

              : game.outcome ===
                'MISSED'

                ? 'Through to the keeper'

                : 'Watch the ball'}
          </p>
        </header>
      )}


      {!onboarding && !session.complete && !game.match.result && game.quality &&
        game.age <
          T.qualitySeconds &&
        game.camera ===
          'BALL_FOLLOW' && (
          <div className="hit-quality">
            {game.quality ===
            'SWEET'
              ? 'SWEET!'
              : game.quality}
            <small className="feedback-detail">{battingFeedback(game)?.detail}</small>

            {axes &&
              game.assistedHit && (
                <div
                  style={{
                    fontSize: 13,
                    letterSpacing:
                      '.05em',
                  }}
                >
                  ASSISTED CONTACT
                </div>
              )}
          </div>
        )}


      {!onboarding && (!session.complete || wicketHolding) && game.match.result &&
        game.state !==
          'READY' && (
          <div
            className="hit-quality"

            style={{
              top: '34%',
              fontSize: 30,
            }}
          >
            {game.match.result ===
              'BOWLED' ||
             game.match.result ===
              'CAUGHT' ||
            game.match.result ===
              'CAUGHT BEHIND'

              ? `OUT — ${game.match.result}`

              : game.match.result ===
                    'FOUR' ||
                  game.match.result ===
                    'SIX'

                ? `${game.match.result}!`

                : game.match.result}
            <small className="feedback-detail">{battingFeedback(game)?.detail}</small>
          </div>
        )}


      <div className="session-total"><span>{modes.mode === 'FREE_PLAY' ? 'SCORE' : 'RUNS'}</span><strong>{modes.mode === 'FREE_PLAY' ? session.total : `${session.total}/${session.wickets}`}</strong><span className="score-state">{session.overNotation} OVERS<small>{session.bowlerType === 'FAST' ? 'FAST BOWLER' : 'SPINNER'}</small></span>
        {modes.mode === 'TARGET_CHASE' && <span className="chase-hud">TARGET {modes.target}<small>NEED {modes.runsNeeded} FROM {modes.ballsRemaining}</small></span>}</div>
      {overAnnouncement && modes.status === 'PLAYING' && <div className="over-announcement"><strong>{session.bowlerType === 'FAST' ? 'FAST BOWLER' : 'SPINNER'}</strong><small>Over {session.currentOver + 1}</small></div>}
      {axes && <aside>
        {axes && (
          <>
            <label>
              Controller:{' '}

              <select
                value={source}

                onChange={
                  event =>
                    setSource(
                      event.target
                        .value as
                        | 'PHONE'
                        | 'MARKER',
                    )
                }
              >
                <option value="PHONE">
                  PHONE
                </option>

                <option value="MARKER">
                  LEGACY / MARKER DEBUG
                </option>
              </select>
            </label>


            <button
              onClick={() =>
                setOrbit(
                  value =>
                    !value,
                )
              }
            >
              {orbit
                ? 'Return to game camera'
                : 'Debug orbit view'}
            </button>
          </>
        )}


        <button
          onClick={() => {
            setAxes(
              value =>
                !value,
            )

            if (axes) {
              setOrbit(false)
            }
          }}
        >
          Debug:{' '}
          {axes
            ? 'ON'
            : 'OFF'}
        </button>


      </aside>}
      </>
      {!wicketHolding && !replay.inputBlocked && <ModeOverlay modes={modes} phoneConnected={feed.phoneConnected.current} onChoose={chooseMode} onBegin={()=>{modes.begin();scoreChanged()}} onAgain={playAgain} onMenu={changeMode}/>}
    </main>
  )
}
