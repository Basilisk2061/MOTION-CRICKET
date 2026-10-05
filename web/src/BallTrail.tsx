import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute, LineSegments, ShaderMaterial } from 'three'
import { BallTrailHistory, TRAIL_STYLE } from './ballTrailHistory'
import type { Delivery } from './delivery'

export default function BallTrail({game}:{game:Delivery}) {
  const trail=useMemo(()=>{
    const geometry=new BufferGeometry()
    geometry.setAttribute('position',new Float32BufferAttribute(new Float32Array(192*6),3))
    geometry.setAttribute('opacity',new Float32BufferAttribute(new Float32Array(192*2),1))
    geometry.setDrawRange(0,0)
    const material=new ShaderMaterial({transparent:true,depthWrite:false,
      vertexShader:'attribute float opacity; varying float a; void main(){a=opacity;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying float a; void main(){gl_FragColor=vec4(.92,.76,.53,a);}'})
    const line=new LineSegments(geometry,material);line.frustumCulled=false
    return {line,geometry,material,history:new BallTrailHistory(),match:game.match,bounce:game.bounceId}
  },[game])
  useEffect(()=>()=>{trail.geometry.dispose();trail.material.dispose()},[trail])
  useFrame(({clock})=>{
    const now=clock.elapsedTime
    if(trail.match!==game.match || game.state==='READY') {
      trail.history.clear();trail.match=game.match;trail.bounce=game.bounceId
    }
    const incoming=game.released && !game.outcome && !game.match.hit && game.state!=='READY'
    trail.history.setMode(game.match.hit?'hit':'incoming')
    if((incoming || game.match.hit) && !game.fieldingHeld && !game.fieldingReturn && !game.match.stopped && game.visible) {
      if(game.bounceId!==trail.bounce) {
        trail.history.add(game.bouncePosition,now,true);trail.bounce=game.bounceId
      }
      trail.history.add(game.position,now)
    }
    trail.history.expire(now)
    const points=trail.history.points,style=TRAIL_STYLE[trail.history.mode]
    const positions=trail.geometry.getAttribute('position'),opacity=trail.geometry.getAttribute('opacity')
    for(let i=1;i<points.length;i++) for(let j=0;j<2;j++) {
      const point=points[i-1+j],index=(i-1)*2+j
      positions.setXYZ(index,point.p.x,point.p.y,point.p.z);opacity.setX(index,style.opacity*Math.max(0,1-(now-point.at)/style.duration))
    }
    positions.needsUpdate=true;opacity.needsUpdate=true
    trail.geometry.setDrawRange(0,Math.max(0,points.length-1)*2)
  })
  return <primitive object={trail.line} />
}
