import { Vector3 } from 'three'
import { edgeIntercept, normalDeliveryIntercept, KEEPER_REACH } from './keeperInterception'

export type KeeperState = 'READY'|'TRACKING'|'MOVING'|'CATCH_ATTEMPT'|'DIVE_LEFT'|'DIVE_RIGHT'|'LOW_STOP'|'RECOVER'
export type KeeperBall = { position:Vector3; velocity:Vector3; released:boolean; visible:boolean; outcome:'HIT'|'MISSED'|null; state:string; match?:{held:boolean;stopped:boolean}; fieldingHeld?:boolean; fieldingReturn?:boolean;
  bounced?:boolean; bounceResponse?:number; plan?:{flightGravity:number;swingAcceleration:number;spinImpulse:number;forwardImpulse:number}|null }
export const KEEPER={z:3.4,gloveZ:2.92,diveThreshold:.75,maxShift:2.2,speed:3.8,maxBackward:2.5,maxForward:.8,reactionSeconds:.20,holdSeconds:.55,recoverySeconds:.85}
const home=new Vector3(0,0,KEEPER.z)
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n))
function predict(ball:KeeperBall,time:number) {
  const p=ball.position.clone().addScaledVector(ball.velocity,time)
  if(ball.position.y>.08)p.y-=.5*9.81*time*time
  p.y=Math.max(.056,p.y)
  return p
}
export function keeperIntercept(ball:KeeperBall,position=home) {
  if(!ball.released||!ball.visible||ball.fieldingHeld||ball.fieldingReturn||ball.velocity.lengthSq()<.0001)return null
  const time=(KEEPER.gloveZ-ball.position.z)/ball.velocity.z
  if(time>=0 && time<=1.1) {
    const point=predict(ball,time)
    if(Math.abs(point.x)<=.55 && point.y<=1.7)
      return {time,point,body:home.clone()}
  }
  for(let time=.05;time<=1.1;time+=.05) {
    const point=predict(ball,time)
    if(Math.abs(point.x)>2.2||point.z<2.1||point.z>6.0||point.y>1.7)continue
    const body=new Vector3(clamp(point.x-Math.sign(point.x)*.4,-2.2,2.2),0,clamp(point.z+.48,2.6,5.9))
    const distance=body.distanceTo(position)
    if(distance<=KEEPER.speed*Math.max(0,time-.08)+.08)return {time,point,body}
  }
  return null
}
export class KeeperPresentation {
  state:KeeperState='READY'
  position=home.clone()
  actionCenter=new Vector3(0,.9,KEEPER.z)
  reach=new Vector3(0,.56,KEEPER.gloveZ)
  tilt=0
  crouch=0
  private age=0
  private finished=false
  private contactAge=0
  private diveAge=0
  private diveCommitted=false
  catchActive=false
  mode: 'IDLE'|'NORMAL_KEEPING'|'EDGE_REACTION'='IDLE'
  update(ball:KeeperBall,dt:number) {
    dt=Math.max(0,Math.min(dt,.05))
    this.catchActive=false
    const done=ball.state==='READY'||ball.state==='COMPLETE'||!!ball.match?.stopped||!!ball.fieldingHeld
    const mode=done?'IDLE':ball.outcome==='HIT'?'EDGE_REACTION':'NORMAL_KEEPING'
    if(mode!==this.mode) {
      this.contactAge=0;this.diveAge=0;this.diveCommitted=false
      if(mode!=='IDLE')this.state='TRACKING'
      this.mode=mode
    }
    this.contactAge=this.mode==='EDGE_REACTION'?this.contactAge+dt:0
    if(done){this.diveCommitted=false;this.diveAge=0}
    if(done) {
      this.age=this.finished?this.age+dt:0;this.finished=true
      this.state=ball.state==='READY'?'RECOVER':this.age<KEEPER.holdSeconds?'CATCH_ATTEMPT':'RECOVER'
    } else {this.finished=false;this.age=0}
    const intercept=done?null:this.mode==='NORMAL_KEEPING'?normalDeliveryIntercept(ball,this.position,
      !this.diveCommitted||this.diveAge<KEEPER_REACH.diveSeconds)
      :edgeIntercept(ball,this.position,Math.max(0,KEEPER_REACH.reaction-this.contactAge),
      this.diveCommitted&&this.diveAge<KEEPER_REACH.diveSeconds,
      !this.diveCommitted||this.diveAge<KEEPER_REACH.diveSeconds)
    let body=this.position.clone(),target=this.reach.clone()
    if(this.state==='RECOVER') {body.copy(home);target.set(0,.56,KEEPER.gloveZ)}
    else if(intercept && (this.mode==='NORMAL_KEEPING'||this.contactAge>=KEEPER_REACH.reaction)) {
      if(intercept.dive)this.diveCommitted=true
      body.copy(intercept.body);target.copy(intercept.point)
      this.state=intercept.dive?target.x<0?'DIVE_LEFT':'DIVE_RIGHT'
        :target.y<.4?'LOW_STOP':body.distanceTo(this.position)>.08?'MOVING':'CATCH_ATTEMPT'
      this.catchActive=true
    } else if(!done) {
      this.state='TRACKING'
      this.catchActive=this.mode==='NORMAL_KEEPING'&&ball.outcome==='MISSED'
      if(ball.position.z>6.4 || ball.velocity.z<-.1) {this.state='RECOVER';body.copy(home);target.set(0,.56,KEEPER.gloveZ)}
    }
    const recovering=this.state==='RECOVER'
    const diving=this.state==='DIVE_LEFT'||this.state==='DIVE_RIGHT'
    this.diveAge=this.diveCommitted?this.diveAge+dt:0
    const speed=recovering?2.5:diving&&this.diveAge<=KEEPER_REACH.diveSeconds?KEEPER_REACH.diveSpeed:KEEPER.speed
    this.position.add(body.sub(this.position).clampLength(0,speed*dt))
    const arm=diving?KEEPER_REACH.diveArm:KEEPER_REACH.standingArm
    target.x=clamp(target.x,this.position.x-arm,this.position.x+arm)
    target.z=clamp(target.z,this.position.z-.65,this.position.z+.65)
    target.y=clamp(target.y,KEEPER_REACH.minHeight,KEEPER_REACH.maxHeight)
    this.reach.lerp(target,1-Math.exp(-dt/.065))
    const dive=this.state==='DIVE_LEFT'||this.state==='DIVE_RIGHT'
    this.tilt+=( (dive?-Math.sign(target.x-this.position.x)*.8:0)-this.tilt)*(1-Math.exp(-dt/.12))
    this.crouch+=((target.y<.4?.25:dive?.2:0)-this.crouch)*(1-Math.exp(-dt/.12))
    this.actionCenter.set(this.position.x,.85-this.crouch,this.position.z)
    if(ball.state==='READY'&&this.position.distanceTo(home)<.01)this.state='READY'
  }
}
