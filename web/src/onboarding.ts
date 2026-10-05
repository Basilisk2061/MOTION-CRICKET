export const SETUP_STEPS = [
  'Welcome', 'What you need', 'Windows tracker', 'Connect everything', 'Calibrate',
  'How to bat', 'Call the bowler', 'Cricket essentials', 'Ready to play',
] as const
export type SetupStatus = { webcamConnected: boolean; webcamCalibrated: boolean; phoneConnected: boolean; phoneCalibrated: boolean }
export function setupCanAdvance(step: number, status: SetupStatus) {
  if (step === 3) return status.webcamConnected && status.phoneConnected
  if (step === 4 || step === 8) return status.webcamConnected && status.phoneConnected && status.webcamCalibrated && status.phoneCalibrated
  return true
}
export const TRACKER_FILE = 'MotionCricketTracker-Windows.zip'
export const TRACKER_RELEASES = 'https://github.com/Basilisk2061/MOTION-CRICKET/releases'
export function trackerAsset(releases: unknown): string | null {
  if (!Array.isArray(releases)) return null
  for (const release of releases) {
    if (release.draft || release.prerelease || !Array.isArray(release.assets)) continue
    for (const asset of release.assets) {
      if (asset.name !== TRACKER_FILE || typeof asset.browser_download_url !== 'string') continue
      try {
        const url = new URL(asset.browser_download_url)
        if (url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password &&
            url.pathname.startsWith('/Basilisk2061/MOTION-CRICKET/releases/download/') && url.pathname.endsWith('/'+TRACKER_FILE)) return url.href
      } catch { /* Do not offer an unverified download URL. */ }
    }
  }
  return null
}
