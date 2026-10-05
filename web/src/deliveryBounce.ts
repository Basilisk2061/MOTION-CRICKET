import { DELIVERY } from './gameplayTuning'
export const DELIVERY_BOUNCE={BASE:.35,LENGTH_SHARE:.36,PACE_SHARE:.12,PACE_MIN:11,PACE_MAX:24,
 LENGTH_METRES:9,MAX_RESTITUTION:.92,HORIZONTAL_KICK:.18,MAX_VERTICAL:6.4,TOP_SPIN_MULTIPLIER:1.10} as const
export const SPIN_PITCH={OFF_SPIN:2.8,LEG_SPIN:2.8,TOP_SPIN:3.6,STRAIGHTER:2.4,FLIGHTED:2.3} as const
// Pitch incidence and pace supply rebound energy. Length changes restitution
// continuously; arrival height is then ordinary ballistic flight, not a target.
export function deliveryRebound(incomingY:number,pace:number,bounceZ:number,topSpin=false,spin?:keyof typeof SPIN_PITCH,spinStrength=0){
 const distance=Math.max(0,-.65-bounceZ),u=Math.min(1,distance/DELIVERY_BOUNCE.LENGTH_METRES)
 const length=u*u*(3-2*u),power=Math.max(0,Math.min(1,(pace-DELIVERY_BOUNCE.PACE_MIN)/(DELIVERY_BOUNCE.PACE_MAX-DELIVERY_BOUNCE.PACE_MIN)))
 const restitution=Math.min(DELIVERY_BOUNCE.MAX_RESTITUTION,DELIVERY_BOUNCE.BASE+DELIVERY_BOUNCE.LENGTH_SHARE*length+DELIVERY_BOUNCE.PACE_SHARE*power)
 const energy=Math.hypot(Math.max(0,-incomingY),pace*DELIVERY_BOUNCE.HORIZONTAL_KICK)
 const rebound=Math.min(DELIVERY_BOUNCE.MAX_VERTICAL,energy*restitution*(topSpin?DELIVERY_BOUNCE.TOP_SPIN_MULTIPLIER:1))
 if(!spin)return rebound
 // Rotational pitch response supplements impact energy, not a forced arrival Y.
 // Longer lengths engage more bite; flighted keeps a gentler response than top-spin.
 const bite=(SPIN_PITCH[spin]+.12*Math.min(4.2,Math.abs(spinStrength)))*(.65+.65*length)
 return Math.min(5.4,Math.hypot(rebound,bite))
}
export function reboundHeight(floor:number,rebound:number,time:number){return floor+rebound*time-.5*DELIVERY.gravity*time*time}
