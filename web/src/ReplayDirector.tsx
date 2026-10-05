import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute, LineSegments, Object3D, Quaternion, ShaderMaterial, Vector3 } from 'three'
import type { Delivery } from './delivery'
import type { SessionScore } from './sessionScore'
import { applyTransforms, captureTransforms, ReplayRecorder, replayResult } from './replayRecorder'
import { ReplayCamera, type ReplaySession } from './replayPlayback'

type Root=RefObject<Object3D|null>
export default function ReplayDirector({game,score,replay,roots,hidden,suspended}:{
  game:Delivery;score:SessionScore;replay:ReplaySession;roots:Root[];hidden:Root[];suspended:boolean}){
  const state=useRef({recorder:new ReplayRecorder(),objects:[] as Object3D[],match:game.match,
    started:false,scoreAtStart:0,resultAt:null as number|null,played:false,lastHeld:false,lastBounce:game.bounceId,
    ball:new Vector3(),nextBall:new Vector3(),
    live:new Float64Array(0),camera:new ReplayCamera('FOUR'),savedPosition:new Vector3(),savedQuaternion:new Quaternion(),restoring:false})
  const trail=useMemo(()=>{
    const geometry=new BufferGeometry()
    geometry.setAttribute('position',new Float32BufferAttribute(new Float32Array(192*6),3))
    geometry.setAttribute('opacity',new Float32BufferAttribute(new Float32Array(192*2),1))
    const material=new ShaderMaterial({transparent:true,depthWrite:false,
      vertexShader:'attribute float opacity;varying float a;void main(){a=opacity;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying float a;void main(){gl_FragColor=vec4(.92,.76,.53,a);}'})
    const line=new LineSegments(geometry,material);line.visible=false;line.frustumCulled=false
    return {line,geometry,material}
  },[])
  useEffect(()=>()=>{trail.geometry.dispose();trail.material.dispose()},[trail])
  // Override only while drawing, after live animation; restore in finally.
  useFrame(({gl,scene,camera,clock},dt)=>{
    const s=state.current,now=clock.elapsedTime
    replay.tick(dt)
    if(s.restoring&&!replay.blocked){camera.position.copy(s.savedPosition);camera.quaternion.copy(s.savedQuaternion);s.restoring=false}
    if(!suspended&&!replay.blocked){
      if(game.state!=='READY'&&(!s.started||s.match!==game.match)){
        s.recorder.clear();s.objects=[]
        roots.forEach(root=>root.current?.traverse(o=>s.objects.push(o)))
        s.live=new Float64Array(s.objects.length*11);s.match=game.match;s.started=true
        s.scoreAtStart=score.totalLegalBalls;s.resultAt=null;s.played=false;s.lastHeld=false;s.lastBounce=game.bounceId;replay.pending=false
      }
      if(s.started&&(game.state!=='READY'||replay.pending)){
        let event=false
        if(game.released)event=s.recorder.event('release',now)||event
        if(game.bounceId!==s.lastBounce){event=s.recorder.event('bounce',now,`bounce:${game.bounceId}`)||event;s.lastBounce=game.bounceId}
        if(game.match.hit)event=s.recorder.event('contact',now-game.match.age)||event
        if(game.match.wicketImpact)event=s.recorder.event('wicket',now-Math.max(0,game.match.age-game.match.wicketImpact.timestamp))||event
        if((game.match.held||game.fieldingHeld)&&!s.lastHeld)event=s.recorder.event('collection',now)||event
        s.lastHeld=game.match.held||game.fieldingHeld
        if(replayResult(game.match.result)&&s.resultAt===null){
          s.resultAt=now;replay.pending=true
          if(game.match.result==='FOUR'||game.match.result==='SIX')s.recorder.event('boundary',now)
          else if(!game.match.wicketImpact)s.recorder.event('wicket',now)
          event=true
        }
        if(s.resultAt===null||now-s.resultAt<=1.6)
          s.recorder.record(now,s.objects,game.position,game.match.hit,event)
        const beat=game.match.result==='BOWLED'?1.5:.85
        if(!s.played&&s.resultAt!==null&&now-s.resultAt>=beat&&score.totalLegalBalls>s.scoreAtStart){
          const clip=s.recorder.clip(game.match.result!,s.resultAt)
          s.played=true;replay.pending=false
          if(clip){
            s.savedPosition.copy(camera.position);s.savedQuaternion.copy(camera.quaternion);s.restoring=true
            s.camera=new ReplayCamera(clip.result);replay.begin(clip)
          }
        }
      }
    }
    const playback=replay.playback
    if(!replay.blocked||!playback){trail.line.visible=false;gl.render(scene,camera);return}
    const sample=replay.playing?playback.step(dt):playback.sample(playback.time)
    captureTransforms(s.objects,s.live)
    const visibility=hidden.map(root=>root.current?.visible)
    try{
      applyTransforms(s.objects,sample.a.transforms,sample.b.transforms,sample.alpha)
      hidden.forEach(root=>{if(root.current)root.current.visible=false})
      const ball=s.ball.fromArray(sample.a.ball).lerp(s.nextBall.fromArray(sample.b.ball),sample.alpha)
      const contact=playback.clip.events.find(e=>e.type==='contact')?.at??Infinity
      s.camera.update(ball,playback.time>=contact,dt,(playback.time-playback.clip.start)/(playback.clip.end-playback.clip.start));camera.position.copy(s.camera.position);camera.lookAt(s.camera.target)
      const duration=sample.a.hit?4:.12,opacity=sample.a.hit?.42:.12
      const points=playback.clip.frames.filter(f=>f.at<=playback.time&&f.at>=playback.time-duration).slice(-191)
      const position=trail.geometry.getAttribute('position'),alpha=trail.geometry.getAttribute('opacity')
      for(let i=1;i<points.length;i++)for(let j=0;j<2;j++){
        const p=points[i-1+j],n=(i-1)*2+j
        position.setXYZ(n,p.ball[0],p.ball[1],p.ball[2]);alpha.setX(n,opacity*Math.max(0,1-(playback.time-p.at)/duration))
      }
      position.needsUpdate=true;alpha.needsUpdate=true;trail.geometry.setDrawRange(0,Math.max(0,points.length-1)*2);trail.line.visible=true
      gl.render(scene,camera)
    }finally{
      applyTransforms(s.objects,s.live)
      hidden.forEach((root,i)=>{if(root.current)root.current.visible=visibility[i]??true})
      trail.line.visible=false
    }
    if(playback.finished&&replay.playing)replay.skip()
  },1)
  return <primitive object={trail.line}/>
}
