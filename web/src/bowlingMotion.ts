export const MOTION_TUNING={HISTORY_MS:300,ARM_GUARD_MS:150,QUIET_RAD_S:1.2,QUIET_MS:80,
 ONSET_RAD_S:1.8,ONSET_MS:70,ONSET_SAMPLES:3,MIN_PEAK:2.2,MIN_ANGLE:.40,
 MIN_ACTION_MS:120,MIN_COHERENCE:.45,DECEL_RATIO:.72,DECEL_MS:25,DECEL_SAMPLES:2,MAX_ACTION_MS:1800,
 PREP_RAD_S:.8,PREP_MS:60,PREP_SAMPLES:3,PREP_ANGLE:.08,PREP_COHERENCE:.8,
 REVERSAL_DOT:-.5,REVERSAL_MS:40,REVERSAL_SAMPLES:3,FORWARD_ONLY_QUIET_MS:600,
 MAX_GAP_MS:150,MAX_RAD_S:40,PACE_PERCENTILE:.75} as const
type Vec={x:number;y:number;z:number}
export type BowlingMotionState='IDLE'|'READY'|'PREPARATION'|'MOTION_STARTED'|'COOLDOWN'
export type MotionDebug={state:BowlingMotionState;filtered:number;peak:number;paceMetric:number;angle:number;history:number[];releaseAt:number|null;gyro?:Vec;coherence?:number;direction?:Vec;preparationDirection?:Vec|null;directionDot?:number|null;preparationPeak?:number;preparationAngle?:number;reversal?:boolean;forwardOnly?:boolean;paceSamples?:number[]}
const median=(values:number[])=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)]
export class BowlingMotion {
 state:BowlingMotionState='IDLE'
 filtered=0;peak=0;paceMetric=0;angle=0;releaseAt:number|null=null
 private at=-Infinity;private armedAt=0;private quietAt:number|null=null;private settled=false
 private onsetAt:number|null=null;private onsetCount=0;private startedAt=0;private decelAt:number|null=null;private decelCount=0
 private history:{at:number;speed:number}[]=[];private action:number[]=[]
 private turn={x:0,y:0,z:0}
 private vectors:Vec[]=[];private direction:Vec={x:0,y:0,z:0};private filteredGyro:Vec={x:0,y:0,z:0}
 private preparationDirection:Vec|null=null;private preparationPeak=0;private preparationAngle=0
 private prepTurn:Vec={x:0,y:0,z:0};private reverseAt:number|null=null;private reverseCount=0
 private earlyMotion=false;private fallback=false;private forwardOnly=false;private reversal=false
 private get directionDot(){const p=this.preparationDirection;return p?this.direction.x*p.x+this.direction.y*p.y+this.direction.z*p.z:null}
 arm(at:number){this.cancel();this.state='READY';this.armedAt=at}
 cancel(){this.state='IDLE';this.at=-Infinity;this.history=[];this.action=[];this.filtered=0;this.peak=0;
  this.paceMetric=0;this.angle=0;this.turn={x:0,y:0,z:0};this.releaseAt=null;this.quietAt=null;this.settled=false;this.onsetAt=null;this.onsetCount=0;this.decelAt=null;this.decelCount=0;
  this.vectors=[];this.direction={x:0,y:0,z:0};this.filteredGyro={x:0,y:0,z:0};this.preparationDirection=null;this.preparationPeak=0;this.preparationAngle=0;this.prepTurn={x:0,y:0,z:0};this.reverseAt=null;this.reverseCount=0;this.earlyMotion=false;this.fallback=false;this.forwardOnly=false;this.reversal=false}
 private forward(at:number,fallback=false){
  this.state='MOTION_STARTED';this.startedAt=at;this.forwardOnly=fallback;this.reversal=!fallback;
  // Discard preparation pace, rotation and deceleration history.
  this.action=[];this.angle=0;this.peak=0;this.turn={x:0,y:0,z:0};this.decelAt=null;this.decelCount=0
 }
 update(speed:number,at:number,gyro?:{x:number;y:number;z:number}):number|null {
  if(!Number.isFinite(speed)||!Number.isFinite(at)||at<=this.at||gyro&&![gyro.x,gyro.y,gyro.z].every(Number.isFinite))return null
  const gap=at-this.at,dt=Number.isFinite(gap)?Math.min(gap/1000,.05):0;this.at=at
  if(this.state==='IDLE'||this.state==='COOLDOWN')return null
  if(gap>MOTION_TUNING.MAX_GAP_MS&&this.history.length){this.arm(at);this.at=at}
  speed=Math.max(0,Math.min(speed,MOTION_TUNING.MAX_RAD_S))
  if(speed>=MOTION_TUNING.PREP_RAD_S&&at-this.armedAt<MOTION_TUNING.ARM_GUARD_MS)this.earlyMotion=true
  this.vectors.push(gyro?{...gyro}:{x:speed,y:0,z:0});this.vectors=this.vectors.slice(-3)
  this.history.push({at,speed});this.history=this.history.filter(s=>at-s.at<=MOTION_TUNING.HISTORY_MS).slice(-60)
  if(this.history.length<3)return null
  this.filtered=median(this.history.slice(-3).map(s=>s.speed))
  this.filteredGyro={x:median(this.vectors.map(v=>v.x)),y:median(this.vectors.map(v=>v.y)),z:median(this.vectors.map(v=>v.z))}
  const norm=Math.hypot(this.filteredGyro.x,this.filteredGyro.y,this.filteredGyro.z)
  this.direction=norm>1e-8?{x:this.filteredGyro.x/norm,y:this.filteredGyro.y/norm,z:this.filteredGyro.z/norm}:{x:0,y:0,z:0}
  if(this.state==='READY'){
   if(this.filtered<=MOTION_TUNING.QUIET_RAD_S){
    this.quietAt??=at
    if(at-this.quietAt>=MOTION_TUNING.QUIET_MS)this.settled=true
   }
   if(!this.settled||at-this.armedAt<MOTION_TUNING.ARM_GUARD_MS)return null
   if(this.filtered<MOTION_TUNING.PREP_RAD_S){this.onsetAt=null;this.onsetCount=0;this.preparationAngle=0;this.prepTurn={x:0,y:0,z:0};return null}
   if(this.onsetAt===null){this.onsetAt=at;this.fallback=!this.earlyMotion&&this.quietAt!==null&&at-this.quietAt>=MOTION_TUNING.FORWARD_ONLY_QUIET_MS}
   this.onsetCount++;this.preparationAngle+=this.filtered*dt;this.preparationPeak=Math.max(this.preparationPeak,this.filtered)
   this.prepTurn.x+=this.direction.x*this.filtered*dt;this.prepTurn.y+=this.direction.y*this.filtered*dt;this.prepTurn.z+=this.direction.z*this.filtered*dt
   const n=Math.hypot(this.prepTurn.x,this.prepTurn.y,this.prepTurn.z)
   if(n/this.preparationAngle<MOTION_TUNING.PREP_COHERENCE){this.onsetAt=null;this.onsetCount=0;this.preparationAngle=0;this.prepTurn={x:0,y:0,z:0};return null}
   if(this.onsetCount<MOTION_TUNING.PREP_SAMPLES||at-this.onsetAt<MOTION_TUNING.PREP_MS||this.preparationAngle<MOTION_TUNING.PREP_ANGLE)return null
   this.preparationDirection={x:this.prepTurn.x/n,y:this.prepTurn.y/n,z:this.prepTurn.z/n};this.state='PREPARATION';this.startedAt=at
   if(this.fallback)this.forward(at,true)
   return null
  }
  if(this.state==='PREPARATION'){
   if(at-this.startedAt>MOTION_TUNING.MAX_ACTION_MS){this.arm(at);return null}
   if(this.filtered>=MOTION_TUNING.ONSET_RAD_S&&(this.directionDot??1)<=MOTION_TUNING.REVERSAL_DOT){
    this.reverseAt??=at;this.reverseCount++
    if(this.reverseCount>=MOTION_TUNING.REVERSAL_SAMPLES&&at-this.reverseAt>=MOTION_TUNING.REVERSAL_MS)this.forward(at)
   }else{this.reverseAt=null;this.reverseCount=0;this.preparationPeak=Math.max(this.preparationPeak,this.filtered);this.preparationAngle+=this.filtered*dt}
   return null
  }
  if(!this.forwardOnly&&this.filtered>MOTION_TUNING.QUIET_RAD_S&&(this.directionDot??-1)>0){this.state='PREPARATION';this.startedAt=at;this.reverseAt=null;this.reverseCount=0;return null}
  {
   this.action.push(this.filtered);this.action=this.action.slice(-120)
   this.angle+=this.filtered*dt;this.peak=Math.max(this.peak,this.filtered)
   this.turn.x+=this.direction.x*this.filtered*dt;this.turn.y+=this.direction.y*this.filtered*dt;this.turn.z+=this.direction.z*this.filtered*dt
  }
  if(at-this.startedAt>MOTION_TUNING.MAX_ACTION_MS){this.arm(at);return null}
  if(this.peak<MOTION_TUNING.MIN_PEAK||this.angle<MOTION_TUNING.MIN_ANGLE||at-this.startedAt<MOTION_TUNING.MIN_ACTION_MS)return null
  if(this.filtered<=this.peak*MOTION_TUNING.DECEL_RATIO){
   this.decelAt??=at;this.decelCount++
   if(this.decelCount>=MOTION_TUNING.DECEL_SAMPLES&&at-this.decelAt>=MOTION_TUNING.DECEL_MS&&this.coherence>=MOTION_TUNING.MIN_COHERENCE){
    const sorted=this.action.slice().sort((a,b)=>a-b)
    this.paceMetric=sorted[Math.floor((sorted.length-1)*MOTION_TUNING.PACE_PERCENTILE)]??0
    this.releaseAt=at;this.state='COOLDOWN';return this.paceMetric
   }
  }else{this.decelAt=null;this.decelCount=0}
  return null
 }
 get coherence(){return this.angle>0?Math.min(1,Math.hypot(this.turn.x,this.turn.y,this.turn.z)/this.angle):0}
 debug():MotionDebug{return {state:this.state,filtered:this.filtered,peak:this.peak,paceMetric:this.paceMetric,coherence:this.coherence,
  angle:this.angle,history:this.history.map(s=>s.speed),releaseAt:this.releaseAt,gyro:{...this.filteredGyro},direction:{...this.direction},preparationDirection:this.preparationDirection,directionDot:this.directionDot,preparationPeak:this.preparationPeak,preparationAngle:this.preparationAngle,reversal:this.reversal,forwardOnly:this.forwardOnly,paceSamples:this.action.slice()}}
}
