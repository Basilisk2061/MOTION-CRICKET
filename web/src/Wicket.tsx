import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Vector3 } from 'three'
import { GAMEPLAY as T } from './gameplayTuning'
import { surfaceTexture } from './surfaceTextures'
import { GameAudio } from './gameAudio'
import { WICKET_VISUAL, type WicketImpact } from './wicketImpact'
import { WicketPresentation } from './wicketPresentation'

export default function Wicket({z,ground=T.groundY,x=WICKET_VISUAL.X,height=WICKET_VISUAL.HEIGHT,bailHeight=WICKET_VISUAL.BAIL_HEIGHT,getImpact,ready,debug=false,paused}:{
 z:number;ground?:number;x?:readonly number[];height?:number;bailHeight?:number;
 getImpact?:()=>WicketImpact|null;ready?:()=>boolean;debug?:boolean;paused?:()=>boolean}) {
  const wood=useMemo(()=>surfaceTexture('wood'),[])
  const key=x.join(',')
  const model=useMemo(()=>new WicketPresentation(x,bailHeight),[key,bailHeight])
  const audio=useMemo(()=>new GameAudio(),[]),stumps=useRef<(Group|null)[]>([]),bails=useRef<(Group|null)[]>([])
  const last=useRef<WicketImpact|null>(null),shake=useRef(new Vector3()),debugElement=useRef<HTMLPreElement|null>(null)
  useEffect(()=>{
    if(!getImpact)return
    const unlock=()=>audio.unlock(false)
    unlock()
    window.addEventListener('pointerdown',unlock);window.addEventListener('keydown',unlock)
    return()=>{window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);audio.dispose()}
  },[audio,!!getImpact])
  useEffect(()=>{
    if(!debug)return
    const element=document.createElement('pre');element.style.cssText='position:fixed;right:16px;bottom:130px;z-index:20;background:#111d;padding:10px;color:#ddd;font:10px monospace;pointer-events:none'
    document.body.appendChild(element);debugElement.current=element
    return()=>{element.remove();debugElement.current=null}
  },[debug])
  useFrame(({camera})=>{if(paused?.())return;camera.position.sub(shake.current);shake.current.set(0,0,0)},-2)
  useFrame(({camera},dt)=>{
    if(paused?.())return
    const event=getImpact?.()??null
    if(ready?.()){model.reset();last.current=event}
    else if(event&&event!==last.current){model.accept(event,(speed,strength)=>audio.wicketImpact(speed,strength));last.current=event}
    model.step(dt)
    model.stumps.forEach((p,i)=>{stumps.current[i]?.position.copy(p.position);stumps.current[i]?.rotation.set(p.rotation.x,p.rotation.y,p.rotation.z)})
    model.bails.forEach((p,i)=>{bails.current[i]?.position.copy(p.position);bails.current[i]?.rotation.set(p.rotation.x,p.rotation.y,p.rotation.z)})
    shake.current.copy(model.cameraOffset());camera.position.add(shake.current)
    if(debugElement.current){const e=model.impact,s=e?model.stumps[e.struckStump]:null
      debugElement.current.textContent=e?`WICKET IMPACT\nStump: ${e.struckStump} / strength ${e.strength.toFixed(2)}\nPosition: ${e.position.toArray().map(n=>n.toFixed(2))}\nHeight: ${e.impactHeight.toFixed(2)} / speed ${e.speed.toFixed(2)}\nVelocity: ${e.ballVelocity.toArray().map(n=>n.toFixed(2))}\nStump impulse: ${s?.linearImpulse.toArray().map(n=>n.toFixed(2))}\nAngular impulse: ${s?.angularImpulse.toArray().map(n=>n.toFixed(2))}\nBails: ${model.bails.map(b=>b.attached?'attached':'detached').join(' / ')}\nElapsed: ${model.elapsed.toFixed(2)}s`:'WICKET: upright / bails seated'}
  })
  useEffect(()=>()=>wood.dispose(),[wood])
  return <group position={[0,ground,z]}>
    {x.map((value,i)=><group key={value} ref={group=>{stumps.current[i]=group}} position={[value,0,0]}>
      <mesh position={[0,height/2,0]} castShadow receiveShadow><cylinderGeometry args={[.018,.019,height,12]} /><meshStandardMaterial map={wood} roughness={.65} /></mesh>
      {[.66,.68,.704].map(y=><mesh key={y} position={[0,y,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.018,.0015,4,12]} /><meshStandardMaterial color="#aa8250" /></mesh>)}
    </group>)}
    {[0,1].map(i=><group key={i} ref={group=>{bails.current[i]=group}} position={[(x[i]+x[i+1])/2,bailHeight,0]}>
      <mesh castShadow rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.007,.007,.11,10]} /><meshStandardMaterial map={wood} /></mesh>
      <mesh castShadow rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.012,.012,.052,10]} /><meshStandardMaterial map={wood} /></mesh>
    </group>)}
  </group>
}
