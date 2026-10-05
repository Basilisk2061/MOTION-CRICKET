import { useEffect, useRef, useState } from 'react'
import type { GameModes } from './gameMode'
import type { Delivery } from './delivery'
import { ASSIST_COPY, HELP_KEYS, markSeen } from './battingHelp'
import PhoneSetup from './PhoneSetup'
import GuidedSetup from './GuidedSetup'
import './battingHud.css'

export default function BattingHud({modes,game,beginner,onAssist,phoneStatus,calibrated,onDebug,debug,initialOnboarding=false,onStart=()=>{},onExit=()=>{},onSuspend=()=>{},webcamConnected=false,webcamCalibrated=false}:{
 modes:GameModes;game:Delivery;beginner:boolean;onAssist:(value:boolean)=>void;phoneStatus:string;
 calibrated:boolean;onDebug:()=>void;debug:boolean;initialOnboarding?:boolean;onStart?:()=>void;onExit?:()=>void;onSuspend?:(value:boolean)=>void;webcamConnected?:boolean;webcamCalibrated?:boolean
}){
 const [page,setPage]=useState<number|null>(()=>initialOnboarding?0:null)
 const [explain,setExplain]=useState(false)
 const [setup,setSetup]=useState(false)
 const dialog=useRef<HTMLDivElement>(null),helpButton=useRef<HTMLButtonElement>(null),assistButton=useRef<HTMLButtonElement>(null)
 const modal=explain||setup
 const close=()=>{
  if(initialOnboarding){onExit();return}
  if(explain){setExplain(false);assistButton.current?.focus()}
  else if(setup)setSetup(false)
  else{setPage(null);helpButton.current?.focus()}
  onSuspend(false)
 }
 const start=()=>{if(initialOnboarding){markSeen(HELP_KEYS.tutorial);setPage(null);onStart();onSuspend(false)}else close()}
 useEffect(()=>{
  if(!modal)return
  const previous=document.activeElement as HTMLElement|null
  dialog.current?.querySelector<HTMLElement>('button, a[href], select, summary')?.focus()
  const keys=(event:KeyboardEvent)=>{
   // Do not let dialog key presses request a delivery underneath it.
   event.stopImmediatePropagation()
   if(event.key==='Escape'){event.preventDefault();close();return}
   if(event.key==='Tab'){
    const buttons=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], select, summary')??[])
    const first=buttons[0],last=buttons[buttons.length-1]
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
   }
   if(event.code==='Space'&&!(document.activeElement instanceof HTMLButtonElement))event.preventDefault()
  }
  window.addEventListener('keydown',keys,true)
  return()=>{window.removeEventListener('keydown',keys,true);if(previous?.isConnected)previous.focus()}
 },[modal,page,explain,setup])
 const score=modes.score,waiting=game.state==='READY'&&modes.status==='PLAYING'
 const betweenBalls=game.state==='READY'
 const toggleAssist=()=>{onSuspend(betweenBalls);setExplain(true)}
 return <>
  {!initialOnboarding&&<><section className="batting-score" aria-label="Live score">
   <span className="score-mode">{modes.mode==='FREE_PLAY'?'Free play':'Target chase'}</span>
   <strong>{score.total}<small>/{score.wickets}</small></strong>
   <div className="score-over">{score.overNotation}<small>overs · {score.bowlerType==='FAST'?'FAST':'SPIN'}</small></div>
   {modes.mode==='TARGET_CHASE'&&<div className="score-chase"><span>Target <b>{modes.target}</b></span><strong>{modes.runsNeeded}<small> needed</small></strong><span>{modes.ballsRemaining} balls left</span></div>}
  </section>
  <nav className={`batting-settings ${modes.mode==='TARGET_CHASE'?'chase-utilities':''}`} aria-label="Batting settings">
   <button ref={assistButton} className="assist-switch" aria-pressed={beginner} onClick={toggleAssist}>Beginner Assist <b>{beginner?'ON':'OFF'}</b></button>
   <button ref={helpButton} disabled={!betweenBalls} title={betweenBalls?'Batting guide':'Available between deliveries'} onClick={()=>{onSuspend(true);setPage(0)}}>How to play</button>
   <button className="debug-link" aria-pressed={debug} onClick={onDebug}>Debug {debug?'on':'off'}</button>
  </nav>
  <section className="batting-controls" aria-label="Controller and controls">
   <button className="phone-readiness" disabled={!betweenBalls} title={betweenBalls?'Open phone setup':'Phone setup available between deliveries'} onClick={()=>{onSuspend(true);setSetup(true)}}>{phoneStatus==='DISCONNECTED'?'PHONE DISCONNECTED':phoneStatus==='STALE'?'PHONE STALE':calibrated?'PHONE READY':'CALIBRATION NEEDED'}</button>
   {waiting&&<div className="next-delivery is-ready"><kbd>SPACE</kbd><span>NEXT BALL</span></div>}
  </section></>}
  {modal&&<div className="batting-dialog-scrim"><div ref={dialog} className="batting-dialog" role="dialog" aria-modal="true" aria-labelledby="batting-help-title">
   {setup?<><span className="dialog-count">Batting controller</span><h2 id="batting-help-title">Connect your phone</h2><PhoneSetup status={phoneStatus} calibrated={calibrated}/><div className="dialog-actions"><button className="primary" onClick={close}>Done</button></div></>:<>
    <span className="dialog-count">Batting settings</span><h2 id="batting-help-title">Beginner Assist</h2><p>{ASSIST_COPY.intro}</p>
    <ul>{ASSIST_COPY.items.map(item=><li key={item}>{item}</li>)}</ul><p>{ASSIST_COPY.outro}</p>
    <strong className="assist-current">Assist is {beginner?'ON':'OFF'}</strong><small>Changes apply to the next ball.</small>
    <div className="dialog-actions"><button onClick={close}>{beginner?'Keep on':'Keep off'}</button><button className="primary" onClick={()=>{onAssist(!beginner);close()}}>{beginner?'Turn off':'Turn on'}</button></div>
   </>}
   <small className="dialog-key-help">Esc to close · Tab to move between buttons</small>
  </div></div>}
  {page!==null&&<GuidedSetup firstVisit={initialOnboarding}
   status={{webcamConnected,webcamCalibrated,phoneConnected:phoneStatus==='CONNECTED',phoneCalibrated:calibrated}}
   onComplete={start} onClose={initialOnboarding?start:close}/>}
 </>
}
