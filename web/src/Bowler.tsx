import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Vector3 } from 'three'
import { bowlerPose, releaseTime } from './bowling'
import { GAMEPLAY as T } from './gameplayTuning'
import type { Delivery } from './delivery'
import Humanoid, { humanPose } from './Humanoid'

export default function Bowler({ game }: { game: Delivery }) {
  const root = useRef<Group>(null), pose = useMemo(humanPose, [])
  const previous = useMemo(humanPose, [])
  const axis = useMemo(()=>new Vector3(1,0,0),[])
  useFrame(({clock},dt) => {
    previous.hip.copy(pose.hip); previous.shoulder.copy(pose.shoulder); previous.head.copy(pose.head)
    for(let i=0;i<2;i++) { previous.feet[i].copy(pose.feet[i]); previous.knees[i].copy(pose.knees[i]); previous.hands[i].copy(pose.hands[i]); previous.elbows[i].copy(pose.elbows[i]) }
    const p = bowlerPose(game.state === 'READY' ? 0 : game.bowlingTime, game.pause, game.state === 'READY')
    root.current!.position.copy(p.root)
    const running = p.state === 'RUN_UP', gather = p.state === 'GATHER'
    const follow = Math.max(0,Math.min(1,(game.bowlingTime-releaseTime(game.pause))/T.followThroughSeconds))
    const cycle = running ? (game.bowlingTime-game.pause)/T.runSeconds*Math.PI*10 : follow*Math.PI*3
    const amplitude = running ? 1 : p.state === 'FOLLOW_THROUGH' ? (1-follow)*.65 : 0
    const bob = running ? Math.abs(Math.sin(cycle))*.035 : Math.sin(clock.elapsedTime*2)*.006
    pose.hip.set(0,.85+bob,0)
    pose.shoulder.set(0,T.shoulderY,0).applyAxisAngle(axis,p.lean)
    pose.head.copy(pose.shoulder); pose.head.y += .29; pose.head.z -= .035
    for(let i=0;i<2;i++) {
      const s = i ? 1 : -1, phase = cycle+i*Math.PI
      pose.feet[i].set(s*.12,.08+Math.max(0,Math.sin(phase))*.16*amplitude,Math.cos(phase)*.34*amplitude)
      pose.knees[i].set(s*.13,.45+bob,Math.cos(phase)*.18*amplitude+.07)
    }
    if(gather) { pose.knees[0].set(-.13,.69,.25); pose.feet[0].set(-.13,.38,.10) }
    if(p.state === 'BOWLING_ARM_ROTATION' || p.state === 'RELEASE') {
      pose.feet[0].set(-.12,.08,.36); pose.knees[0].set(-.12,.44,.29)
      pose.feet[1].set(.12,.10,-.34); pose.knees[1].set(.12,.43,-.12)
    }
    // Anchor the visual bowling hand to the unchanged physics release path.
    pose.hands[1].copy(p.hand).sub(p.root)
    pose.elbows[1].set(.22,T.shoulderY,0).applyAxisAngle(axis,p.lean).lerp(pose.hands[1],.48)
    const angle = running ? Math.sin(cycle)*.8 : gather ? -2.5 : -.4-follow*.5
    pose.elbows[0].copy(pose.shoulder); pose.elbows[0].x -= .22
    pose.elbows[0].y -= .30*Math.cos(angle); pose.elbows[0].z -= .30*Math.sin(angle)
    pose.hands[0].copy(pose.elbows[0])
    pose.hands[0].y -= .27*Math.cos(angle-.4); pose.hands[0].z -= .27*Math.sin(angle-.4)
    const settle = Math.max(0,Math.min(1,(game.bowlingTime-releaseTime(game.pause)-T.followThroughSeconds)/.6))
    if(game.released && settle>0) {
      pose.shoulder.y += (T.shoulderY-pose.shoulder.y)*settle; pose.shoulder.z *= 1-settle
      pose.head.copy(pose.shoulder); pose.head.y+=.29
      pose.hands[1].lerp(previous.hands[1].set(.24,.69,.02),settle)
      pose.elbows[1].lerp(previous.elbows[1].set(.24,1.03,.02),settle)
    }
    // Smooth visual pose transitions only; the bowling hand keeps its exact release path.
    const alpha=1-Math.exp(-dt/.055)
    pose.hip.lerp(previous.hip,1-alpha); pose.shoulder.lerp(previous.shoulder,1-alpha); pose.head.lerp(previous.head,1-alpha)
    for(let i=0;i<2;i++) { pose.feet[i].lerp(previous.feet[i],1-alpha); pose.knees[i].lerp(previous.knees[i],1-alpha) }
    pose.hands[0].lerp(previous.hands[0],1-alpha); pose.elbows[0].lerp(previous.elbows[0],1-alpha)
  }, -.5)
  return <group ref={root}><Humanoid pose={pose} /></group>
}
