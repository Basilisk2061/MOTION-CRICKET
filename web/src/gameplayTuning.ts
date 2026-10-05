import { Quaternion, Vector3 } from 'three'

export const BAT_HITBOX_WIDTH_MULTIPLIER = 1.95
export const BAT_HITBOX_THICKNESS_MULTIPLIER = 2.4
export const BAT_HITBOX_LENGTH_PADDING = .12
export const BALL_HIT_RADIUS_PADDING = .025

export const MATCH = {
  POWER_RATE: .26,
  POWER_DEAD_ZONE: 1.5,

  MAX_EXIT_SPEED: 24,
  LOFT_MAX_EXIT_SPEED: 28,
  LOFT_MIN_PHYSICAL_SPEED: 20,
  LOFT_MIN_POWER: .65,
  LOFT_MIN_VERTICAL_RATIO: .22,
  ATTACK_SPEED: 20,
  STRICT_ATTACK_SPEED: 18,

  QUALITY_POWER: {
    SWEET: 1,
    GOOD: .94,
    EDGE: .66,
  },

  GLOVE_RADIUS: .16,
  GLOVE_PLANE: 2.92,
  GLOVE_MAX_X: 2.2,
  GLOVE_MIN_Y: .12,
  GLOVE_MAX_Y: 1.7,

  WICKET_Z: .87,
  STUMP_X: [-.095, 0, .095],
  STUMP_RADIUS: .019,
  STUMP_HEIGHT: .71,
  BAIL_HEIGHT: .723,

  // Matches the existing stadium rope:
  // radius 35.8, Z scale 1.2, center Z -9.
  BOUNDARY_RADIUS: 35.8,
  BOUNDARY_Z_SCALE: 1.2,
  BOUNDARY_CENTER_Z: -9,

  RUN_THRESHOLDS: [.10, .35, .65],

  STOP_SPEED: .65,
  RESULT_TIMEOUT: 8,

  GROUND_DECELERATION: 6.5,
  SHOT_BOUNCE: .45,
  BOUNCE_MIN_SPEED: 1,
} as const

export const BEGINNER = {
  CORRIDOR_X: .26,
  CORRIDOR_Y: .22,
  CORRIDOR_DEPTH: .055,

  CONTACT_MIN_Z: -1.15,
  CONTACT_MAX_Z: .10,

  TIMING_GRACE_MS: 120,
  HISTORY_COUNT: 24,

  MIN_FACE_SUITABILITY: .25,
  QUALITY_SPEED: 2,

  PREDICTED_RELIABILITY: .65,
  DEGRADED_RELIABILITY: .85,

  QUALITY_TIMING_WEIGHT: .35,
  QUALITY_PROXIMITY_WEIGHT: .25,
  QUALITY_ORIENTATION_WEIGHT: .20,
  QUALITY_SPEED_WEIGHT: .15,
  QUALITY_TRACKING_WEIGHT: .05,

  GOOD_THRESHOLD: .65,
  SWEET_THRESHOLD: .90,

  SWEET_MIN_PROXIMITY: .78,
  SWEET_MIN_ORIENTATION: .8,
  SWEET_MIN_TIMING: .8,

  GOOD_POWER_FLOOR: .85,
  EDGE_POWER_FLOOR: .65,
} as const

