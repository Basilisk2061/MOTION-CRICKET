import { Vector3 } from 'three'
import type { ReplayClip, ReplayFrame } from './replayRecorder'

export class ReplayPlayback {
  time:number
  age=0
  index=0
  finished=false
  readonly focus:number
  readonly cruise:number
  constructor(public clip:ReplayClip){
    this.time=clip.start
    this.focus=clip.events.find(e=>e.type===(clip.result==='BOWLED'?'wicket':'contact'))?.at??clip.end-.5
    // Preserve the full recorded flight; compress long boundary travel, not physics.
    this.cruise=Math.max(.65,(clip.end-clip.start-.35)/3.4)
  }
  step(dt:number){
    const distance=Math.abs(this.time-this.focus)
    const speed=distance<.14?.42:distance<.38?.65:this.cruise
    this.age+=dt;this.time=Math.min(this.clip.end,this.time+Math.min(dt,.1)*speed)
    this.finished=this.time>=this.clip.end
    return this.sample(this.time)
  }
  sample(time:number):{a:ReplayFrame;b:ReplayFrame;alpha:number}{
    const frames=this.clip.frames
    while(this.index<frames.length-2&&frames[this.index+1].at<=time)this.index++
    const a=frames[this.index],b=frames[this.index+1]??a
    return {a,b,alpha:Math.max(0,Math.min(1,(time-a.at)/Math.max(.00001,b.at-a.at)))}
  }
}

export class ReplaySession {
  phase:'IDLE'|'PLAYING'|'EXITING'|'RETURNING'='IDLE'
  pending=false
  result=''
  playback:ReplayPlayback|null=null
  private exitTime=0
  private listeners=new Set<()=>void>()
  revision=0
  get playing(){return this.phase==='PLAYING'}
  get blocked(){return this.phase==='PLAYING'||this.phase==='EXITING'}
  get inputBlocked(){return this.pending||this.phase!=='IDLE'}
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
  snapshot=()=>this.revision
  private changed(){this.revision++;this.listeners.forEach(f=>f())}
  begin(clip:ReplayClip){this.pending=false;this.result=clip.result;this.playback=new ReplayPlayback(clip);this.phase='PLAYING';this.changed()}
  skip(){if(this.phase==='IDLE')return false;if(this.phase!=='PLAYING')return true;this.phase='EXITING';this.exitTime=.16;this.changed();return true}
  tick(dt:number){
    if(this.phase==='EXITING'||this.phase==='RETURNING'){
      this.exitTime-=dt
      if(this.exitTime<=0){this.phase=this.phase==='EXITING'?'RETURNING':'IDLE';this.exitTime=.16;this.playback=null;this.changed()}
    }
  }
  consumeKey(code:string){if(!this.inputBlocked||!['Space','Escape'].includes(code))return false;if(this.blocked)this.skip();return true}
}

export class ReplayCamera {
  position=new Vector3()
  target=new Vector3()
  private desired=new Vector3()
  private desiredTarget=new Vector3()
  private centre=new Vector3(0,1,0)
  constructor(private result:string){
    this.position.set(result==='BOWLED'?3.2:result==='SIX'?-3.8:-4.2,result==='SIX'?1.5:2.5,4.8)
    this.target.set(0,.85,-1)
  }
  update(ball:Vector3,afterContact:boolean,dt:number,progress=0){
    if(this.result==='BOWLED'){
      this.desired.set(3.2,1.8,3.8);this.desiredTarget.set(0,.6,.5)
    }else{
      const travel=afterContact?Math.max(0,Math.min(1,ball.distanceTo(this.centre)/16)):0
      this.desired.set(this.result==='SIX'?-3.8:-4.2,this.result==='SIX'?1.5:2.5,4.8)
      this.desired.addScaledVector(ball,travel*.32)
      this.desired.y=Math.max(this.result==='SIX'?1.5:2.5,this.desired.y)
      this.desiredTarget.set(0,.85,-1).lerp(ball,travel)
      if(this.result==='CAUGHT BEHIND'){
        this.desired.set(3.2,2.2,6.5);this.desiredTarget.lerp(ball,.8)
      }else if(this.result==='CAUGHT'&&progress>.7){
        this.desired.copy(ball).add(this.centre.set(4,2.4,5));this.centre.set(0,1,0)
        this.desiredTarget.copy(ball)
      }
    }
    const alpha=1-Math.exp(-dt/.22)
    this.position.lerp(this.desired,alpha);this.target.lerp(this.desiredTarget,alpha)
  }
}
