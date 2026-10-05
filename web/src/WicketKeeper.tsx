import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Vector3 } from 'three'
import Humanoid, { humanPose } from './Humanoid'
import { KeeperPresentation } from './keeperPresentation'

export default function WicketKeeper({ keeper }: { keeper: KeeperPresentation }) {
  const pose=useMemo(humanPose,[]), root=useRef<Group>(null)
  const axis=useMemo(()=>new Vector3(0,0,1),[])
  useFrame(()=>{if(root.current)root.current.position.copy(keeper.position)})
  useFrame(({clock})=>{
    root.current!.position.copy(keeper.position)
    const breath=Math.sin(clock.elapsedTime*1.8)*.007, lower=keeper.crouch
    pose.hip.set(0,.66-lower+breath,0)
    pose.shoulder.set(0,1.1-lower+breath,.18);pose.head.set(0,1.37-lower+breath,.22)
    for(let i=0;i<2;i++) {
      const s=i?1:-1
      pose.feet[i].set(s*.26,.08,0);pose.knees[i].set(s*.28,.40-lower*.5,.21)
    }
    const points=[pose.shoulder,pose.head,...pose.knees,...pose.feet]
    for(const p of points) p.sub(pose.hip).applyAxisAngle(axis,-keeper.tilt).add(pose.hip)
    const floor=Math.min(...points.map(p=>p.y-.09),pose.hip.y-.15)
    const lift=Math.max(0,.02-floor)
    for(const p of [...points,pose.hip]) p.y+=lift
    for(let i=0;i<2;i++) {
      const s=i?1:-1
      pose.hands[i].set(-(keeper.reach.x-keeper.position.x)+s*.07,keeper.reach.y,keeper.position.z-keeper.reach.z)
      pose.elbows[i].copy(pose.shoulder);pose.elbows[i].x+=s*.22
      pose.elbows[i].lerp(pose.hands[i],.52);pose.elbows[i].y-=.08
    }
  },-.5)
  return <group ref={root} rotation={[0,Math.PI,0]}><Humanoid pose={pose} keeper /></group>
}
