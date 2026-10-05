import { LAB_TUNING as T } from './bowlingLabTuning'
export type BowlingTarget={x:number;z:number}
export const defaultBowlingTarget=():BowlingTarget=>({x:T.DEFAULT_TARGET_X,z:T.DEFAULT_TARGET_Z})
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n))
export function clampBowlingTarget(target:BowlingTarget):BowlingTarget {
 return {x:clamp(Number.isFinite(target.x)?target.x:T.DEFAULT_TARGET_X,-T.LINE_MAX_OFFSET,T.LINE_MAX_OFFSET),
  z:clamp(Number.isFinite(target.z)?target.z:T.DEFAULT_TARGET_Z,T.MIN_PITCH_TARGET,T.MAX_PITCH_TARGET)}
}
// Bowler view matches the laptop camera: screen left = world +X (LEG).
// Far/top is the batsman; near/bottom is the bowler.
export function pitchTapTarget(u:number,v:number):BowlingTarget {
 return clampBowlingTarget({x:(1-u*2)*T.LINE_MAX_OFFSET,z:T.MAX_PITCH_TARGET-v*(T.MAX_PITCH_TARGET-T.MIN_PITCH_TARGET)})
}
export function pitchTargetUV(target:BowlingTarget){
 const p=clampBowlingTarget(target)
 return {u:(1-p.x/T.LINE_MAX_OFFSET)/2,v:(T.MAX_PITCH_TARGET-p.z)/(T.MAX_PITCH_TARGET-T.MIN_PITCH_TARGET)}
}
