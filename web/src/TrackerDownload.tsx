import { useEffect, useState } from 'react'
import { TRACKER_RELEASES, trackerAsset } from './onboarding'

export default function TrackerDownload() {
  const [url, setURL] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const abort = new AbortController()
    fetch('https://api.github.com/repos/Basilisk2061/MOTION-CRICKET/releases?per_page=5', { signal: abort.signal })
      .then(r => { if (!r.ok) throw Error(); return r.json() })
      .then(releases => { if (!abort.signal.aborted) setURL(trackerAsset(releases)) })
      .catch(() => { /* Releases link remains available if GitHub's API is offline/rate-limited. */ })
      .finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => abort.abort()
  }, [])
  return <div className="tracker-download">
    {url ? <a className="guide-primary" href={url}>DOWNLOAD FOR WINDOWS <span aria-hidden="true">↗</span></a>
      : <button className="guide-primary" disabled>{loading ? 'CHECKING DOWNLOAD…' : 'DOWNLOAD NOT PUBLISHED YET'}</button>}
    <span>Windows Tracker · Portable ZIP · Extract the entire folder</span>
    {!url && !loading && <small>The build is awaiting release publication. <a href={TRACKER_RELEASES} target="_blank" rel="noreferrer">Check tracker releases ↗</a></small>}
  </div>
}
