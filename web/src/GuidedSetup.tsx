import { useEffect, useRef, useState } from 'react'
import { HELP_KEYS, markSeen } from './battingHelp'
import { SETUP_STEPS, setupCanAdvance, type SetupStatus } from './onboarding'
import PhoneSetup from './PhoneSetup'
import TrackerDownload from './TrackerDownload'
import { currentSession, PUBLIC_RELAY } from './publicSession'
import './onboarding.css'

export default function GuidedSetup({ status, onComplete, onClose, initialStep = 0, firstVisit = false }:
  { status: SetupStatus; onComplete: () => void; onClose: () => void; initialStep?: number; firstVisit?: boolean }) {
  const [step, setStep] = useState(initialStep)
  const panel = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null)
  const ready = !firstVisit || setupCanAdvance(step, status)
  const finish = () => { markSeen(HELP_KEYS.tutorial); onComplete() }
  const leave = () => { if (firstVisit) markSeen(HELP_KEYS.tutorial); onClose() }
  const next = () => { if (!ready) return; if (step === 8) finish(); else setStep(step+1) }
  useEffect(() => { heading.current?.focus() }, [step])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      event.stopImmediatePropagation() // Never let a tutorial key call the bowler behind the dialog.
      if (event.key === 'Escape') { event.preventDefault(); leave() }
      if (event.key === 'ArrowRight') { event.preventDefault(); next() }
      if (event.key === 'ArrowLeft') { event.preventDefault(); setStep(Math.max(0, step-1)) }
      if (event.key === 'Tab') {
        const buttons = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],select') ?? [])
        const first = buttons[0], last = buttons[buttons.length-1]
        if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
      if (event.code === 'Space' && !(event.target instanceof HTMLButtonElement)) event.preventDefault()
    }
    window.addEventListener('keydown', keys, true)
    return () => window.removeEventListener('keydown', keys, true)
  }, [step, ready, firstVisit, onClose, onComplete])
  const indicators = <div className="guide-status" aria-label="Controller readiness" aria-live="polite">
    {[
      ['WEBCAM', status.webcamConnected, status.webcamConnected ? 'Connected' : 'Not connected'],
      ['PHONE', status.phoneConnected, status.phoneConnected ? 'Connected' : 'Not connected'],
      ['CALIBRATION', status.webcamCalibrated && status.phoneCalibrated, status.webcamCalibrated && status.phoneCalibrated ? 'Ready' : 'Needed'],
    ].map(([label, connected, text]) => <div key={String(label)}><i className={connected ? 'is-ready' : ''} /><span>{label}</span><b>{text}</b></div>)}
  </div>
  return <div className="guide-scrim"><div ref={panel} className="motion-guide" role="dialog" aria-modal="true" aria-labelledby="guide-title">
    <div className="guide-top"><span>MOTION / CRICKET</span><button onClick={leave}>{firstVisit ? 'SKIP SETUP' : 'CLOSE HELP'} <span aria-hidden="true">×</span></button></div>
    <div className="guide-progress" aria-label={`Step ${step+1} of ${SETUP_STEPS.length}`}>
      {SETUP_STEPS.map((title, index) => <span key={title} className={index <= step ? 'complete' : ''} />)}
    </div>
    <div className="guide-body" key={step}>
      <div className="guide-step"><span>{String(step+1).padStart(2,'0')}</span><p>PLAYER SETUP<br/><b>{SETUP_STEPS[step]}</b></p></div>
      <h2 id="guide-title" ref={heading} tabIndex={-1}>{[
        <>YOUR BODY.<br/>YOUR BAT.</>, 'A little space. A real swing.', 'Meet your webcam companion.', 'One code. Everything connected.',
        'Make this stance yours.', 'Move it. Rotate it. Play it.', 'Ready? Call the bowler.', 'Cricket. Without the keyboard.', <>YOU’RE<br/>READY.</>,
      ][step]}</h2>
      {step === 0 && <><p className="guide-lead">Your body is the controller.</p><div className="guide-pair"><div><span>01 / WEBCAM</span><strong>Bat position</strong><p>Move your right hand.</p></div><div><span>02 / PHONE</span><strong>Bat rotation</strong><p>Turn your phone.</p></div></div></>}
      {step === 1 && <><ul className="guide-checklist"><li>Windows laptop / PC with a webcam</li><li>A smartphone with motion sensors</li><li>Enough room to swing safely</li></ul><p className="guide-note">Hold your phone securely. Never throw or release it. Keep people and objects outside your swing.</p></>}
      {step === 2 && <><ol className="guide-checklist"><li>Download the complete Windows Tracker ZIP.</li><li>Extract it. Keep the whole folder together.</li><li>Open <b>MotionCricketTracker.exe</b> and allow webcam access.</li><li>Keep it running while you play.</li></ol><TrackerDownload/><p className="guide-note">Already have the tracker? Choose Next. This is a portable build, not an installer. Windows may show an unsigned-app warning; do not disable security protection.</p></>}
      {step === 3 && <><div className="guide-code"><span>YOUR GAME CODE</span><strong>{PUBLIC_RELAY ? currentSession() : 'LOCAL PLAY'}</strong><p>{PUBLIC_RELAY ? 'Enter this code in Motion Cricket Tracker, then choose CONNECT.' : 'Run the local tracker and use your phone-enabled HTTPS setup.'}</p></div><PhoneSetup status={status.phoneConnected ? 'CONNECTED' : 'DISCONNECTED'} calibrated={status.phoneCalibrated} compact/>{indicators}</>}
      {step === 4 && <><p className="guide-lead">Stand naturally, right-handed and side-on. Keep your right arm visible.</p><div className="guide-pair"><div><span>WEBCAM</span><strong>CALIBRATE</strong><p>Click in the tracker, or press <kbd>C</kbd> in its webcam window.</p></div><div><span>PHONE</span><strong>CALIBRATE</strong><p>Hold your normal grip and tap Calibrate on your phone.</p></div></div><p className="guide-note">This sets your normal batting position and bat angle. Return to this stance between shots.</p>{indicators}</>}
      {step === 5 && <><div className="guide-pair"><div><span>WEBCAM → POSITION</span><strong>Move your right hand</strong><p>Left / right · up / down · forward / back</p></div><div><span>PHONE → ANGLE</span><strong>Rotate your phone</strong><p>The bat turns with your grip.</p></div></div><p className="guide-lead">Together, your physical swing controls the bat.</p><p className="guide-note">Swing naturally. Timing, direction and bat speed matter. Return to stance between shots.</p></>}
      {step === 6 && <><div className="guide-call" aria-label="Raise the bat, then hold for one second"><span className="guide-bat" aria-hidden="true"/><div><strong>RAISE → HOLD</strong><p>Raise the bat / phone so the bat points upward.<br/>Hold the bowler-call pose for about 1 second.</p></div></div><p className="guide-lead">Watch the bowler. Then play your shot.</p><p className="guide-note">Or press <kbd>SPACE</kbd> on the laptop to request a delivery. Lower the bat between calls.</p></>}
      {step === 7 && <><ul className="guide-checklist"><li>Hit naturally. Runs are scored automatically.</li><li>Boundaries: <b>4</b> along the ground, <b>6</b> over the boundary.</li><li>Wickets follow your selected mode’s rules.</li><li>Fielders and the wicketkeeper are automatic.</li></ul><p className="guide-note">No keyboard batting controls. Beginner Assist offers about 10% slower deliveries and more forgiving contact / timing. Change it in the batting HUD.</p></>}
      {step === 8 && <>{indicators}<p className="guide-lead">Choose your mode. Find your stance. Play cricket.</p><p className="guide-note">You can reopen this guide from HOW TO PLAY or TRACKER / SETUP on the menu.</p></>}
      {!ready && <p className="guide-wait" role="status">{step === 3 ? 'Connect the webcam tracker and phone to continue.' : 'Connect and calibrate both controllers to continue.'} Need help? Go Back to connection setup, or Skip setup and return later.</p>}
    </div>
    <div className="guide-bottom"><button className="guide-back" disabled={step === 0} onClick={() => setStep(step-1)}>← BACK</button><span>{step+1} / {SETUP_STEPS.length}</span><button className="guide-primary" disabled={!ready} onClick={next}>{step === 0 ? 'GET STARTED' : step === 8 ? 'START BATTING' : 'NEXT'} <span aria-hidden="true">→</span></button></div>
  </div></div>
}
