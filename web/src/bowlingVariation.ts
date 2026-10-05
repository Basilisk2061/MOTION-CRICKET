import { Vector3 } from 'three'
import { DELIVERY, GAMEPLAY as T } from './gameplayTuning'
import { tacticalWeight, type Tactic } from './bowlingTactics'
import { deliveryRebound, reboundHeight } from './deliveryBounce'
export type BowlerType = 'FAST' | 'SPIN'
export type Variation = 'GOOD_LENGTH' | 'YORKER' | 'BOUNCER' | 'INSWINGER' | 'OUTSWINGER' | 'FULL' | 'SHORT' | 'OFF_SPIN' | 'LEG_SPIN' | 'TOP_SPIN' | 'STRAIGHTER' | 'FLIGHTED'
type Recipe = { weight: number; speed: [number, number]; length: [number, number]; height: [number, number]; swing?: number; turn?: number }
const FAST: Partial<Record<Variation, Recipe>> = {
 GOOD_LENGTH: { weight: 5, speed: [14,18], length: [-6.8,-5], height: [.55,.8] },
 YORKER: { weight: 1, speed: [14,17], length: [-1.5,-1.1], height: [.14,.22] },
 BOUNCER: { weight: 1, speed: [15,18], length: [-10,-8.5], height: [1.05,1.3] },
 INSWINGER: { weight: 2, speed: [14,17], length: [-6.5,-5], height: [.55,.85], swing: .675 },
 OUTSWINGER: { weight: 2, speed: [14,17], length: [-6.5,-5], height: [.55,.85], swing: -.675 },
 FULL: { weight: 3, speed: [13,17], length: [-4,-2.8], height: [.4,.65] },
 SHORT: { weight: 3, speed: [14,18], length: [-8.5,-7], height: [.8,1.05] },
}
const SPIN: Partial<Record<Variation, Recipe>> = {
 OFF_SPIN: { weight: 4, speed: [10.5,13], length: [-5.5,-4], height: [.55,.85], turn: 1.65 },
 LEG_SPIN: { weight: 4, speed: [10.5,13], length: [-5.5,-4], height: [.55,.85], turn: -1.65 },
 TOP_SPIN: { weight: 2, speed: [11,13.5], length: [-6,-4.5], height: [.85,1.05] },
 STRAIGHTER: { weight: 2, speed: [11.5,14], length: [-5,-3.8], height: [.5,.75] },
 FLIGHTED: { weight: 2, speed: [8.5,9.5], length: [-5.8,-4.5], height: [.65,.9] },
}
export type BowlingPlan = { velocity: Vector3; bounce: number; bounceZ: number; targetX: number; height: number; tier: number; bowler: BowlerType; variation: Variation; speed: number; swingAcceleration: number; spinImpulse: number; forwardImpulse: number; flightGravity: number }
export const QUICK_SPEED_EXTENSION = { FAST: 6, SPIN: 2, FLIGHTED: 1 }
export function deliverySpeed(range: [number, number], extension: number, draw: number, legacyShare = .9) {
 return draw < legacyShare ? range[0] + draw / legacyShare * (range[1] - range[0])
   : range[1] + (draw - legacyShare) / (1 - legacyShare) * extension
}
export function fastDeliverySpeed(range: [number, number], extension: number, draw: number) {
 // Continuous quantiles preserve the variation's slower range and top endpoint.
 if (draw < .45) return range[0] + Math.pow(draw / .45, .40) * (range[1] - range[0])
 const upper = (draw - .45) / .55
 if (upper < .38) return range[1] + upper / .38 * (20 - range[1])
 if (upper < .78) return 20 + (upper - .38) / .40 * 2
 return 22 + (upper - .78) / .22 * (range[1] + extension - 22)
}
export function fastPaceBand(speed: number) { return speed < 16 ? 'SLOW' : speed < 20 ? 'NORMAL' : speed < 22 ? 'QUICK' : 'EXPRESS' }
export function fastSwingBand(draw: number) { return draw < .15 ? 'SUBTLE' : draw < .60 ? 'NORMAL' : draw < .875 ? 'STRONG' : 'BIG' }
export function fastSwingMultiplier(draw: number) {
 if (draw < .15) return .20 + draw / .15 * .30
 if (draw < .60) return .75 + (draw - .15) / .45 * .50
 if (draw < .875) return 1.40 + (draw - .60) / .275 * .50
 return 2.10 + (draw - .875) / .125 * .60
}
export function spinDeliverySpeed(range: [number, number], extension: number, draw: number, flighted = false) {
 if (flighted) return deliverySpeed(range, extension, draw, .30)
 // Keep slower change-ups; favor the upper part of each variation's quick extension.
 return draw < .20 ? range[0] + draw / .20 * (range[1] - range[0])
   : range[1] + Math.pow((draw - .20) / .80, .65) * extension
}
export function spinTurnStrength(draw: number) {
 // Independent of pace: subtle 12.5%, normal 50%, strong 27.5%, ripping 10%.
 if (draw < .125) return .45 + draw / .125 * .45
 if (draw < .625) return 1.1 + (draw - .125) / .50 * .80
 if (draw < .90) return 2.2 + (draw - .625) / .275 * .90
 return 3.4 + (draw - .90) / .10 * .80
}
export function playableInitialLine(line:number,draw:number){
 // Preserve an occasional genuine wide; compress only the excessive -X tail.
 if(line>=-.50||draw<.05)return line
 return -.50-.25*(1-Math.exp((line+.50)/.25))
}
export function generateDelivery(type: BowlerType, random: () => number, beginner: boolean, release: Vector3, previous?: Variation, repetitions = 0, forced?: Variation, tactic?: Tactic): BowlingPlan {
 const recipes = type === 'FAST' ? FAST : SPIN
 const entries = Object.entries(recipes).filter(([name]) => repetitions < 2 || name !== previous) as [Variation, Recipe][]
 let draw = random() * entries.reduce((sum, [name,r]) => sum + r.weight*tacticalWeight(tactic,name), 0)
 let variation = entries[entries.length-1][0]
 for (const [name,r] of entries) { draw -= r.weight*tacticalWeight(tactic,name); if (draw < 0) { variation = name; break } }
 if (forced && recipes[forced]) variation = forced
 const r = recipes[variation]!
 const between = ([a,b]: [number,number]) => a + random() * (b-a)
 const extension = variation === 'FLIGHTED' ? QUICK_SPEED_EXTENSION.FLIGHTED : QUICK_SPEED_EXTENSION[type]
 const speedDraw = random()
 const speed = (type === 'FAST' ? fastDeliverySpeed(r.speed, extension, speedDraw)
   : spinDeliverySpeed(r.speed, extension, speedDraw, variation === 'FLIGHTED')) * (beginner ? T.beginnerSpeedMultiplier : 1)
 const bounceDraw=between(r.length),heightDraw=between(r.height),lineDraw=random()
 let bounceZ = bounceDraw, height = heightDraw, targetX = .32 + (lineDraw*2-1)*.16
 let compensation = 1,legSideLine=false
 if(tactic) {
   const intent=random() // Independent questions, not an imposed wicket sequence.
   if(intent<.28) {
     targetX=-.09+random()*.18
     if(!['BOUNCER','SHORT','TOP_SPIN','FLIGHTED'].includes(variation)) height=.26+random()*.20
     if(variation==='YORKER') {
       const accuracy=random()
       bounceZ=accuracy<.10?-1.18+random()*.16:accuracy<.75?-1.7+random()*.5:-2.5+random()*.7
       height=accuracy<.10?.10+random()*.04:.14+random()*.10
     }
   } else if(intent<.73) targetX=-.38+random()*.30
   else { targetX=.35+lineDraw*.45;legSideLine=true }
   // Aiming the initial line is distinct from cancelling the eventual movement.
   // Most tactical moving deliveries are NOT solved back to a safe final line.
   if(r.swing || r.turn) compensation=random()<.65?random()*.65:1
   // This branch selects an actual leg-side start, not a movement-cancelled endpoint.
   if(legSideLine) compensation=0
 }
 const floor = T.groundY + DELIVERY.radius
 const forwardImpulse = variation === 'TOP_SPIN' ? .72 : 0
 const t1 = (bounceZ-release.z)/speed, t2 = (-.65-bounceZ)/(speed+forwardImpulse)
 const originalVy = (floor-release.y+.5*DELIVERY.gravity*t1*t1)/t1
 const vy = type === 'SPIN' ? Math.min(originalVy, variation === 'FLIGHTED' ? 1.5 : -.65) : originalVy
 // Slow scene-scale spin needs less downward flight acceleration to pitch at
 // the same length. Normal spin descends from release instead of hanging upward;
 // FLIGHTED retains its loop. After bounce,
 // normal gravity resumes; lateral turn stays independent of vertical rebound.
 const flightGravity = type === 'SPIN' ? 2 * (release.y - floor + vy * t1) / (t1 * t1) : DELIVERY.gravity
 const swingAcceleration = r.swing ? r.swing * fastSwingMultiplier(random()) : 0
 const turnDraw = r.turn ? random() : 0
 const spinImpulse = r.turn ? Math.sign(r.turn) * spinTurnStrength(turnDraw) : 0
 const spinType=type==='SPIN'?variation as 'OFF_SPIN'|'LEG_SPIN'|'TOP_SPIN'|'STRAIGHTER'|'FLIGHTED':undefined
 const rebound = deliveryRebound(vy-flightGravity*t1,speed,bounceZ,variation==='TOP_SPIN',spinType,spinImpulse)
 height=reboundHeight(floor,rebound,t2)
 // Field roles establish off-side -X and leg-side +X for the right-handed batter.
 const lateralTravel = swingAcceleration*(.5*t1*t1+t1*t2)+spinImpulse*t2
 const initialLine=playableInitialLine(targetX-lateralTravel*compensation,lineDraw)
 return { velocity: new Vector3((initialLine-release.x)/(t1+t2),vy,speed),
  bounce: rebound/(flightGravity*t1-vy), bounceZ,targetX,height,tier:0,bowler:type,variation,speed,swingAcceleration,spinImpulse,forwardImpulse,flightGravity }
}
