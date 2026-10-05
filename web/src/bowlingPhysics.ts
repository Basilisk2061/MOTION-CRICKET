import { Vector3 } from 'three'
import { wicketImpact, type WicketImpact } from './wicketImpact'
import { WICKET_PRESENTATION_HOLD_MS } from './wicketLifecycle'
import { deliveryRebound } from './deliveryBounce'
import type { bowlingParameters } from './bowlingController'
export type LabParameters=ReturnType<typeof bowlingParameters>
const GRAVITY=9.81,FLOOR=.056
export class BowlingPhysics {
 wicketImpact:WicketImpact|null=null
 position=new Vector3(0,2,-18)
 velocity=new Vector3()
 parameters:LabParameters|null=null
 state:'READY'|'FLIGHT'|'DONE'='READY'
 bounced=false
 hitStumps=false
 bouncePosition=new Vector3()
 wicketPlanePosition:Vector3|null=null
 swingDisplacement=0
 preBounceSwingDisplacement=0
 wicketSwingDisplacement:number|null=null
 releaseSpeed=0
 private swingVelocity=0
 private rebound=0
 private age=0
 private pause=0
 get ready(){return this.state==='READY'}
 get wicketHolding(){return !!this.wicketImpact&&this.state==='DONE'&&this.pause<WICKET_PRESENTATION_HOLD_MS/1000}
 release(p:LabParameters){
  if(!this.ready)return false
  const t1=(p.bounceZ+18)/p.speed
  this.position.set(0,2,-18)
  this.wicketImpact=null
  // Target is the BOUNCE point. Compensate deterministic pre-bounce swing;
  // the ball still curves, but arrives at the requested region.
  this.velocity.set((p.line-.5*p.swingAcceleration*t1*t1)/t1,(FLOOR-2+.5*GRAVITY*t1*t1)/t1,p.speed)
  this.rebound=deliveryRebound(this.velocity.y-GRAVITY*t1,p.speed,p.bounceZ)
  this.releaseSpeed=this.velocity.length()
  this.wicketPlanePosition=null;this.swingDisplacement=0;this.preBounceSwingDisplacement=0
  this.wicketSwingDisplacement=null;this.swingVelocity=0
  this.parameters=p;this.bounced=false;this.hitStumps=false;this.age=0;this.state='FLIGHT'
  return true
 }
 reset(){if(this.wicketHolding)return;this.state='READY';this.velocity.set(0,0,0);this.wicketImpact=null}
 step(dt:number){
  if(!Number.isFinite(dt)||dt<=0)return
  dt=Math.min(dt,.05)
  if(this.state==='DONE'){this.pause+=dt;if(this.pause>=(this.wicketImpact?WICKET_PRESENTATION_HOLD_MS/1000:1))this.reset();return}
  if(this.state!=='FLIGHT'||!this.parameters)return
  this.age+=dt
  const steps=Math.ceil(dt/(1/240)),h=dt/steps
  for(let i=0;i<steps && this.state==='FLIGHT';i++){
   let remaining=h
   const old=this.position.clone()
   const oldSwing=this.swingDisplacement
   if(!this.bounced && this.position.y+this.velocity.y*h-.5*GRAVITY*h*h<=FLOOR){
    const impact=Math.max(0,Math.min(h,(this.velocity.y+Math.sqrt(this.velocity.y*this.velocity.y+2*GRAVITY*(this.position.y-FLOOR)))/GRAVITY))
    this.advance(impact);this.position.y=FLOOR;this.bouncePosition.copy(this.position)
    this.preBounceSwingDisplacement=this.swingDisplacement
    this.bounced=true;this.velocity.y=this.rebound;this.velocity.x+=this.parameters.spin;remaining-=impact
   }
   this.advance(remaining)
   if(this.position.y<FLOOR){this.position.y=FLOOR;this.velocity.y=Math.abs(this.velocity.y)*.3;this.velocity.x*=.97;this.velocity.z*=.97;this.swingVelocity*=.97}
   if(old.z<=0 && this.position.z>=0){
    const t=(0-old.z)/(this.position.z-old.z),contact=old.clone().lerp(this.position,t)
    this.wicketPlanePosition=contact.clone();this.wicketSwingDisplacement=oldSwing+(this.swingDisplacement-oldSwing)*t
    if(Math.abs(contact.x)<=.18 && contact.y<=.76){
     this.wicketImpact=wicketImpact(contact,this.velocity,this.age,0,[-.105,0,.105])
     this.position.copy(contact);this.hitStumps=true;this.finish()
    }
   }
   if(this.position.z>3 || this.age>5)this.finish()
  }
 }
 private advance(dt:number){
  const acceleration=this.bounced?0:this.parameters?.swingAcceleration??0
  this.position.addScaledVector(this.velocity,dt);this.position.x+=.5*acceleration*dt*dt
  this.velocity.x+=acceleration*dt;this.position.y-=.5*GRAVITY*dt*dt;this.velocity.y-=GRAVITY*dt
  // Track the contribution of the applied force, not a second simulated ball.
  this.swingDisplacement+=this.swingVelocity*dt+.5*acceleration*dt*dt
  this.swingVelocity+=acceleration*dt
 }
 private finish(){this.state='DONE';this.pause=0;this.velocity.set(0,0,0)}
}
