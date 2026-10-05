import { LAB_TUNING as T } from './bowlingLabTuning'
import type { BowlingPhysics } from './bowlingPhysics'

export function lengthLabel(actualBounceZ:number) {
  return actualBounceZ>T.YORKER_LENGTH_LIMIT?'YORKER / VERY FULL':actualBounceZ>T.FULL_LENGTH_LIMIT?'FULL'
    :actualBounceZ>T.GOOD_LENGTH_LIMIT?'GOOD LENGTH':actualBounceZ>T.SHORT_LENGTH_LIMIT?'SHORT':'BOUNCER LENGTH'
}
export function lineLabel(actualX:number) {
  return Math.abs(actualX)<=T.LINE_MIDDLE_LIMIT?'MIDDLE':actualX< -T.LINE_STUMP_LIMIT?'OUTSIDE OFF'
    :actualX<0?'OFF STUMP':actualX<=T.LINE_STUMP_LIMIT?'LEG STUMP':'LEG SIDE'
}
export function bowlingFeedback(physics:BowlingPhysics) {
  if(!physics.parameters)return null
  const displacement=physics.preBounceSwingDisplacement
  const amount=Math.abs(displacement)
  const meaningful=amount>=T.SWING_VISIBLE_DISPLACEMENT
  const target=physics.parameters.selectedTarget
  const dx=physics.bouncePosition.x-target.x,dz=physics.bouncePosition.z-target.z
  const onTarget=(dx/T.LANDING_RADIUS_X)**2+(dz/T.LANDING_RADIUS_Z)**2<=1
  const accuracy=!physics.bounced?'AWAITING PITCH':onTarget?'ON TARGET':Math.abs(dz)/T.LANDING_RADIUS_Z>=Math.abs(dx)/T.LANDING_RADIUS_X
    ?dz>0?'TOO FULL':'TOO SHORT':dx<0?'WIDE OF TARGET (OFF)':'WIDE OF TARGET (LEG)'
  return {speed:physics.releaseSpeed,kmh:physics.releaseSpeed*T.SIM_KMH_PER_UNIT_S,
    line:physics.wicketPlanePosition?lineLabel(physics.wicketPlanePosition.x):'AWAITING STUMPS',
    length:physics.bounced?lengthLabel(physics.bouncePosition.z):'AWAITING PITCH',
    swing:!meaningful?'NONE':displacement>0?'INSWING':'OUTSWING',
    swingAmount:!meaningful?'NONE':amount<T.SWING_NORMAL_DISPLACEMENT?'SUBTLE':amount<T.SWING_STRONG_DISPLACEMENT?'NORMAL':'STRONG',
    pitchDistance:physics.bounced?-physics.bouncePosition.z:null,displacement,
    intendedLine:lineLabel(target.x),intendedLength:lengthLabel(target.z),accuracy,targetError:physics.bounced?Math.hypot(dx,dz):null,
    bounceLine:physics.bounced?lineLabel(physics.bouncePosition.x):'AWAITING PITCH'}
}
