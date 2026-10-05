export type AudioSettings = { crowd: number; sfx: number; crowdMuted: boolean; sfxMuted: boolean }
const KEY = 'motion-cricket.audio.v1'
const defaults: AudioSettings = { crowd: 100, sfx: 100, crowdMuted: false, sfxMuted: false }
const listeners = new Set<() => void>()
const level = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 100
function read(): AudioSettings {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return { crowd: level(v.crowd), sfx: level(v.sfx), crowdMuted: v.crowdMuted === true, sfxMuted: v.sfxMuted === true } } catch { return { ...defaults } }
}
let settings = read()
export const getAudioSettings = () => settings
export function setAudioSettings(next: AudioSettings) {
  settings = { crowd: level(next.crowd), sfx: level(next.sfx), crowdMuted: next.crowdMuted === true, sfxMuted: next.sfxMuted === true }
  try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch { /* Private storage may be unavailable. */ }
  listeners.forEach(f => f())
}
export function subscribeAudio(f: () => void) { listeners.add(f); return () => { listeners.delete(f) } }
export function audioLevel(channel: 'crowd' | 'sfx') { return settings[channel + 'Muted' as 'crowdMuted' | 'sfxMuted'] ? 0 : settings[channel] / 100 }
