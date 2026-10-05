declare const __PUBLIC_RELAY__: boolean
export const PUBLIC_RELAY = typeof __PUBLIC_RELAY__ !== 'undefined' && __PUBLIC_RELAY__
export const SESSION_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/
export function newSession() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), n => alphabet[n % alphabet.length]).join('')
}
let code = ''
export function currentSession() {
  if (code) return code
  const supplied = new URLSearchParams(location.search).get('session')?.toUpperCase() ?? ''
  if (SESSION_PATTERN.test(supplied)) return code = supplied
  if (location.pathname.replace(/\/$/, '') === '/controller') return ''
  try { code = sessionStorage.getItem('motion-cricket-session') ?? '' } catch { /* Private browsing. */ }
  if (!SESSION_PATTERN.test(code)) code = newSession()
  try { sessionStorage.setItem('motion-cricket-session', code) } catch { /* Tab-local fallback. */ }
  return code
}
export function publicPhoneURL(origin = location.origin, session = currentSession()) {
  return `${origin}/controller?session=${encodeURIComponent(session)}`
}
export function relaySocketURL(path: string, origin = location.origin, session = currentSession()) {
  const incoming = new URL(path, origin), relay = new URL('/relay', origin)
  relay.protocol = 'wss:'
  relay.searchParams.set('session', session)
  relay.searchParams.set('role', incoming.searchParams.get('role') === 'phone' ? 'phone' : 'game')
  if (relay.searchParams.get('role') === 'game') relay.searchParams.set('channel', incoming.pathname === '/cv-ws' ? 'cv' : 'phone')
  return relay.href
}
