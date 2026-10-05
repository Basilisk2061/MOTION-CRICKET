import type { MatchResult } from './matchResult'
import { SessionScore, BALLS_PER_OVER, resultRuns } from './sessionScore'
export type GameMode = 'FREE_PLAY' | 'TARGET_CHASE'
export type GameModeStatus = 'MENU' | 'INTRO' | 'PLAYING' | 'WON' | 'LOST' | 'COMPLETE'
export const CHASE_OVERS = 3
export function generateTarget(random: () => number = Math.random) { return 30 + Math.min(15, Math.floor(random() * 16)) }
export class GameModes {
  mode: GameMode | null = null
  target = 0
  private phase: 'MENU' | 'INTRO' | 'PLAYING' = 'MENU'
  constructor(readonly score: SessionScore, private random: () => number = Math.random) {}
  get status(): GameModeStatus {
    if (this.phase !== 'PLAYING') return this.phase
    if (this.mode === 'TARGET_CHASE' && this.score.total >= this.target) return 'WON'
    if (this.score.complete) return this.mode === 'FREE_PLAY' ? 'COMPLETE' : 'LOST'
    return 'PLAYING'
  }
  get runsNeeded() { return Math.max(0, this.target - this.score.total) }
  get ballsRemaining() { return this.mode === 'TARGET_CHASE' ? Math.max(0, CHASE_OVERS * BALLS_PER_OVER - this.score.totalLegalBalls) : null }
  choose(mode: GameMode) {
    this.mode = mode
    this.score.overs = mode === 'FREE_PLAY' ? null : CHASE_OVERS
    this.score.maxWickets = mode === 'FREE_PLAY' ? 1 : 10
    this.score.reset()
    this.target = mode === 'TARGET_CHASE' ? generateTarget(this.random) : 0
    this.phase = mode === 'TARGET_CHASE' ? 'INTRO' : 'PLAYING'
  }
  begin() { if (this.phase === 'INTRO') this.phase = 'PLAYING' }
  menu() { this.phase = 'MENU' }
  consume(match: MatchResult, deliveryComplete: boolean) {
    if (this.status !== 'PLAYING' || !match.result) return false
    // Terminal scoring results may end a mode without waiting for the return camera.
    const wicket = ['BOWLED', 'CAUGHT', 'CAUGHT BEHIND'].includes(match.result)
    const winningResult = this.mode === 'TARGET_CHASE' && !wicket
      && match.result !== 'DOT' && this.runsNeeded <= resultRuns(match.result)
    if (!deliveryComplete && !(this.mode === 'FREE_PLAY' && wicket) && !winningResult) return false
    return this.score.consume(match)
  }
}
