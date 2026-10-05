import { useEffect, useSyncExternalStore } from 'react'
import type { ReplaySession } from './replayPlayback'
import './replay.css'

export default function ReplayOverlay({session}:{session:ReplaySession}){
  useSyncExternalStore(session.subscribe,session.snapshot)
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(!session.consumeKey(event.code))return
      event.preventDefault();event.stopImmediatePropagation()
    }
    window.addEventListener('keydown',key,true)
    return()=>window.removeEventListener('keydown',key,true)
  },[session])
  if(session.phase==='IDLE')return null
  return <div className={`replay-overlay replay-${session.phase.toLowerCase()}`} role="region" aria-label={`${session.result} replay`}>
    {session.phase!=='RETURNING'&&<><div className="replay-tag"><strong>REPLAY</strong><span>{session.result}</span></div>
    <button className="replay-skip" onClick={()=>session.skip()}>SKIP <span>SPACE / ESC</span></button></>}
    <div className="replay-cut" aria-hidden="true"/>
  </div>
}
