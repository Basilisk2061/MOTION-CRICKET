import { Vector3 } from 'three'

import { BASE_RIGHT_HAND_POSITION } from './controller'

import { SWING_CONTINUITY as T } from './gameplayTuning'


export type HandleSource =
  | 'MEASURED'
  | 'PREDICTED'
  | 'HELD'


export type AssistLevel =
  | 'NORMAL'
  | 'DEGRADED'
  | 'SWING-LOSS'


export type HandleSample = {
  sampleTime?: number
  estimated?: boolean
  measurementAgeMs?: number
  sampleId?: number
  received: number
  position: Vector3
  velocity: Vector3 | null
}


export type SwingContactContext = {
  now: number
  swingActive: boolean
  source: HandleSource
  level: AssistLevel
  predictionAgeMs: number
  reacquiring: boolean
}


// ------------------------------------------------------------
// PHONE SWING DETECTION
// ------------------------------------------------------------

export class PhoneSwing {
  active = false

  private highSince: number | null = null
  private lowSince: number | null = null
  private lastSample = -Infinity


  reset() {
    this.active = false
    this.highSince = null
    this.lowSince = null
    this.lastSample = -Infinity
  }


  update(
    now: number,
    sampleId: number,
    fresh: boolean,
    angularSpeed: number,
    swingSpeed: number,
  ) {
    if (
      !fresh ||
      now - sampleId > T.SWING_SAMPLE_GAP_MS
    ) {
      this.reset()
      return false
    }


    if (sampleId === this.lastSample) {
      return this.active
    }


    if (
      sampleId - this.lastSample >
      T.SWING_SAMPLE_GAP_MS
    ) {
      this.highSince = null
      this.lowSince = null
    }


    this.lastSample = sampleId


    const speed = Math.max(
      angularSpeed,
      swingSpeed / T.SWING_LEVER_METRES,
    )


    if (!this.active) {
      if (speed >= T.SWING_START_RAD_S) {
        if (this.highSince === null) {
          this.highSince = now
        } else if (
          now - this.highSince >=
          T.SWING_CONFIRM_MS
        ) {
          this.active = true
          this.lowSince = null
        }
      } else {
        this.highSince = null
      }
    } else if (
      speed < T.SWING_END_RAD_S
    ) {
      if (this.lowSince === null) {
        this.lowSince = now
      } else if (
        now - this.lowSince >=
        T.SWING_RELEASE_MS
      ) {
        this.active = false
        this.highSince = null
      }
    } else {
      this.lowSince = null
    }


    return this.active
  }
}


// Python filters position. The browser applies each new sample directly.
export class HandleContinuity {
  position=new Vector3(...BASE_RIGHT_HAND_POSITION)
  target=this.position.clone()
  velocity=new Vector3()
  source:HandleSource='HELD'
  predictionAgeMs=0
  reacquiring=false
  correctingThisFrame=false
  private sampleId=-Infinity
  private sampleTime:number|null=null
  get mode(){return this.source==='HELD'?'HELD':'DIRECT'}
  reset(position:Vector3) {
    this.position.copy(position);this.target.copy(position);this.velocity.set(0,0,0)
    this.source='HELD';this.predictionAgeMs=0;this.reacquiring=false;this.correctingThisFrame=false
    this.sampleId=-Infinity;this.sampleTime=null
  }
  update(now:number,_dt:number,sample:HandleSample|null,_swingActive:boolean) {
    this.predictionAgeMs=0;this.reacquiring=false;this.correctingThisFrame=false
    if(!sample || sample.estimated || now-sample.received>T.CV_SAMPLE_FRESH_MS ||
       ![sample.position.x,sample.position.y,sample.position.z,sample.received,sample.sampleTime??sample.received,
         sample.sampleId??sample.received].every(Number.isFinite) || sample.position.length()>10) {
      this.source='HELD';this.velocity.set(0,0,0);this.target.copy(this.position);return this
    }
    const id=sample.sampleId??sample.received,time=sample.sampleTime??sample.received
    if(id<=this.sampleId)return this
    const elapsed=this.sampleTime===null?0:(time-this.sampleTime)/1000
    const previous=this.position.clone()
    this.position.copy(sample.position);this.target.copy(this.position)
    if(elapsed>0 && elapsed<=.25)this.velocity.copy(this.position).sub(previous).divideScalar(elapsed)
    else this.velocity.set(0,0,0)
    this.sampleId=id;this.sampleTime=time;this.source='MEASURED'
    return this
  }
}

// ------------------------------------------------------------
// ASSIST LEVEL
// ------------------------------------------------------------

export function assistLevel(
  cvStatus: string,
  handle: HandleContinuity,
  swingActive: boolean,
): AssistLevel {
  if (
    swingActive &&
    handle.source ===
      'PREDICTED' &&
    handle.predictionAgeMs <=
      T.CV_PREDICTION_MAX_MS &&
    [
      'LOST',
      'STALE',
      'DISCONNECTED',
    ].includes(
      cvStatus,
    )
  ) {
    return 'SWING-LOSS'
  }


  return (
    handle.source ===
      'PREDICTED' ||
    cvStatus ===
      'DEGRADED'
  )
    ? 'DEGRADED'
    : 'NORMAL'
}
