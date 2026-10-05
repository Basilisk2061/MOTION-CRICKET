import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, CanvasTexture, Group, Line, LineBasicMaterial, Mesh, Quaternion, Vector3 } from 'three'
import type { useController } from './controller'
import { bowlingParameters } from './bowlingController'
import { BowlingPhysics } from './bowlingPhysics'
import { bowlingFeedback, lengthLabel, lineLabel } from './bowlingFeedback'
import { bowlingLandingGuide, playableDelivery } from './bowlingLandingGuide'
import { LAB_TUNING as T } from './bowlingLabTuning'
import { MOTION_TUNING as M } from './bowlingMotion'
import Wicket from './Wicket'
import { bowlingPreview, handoffPosition, PREVIEW_TUNING } from './bowlingPreview'
import './bowlingLab.css'
type Feed=ReturnType<typeof useController>
type PreviewDebug={position:Vector3;release:Vector3|null;initial:Vector3|null}
function PitchLabel({text,x,z}:{text:string;x:number;z:number}){
 const texture=useMemo(()=>{
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64
  const context=canvas.getContext('2d')!
  context.font='bold 30px sans-serif';context.fillStyle='#e5ddc8';context.textAlign='center';context.fillText(text,128,43)
  return new CanvasTexture(canvas)
 },[text])
 useEffect(()=>()=>texture.dispose(),[texture])
 return <mesh position={[x,.033,z]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[1.1,.28]}/><meshBasicMaterial map={texture} transparent opacity={.8} depthWrite={false}/></mesh>
}
function LabScene({feed,physics,diagnostic,debug}:{feed:Feed;physics:BowlingPhysics;diagnostic:PreviewDebug;debug:boolean}){
 const ball=useRef<Group>(null),last=useRef(feed.bowlingRelease.current?.sequence??0)
 const offset=useRef(new Vector3()),age=useRef(0),rotation=useRef(new Quaternion())
 const guide=useRef<Mesh>(null),predicted=useRef<{key:string;center:Vector3}|null>(null)
 const intended=useRef<Mesh>(null)
 const history=useRef<{at:number;point:Vector3}[]>([])
 const trail=useMemo(()=>{
  const geometry=new BufferGeometry()
  geometry.setAttribute('position',new BufferAttribute(new Float32Array(T.TRAIL_POINTS*3),3))
  geometry.setAttribute('color',new BufferAttribute(new Float32Array(T.TRAIL_POINTS*3),3))
  const line=new Line(geometry,new LineBasicMaterial({vertexColors:true,transparent:true,opacity:.45,depthWrite:false}))
  line.frustumCulled=false;return line
 },[])
 useEffect(()=>()=>{trail.geometry.dispose();trail.material.dispose()},[trail])
 const {camera}=useThree()
 useEffect(()=>{camera.lookAt(0,.8,0)},[camera])
 useFrame((_,dt)=>{
  const sample=feed.bowlingRelease.current
  const live=feed.bowlingPose.current
  const preview=bowlingPreview(live && feed.phoneConnected.current && performance.now()-live.received<PREVIEW_TUNING.STALE_MS?live.message:null)
  if(intended.current){
   intended.current.visible=physics.ready&&!!preview.controls
   if(preview.controls)intended.current.position.set(preview.controls.selectedTarget.x,.044,preview.controls.selectedTarget.z)
  }
  if(guide.current){
   guide.current.visible=physics.ready&&!!preview.controls
   if(preview.controls&&physics.ready){
    const key=JSON.stringify(preview.controls)
    if(predicted.current?.key!==key)predicted.current={key,center:bowlingLandingGuide(preview.controls).center}
    const center=live?.message.holding?predicted.current.center:new Vector3(preview.controls.selectedTarget.x,.056,preview.controls.selectedTarget.z)
    guide.current.position.set(center.x,.039,center.z)
    const material=guide.current.material as import('three').MeshBasicMaterial
    material.opacity=live?.message.holding ? .42 : .29
    material.color.set(playableDelivery(preview.controls)?'#d4d7ac':'#e3c59d')
   }
  }
  if(physics.ready && ball.current){
   ball.current.position.copy(preview.position);ball.current.quaternion.copy(preview.orientation)
   diagnostic.position.copy(preview.position)
  }
  let released=false
  if(sample && sample.sequence!==last.current){
   last.current=sample.sequence
   if(performance.now()-sample.received<400 && feed.phoneConnected.current && physics.ready){
    const shown=ball.current?.position.clone()??preview.position.clone()
    rotation.current.copy(ball.current?.quaternion??preview.orientation)
    if(physics.release(bowlingParameters(sample.message))){
     offset.current.copy(shown).sub(physics.position);age.current=0;released=true
     diagnostic.release=shown;diagnostic.initial=handoffPosition(physics.position,offset.current,0)
    }
   }
  }
  physics.step(dt);age.current+=dt
  feed.publishBowlingLab(true,physics.ready)
  if(guide.current&&!physics.ready)guide.current.visible=false
  if(intended.current&&!physics.ready)intended.current.visible=false
  if(ball.current){
   ball.current.visible=true
   if(!physics.ready){
    ball.current.position.copy(handoffPosition(physics.position,offset.current,age.current))
    ball.current.quaternion.copy(rotation.current).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),age.current*T.BALL_ROTATION_RAD_S))
   }
   if(released)history.current=[]
   const now=performance.now()/1000
   history.current=history.current.filter(p=>now-p.at<T.TRAIL_SECONDS)
   if(physics.state==='FLIGHT')history.current.push({at:now,point:ball.current.position.clone()})
   history.current=history.current.slice(-T.TRAIL_POINTS)
   const positions=trail.geometry.getAttribute('position'),colors=trail.geometry.getAttribute('color')
   history.current.forEach((p,i)=>{
    positions.setXYZ(i,p.point.x,p.point.y,p.point.z)
    const fade=Math.max(0,1-(now-p.at)/T.TRAIL_SECONDS)
    colors.setXYZ(i,.08+.65*fade,.11+.57*fade,.13+.43*fade)
   })
   positions.needsUpdate=true;colors.needsUpdate=true;trail.geometry.setDrawRange(0,history.current.length)
   trail.visible=history.current.length>1&&!physics.ready
  }
 })
 return <>
  <primitive object={trail}/>
  <color attach="background" args={['#141c20']}/><fog attach="fog" args={['#141c20',35,90]}/>
  <ambientLight intensity={.8}/><directionalLight position={[8,16,-12]} intensity={2.4} castShadow/>
  <mesh rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[90,90]}/><meshStandardMaterial color="#253e32" roughness={1}/></mesh>
  <mesh position={[0,.013,-9]} rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[2.6,22]}/><meshStandardMaterial color="#8a795a" roughness={1}/></mesh>
  {[-.65,-17.5].map(z=><mesh key={z} position={[0,.023,z]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[2.8,.035]}/><meshBasicMaterial color="#e8e4d5"/></mesh>)}
  <Wicket z={0} ground={0} x={[-.105,0,.105]} height={.72} bailHeight={.725} getImpact={()=>physics.wicketImpact} ready={()=>physics.ready} debug={debug}/>
  {[[-1.7,1,'YORKER'],[-3.5,2.6,'FULL'],[-6,2.4,'GOOD'],[-8.1,1.8,'SHORT'],[-9.5,1,'VERY SHORT']].map(([z,depth,label],i)=><group key={String(label)}>
   <mesh position={[0,.026,Number(z)]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[2.6,Number(depth)]}/><meshBasicMaterial color={i%2?'#ddd2b3':'#b5bdaf'} transparent opacity={.11}/></mesh>
   <PitchLabel text={String(label)} x={1.9} z={Number(z)}/>
  </group>)}
  {[[-.9,'OFF'],[0,'STUMPS'],[.9,'LEG']].map(([x,text])=><PitchLabel key={String(text)} text={String(text)} x={Number(x)} z={.9}/>)}
  <mesh ref={guide} rotation={[-Math.PI/2,0,0]} scale={[T.LANDING_RADIUS_X,T.LANDING_RADIUS_Z,1]} visible={false}>
   <circleGeometry args={[1,48]}/><meshBasicMaterial color="#e3d7b1" transparent opacity={.16} depthWrite={false}/>
  </mesh>
  <mesh ref={intended} rotation={[-Math.PI/2,0,0]} visible={false}><ringGeometry args={[.065,.105,32]}/><meshBasicMaterial color="#fff1c4" transparent opacity={.85} depthWrite={false}/></mesh>
  <group ref={ball}>
   <mesh castShadow><sphereGeometry args={[.056,28,20]}/><meshStandardMaterial color="#bb323a" roughness={.65}/></mesh>
   {[-.003,.003].map(z=><mesh key={z} position={[0,0,z]}><torusGeometry args={[.0558,.0012,6,64]}/><meshStandardMaterial color="#ead8ba"/></mesh>)}
   {Array.from({length:28},(_,i)=>{const a=i*Math.PI*2/28;return <mesh key={i} position={[Math.cos(a)*.056,Math.sin(a)*.056,0]} rotation={[0,0,a]}><boxGeometry args={[.0014,.0025,.009]}/><meshStandardMaterial color="#ead8ba"/></mesh>})}
  </group>
  {[-7,7].map(x=><mesh key={x} position={[x,.28,-9]}><boxGeometry args={[.25,.55,24]}/><meshStandardMaterial color="#212c2f"/></mesh>)}
 </>
}
export default function BowlingLab({feed,onBack}:{feed:Feed;onBack:()=>void}){
 const physics=useMemo(()=>new BowlingPhysics(),[]),[debug,setDebug]=useState(false),[,refresh]=useState(0)
 const diagnostic=useMemo<PreviewDebug>(()=>({position:new Vector3(0,2,-18),release:null,initial:null}),[])
 const publisher=feed.publishBowlingLab
 const back=useRef(onBack);back.current=onBack
 useEffect(()=>{
  const timer=setInterval(()=>refresh(n=>n+1),100)
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();back.current()}}
  window.addEventListener('keydown',key)
  return()=>{clearInterval(timer);window.removeEventListener('keydown',key);publisher(false,false)}
 },[publisher])
 const p=physics.parameters
 const feedback=physics.state==='FLIGHT'?null:bowlingFeedback(physics)
 const live=feed.bowlingPose.current?.message,controls=bowlingPreview(live??null).controls
 const landing=useMemo(()=>controls?bowlingLandingGuide(controls):null,[live])
 return <main className="bowling-lab-screen">
  <Canvas shadows dpr={[1,1.5]} camera={{position:[0,2.1,-19.5],fov:52,near:.03,far:100}}>
   <LabScene feed={feed} physics={physics} diagnostic={diagnostic} debug={debug}/>
  </Canvas>
  <div className="lab-title"><span className="eyebrow">EXPERIMENTAL / PHONE MOTION</span><h1>BOWLING LAB</h1><p>Keep your phone in your hand. Never throw it.</p></div>
  <div className="lab-actions"><button onClick={onBack}>← BACK</button><button onClick={()=>setDebug(v=>!v)}>DEBUG {debug?'ON':'OFF'}</button></div>
  <div className="lab-feedback" role="status">
   {physics.ready&&feed.phoneConnected.current&&live&&controls&&<p><strong>{live.motion?.state==='MOTION_STARTED'?'BOWLING...':live.holding?'WAITING FOR BOWLING MOTION':playableDelivery(controls)?'DELIVERY READY':'READY'}</strong> · TARGET: {lineLabel(controls.selectedTarget.x)} · {lengthLabel(controls.selectedTarget.z)} · SWING: {live.swingIntent??'NONE'}<br/><small>Choose target and swing, press READY, then bowl while holding your phone securely.</small></p>}
   <strong>{physics.hitStumps?'HIT STUMPS':physics.state==='FLIGHT'?'DELIVERY IN FLIGHT':physics.ready?'READY TO BOWL':'DELIVERY COMPLETE'}</strong>
   <p>{feedback?`${feedback.length} · ${feedback.bounceLine} · ${feedback.swing} / ${feedback.swingAmount}`:physics.state==='FLIGHT'?'Watch the ball curve. Results follow the delivery.':'On your phone: calibrate, select target and swing, press READY TO BOWL, then perform your bowling motion.'}</p>
   {feedback&&feedback.targetError!==null&&<p>INTENDED: {feedback.intendedLine} · {feedback.intendedLength}<br/>{feedback.accuracy} · Error {feedback.targetError.toFixed(2)} game units</p>}
   {feedback && <p>{feedback.kmh.toFixed(1)} simulated km/h <small>({feedback.speed.toFixed(2)} game units/s)</small>
    {feedback.pitchDistance!==null && <> · Pitched {feedback.pitchDistance.toFixed(2)} game units before stumps</>} · Airborne swing {Math.abs(feedback.displacement).toFixed(2)} game units</p>}
   {!feed.phoneConnected.current && <small>PHONE NOT CONNECTED · open /controller using your existing trusted HTTPS setup</small>}
   {physics.state==='DONE' && !physics.wicketHolding && <button onClick={()=>physics.reset()}>BOWL AGAIN</button>}
  </div>
  {debug && <div className="lab-debug"><p>RELEASE SOURCE: {p?.source??'--'}</p>
   <p>LIVE BOWLING POSE / HOLDING: {String(live?.holding??false)} / SWING: {live?.swingIntent??'NONE'}</p>
   <p>MOTION STATE: {live?.motion?.state??'--'} / GYRO XYZ: {live?.motion?.gyro?Object.values(live.motion.gyro).map(n=>n.toFixed(2)).join(' / '):'--'}</p>
   <p>GYRO MAGNITUDE: {live?.motion?.gyro?Math.hypot(live.motion.gyro.x,live.motion.gyro.y,live.motion.gyro.z).toFixed(2):'--'} / FILTERED: {live?.motion?.filtered.toFixed(2)} / PEAK: {live?.motion?.peak.toFixed(2)}</p>
   <p>HISTORY (300ms): {live?.motion?.history.map(n=>n.toFixed(1)).join(' / ')} / ANGLE: {live?.motion?.angle.toFixed(2)} / COHERENCE: {live?.motion?.coherence?.toFixed(2)}</p>
   <p>ONSET: {M.ONSET_RAD_S} rad/s over {M.ONSET_MS}ms / RELEASE: peak ≥ {M.MIN_PEAK}, drop to {M.DECEL_RATIO*100}% over {M.DECEL_MS}ms</p>
   <p>PACE METRIC (75th percentile): {live?.motion?.paceMetric.toFixed(2)} / RELEASE AT: {live?.motion?.releaseAt??'--'}</p>
   <p>PREPARATION DIRECTION: {live?.motion?.preparationDirection?Object.values(live.motion.preparationDirection).map(n=>n.toFixed(2)).join(' / '):'--'} / CURRENT DIRECTION: {live?.motion?.direction?Object.values(live.motion.direction).map(n=>n.toFixed(2)).join(' / '):'--'} / DOT: {live?.motion?.directionDot?.toFixed(2)}</p>
   <p>PREPARATION PEAK / ANGLE: {live?.motion?.preparationPeak?.toFixed(2)} / {live?.motion?.preparationAngle?.toFixed(2)} / REVERSAL: {String(live?.motion?.reversal??false)} / FORWARD ONLY: {String(live?.motion?.forwardOnly??false)}</p>
   <p>FORWARD PACE SAMPLES: {live?.motion?.paceSamples?.map(n=>n.toFixed(1)).join(' / ')} / RELEASE ORIENTATION: {p?Object.values(p.orientation).map(n=>n.toFixed(3)).join(' / '):'--'}</p>
   <p>PHASE GATE: preparation ≥ {M.PREP_RAD_S} rad/s, {M.PREP_MS}ms / reversal dot ≤ {M.REVERSAL_DOT}, {M.REVERSAL_MS}ms / READY GUARD {M.ARM_GUARD_MS}ms / FORWARD-ONLY quiet {M.FORWARD_ONLY_QUIET_MS}ms</p>
   <p>YAW / PITCH: {controls?[controls.yaw,controls.pitch].map(n=>n.toFixed(3)).join(' / '):'--'} · POST DEADZONE: {controls?[controls.postDeadzoneYaw,controls.postDeadzonePitch].map(n=>n.toFixed(3)).join(' / '):'--'}</p>
   <p>PROSPECTIVE LINE / PITCH: {controls?[controls.line,controls.bounceZ].map(n=>n.toFixed(3)).join(' / '):'--'}</p>
   <p>SELECTED TARGET / RELEASE ERROR: {controls?`${controls.selectedTarget.x.toFixed(3)} / ${controls.selectedTarget.z.toFixed(3)} ; ${controls.lineError.toFixed(3)} / ${controls.lengthError.toFixed(3)}`:'--'}</p>
   <p>PREDICTED LANDING: {landing?.center.toArray().map(n=>n.toFixed(3)).join(' / ')} · RADII: {landing?.radiusX} / {landing?.radiusZ}</p>
   <p>RELEASE ERROR INPUTS / INTENSITY: {controls?[controls.lineInput,controls.lengthInput,controls.intensity].map(n=>n.toFixed(3)).join(' / '):'--'}</p>
   <p>LIVE ORIENTATION: {live?Object.values(live.orientation).map(n=>n.toFixed(3)).join(' / '):'--'}</p>
   <p>PREVIEW XYZ: {diagnostic.position.toArray().map(n=>n.toFixed(3)).join(' / ')}</p>
   <p>RELEASE PREVIEW / INITIAL VISUAL: {diagnostic.release?.toArray().map(n=>n.toFixed(3)).join(' / ')} ; {diagnostic.initial?.toArray().map(n=>n.toFixed(3)).join(' / ')}</p>
   <p>HANDOFF DISTANCE: {diagnostic.release&&diagnostic.initial?diagnostic.release.distanceTo(diagnostic.initial).toFixed(6):'--'} / PHYSICS ANCHOR: 0 / 2 / -18</p>
   <p>ORIENTATION: {p?Object.values(p.orientation).map(n=>n.toFixed(3)).join(' / '):'--'}</p>
   <p>ANGULAR SPEED: {p?.angularSpeed.toFixed(2)??'--'} rad/s</p>
   <p>SWING INTENT: {p?.swingIntent??'--'} · ACCELERATION: {p?.swingAcceleration.toFixed(3)??'--'}</p>
   <p>RELEASE INTENSITY: {p?.intensity.toFixed(3)??'--'} · FORWARD PACE: {p?.speed.toFixed(2)??'--'}</p>
   <p>LINE INPUT: {p?.lineInput.toFixed(3)??'--'} · TARGET: {p?.line.toFixed(2)??'--'}</p>
   <p>LENGTH INPUT: {p?.lengthInput.toFixed(3)??'--'} · PITCH TARGET Z: {p?.bounceZ.toFixed(2)??'--'}</p>
   <p>SWING MAGNITUDE: {p?.swingMagnitude.toFixed(3)??'--'} · ACTUAL DISPLACEMENT: {feedback?.displacement.toFixed(3)??'--'}</p>
   <p>AXIAL SPIN IMPULSE: {p?.spin.toFixed(2)??'--'}</p>
   <p>ACTUAL BOUNCE: {physics.bounced?physics.bouncePosition.toArray().map(n=>n.toFixed(2)).join(' / '):'--'}</p>
   <p>ACTUAL STUMP-PLANE LINE: {physics.wicketPlanePosition?.x.toFixed(3)??'--'}</p>
  </div>}
 </main>
}
