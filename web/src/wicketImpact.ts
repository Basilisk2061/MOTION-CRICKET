import { Vector3 } from 'three'
export const WICKET_VISUAL={X:[-.095,0,.095],HEIGHT:.71,BAIL_HEIGHT:.723,RADIUS:.019,
 LIGHT:.30,HARD:.70,MAX_SPEED:28,GRAVITY:9.81,CAMERA_SECONDS:.09,CAMERA_MAX:.008} as const
export type WicketImpact={position:Vector3;ballVelocity:Vector3;speed:number;struckStump:number;
 impactHeight:number;impactDirection:Vector3;timestamp:number;strength:number}
// Called only AFTER an authoritative collision succeeds; this is not a detector.
export function wicketImpact(position:Vector3,velocity:Vector3,timestamp:number,ground=0,x:readonly number[]=WICKET_VISUAL.X):WicketImpact {
 const speed=velocity.length(),struckStump=x.reduce((best,value,i)=>Math.abs(position.x-value)<Math.abs(position.x-x[best])?i:best,0)
 const centrality=Math.max(0,1-Math.abs(position.x-x[struckStump])/(WICKET_VISUAL.RADIUS+.056))
 return {position:position.clone(),ballVelocity:velocity.clone(),speed,struckStump,impactHeight:position.y-ground,
  impactDirection:velocity.clone().normalize(),timestamp,strength:Math.max(.12,Math.min(1,speed/WICKET_VISUAL.MAX_SPEED*(.35+.65*centrality)))}
}
