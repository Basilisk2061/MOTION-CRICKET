import { Vector3 } from 'three'
import type { KeeperBall } from './keeperPresentation'
export const KEEPER_REACH = { reaction: .14, moveSpeed: 3.8, diveSpeed: 5.8,
  standingShift: 1.45, diveShift: 2.5, standingArm: .55, diveArm: 1.05,
  minHeight: .12, maxHeight: 2.05, diveSeconds: .55, cleanSpeed: 22, diveCleanSpeed: 18 }
export function predictKeeperPoint(ball: KeeperBall, time: number) {
  const p=ball.position.clone().addScaledVector(ball.velocity,time)
  if(ball.position.y>.08)p.y-=.5*9.81*time*time
  p.y=Math.max(.056,p.y)
  return p
}
export function edgeIntercept(ball: KeeperBall, body: Vector3, reactionRemaining: number, forceDive=false, allowDive=true) {
  if(ball.outcome!=='HIT'||!ball.released||!ball.visible||ball.fieldingHeld||ball.fieldingReturn||ball.velocity.z<=.1)return null
  // Search a bounded behind-wicket region using only the observed post-hit velocity.
  let attempt: {point:Vector3;body:Vector3;time:number;dive:boolean;reachable:boolean} | null=null
  for(let z=2.65;z<=5.2;z+=.10){
    const time=(z-ball.position.z)/ball.velocity.z
    if(time<0||time>1.1)continue
    const point=predictKeeperPoint(ball,time)
    // Gloves at .12 can reach the .056 ball center without enlarging their radius.
    if(point.y<.056||point.y>KEEPER_REACH.maxHeight)continue
    const gap=Math.abs(point.x-body.x),dive=allowDive&&(forceDive||gap>.75)
    const arm=dive?KEEPER_REACH.diveArm:KEEPER_REACH.standingArm
    const shift=dive?KEEPER_REACH.diveShift:KEEPER_REACH.standingShift
    const x=Math.max(-shift,Math.min(shift,point.x-Math.sign(point.x-body.x)*arm))
    const target=new Vector3(x,0,z+.48)
    const available=Math.max(0,time-reactionRemaining)
    const reachable=target.distanceTo(body)<=(dive?KEEPER_REACH.diveSpeed:KEEPER_REACH.moveSpeed)*available
      && Math.abs(point.x-x)<=arm && (!dive||available<=KEEPER_REACH.diveSeconds)
    const candidate={point,body:target,time,dive,reachable}
    if(!attempt)attempt=candidate
    if(reachable)return candidate
  }
  return attempt
}

export function normalDeliveryIntercept(ball: KeeperBall, body: Vector3, allowDive=true) {
  if(ball.outcome==='HIT'||!ball.released||!ball.visible||ball.fieldingHeld||ball.fieldingReturn
    ||ball.match?.stopped||ball.velocity.z<=.1)return null
  // Forecast the visible incoming delivery, including its pending pitch bounce.
  // Never reuse this forecast after bat contact.
  const point=ball.position.clone(),velocity=ball.velocity.clone()
  let bounced=ball.bounced??true
  let attempt: ReturnType<typeof edgeIntercept>=null
  let diveAttempt: ReturnType<typeof edgeIntercept>=null
  const step=1/120
  for(let time=step;time<=1.1;time+=step) {
    const preBounce=!bounced&&!ball.outcome
    const gravity=preBounce?ball.plan?.flightGravity??9.81:9.81
    const swing=preBounce?ball.plan?.swingAcceleration??0:0
    point.x+=velocity.x*step+.5*swing*step*step
    point.y+=velocity.y*step-.5*gravity*step*step
    point.z+=velocity.z*step
    velocity.x+=swing*step;velocity.y-=gravity*step
    if(point.y<=.056) {
      point.y=.056
      if(!bounced) {
        velocity.y=Math.abs(velocity.y)*(ball.bounceResponse??.60)
        if(!ball.outcome) {
          velocity.x+=ball.plan?.spinImpulse??0
          velocity.z+=ball.plan?.forwardImpulse??0
        }
        bounced=true
      } else {
        velocity.y=0
        velocity.x*=Math.exp(-step);velocity.z*=Math.exp(-step)
      }
    }
    if(point.z>5.2)break
    if(point.z<2.65||point.y>KEEPER_REACH.maxHeight)continue
    for(const dive of [false,true]) {
      if(dive&&!allowDive)continue
      const arm=dive?KEEPER_REACH.diveArm:KEEPER_REACH.standingArm
      const shift=dive?KEEPER_REACH.diveShift:KEEPER_REACH.standingShift
      const x=Math.max(-shift,Math.min(shift,point.x-Math.sign(point.x-body.x)*arm))
      const target=new Vector3(x,0,point.z+.48)
      const reachable=target.distanceTo(body)<=(dive?KEEPER_REACH.diveSpeed:KEEPER_REACH.moveSpeed)*time
        &&Math.abs(point.x-x)<=arm&&(!dive||time<=KEEPER_REACH.diveSeconds)
      const candidate={point:point.clone(),body:target,time,dive,reachable}
      if(!dive&&!attempt)attempt=candidate
      if(reachable&&!dive)return candidate // Prefer a shuffle over an unnecessary dive.
      if(reachable&&dive&&!diveAttempt)diveAttempt=candidate
    }
  }
  return diveAttempt??attempt
}
