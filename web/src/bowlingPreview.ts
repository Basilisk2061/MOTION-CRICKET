import { Quaternion, Vector3 } from 'three'
import { bowlingParameters, type BowlingPose } from './bowlingController'
export const PREVIEW_TUNING={X:.22,Y:.16,Z:.18,HOLD_LIFT:.025,HANDOFF_SECONDS:.12,STALE_MS:500}
export function bowlingPreview(pose:BowlingPose|null){
 const controls=pose?bowlingParameters({...pose,type:'BOWLING_RELEASE',source:'TOUCH_RELEASE',id:1}):null
 const position=new Vector3(0,2,-18)
 if(controls)position.add(new Vector3(controls.lineInput*PREVIEW_TUNING.X,
  controls.lengthInput*PREVIEW_TUNING.Y+(pose?.holding?PREVIEW_TUNING.HOLD_LIFT:0),
  -controls.lengthInput*PREVIEW_TUNING.Z))
 const q=pose?.orientation
 return {position,orientation:q?new Quaternion(q.x,q.y,q.z,q.w).normalize():new Quaternion(),controls}
}
// Visual handoff only: authoritative line/length/trajectory never use this offset.
export function handoffPosition(physical:Vector3,offset:Vector3,age:number){
 return physical.clone().addScaledVector(offset,Math.max(0,1-age/PREVIEW_TUNING.HANDOFF_SECONDS))
}
