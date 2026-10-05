import { Vector3 } from 'three'
import type { FieldingController, FielderRole } from './fielding'
import type { BowlerType } from './bowlingVariation'
import type { Tactic } from './bowlingTactics'

type Placement = [FielderRole, number, number]
export const FORMATIONS = {
 FAST_ATTACKING: [['SLIP',-1.8,4.8],['GULLY',-5,2],['POINT',-11,-4],['COVER',-12,-12],['MID_OFF',-7,-20],['MID_ON',7,-20],['SQUARE_LEG',13,-3],['FINE_LEG',13,12],['DEEP_COVER',-25,-20]],
 FAST_SWING: [['SLIP',-1.8,5],['SECOND_SLIP',-3.3,4.4],['GULLY',-6,1],['POINT',-12,-5],['COVER',-12,-14],['MID_OFF',-7,-20],['MID_ON',7,-20],['SQUARE_LEG',14,-4],['FINE_LEG',14,14]],
 FAST_SHORT_BALL: [['SLIP',-2,5],['POINT',-13,-5],['COVER',-13,-14],['MID_OFF',-8,-22],['MID_ON',8,-22],['SQUARE_LEG',12,-2],['DEEP_SQUARE',29,-5],['FINE_LEG',19,16],['DEEP_MID_WICKET',25,-20]],
 FAST_BALANCED: [['POINT',-12,-4.8],['COVER',-13.2,-13.2],['MID_OFF',-7.2,-19.2],['MID_ON',7.2,-19.2],['MID_WICKET',13.2,-12],['SQUARE_LEG',14.4,-3.6],['THIRD_MAN',-19.8,8.8],['DEEP_COVER',-26.4,-19.8],['DEEP_MID_WICKET',26.4,-18.7]],
 FAST_DEFENSIVE: [['DEEP_POINT',-30,-5],['DEEP_COVER',-27,-23],['LONG_OFF',-12,-43],['LONG_ON',12,-43],['MID_WICKET',14,-15],['SQUARE_LEG',15,-3],['THIRD_MAN',-22,13],['FINE_LEG',22,13],['DEEP_MID_WICKET',28,-23]],
 SPIN_ATTACKING: [['SLIP',-1.8,4.5],['SHORT_COVER',-4,-3],['SHORT_MID_WICKET',4,-3],['POINT',-12,-5],['COVER',-13,-13],['MID_OFF',-7,-20],['MID_ON',7,-20],['SQUARE_LEG',14,-4],['DEEP_MID_WICKET',26,-20]],
 SPIN_OFFSIDE_PRESSURE: [['SLIP',-2,4.5],['GULLY',-5,1],['SHORT_COVER',-5,-5],['POINT',-13,-4],['COVER',-15,-15],['MID_OFF',-8,-22],['MID_ON',8,-22],['SQUARE_LEG',14,-4],['DEEP_COVER',-27,-22]],
 SPIN_LEGSIDE_TRAP: [['SLIP',-2,4],['SHORT_MID_WICKET',4,-4],['MID_WICKET',12,-13],['SQUARE_LEG',12,-2],['DEEP_SQUARE',29,-4],['FINE_LEG',17,15],['MID_ON',8,-22],['MID_OFF',-8,-22],['POINT',-14,-6]],
 SPIN_BALANCED: [['POINT',-13,-5],['COVER',-15,-14],['MID_OFF',-8,-22],['MID_ON',8,-22],['MID_WICKET',14,-13],['SQUARE_LEG',15,-3],['THIRD_MAN',-20,10],['DEEP_COVER',-27,-21],['DEEP_MID_WICKET',27,-20]],
 SPIN_DEFENSIVE: [['DEEP_POINT',-30,-5],['DEEP_COVER',-28,-23],['LONG_OFF',-12,-43],['LONG_ON',12,-43],['MID_WICKET',14,-15],['SQUARE_LEG',15,-3],['THIRD_MAN',-22,13],['FINE_LEG',22,13],['DEEP_MID_WICKET',28,-23]],
} satisfies Record<string, Placement[]>
export type FieldPlan = keyof typeof FORMATIONS
export function chooseFieldPlan(type: BowlerType, tactic: Tactic, random: () => number, recent: FieldPlan[]) {
  const preferred: Partial<Record<Tactic,FieldPlan>> = {ATTACK_OFF_STUMP:'FAST_ATTACKING',SWING_ATTACK:'FAST_SWING',
    YORKER_ATTACK:'FAST_ATTACKING',SHORT_BALL_TRAP:'FAST_SHORT_BALL',CHANNEL_PRESSURE:'FAST_SWING',
    ATTACK_STUMPS:'SPIN_ATTACKING',OUTSIDE_OFF_TRAP:'SPIN_OFFSIDE_PRESSURE',TURN_AWAY_PRESSURE:'SPIN_OFFSIDE_PRESSURE',
    TURN_IN_ATTACK:'SPIN_LEGSIDE_TRAP',FLIGHT_AND_DECEIVE:'SPIN_ATTACKING'}
  const options = (Object.keys(FORMATIONS) as FieldPlan[]).filter(p=>p.startsWith(type+'_'))
  const weights=options.map(p=>(p===preferred[tactic]?5:p.endsWith('BALANCED')?2:1)*
    (recent.length>=2&&recent.slice(-2).every(v=>v===p)?.03:recent[recent.length-1]===p?.3:1))
  let draw=random()*weights.reduce((a,b)=>a+b,0)
  for(let i=0;i<options.length;i++){draw-=weights[i];if(draw<0)return options[i]}
  return options[options.length-1]
}
export function applyFieldPlan(fielding: FieldingController, plan: FieldPlan, ready: boolean) {
  if(!ready)return false
  fielding.reset()
  FORMATIONS[plan].forEach(([role,x,z],i)=>{
    const f=fielding.fielders[i];f.role=role;f.homePosition.set(x,0,z);f.position.copy(f.homePosition);f.target.copy(f.homePosition)
  })
  return true
}
export function fieldMapPoint(position: Vector3) {
  // Bowler ahead/top; off side (-X) left for this right-handed batter.
  return {x:50+position.x/35.8*46,y:50+(position.z+9)/(35.8*1.2)*46}
}
