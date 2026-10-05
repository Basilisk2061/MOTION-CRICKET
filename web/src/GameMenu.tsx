import { useEffect, useRef, useState } from 'react'
import AudioSettings from './AudioSettingsPanel'
import './onboarding.css'
export default function GameMenu({ onSuspend, onMainMenu }: { onSuspend: (paused: boolean) => void; onMainMenu: () => void }) {
  const [page, setPage] = useState<'MENU' | 'SETTINGS' | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const change = (next: typeof page) => { onSuspend(next !== null); setPage(next) }
  useEffect(() => {
    if (page !== null) panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const key = (e: KeyboardEvent) => {
      if (page === null && (e.defaultPrevented || document.querySelector('[aria-modal="true"]') || (e.target as HTMLElement)?.matches('input,select,textarea'))) return
      if (page !== null || e.key === 'Escape') {
        e.stopImmediatePropagation()
        if (e.key === 'Escape') { e.preventDefault(); change(page === 'SETTINGS' ? 'MENU' : page === null ? 'MENU' : null) }
        if (page !== null && e.key === 'Tab') {
          const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>('button,input') ?? [])
          const first = nodes[0], last = nodes[nodes.length-1]
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
        }
        if (page !== null && e.code === 'Space' && !(e.target instanceof HTMLButtonElement)) e.preventDefault()
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [page])
  return <><button className="in-game-menu" onClick={() => change('MENU')}>MENU</button>
    {page !== null && <div className="guide-scrim"><div className="pause-menu" ref={panel} role="dialog" aria-modal="true" aria-label="Motion Cricket menu">
      <h2>MOTION CRICKET</h2>
      {page === 'SETTINGS' ? <><AudioSettings/><button onClick={() => change('MENU')}>BACK</button></> : <>
        <button onClick={() => change(null)}>RESUME</button><button onClick={() => setPage('SETTINGS')}>SETTINGS</button>
        <button onClick={() => { change(null); onMainMenu() }}>MAIN MENU</button></>}
    </div></div>}
  </>
}
