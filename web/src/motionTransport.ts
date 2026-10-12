export type MotionSequence = { epoch: string; sequence: number }
export const MOTION_TIMEOUT_MS = 1000
export const RECOVERY_GAP_MS = 750
export function transportEpoch() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('')
}
export function motionSequence(value: unknown): MotionSequence | null {
  const m = value as MotionSequence | undefined
  return m && typeof m.epoch === 'string' && /^[a-f0-9]{32}$/.test(m.epoch)
    && Number.isSafeInteger(m.sequence) && m.sequence > 0 ? m : null
}

// Advancement, not physical displacement, establishes that delivery is expected.
export class MotionProgress {
  epoch = ''; produced = 0; applied = 0; acknowledged = 0
  progressAt = 0; expectedAt = 0; pendingAt: number | null = null
  reset(epoch: string, now: number) {
    this.epoch = epoch; this.produced = this.applied = this.acknowledged = 0
    this.pendingAt = null; this.progressAt = now; this.expectedAt = now
  }
  observe(m: MotionSequence, acknowledged: number, expected: boolean, now: number) {
    if (this.epoch !== m.epoch) {
      this.reset(m.epoch, now)
    }
    if (m.sequence > this.produced) { this.produced = m.sequence; this.expectedAt = now }
    if (acknowledged > this.acknowledged) { this.acknowledged = acknowledged; this.progressAt = now; this.pendingAt = null }
    if (expected && this.produced > this.acknowledged) this.pendingAt ??= now
    else this.pendingAt = null
  }
  stalled(now: number) {
    return this.pendingAt !== null && now - this.pendingAt > MOTION_TIMEOUT_MS
  }
}

// Old callbacks and even already-queued retry callbacks cannot own a new connection.
export class ConnectionGeneration {
  readonly identity = transportEpoch()
  private failures = 0
  generation = 0; reconnects = 0; stalls = 0; private retired = true; private disposed = false
  private timer: ReturnType<typeof setTimeout> | undefined
  begin() { clearTimeout(this.timer); this.retired = false; return ++this.generation }
  owns(id: number) { return !this.disposed && !this.retired && id === this.generation }
  healthy(id: number) { if(this.owns(id))this.failures=0 }
  url(url: string, enabled: boolean, generation: number) {
    if(!enabled)return url
    const target=new URL(url);target.searchParams.set('owner',this.identity);target.searchParams.set('generation',String(generation));return target.toString()
  }
  retry(id: number, connect: () => void, reason = '') {
    if (!this.owns(id)) return false
    this.retired = true
    if (reason === 'Motion delivery stalled') this.stalls++
    const delay=this.failures++===0?0:Math.min(2000,250*2**Math.min(this.failures-2,3))
    this.timer = setTimeout(() => {
      if (!this.disposed && this.generation === id && this.retired) { this.reconnects++; connect() }
    }, delay)
    return true
  }
  dispose() { this.disposed = true; this.retired = true; clearTimeout(this.timer) }
}
