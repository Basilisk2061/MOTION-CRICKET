import { Vector3 } from 'three'
import { WICKET_VISUAL as T, type WicketImpact } from './wicketImpact'
export type WicketPiece={position:Vector3;rotation:Vector3;velocity:Vector3;angularVelocity:Vector3;linearImpulse:Vector3;angularImpulse:Vector3;attached:boolean;strength:number}
const piece=(x:number,y=0):WicketPiece=>({position:new Vector3(x,y,0),rotation:new Vector3(),velocity:new Vector3(),angularVelocity:new Vector3(),linearImpulse:new Vector3(),angularImpulse:new Vector3(),attached:true,strength:0})
export class WicketPresentation {
 stumps:WicketPiece[]=[];bails:WicketPiece[]=[];elapsed=0;impact:WicketImpact|null=null
 constructor(readonly x:readonly number[]=T.X,readonly bailHeight:number=T.BAIL_HEIGHT){this.reset()}
 reset(){this.stumps=this.x.map(x=>piece(x));this.bails=[piece((this.x[0]+this.x[1])/2,this.bailHeight),piece((this.x[1]+this.x[2])/2,this.bailHeight)];this.impact=null;this.elapsed=0}
 accept(event:WicketImpact|null,sound:(speed:number,strength:number)=>void=()=>{}){
  if(!event||event===this.impact)return false
  this.reset();this.impact=event
  const direction=new Vector3(event.impactDirection.x,0,event.impactDirection.z).normalize()
  const primary=this.stumps[event.struckStump],power=event.strength
  this.stumps.forEach((stump,i)=>{
   const s=i===event.struckStump?power:power>=T.HARD?power*.13:0
   stump.strength=s;stump.velocity.copy(direction).multiplyScalar(s*.32)
   stump.velocity.y=s>=T.HARD?.12:0
   const turn=s*(3+2*Math.max(0,1-event.impactHeight/.71))
   stump.angularVelocity.set(direction.z*turn,0,-direction.x*turn)
   stump.linearImpulse.copy(stump.velocity);stump.angularImpulse.copy(stump.angularVelocity)
  })
  this.bails.forEach((bail,i)=>{
   const supported=i===event.struckStump||i+1===event.struckStump
   if(!supported&&power<T.HARD)return
   bail.attached=false;bail.velocity.copy(direction).multiplyScalar(.15+power*.55)
   bail.velocity.x+=(i===0?-1:1)*power*.08;bail.velocity.y=.8+power*1.2
   bail.angularVelocity.set(direction.z*(3+power*5),power*2,-direction.x*(3+power*5)+(i===0?-1:1)*power*2)
  })
  if(primary.strength>0)sound(event.speed,power)
  return true
 }
 step(dt:number){
  if(!this.impact||!Number.isFinite(dt)||dt<=0)return
  dt=Math.min(dt,.05);const count=Math.ceil(dt/(1/120)),h=dt/count
  for(let n=0;n<count;n++){
   this.elapsed+=h
   this.stumps.forEach(stump=>{
    if(!stump.strength)return
    stump.position.addScaledVector(stump.velocity,h);stump.velocity.y-=T.GRAVITY*h
    if(stump.position.y<0){stump.position.y=0;stump.velocity.y=0}
    stump.velocity.multiplyScalar(Math.exp(-4*h))
    const angle=Math.hypot(stump.rotation.x,stump.rotation.z)
    if(stump.strength<T.LIGHT){stump.angularVelocity.addScaledVector(stump.rotation,-18*h);stump.angularVelocity.multiplyScalar(Math.exp(-7*h))}
    else if(angle>0&&angle<1.46)stump.angularVelocity.addScaledVector(stump.rotation,4*Math.sin(angle)/angle*h)
    stump.rotation.addScaledVector(stump.angularVelocity,h)
    const tilt=Math.hypot(stump.rotation.x,stump.rotation.z),limit=stump.strength<T.LIGHT?.32:1.46
    if(tilt>limit){stump.rotation.multiplyScalar(limit/tilt);stump.angularVelocity.set(0,0,0)}
   })
   this.bails.forEach(bail=>{
    if(bail.attached)return
    bail.position.addScaledVector(bail.velocity,h);bail.velocity.y-=T.GRAVITY*h;bail.rotation.addScaledVector(bail.angularVelocity,h)
    if(bail.position.y<.012){bail.position.y=.012;bail.velocity.y=Math.abs(bail.velocity.y)<.2?0:-bail.velocity.y*.18;bail.velocity.multiplyScalar(Math.exp(-9*h));bail.angularVelocity.multiplyScalar(Math.exp(-9*h))}
   })
  }
 }
 cameraOffset(){
  if(!this.impact||this.elapsed>=T.CAMERA_SECONDS)return new Vector3()
  const wave=Math.sin(this.elapsed/T.CAMERA_SECONDS*Math.PI*2)*(1-this.elapsed/T.CAMERA_SECONDS)*T.CAMERA_MAX*this.impact.strength
  return new Vector3(wave*.3,wave,0)
 }
}
