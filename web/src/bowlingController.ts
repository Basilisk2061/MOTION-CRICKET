import { Quaternion, Vector3 } from 'three'
import { BowlingCalibration } from './bowlingCalibration'
import { BowlingMotion, type MotionDebug } from './bowlingMotion'
import { clampBowlingTarget, defaultBowlingTarget, type BowlingTarget } from './bowlingTarget'
import { LAB_TUNING as T, normalizeSwingIntent, swingWorldSign, type SwingIntent } from './bowlingLabTuning'
export type { SwingIntent } from './bowlingLabTuning'
export type ReleaseSource = 'VOLUME_DOWN' | 'TOUCH_RELEASE' | 'AUTO_MOTION'
export type BowlingRelease = { type:'BOWLING_RELEASE'; source:ReleaseSource; timestamp:number; id:number;
 calibrationId:number; orientation:{x:number;y:number;z:number;w:number}; angularVelocity:{x:number;y:number;z:number};
 swingIntent?:SwingIntent; angularSpeed?:number; target?:BowlingTarget }
export function volumeDownKey(event: {key:string;code?:string;repeat?:boolean}) {
 return !event.repeat && ['AudioVolumeDown','VolumeDown'].some(key=>event.key===key || event.code===key)
}
export function parseBowlingRelease(value: unknown): BowlingRelease | null {
 const m=value as BowlingRelease | null
 if (!m || m.type!=='BOWLING_RELEASE' || !['VOLUME_DOWN','TOUCH_RELEASE','AUTO_MOTION'].includes(m.source)
  || ![m.timestamp,m.id,m.calibrationId].every(Number.isFinite) || m.id<1 || m.calibrationId<1
  || !m.orientation || !m.angularVelocity) return null
 const q=m.orientation,v=m.angularVelocity
 if (![q.x,q.y,q.z,q.w,v.x,v.y,v.z].every(Number.isFinite)
  || Math.abs(Math.hypot(q.x,q.y,q.z,q.w)-1)>.05 || Math.hypot(v.x,v.y,v.z)>80) return null
 if(m.angularSpeed!==undefined&&(!Number.isFinite(m.angularSpeed)||m.angularSpeed<0||m.angularSpeed>T.MOTION_MAX_RAD_S))return null
 if(m.target&&![m.target.x,m.target.z].every(Number.isFinite))return null
 return {type:'BOWLING_RELEASE',source:m.source,timestamp:m.timestamp,id:m.id,calibrationId:m.calibrationId,
  orientation:{x:q.x,y:q.y,z:q.z,w:q.w},angularVelocity:{x:v.x,y:v.y,z:v.z},
  swingIntent:normalizeSwingIntent(m.swingIntent),...(m.angularSpeed===undefined?{}:{angularSpeed:m.angularSpeed}),
  target:clampBowlingTarget(m.target??defaultBowlingTarget())}
}
export class TouchRelease {
 held=false
 down(ready:boolean) { this.held=ready; return this.held }
 up() { const release=this.held;this.held=false;return release }
 cancel() { this.held=false }
}
export class TapRelease {
 armed=false
 tap(ready:boolean){
  if(!ready){this.cancel();return false}
  if(!this.armed){this.armed=true;return false}
  this.armed=false;return true
 }
 volume(){if(!this.armed)return false;this.armed=false;return true}
 cancel(){this.armed=false}
}
export class BowlingController {
 readonly motion=new BowlingMotion()
 private automatic:BowlingRelease|null=null
 arm(at:number){if(!this.calibration.reference||!this.previous||at-this.previous.at>200)return false;
  this.automatic=null;this.motion.arm(at);this.holding=true;return true}
 cancel(){this.motion.cancel();this.holding=false;this.automatic=null}
 takeAutomaticRelease(){const event=this.automatic;this.automatic=null;return event}
 holding=false
 swingIntent:SwingIntent='NONE'
 target=defaultBowlingTarget()
 selectTarget(target:BowlingTarget){if(!this.holding)this.target=clampBowlingTarget(target)}
 pose():BowlingPose|null {
  const s=this.previous,snapshot=s&&this.snapshot('TOUCH_RELEASE',s.at,this.swingIntent)
  if(!snapshot)return null
  return {type:'BOWLING_POSE',timestamp:snapshot.timestamp,calibrationId:snapshot.calibrationId,
   orientation:snapshot.orientation,angularVelocity:snapshot.angularVelocity,angularSpeed:snapshot.angularSpeed,
   holding:this.holding,swingIntent:this.swingIntent,target:{...this.target},motion:this.motion.debug()}
 }
 readonly calibration=new BowlingCalibration()
 private samples: {q:Quaternion;omega:Vector3;at:number}[]=[]
 private previous: {q:Quaternion;at:number} | null=null
 private count=0
 private lastRelease=-Infinity
 sample(raw:Quaternion,gyro:Vector3|null,at:number) {
  if (!raw.toArray().every(Number.isFinite) || raw.lengthSq()<.01 || !Number.isFinite(at)) return
  if(this.previous&&at<=this.previous.at)return
  const q=raw.clone().normalize(),dt=this.previous?(at-this.previous.at)/1000:0
  let omega=gyro?.clone() ?? new Vector3()
  if(!gyro && this.previous && dt>0 && dt<.2){
   const delta=this.previous.q.clone().invert().multiply(q).normalize()
   if(delta.w<0)delta.set(-delta.x,-delta.y,-delta.z,-delta.w)
   const sine=Math.hypot(delta.x,delta.y,delta.z)
   if(sine>1e-8)omega.set(delta.x,delta.y,delta.z).multiplyScalar(2*Math.atan2(sine,delta.w)/(sine*dt))
  }
  if(!omega.toArray().every(Number.isFinite))omega.set(0,0,0)
  omega.clampLength(0,T.MOTION_MAX_RAD_S)
  this.previous={q,at};this.samples.push({q,omega,at})
  this.samples=this.samples.filter(s=>at-s.at<=T.RELEASE_CACHE_MS).slice(-T.RELEASE_SAMPLE_COUNT)
  const paceMetric=this.motion.update(omega.length(),at,omega)
  if(paceMetric!==null){
   const event=this.release('AUTO_MOTION',at,this.swingIntent)
   if(event){event.angularSpeed=paceMetric;
    const releaseOrientation=this.calibration.relative(q)!
    event.orientation={x:releaseOrientation.x,y:releaseOrientation.y,z:releaseOrientation.z,w:releaseOrientation.w};this.automatic=event}
   this.holding=false
  }
 }
 calibrate(raw:Quaternion) { this.cancel();this.samples=[];this.previous=null;this.target=defaultBowlingTarget();return this.calibration.capture(raw) }
 release(source:ReleaseSource,at:number,swingIntent:SwingIntent='NONE'):BowlingRelease|null {
  if(at-this.lastRelease<T.RELEASE_COOLDOWN_MS)return null
  const snapshot=this.snapshot(source,at,swingIntent)
  if(!snapshot)return null
  this.lastRelease=at
  return {...snapshot,id:++this.count,target:{...this.target}}
 }
 private snapshot(source:ReleaseSource,at:number,swingIntent:SwingIntent):BowlingRelease|null {
  const recent=this.samples.filter(s=>at-s.at>=0 && at-s.at<=T.RELEASE_WINDOW_MS)
  if(!this.calibration.reference || !recent.length) return null
  let q=recent[0].q.clone(),omega=new Vector3()
  recent.forEach((s,i)=>{if(i)q.slerp(s.q,1/(i+1));omega.add(s.omega)})
  q=this.calibration.relative(q)!
  omega.divideScalar(recent.length)
  // Magnitudes avoid cancellation when action direction changes. Trim isolated
  // extremes, while sustained fast samples still produce fast deliveries.
  const speeds=recent.map(s=>s.omega.length()).sort((a,b)=>a-b)
  const trim=Math.floor(speeds.length*T.MOTION_TRIM_SHARE)
  const kept=speeds.slice(trim,speeds.length-trim)
  const angularSpeed=kept.reduce((sum,n)=>sum+n,0)/kept.length
  return {type:'BOWLING_RELEASE',source,timestamp:at,id:1,calibrationId:this.calibration.id,
   orientation:{x:q.x,y:q.y,z:q.z,w:q.w},angularVelocity:{x:omega.x,y:omega.y,z:omega.z},
   swingIntent:normalizeSwingIntent(swingIntent),angularSpeed}
 }
}
export type BowlingPose=Omit<BowlingRelease,'type'|'source'|'id'> & {type:'BOWLING_POSE';holding:boolean;motion?:MotionDebug}
export function parseBowlingPose(value:unknown):BowlingPose|null {
 const m=value as BowlingPose|null
 if(!m||m.type!=='BOWLING_POSE'||typeof m.holding!=='boolean')return null
 const release=parseBowlingRelease({...m,type:'BOWLING_RELEASE',source:'TOUCH_RELEASE',id:1})
 if(!release)return null
 return {type:'BOWLING_POSE',timestamp:release.timestamp,calibrationId:release.calibrationId,
  orientation:release.orientation,angularVelocity:release.angularVelocity,angularSpeed:release.angularSpeed,holding:m.holding,swingIntent:release.swingIntent,
  target:release.target,...(m.motion&&['IDLE','READY','PREPARATION','MOTION_STARTED','COOLDOWN'].includes(m.motion.state)
   &&[m.motion.filtered,m.motion.peak,m.motion.paceMetric,m.motion.angle].every(Number.isFinite)
   &&Array.isArray(m.motion.history)&&m.motion.history.length<=60&&m.motion.history.every(Number.isFinite)
   &&(m.motion.releaseAt===null||Number.isFinite(m.motion.releaseAt))
   &&(!m.motion.gyro||[m.motion.gyro.x,m.motion.gyro.y,m.motion.gyro.z].every(Number.isFinite))?{motion:m.motion}:{})}
}
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n))
const dead=(n:number,zone:number)=>Math.abs(n)<zone?0:n-Math.sign(n)*zone
function angleControl(angle:number,deadzone:number,maxAngle:number) {
 const n=clamp((Math.abs(angle)-deadzone)/(maxAngle-deadzone),0,1)
 return n===0?0:Math.sign(angle)*Math.pow(n,T.ANGLE_RESPONSE)
}
export function bowlingParameters(release:BowlingRelease) {
 const q=release.orientation,forward=new Vector3(0,0,-1).applyQuaternion(new Quaternion(q.x,q.y,q.z,q.w).normalize())
 const yaw=clamp(Math.atan2(forward.x,-forward.z),-T.LINE_MAX_ANGLE,T.LINE_MAX_ANGLE)
 const pitch=clamp(Math.asin(clamp(forward.y,-1,1)),-T.LENGTH_MAX_ANGLE,T.LENGTH_MAX_ANGLE)
 const rawSpeed=release.angularSpeed??new Vector3(release.angularVelocity.x,release.angularVelocity.y,release.angularVelocity.z).length()
 const angularSpeed=clamp(Number.isFinite(rawSpeed)?rawSpeed:0,0,T.MOTION_MAX_RAD_S)
 const intensity=clamp(1-Math.exp(-Math.max(0,angularSpeed-T.MOTION_DEADZONE)/T.PACE_RESPONSE_RAD_S),0,1)
 // Orientation affects bounded release error, never replaces pitch intent.
 const lineInput=angleControl(yaw,T.LINE_DEADZONE,T.LINE_MAX_ANGLE)*T.LATERAL_CONTROL_SIGN || 0
 const lengthInput=angleControl(pitch,T.LENGTH_DEADZONE,T.LENGTH_MAX_ANGLE)
 const selectedTarget=clampBowlingTarget(release.target??defaultBowlingTarget())
 const lineError=lineInput*T.MAX_RELEASE_LINE_ERROR
 const lengthError=-lengthInput*T.MAX_RELEASE_LENGTH_ERROR
 const swingIntent=normalizeSwingIntent(release.swingIntent)
 const swingMagnitude=Math.min(T.MAX_USER_SWING,T.BASE_SELECTED_SWING+T.MOTION_SWING_CONTRIBUTION*intensity)
 const speed=T.PACE_MIN+(T.PACE_MAX-T.PACE_MIN)*intensity
 const bounceZ=clamp(selectedTarget.z+lengthError,T.MIN_PITCH_TARGET,T.MAX_PITCH_TARGET)
 const line=clamp(selectedTarget.x+lineError,-T.LINE_MAX_OFFSET,T.LINE_MAX_OFFSET)
 const flightTime=(bounceZ+18)/speed
 const swingAcceleration=swingWorldSign(swingIntent)*Math.min(swingMagnitude,2*T.MAX_PREBOUNCE_SWING_DISPLACEMENT/(flightTime*flightTime))
 return {source:release.source,orientation:release.orientation,angularSpeed,intensity,yaw,pitch,
  postDeadzoneYaw:dead(yaw,T.LINE_DEADZONE),postDeadzonePitch:dead(pitch,T.LENGTH_DEADZONE),lineInput,lengthInput,swingIntent,
  swingMagnitude:swingIntent==='NONE'?0:swingMagnitude,swingAcceleration,
  speed,line,bounceZ,selectedTarget,lineError,lengthError,
  spin:clamp(dead(release.angularVelocity.y,.25)*.25,-1.2,1.2)}
}
