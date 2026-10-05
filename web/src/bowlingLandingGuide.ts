import { BowlingPhysics, type LabParameters } from './bowlingPhysics'
import { LAB_TUNING as T } from './bowlingLabTuning'
// Same deterministic trajectory as the real Lab ball, including swing and spin.
export function bowlingLandingGuide(parameters:LabParameters){
 const simulation=new BowlingPhysics()
 simulation.release(parameters)
 for(let i=0;i<1200&&!simulation.bounced&&simulation.state==='FLIGHT';i++)simulation.step(1/240)
 return {center:simulation.bouncePosition.clone(),radiusX:T.LANDING_RADIUS_X,radiusZ:T.LANDING_RADIUS_Z}
}
export function playableDelivery(parameters:LabParameters){
 return Math.abs(parameters.line)<=.35&&parameters.bounceZ>=-7.2&&parameters.bounceZ<=-2.2
}
