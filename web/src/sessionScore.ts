import type { MatchResult, Result } from './matchResult'
import type { BowlerType } from './bowlingVariation'
export const DEFAULT_OVERS = 3
export const BALLS_PER_OVER = 6
export function resultRuns(result: string) {
 return ({ DOT:0, '1 RUN':1, '2 RUNS':2, '3 RUNS':3, FOUR:4, SIX:6 } as Record<string, number>)[result] ?? 0
}
export class SessionScore {
 total = 0
 wickets = 0
 out: Result | null = null
 totalLegalBalls = 0
 boundaries4 = 0
 boundaries6 = 0
 bestShotSpeed = 0
 bestOverRuns = 0
 private overRuns = 0
 private firstBowler: BowlerType
 private consumed = new WeakSet<MatchResult>()
 constructor(public overs: number | null = DEFAULT_OVERS, private random: () => number = Math.random,
   public maxWickets = 10) {
  this.firstBowler = random() < .5 ? 'FAST' : 'SPIN'
 }
 get totalRuns() { return this.total }
 get currentOver() { return Math.floor(this.totalLegalBalls / BALLS_PER_OVER) }
 get legalBallsInOver() { return this.totalLegalBalls % BALLS_PER_OVER }
 get overNotation() { return `${this.currentOver}.${this.legalBallsInOver}` }
 get complete() { return (this.overs !== null && this.totalLegalBalls >= this.overs * BALLS_PER_OVER) || this.wickets >= this.maxWickets }
 get bowlerType(): BowlerType { return this.currentOver % 2 ? (this.firstBowler === 'FAST' ? 'SPIN' : 'FAST') : this.firstBowler }
 consume(match: MatchResult) {
  if (this.complete || !match.result || this.consumed.has(match)) return false
  this.consumed.add(match)
  this.out = ['BOWLED','CAUGHT','CAUGHT BEHIND'].includes(match.result) ? match.result : null
  if (this.out) this.wickets++
  const runs = resultRuns(match.result)
  this.total += runs; this.overRuns += runs
  this.boundaries4 += Number(match.result === 'FOUR')
  this.boundaries6 += Number(match.result === 'SIX')
  if (Number.isFinite(match.exitSpeed)) this.bestShotSpeed = Math.max(this.bestShotSpeed, match.exitSpeed)
  this.bestOverRuns = Math.max(this.bestOverRuns, this.overRuns)
  this.totalLegalBalls++
  if (this.legalBallsInOver === 0) this.overRuns = 0
  return true
 }
 reset() {
  this.total = this.wickets = this.totalLegalBalls = this.boundaries4 = this.boundaries6 = 0
  this.bestShotSpeed = this.bestOverRuns = this.overRuns = 0
  this.out = null; this.consumed = new WeakSet()
  this.firstBowler = this.random() < .5 ? 'FAST' : 'SPIN'
 }
}
