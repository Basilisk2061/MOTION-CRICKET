import { useEffect, useState } from 'react'
import { getAudioSettings, setAudioSettings, subscribeAudio } from './audioSettings'
import './onboarding.css'
export default function AudioSettingsPanel() {
  const [settings, refresh] = useState(getAudioSettings)
  useEffect(() => subscribeAudio(() => refresh(getAudioSettings())), [])
  return <section className="audio-settings" aria-label="Audio settings">
    {(['crowd', 'sfx'] as const).map(channel => {
      const muted = channel === 'crowd' ? 'crowdMuted' : 'sfxMuted'
      return <div key={channel}><label htmlFor={`volume-${channel}`}>{channel === 'crowd' ? 'CROWD' : 'SOUND EFFECTS'} <span>{settings[channel]}%</span></label>
        <input id={`volume-${channel}`} type="range" min="0" max="100" value={settings[channel]} onChange={e => setAudioSettings({ ...getAudioSettings(), [channel]: Number(e.target.value) })}/>
        <button aria-pressed={settings[muted]} onClick={() => setAudioSettings({ ...getAudioSettings(), [muted]: !getAudioSettings()[muted] })}>{settings[muted] ? 'UNMUTE' : 'MUTE'}</button></div>
    })}
  </section>
}