export const SWING_CONTINUITY = {
  CV_PREDICTION_MAX_MS: 220,
  CV_PREDICTION_DECAY: .095,

  CV_PREDICTION_MAX_DISPLACEMENT: .20,
  CV_PREDICTION_MAX_VELOCITY: 2.4,

  CV_SAMPLE_FRESH_MS: 100,
  CV_HISTORY_MS: 150,
  CV_HISTORY_COUNT: 6,

  CV_REACQUIRE_BLEND_MS: 80,
  CV_REACQUIRE_MIN_GAP_MS: 60,
  CV_REACQUIRE_DISTANCE: .06,
  CV_REACQUIRE_MAX_SPEED: 4,
  CV_REACQUIRE_SETTLED: .015,

  SWING_START_RAD_S: 2.2,
  SWING_END_RAD_S: 1.0,

  SWING_CONFIRM_MS: 25,
  SWING_RELEASE_MS: 70,
  SWING_SAMPLE_GAP_MS: 100,

  SWING_LEVER_METRES: .65,

  DEGRADED_ASSIST_MULT: 1.3,
  SWING_LOSS_ASSIST_MULT: 1.7,

  CONTACT_HISTORY_MS: 80,
  CONTACT_HISTORY_COUNT: 16,
  CONTACT_HISTORY_ANGLE_STEP: .06,

  SWING_INTENT_MAX_DISTANCE: .26,

  BATTING_INTERACTION_ZONE: {
    min: [-1.1, .08, -1.4],
    max: [1.1, 1.55, .40],
  },
} as const

export const GAMEPLAY = {
  groundY: .02,
  cameraFov: 70,

  nearMissDistance: .085,
  minimumAssistSpeed: 1.0,

  sweetX: .028,
  sweetY: -.45,
  sweetHalfLength: .105,

  sweetMinimumSpeed: .75,

  // Final safety cap.
  // Normal shots should usually be well below this.
  maxShotSpeed: 24,

  toeContactHeight: .022,
  toeNearHeight: .10,

  // Incoming delivery energy retained after bat contact.
  // Kept deliberately low so a stationary bat does not
  // automatically launch the ball toward the boundary.
  restitution: {
    SWEET: .30,
    GOOD: .22,
    EDGE: .15,
  },

  // Energy contributed by actual bat movement.
  // Swinging should matter much more than simply touching the ball.
  swingTransfer: {
    SWEET: .55,
    GOOD: .42,
    EDGE: .25,
  },

  qualitySeconds: 1.4,

  beginnerSpeedMultiplier: .90,
  ballVisualScale: 1.12,

  speedRanges: [
    [12, 14],
    [14, 16],
    [16, 18],
  ] as const,

  lineRanges: [
    .18,
    .32,
    .46,
  ],

  bounceRanges: [
    [-6.8, -5],
    [-8, -4.5],
    [-9, -4],
  ] as const,

  contactHeightRanges: [
    [.52, .78],
    [.45, .90],
    [.40, 1.02],
  ] as const,

  pauseRange: [.25, .65],

  runSeconds: 1.35,
  gatherSeconds: .25,
  armSeconds: .42,
  followThroughSeconds: .65,

  bowlerStartZ: -24.5,
  bowlerCreaseZ: -18.5,

  bowlerX: .10,
  shoulderY: 1.35,
  armLength: .74,
}

export const DELIVERY = {
  radius: .036,

  gravity: 9.81,
  bounce: .60,

  delay: .65,

  release: [.32, 2, -18] as const,

  velocity: [0, -1, 16] as const,

  missPlane: 1.2,

  followSeconds: 2.5,
  returnSeconds: 1.0,
}

export const BLADE_MIN =
  new Vector3(-.055, -.715, -.025)

export const BLADE_MAX =
  new Vector3(.055, -.20, .025)

// Apply only to the rendered/gameplay pose;
// never write back to CV/phone state.
export function constrainBatToGround(
  position: Vector3,
  rotation: Quaternion,
) {
  let lowest = Infinity

  for (const x of [-.058, .058]) {
    for (const y of [-.72, .17]) {
      for (const z of [-.035, .025]) {
        lowest = Math.min(
          lowest,
          new Vector3(x, y, z)
            .applyQuaternion(rotation)
            .add(position)
            .y,
        )
      }
    }
  }

  const lift = Math.max(
    0,
    GAMEPLAY.groundY - lowest,
  )

  position.y += lift

  const toe = new Vector3(0, -.71, 0)
    .applyQuaternion(rotation)
    .add(position)

  return {
    lift,
    toe,
    height: Math.max(
      0,
      toe.y - GAMEPLAY.groundY,
    ),
  }
}
