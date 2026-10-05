import type { BowlerType, Variation } from './bowlingVariation'

export type Tactic = 'ATTACK_OFF_STUMP' | 'SWING_ATTACK' | 'YORKER_ATTACK' | 'SHORT_BALL_TRAP' | 'CHANNEL_PRESSURE'
  | 'ATTACK_STUMPS' | 'OUTSIDE_OFF_TRAP' | 'TURN_AWAY_PRESSURE' | 'TURN_IN_ATTACK' | 'FLIGHT_AND_DECEIVE' | 'BALANCED'
export const TACTICS: Record<BowlerType, Tactic[]> = {
  FAST: ['ATTACK_OFF_STUMP','SWING_ATTACK','YORKER_ATTACK','SHORT_BALL_TRAP','CHANNEL_PRESSURE','BALANCED'],
  SPIN: ['ATTACK_STUMPS','OUTSIDE_OFF_TRAP','TURN_AWAY_PRESSURE','TURN_IN_ATTACK','FLIGHT_AND_DECEIVE','BALANCED'],
}
const preferences: Partial<Record<Tactic, Partial<Record<Variation, number>>>> = {
  ATTACK_OFF_STUMP: {GOOD_LENGTH:2,FULL:1.4,OUTSWINGER:1.6},
  SWING_ATTACK: {INSWINGER:3,OUTSWINGER:3}, YORKER_ATTACK: {YORKER:7,FULL:1.7},
  SHORT_BALL_TRAP: {SHORT:2.5,BOUNCER:5}, CHANNEL_PRESSURE: {GOOD_LENGTH:2,OUTSWINGER:2},
  ATTACK_STUMPS: {STRAIGHTER:3,OFF_SPIN:1.5}, OUTSIDE_OFF_TRAP: {LEG_SPIN:2,FLIGHTED:1.4},
  TURN_AWAY_PRESSURE: {LEG_SPIN:3}, TURN_IN_ATTACK: {OFF_SPIN:3,STRAIGHTER:2},
  FLIGHT_AND_DECEIVE: {FLIGHTED:3,TOP_SPIN:2,STRAIGHTER:1.5},
}
export function tacticalWeight(tactic: Tactic | undefined, variation: Variation) {
  return tactic ? preferences[tactic]?.[variation] ?? 1 : 1
}
export function chooseTactic(type: BowlerType, random: () => number, recent: Tactic[]) {
  const options = TACTICS[type]
  const weights = options.map(p => recent.slice(-2).every(v => v === p) && recent.length >= 2 ? .05
    : recent[recent.length-1] === p ? .35 : 1)
  let draw = random() * weights.reduce((a,b) => a+b,0)
  for(let i=0;i<options.length;i++) { draw -= weights[i]; if(draw<0)return options[i] }
  return options[options.length-1]
}
