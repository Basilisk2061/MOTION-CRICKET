import { Quaternion } from 'three'
import { motionSequence } from './motionTransport'
import type { PhoneMessage } from './phone'

type Receipt = { message: PhoneMessage; received: number }
type Q = {x:number;y:number;z:number;w:number}
export const compactQuaternion = (q: Q | null | undefined) => q ? [q.x,q.y,q.z,q.w].map(v=>Number(v.toFixed(4))) : null
const angle = (a: Q | null, b: Q) => a ? new Quaternion(a.x,a.y,a.z,a.w).normalize().angleTo(new Quaternion(b.x,b.y,b.z,b.w).normalize()) : 0
const copy = (q: Q): Q => ({x:q.x,y:q.y,z:q.z,w:q.w})

// Observation only. No result from this class is fed back into game state.
export class PhoneApplicationDebug {
  private receipts = new WeakMap<Receipt, {ordinal:number;sequence:number|null;epoch:string|null}>()
  private ordinal = 0
  private consumedCount = 0
  incoming: Q | null = null
  raw = {sequence:null as number|null,epoch:null as string|null}
  accepted = {ordinal:0,sequence:null as number|null,epoch:null as string|null}
  consumed = {ordinal:0,sequence:null as number|null,epoch:null as string|null}
  acceptedAt: number | null = null; consumedAt: number | null = null; renderedAt: number | null = null
  target: Q | null = null; final: Q | null = null; rendered: Q | null = null; reference: Q | null = null
  targetChanges = 0; finalChanges = 0; renderedChanges = 0
  reason = 'NO_SAMPLE'; transportReason: string | null = null
  gates: Record<string,unknown> = {}; collision: Record<string,unknown> = {}
  private previous = {accepted:0,consumed:0,target:0,final:0,rendered:0}
  rawMessage(data: unknown) {
    if(typeof data!=='string')return
    try { const m=JSON.parse(data);if(m.type!=='phone-controller')return;const meta=motionSequence(m._transport);this.raw={sequence:meta?.sequence??null,epoch:meta?.epoch??null} } catch { /* Diagnostic only. */ }
  }
  accept(receipt: Receipt, data: string) {
    const meta=motionSequence(JSON.parse(data)._transport)
    this.accepted={ordinal:++this.ordinal,sequence:meta?.sequence??null,epoch:meta?.epoch??null}
    this.receipts.set(receipt,{...this.accepted});this.acceptedAt=receipt.received;this.transportReason=null
    this.incoming=copy(receipt.message.orientation)
  }
  consume(receipt: Receipt, q: Q, reference: Q, now: number) {
    const id=this.receipts.get(receipt)
    if(id && id.ordinal!==this.consumed.ordinal){this.consumed={...id};this.consumedAt=now;this.consumedCount++}
    if(angle(this.target,q)>1e-6)this.targetChanges++
    this.target=copy(q);this.reference=copy(reference);this.reason='NONE'
  }
  hold(reason: string, gates: Record<string,unknown> = {}) { this.reason=reason;this.gates=gates }
  finalTransform(q: Q, collision: Record<string,unknown>) {
    if(angle(this.final,q)>1e-6)this.finalChanges++
    this.final=copy(q);this.collision=collision
  }
  drawn(q: Q, now: number) {
    if(angle(this.rendered,q)>1e-6)this.renderedChanges++
    this.rendered=copy(q);this.renderedAt=now
  }
  report(now: number) {
    const delta={accepted:this.ordinal-this.previous.accepted,consumed:this.consumedCount-this.previous.consumed,
      target:this.targetChanges-this.previous.target,final:this.finalChanges-this.previous.final,rendered:this.renderedChanges-this.previous.rendered}
    this.previous={accepted:this.ordinal,consumed:this.consumedCount,target:this.targetChanges,final:this.finalChanges,rendered:this.renderedChanges}
    const age=(at:number|null)=>at===null?null:Math.round(now-at)
    const boundary=delta.accepted && !delta.consumed?'A: ACCEPTED_NOT_CONSUMED':delta.consumed && !delta.target?'B: CONSUMED_QUATERNION_UNCHANGED':delta.target && !delta.final?'C: TARGET_CHANGED_BAT_UNCHANGED':delta.final && !delta.rendered?'D: BAT_CHANGED_DRAW_UNCHANGED':'PROGRESS_OR_IDLE'
    return {TRANSPORT:{raw:this.raw,accepted:this.accepted,ageMs:age(this.acceptedAt),rejection:this.transportReason},
      APPLICATION:{consumed:this.consumed,ageMs:age(this.consumedAt),receivedRelativeQuaternion:compactQuaternion(this.incoming),relativeQuaternion:compactQuaternion(this.target),
        rawDeviceQuaternion:'Not transmitted; see PHONE SENSOR log',referenceQuaternion:compactQuaternion(this.reference),
        finalBatQuaternion:compactQuaternion(this.final),drawnWorldQuaternion:compactQuaternion(this.rendered),drawAgeMs:age(this.renderedAt),
        rejectedAfterAcceptance:this.reason!=='NONE',reason:this.reason,gates:this.gates,collision:this.collision,
        delta,boundary,finalQuaternionChanging:delta.final>0,drawnQuaternionChanging:delta.rendered>0}}
  }
}
