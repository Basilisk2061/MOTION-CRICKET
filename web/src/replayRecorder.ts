import { Object3D, Quaternion, Vector3 } from 'three'

export const REPLAY_SAMPLE_SECONDS=1/30
export const REPLAY_MAX_FRAMES=960
export const REPLAY_STRIDE=11 // position, quaternion, scale, visibility
export type ReplayEvent={type:'release'|'bounce'|'contact'|'boundary'|'wicket'|'collection';at:number}
export type ReplayFrame={at:number;transforms:Float32Array;hit:boolean;ball:readonly number[]}
export type ReplayClip={frames:ReplayFrame[];events:ReplayEvent[];result:string;start:number;end:number}
export function replayResult(result:string|null){return !!result&&['FOUR','SIX','BOWLED','CAUGHT','CAUGHT BEHIND'].includes(result)}

type TransformBuffer=Float32Array|Float64Array
export function captureTransforms(objects:readonly Object3D[],into:TransformBuffer=new Float32Array(objects.length*REPLAY_STRIDE)){
  objects.forEach((o,i)=>{
    const n=i*REPLAY_STRIDE
    o.position.toArray(into,n);o.quaternion.toArray(into,n+3);o.scale.toArray(into,n+7);into[n+10]=Number(o.visible)
  })
  return into
}
const qa=new Quaternion(),qb=new Quaternion()
export function applyTransforms(objects:readonly Object3D[],a:TransformBuffer,b=a,alpha=0){
  objects.forEach((o,i)=>{
    const n=i*REPLAY_STRIDE
    o.position.set(a[n]+(b[n]-a[n])*alpha,a[n+1]+(b[n+1]-a[n+1])*alpha,a[n+2]+(b[n+2]-a[n+2])*alpha)
    qa.fromArray(a,n+3);qb.fromArray(b,n+3);o.quaternion.copy(qa.slerp(qb,alpha))
    o.scale.set(a[n+7]+(b[n+7]-a[n+7])*alpha,a[n+8]+(b[n+8]-a[n+8])*alpha,a[n+9]+(b[n+9]-a[n+9])*alpha)
    o.visible=!!a[n+10]
  })
}

export class ReplayRecorder {
  frames:ReplayFrame[]=[]
  events:ReplayEvent[]=[]
  private next=-Infinity
  private seen=new Set<string>()
  clear(){this.frames=[];this.events=[];this.next=-Infinity;this.seen.clear()}
  event(type:ReplayEvent['type'],at:number,id:string=type){
    if(this.seen.has(id))return false
    this.seen.add(id);this.events.push({type,at});return true
  }
  record(at:number,objects:readonly Object3D[],ball:Vector3,hit:boolean,force=false){
    if(!force&&at+1e-6<this.next)return
    this.next=at+REPLAY_SAMPLE_SECONDS
    this.frames.push({at,transforms:captureTransforms(objects) as Float32Array,ball:ball.toArray(),hit})
    // Preserve the opening release/bounce/contact context as well as recent outcome.
    if(this.frames.length>REPLAY_MAX_FRAMES)this.frames.splice(180,1)
  }
  clip(result:string,outcomeAt:number):ReplayClip|null{
    if(!replayResult(result)||this.frames.length<2)return null
    const release=this.events.find(e=>e.type==='release')?.at??this.frames[0].at
    const start=Math.max(this.frames[0].at,release-.15)
    const end=Math.min(this.frames.at(-1)!.at,outcomeAt+(result==='BOWLED'?1.5:.55))
    const frames=this.frames.filter(f=>f.at>=start-REPLAY_SAMPLE_SECONDS&&f.at<=end+REPLAY_SAMPLE_SECONDS)
    return frames.length>1?{frames,events:this.events.filter(e=>e.at>=start&&e.at<=end),result,start:frames[0].at,end:frames.at(-1)!.at}:null
  }
}
