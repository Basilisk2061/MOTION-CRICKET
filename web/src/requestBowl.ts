import type { Delivery } from './delivery'
import type { SessionScore } from './sessionScore'
import type { GameModeStatus } from './gameMode'
export function requestBowl(game: Delivery, session: SessionScore, inputAllowed = true, modeStatus: GameModeStatus = 'PLAYING') {
  if (modeStatus !== 'PLAYING' || !inputAllowed || session.complete || game.state !== 'READY') return false
  game.bowlerType = session.bowlerType
  game.start()
  return true
}
