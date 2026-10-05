import { Vector3 } from 'three'

// Compatibility helpers: the single position filter lives in Python.
export class PositionStabilizer {
  position=new Vector3()
  locked=false
  mode='DIRECT'
  private sampleId=-Infinity
  reset(){this.sampleId=-Infinity}
  update(raw:Vector3,time:number,id=time) {
    if(id>this.sampleId && [raw.x,raw.y,raw.z,id].every(Number.isFinite)) {
      this.sampleId=id;this.position.copy(raw)
    }
    return this.position
  }
}
export class RenderPosition {
  position=new Vector3()
  predictionMs=0
  update(position:Vector3,_velocity:Vector3,_received:number,_id:number,_now:number,_locked:boolean) {
    if([position.x,position.y,position.z].every(Number.isFinite))this.position.copy(position)
    return this.position
  }
  reset(){this.predictionMs=0}
}
