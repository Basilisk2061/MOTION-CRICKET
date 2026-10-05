import { useState } from 'react'
import { PUBLIC_RELAY, currentSession } from './publicSession'
import TrackerDownload from './TrackerDownload'
export function trackerJoinURL(session: string) { return /^[A-HJ-NP-Z2-9]{6}$/.test(session) ? `motioncricket://join?session=${session}` : null }
export default function TrackerLaunch() {
  const [attempted, setAttempted] = useState(false)
  const session = currentSession(), url = PUBLIC_RELAY ? trackerJoinURL(session) : null
  return <div className="tracker-launch">{url && <><a className="guide-primary" href={url} onClick={() => setAttempted(true)}>OPEN TRACKER</a>
    <p>Enable one-click launch inside the tracker first (requires the upcoming v0.1.1).</p>
    {attempted && <p role="status">Tracker didn't open? Open it manually and enter {session}.</p>}</>}
    <p>Don't have the tracker?</p><TrackerDownload/>
  </div>
}
