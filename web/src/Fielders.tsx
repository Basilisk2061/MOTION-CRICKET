import {
  useMemo,
  useRef,
} from 'react'

import {
  useFrame,
} from '@react-three/fiber'

import {
  Group,
  Vector3,
} from 'three'

import Humanoid, {
  humanPose,
} from './Humanoid'

import type {
  Fielder,
  FieldingController,
} from './fielding'

function SingleFielder({
  fielder,
}: {
  fielder: Fielder
}) {
  /*
   * IMPORTANT:
   *
   * fielder.position is mutated directly by FieldingController.
   *
   * React does not automatically re-render when a Vector3 is
   * mutated, so we cannot rely on:
   *
   * <group position={fielder.position}>
   *
   * Instead, we keep a ref to the actual Three.js group and
   * copy the latest position into it every frame.
   */
  const root =
    useRef<Group>(null)

  const pose =
    useMemo(
      humanPose,
      [],
    )

  const previous =
    useMemo(
      () =>
        fielder.position.clone(),
      [fielder],
    )

  const movement =
    useMemo(
      () => new Vector3(),
      [],
    )

  // App advances fielding at priority 0. Copy its final transform before render,
  // not from the preceding frame's animation callback.
  useFrame(() => {
    if (root.current) {
      root.current.position.copy(fielder.position)
      root.current.rotation.y = fielder.facing
      ;(fielder.renderedPosition ??= new Vector3()).copy(root.current.position)
    }
  })

  useFrame(
    ({ clock }) => {
      /*
       * ------------------------------------------------------
       * MOVE THE ACTUAL 3D FIELDER
       * ------------------------------------------------------
       */

      if (root.current) {
        root.current.position.copy(
          fielder.position,
        )

        root.current.rotation.y =
          fielder.facing
        ;(fielder.renderedPosition ??= new Vector3()).copy(root.current.position)
      }

      /*
       * ------------------------------------------------------
       * DETECT WHETHER THIS FIELDER MOVED THIS FRAME
       * ------------------------------------------------------
       */

      movement
        .copy(
          fielder.position,
        )
        .sub(previous)

      const moving =
        movement.lengthSq() >
        0.000001

      const running =
        fielder.state ===
          'CHASING' &&
        moving

      /*
       * ------------------------------------------------------
       * RUNNING ANIMATION
       * ------------------------------------------------------
       */

      const phase =
        clock.elapsedTime *
        10

      const stride =
        running
          ? Math.sin(phase) *
            0.30
          : 0

      const armSwing =
        running
          ? Math.sin(
              phase + Math.PI,
            ) * 0.24
          : 0

      /*
       * ------------------------------------------------------
       * BODY
       * ------------------------------------------------------
       */

      pose.hip.set(
        0,
        0.92,
        0,
      )

      pose.shoulder.set(
        0,
        1.35,
        0,
      )

      pose.head.set(
        0,
        1.66,
        0,
      )

      /*
       * ------------------------------------------------------
       * LEGS
       * ------------------------------------------------------
       */

      // Left leg
      pose.knees[0].set(
        -0.13,
        0.52,
        stride,
      )

      pose.feet[0].set(
        -0.13,
        0.06,
        -stride,
      )

      // Right leg
      pose.knees[1].set(
        0.13,
        0.52,
        -stride,
      )

      pose.feet[1].set(
        0.13,
        0.06,
        stride,
      )

      /*
       * ------------------------------------------------------
       * ARMS
       * ------------------------------------------------------
       */

      // Left arm
      pose.elbows[0].set(
        -0.28,
        1.13,
        armSwing,
      )

      pose.hands[0].set(
        -0.30,
        0.92,
        armSwing * 1.4,
      )

      // Right arm
      pose.elbows[1].set(
        0.28,
        1.13,
        -armSwing,
      )

      pose.hands[1].set(
        0.30,
        0.92,
        -armSwing * 1.4,
      )

      /*
       * ------------------------------------------------------
       * COLLECTION POSE
       * ------------------------------------------------------
       */

      if (
        fielder.state ===
        'COLLECTING'
      ) {
        pose.hip.set(
          0,
          0.76,
          0,
        )

        pose.shoulder.set(
          0,
          1.17,
          0.05,
        )

        pose.head.set(
          0,
          1.48,
          0.08,
        )

        pose.knees[0].set(
          -0.15,
          0.42,
          0.10,
        )

        pose.knees[1].set(
          0.15,
          0.42,
          0.10,
        )

        pose.hands[0].set(
          -0.10,
          0.34,
          0.22,
        )

        pose.hands[1].set(
          0.10,
          0.34,
          0.22,
        )

        pose.elbows[0].set(
          -0.22,
          0.78,
          0.12,
        )

        pose.elbows[1].set(
          0.22,
          0.78,
          0.12,
        )
      }

      /*
       * ------------------------------------------------------
       * THROW PREPARATION POSE
       * ------------------------------------------------------
       */

      if (
        fielder.state ===
        'THROWING'
      ) {
        pose.hip.set(
          0,
          0.92,
          0,
        )

        pose.shoulder.set(
          0,
          1.35,
          0,
        )

        pose.head.set(
          0,
          1.66,
          0,
        )

        // Left arm points roughly toward return target.
        pose.elbows[0].set(
          -0.30,
          1.25,
          0.20,
        )

        pose.hands[0].set(
          -0.34,
          1.22,
          0.42,
        )

        // Right arm holds ball back ready to throw.
        pose.elbows[1].set(
          0.36,
          1.40,
          -0.15,
        )

        pose.hands[1].set(
          0.40,
          1.52,
          -0.34,
        )
      }

      /*
       * Save this frame's logical position so next frame we can
       * determine whether the player actually moved.
       */
      previous.copy(
        fielder.position,
      )
      if(fielder.state==='COLLECTING' || fielder.state==='THROWING') {
        pose.hands[1].copy(fielder.handLocal)
        pose.hands[0].copy(fielder.handLocal).add(new Vector3(-.09,0,.015))
        for(let i=0;i<2;i++) {
          pose.elbows[i].copy(pose.shoulder).lerp(pose.hands[i],.55)
          pose.elbows[i].x += i ? .12 : -.12
        }
      }
    },
    -.5,
  )

  return (
    <group
      ref={root}

      /*
       * Initial position only.
       *
       * After mounting, useFrame above owns the world transform.
       */
      position={[
        fielder.position.x,
        fielder.position.y,
        fielder.position.z,
      ]}

      rotation={[
        0,
        fielder.facing,
        0,
      ]}
    >
      <Humanoid
        pose={pose}
      />
    </group>
  )
}

export default function Fielders({
  fielding,
}: {
  fielding: FieldingController
}) {
  return (
    <>
      {fielding.fielders.map(
        fielder => (
          <SingleFielder
            key={fielder.id}
            fielder={fielder}
          />
        ),
      )}
    </>
  )
}
