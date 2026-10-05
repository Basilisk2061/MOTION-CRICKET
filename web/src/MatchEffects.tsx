import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Mesh, MeshBasicMaterial } from 'three'
import type { Delivery } from './delivery'
import { GameAudio } from './gameAudio'

export default function MatchEffects({ game }: { game: Delivery }) {
  const audio = useMemo(()=>new GameAudio(),[]), ring = useRef<Mesh>(null)
  const material = useMemo(()=>new MeshBasicMaterial({color:'#f4dfb0',transparent:true,depthWrite:false,side:2}),[])
  const last = useRef({hit:false,bounce:game.bounceId,age:1,released:false,held:false})
  useEffect(()=>{
    const unlock = ()=>audio.unlock()
    window.addEventListener('pointerdown',unlock); window.addEventListener('keydown',unlock)
    return ()=>{window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);audio.dispose();material.dispose()}
  },[audio,material])
  useFrame(({camera},dt)=>{
    const s = last.current, hit = game.outcome === 'HIT'
    if(game.released&&!s.released)audio.event('bowler-release')
    if(game.match.held&&!s.held&&!game.fieldingHeld&&game.match.result!=='CAUGHT')audio.event('keeper-glove')
    s.released=game.released;s.held=game.match.held
    if(hit && !s.hit) {
      audio.impact(game.quality ?? 'GOOD',game.velocity.length()); s.age = 0
      ring.current!.position.copy(game.position)
    }
    if(game.bounceId !== s.bounce) { audio.impact('BOUNCE',game.velocity.length()); s.bounce=game.bounceId }
    s.hit=hit; s.age+=dt
    ring.current!.visible=s.age<.13; ring.current!.quaternion.copy(camera.quaternion)
    ring.current!.scale.setScalar(.025+s.age*.45); material.opacity=Math.max(0,1-s.age/.13)*.4
  })
  return <mesh ref={ring} material={material} visible={false}><ringGeometry args={[.8,1,16]} /></mesh>
}
