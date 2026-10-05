import type { GameMode, GameModes } from './gameMode'
export default function ModeOverlay({ modes, onChoose, onBegin, onAgain, onMenu, phoneConnected = false }: {
  modes: GameModes; onChoose: (mode: GameMode) => void; onBegin: () => void; onAgain: () => void; onMenu: () => void
  phoneConnected?: boolean
}) {
  const status = modes.status, score = modes.score
  if (status === 'PLAYING') return null
  if (status === 'MENU') return <section className="main-menu" aria-label="Choose game mode">
    <div className="menu-composition">
      <div className="menu-brand"><h1>MOTION CRICKET</h1><p className="menu-subtitle">PHYSICAL BATTING GAME</p>
        <p className="menu-instruction">Choose how you want to play</p></div>
      <div className="menu-modes">
        <button className="mode-choice" onClick={() => onChoose('FREE_PLAY')}>
          <span className="mode-mark" aria-hidden="true">∞</span><span className="mode-name">FREE PLAY</span>
          <span className="mode-description">Bat until you’re out.</span>
          <span className="mode-rules"><span>1 WICKET</span><span>UNLIMITED OVERS</span></span>
          <span className="mode-play">PLAY <span aria-hidden="true">→</span></span>
        </button>
        <button className="mode-choice" onClick={() => onChoose('TARGET_CHASE')}>
          <span className="mode-mark mode-target" aria-hidden="true">◎</span><span className="mode-name">TARGET CHASE</span>
          <span className="mode-description">Chase the target before the balls run out.</span>
          <span className="mode-rules"><span>3 OVERS</span><span>30–45 TARGET</span></span>
          <span className="mode-play">PLAY <span aria-hidden="true">→</span></span>
        </button>
      </div>
      <p className="menu-controller"><span className={`status-dot ${phoneConnected ? 'connected' : ''}`} aria-hidden="true" />
        {phoneConnected ? 'PHONE CONNECTED' : 'CONNECT PHONE TO PLAY'}</p>
    </div>
  </section>
  return <div className="out-overlay mode-overlay" role="dialog" aria-label="Innings">
    {status === 'INTRO' ? <div>
      <p className="eyebrow">Target Chase</p><h1>TARGET</h1><strong>{modes.target}</strong><p>3 OVERS</p>
      <button onClick={onBegin}>START INNINGS</button><button className="mode-secondary" onClick={onMenu}>CHANGE MODE</button>
    </div> : <div>
      <h1>{modes.mode === 'FREE_PLAY' ? 'INNINGS OVER' : status === 'WON' ? 'TARGET CHASED' : 'TARGET MISSED'}</h1>
      <strong>{modes.mode === 'FREE_PLAY' ? score.total : `${score.total}/${score.wickets}`}</strong>
      <p>{modes.mode === 'FREE_PLAY' ? 'RUNS · ' : ''}{score.overNotation} OVERS</p>
      {modes.mode === 'TARGET_CHASE' && <><p>TARGET {modes.target}</p><p>{status === 'WON'
        ? `WON WITH ${modes.ballsRemaining} BALLS REMAINING` : `NEEDED ${modes.runsNeeded} MORE`}</p></>}
      <dl className="match-stats"><dt>Fours</dt><dd>{score.boundaries4}</dd><dt>Sixes</dt><dd>{score.boundaries6}</dd>
        <dt>Best shot</dt><dd>{score.bestShotSpeed.toFixed(1)} units/s</dd><dt>Best over</dt><dd>{score.bestOverRuns} runs</dd></dl>
      <button onClick={onAgain}>{status === 'LOST' ? 'TRY AGAIN' : 'PLAY AGAIN'}</button>
      <button className="mode-secondary" onClick={onMenu}>CHANGE MODE</button>
    </div>}
  </div>
}
