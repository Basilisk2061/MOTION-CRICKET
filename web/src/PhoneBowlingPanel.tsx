import { useEffect, useState } from 'react'
import type { BowlingController, SwingIntent } from './bowlingController'
import { bowlingPreview } from './bowlingPreview'
import { lengthLabel, lineLabel } from './bowlingFeedback'
import { playableDelivery } from './bowlingLandingGuide'
import { pitchTapTarget, pitchTargetUV } from './bowlingTarget'
import { LAB_TUNING as T } from './bowlingLabTuning'
import './bowlingLab.css'
export default function PhoneBowlingPanel({controller,connected,fresh,enabled,ready,enable,calibrate}:{
 controller:BowlingController;connected:boolean;fresh:boolean;enabled:boolean;ready:boolean;enable:()=>void;
 calibrate:()=>void}){
 const [swingIntent,setSwingIntent]=useState<SwingIntent>('NONE')
 const [,refreshTarget]=useState(0)
 const held=controller.holding
 controller.swingIntent=swingIntent
 const canArm=ready&&fresh&&connected&&!!controller.calibration.reference
 useEffect(()=>{
  const cancel=()=>{controller.cancel();refreshTarget(n=>n+1)}
  const visibility=()=>{if(document.hidden)cancel()}
  window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',visibility)
  return()=>{controller.cancel();window.removeEventListener('blur',cancel);document.removeEventListener('visibilitychange',visibility)}
 },[])
 useEffect(()=>{if(!canArm&&controller.holding)controller.cancel()},[canArm,controller])
 const intent=bowlingPreview(controller.pose()).controls
 const target=controller.target,uv=pitchTargetUV(target)
 return <div className="phone-bowling">
  <div className="phone-heading"><span className="eyebrow">Motion Cricket / Experimental</span><span>{connected?'CONNECTED':'DISCONNECTED'}</span></div>
  <h1>BOWLING LAB</h1><p className="lab-safety">Keep the phone securely in your hand. NEVER throw or release the phone.</p>
  {!enabled && <button onClick={enable}>ENABLE MOTION</button>}
  <button onClick={calibrate} disabled={!fresh||held}>CALIBRATE BOWLING</button>
  <p>{!fresh?'Waiting for sensors':!controller.calibration.reference?'Hold your natural bowling grip, then calibrate.':!ready?'DELIVERY ACTIVE':held?'Perform your bowling action. Keep holding the phone securely.':'Choose target and swing, then press READY TO BOWL.'}</p>
  <div className="lab-target-heading">BATSMAN / CREASE</div>
  <button type="button" className="lab-pitch-target" aria-label="Select bowling bounce target" disabled={held||!ready}
   onPointerDown={event=>{
    if(held||!ready)return
    const rect=event.currentTarget.getBoundingClientRect()
    controller.selectTarget(pitchTapTarget((event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height))
    refreshTarget(n=>n+1)
   }}>
   <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <rect x="0" y="0" width="100" height="100" fill="#444444"/>
    {[['VERY SHORT',T.MIN_PITCH_TARGET,T.SHORT_LENGTH_LIMIT],['SHORT',T.SHORT_LENGTH_LIMIT,T.GOOD_LENGTH_LIMIT],['GOOD',T.GOOD_LENGTH_LIMIT,T.FULL_LENGTH_LIMIT],['FULL',T.FULL_LENGTH_LIMIT,T.YORKER_LENGTH_LIMIT],['YORKER',T.YORKER_LENGTH_LIMIT,T.MAX_PITCH_TARGET]].map(([label,start,end],i)=>{
     const y=pitchTargetUV({x:0,z:Number(end)}).v*100,h=(Number(end)-Number(start))/(T.MAX_PITCH_TARGET-T.MIN_PITCH_TARGET)*100
     return <g key={String(label)}><rect x="0" y={y} width="100" height={h} fill={i%2?'#dddddd':'#999999'} opacity=".22"/>
      <text x="50" y={y+h/2+2} textAnchor="middle" fill="#eeeeee" fontSize="5">{label}</text></g>
    })}
    <line x1="50" x2="50" y1="0" y2="100" stroke="#dddddd" strokeDasharray="2 3" opacity=".5"/>
    <ellipse cx={uv.u*100} cy={uv.v*100} rx="8" ry="7" fill="#ffffff" stroke="#eeeeee" opacity=".8"/>
   </svg>
  </button>
  <div className="lab-target-caption"><span>LEG</span><span>BOWLER</span><span>OFF</span></div>
  <p>TARGET: {lineLabel(target.x)} · {lengthLabel(target.z)}{intent&&playableDelivery(intent)&&<> · READY</>}</p>
  <div className="lab-swing-control"><span>SWING</span><div role="group" aria-label="Swing intent">
   {(['IN','NONE','OUT'] as const).map(intent=><button key={intent} type="button" disabled={held}
    aria-pressed={swingIntent===intent} onClick={()=>setSwingIntent(intent)}>{intent}</button>)}
  </div></div>
  <button className={`touch-bowl ${held?'armed':''}`} disabled={!canArm||held}
   onClick={()=>{
    if(canArm&&!held){controller.arm(Date.now());refreshTarget(n=>n+1)}
   }}>
   {!ready?'DELIVERY ACTIVE':controller.motion.state==='MOTION_STARTED'?'BOWLING...':held?'WAITING FOR BOWLING MOTION':'READY TO BOWL'}<small>The ball releases automatically. Keep holding your phone securely.</small>
  </button>
  {held&&<button type="button" onClick={()=>{controller.cancel();refreshTarget(n=>n+1)}}>CANCEL</button>}
 </div>
}
