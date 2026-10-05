import assert from 'node:assert/strict'
import { Room } from '../../cloudflare/worker.mjs'
const socket = (role, channel, debug = false) => ({
  readyState: 1, bufferedAmount: 0, messages: [],
  attachment: { role, channel, debug, session: 'K7P4AB', rateAt: Date.now(), count: 0 },
  deserializeAttachment() { return this.attachment },
  serializeAttachment(a) { this.attachment = a },
  send(data) { this.messages.push(JSON.parse(data)) },
  close(code) { this.closedCode = code; this.readyState = 3 },
})
const cv = socket('game', 'cv', true), gamePhone = socket('game', 'phone')
const tracker = socket('tracker', 'tracker'), phone = socket('phone', 'phone')
const ctx = { getWebSockets: () => [cv, gamePhone, tracker, phone] }
const room = new Room(ctx)
room.webSocketMessage(tracker, JSON.stringify({ type: 'controller', timestamp: 1 }))
room.webSocketMessage(phone, JSON.stringify({ type: 'phone-controller', timestamp: 1 }))
assert.equal(room.debug.trackerIn, 1); assert.equal(room.debug.phoneIn, 1)
assert.equal(room.debug.cvOut, 1); assert.equal(room.debug.phoneOut, 1)
assert(cv.messages.some(m => m.type === 'relay-debug'))
assert(gamePhone.messages.every(m => m.type !== 'relay-debug'))
gamePhone.bufferedAmount = 4096
room.webSocketMessage(phone, JSON.stringify({ type: 'phone-controller', timestamp: 2 }))
assert.equal(room.debug.phoneIn, 2); assert.equal(room.debug.phoneOut, 1); assert.equal(room.debug.drops, 1)
const restored = new Room(ctx)
restored.webSocketMessage(tracker, JSON.stringify({ type: 'controller', timestamp: 3 }))
assert.equal(restored.debug.trackerIn, 1)
cv.attachment.debug = false
const quiet = new Room(ctx)
quiet.webSocketMessage(tracker, JSON.stringify({ type: 'controller', timestamp: 4 }))
assert.equal(quiet.debug, undefined)
assert.equal(cv.messages.at(-1).type, 'controller')
console.log('PASS: opt-in relay counters, restoration, routing/backpressure and quiet normal sessions')
const before = cv.messages.length, phoneBefore = gamePhone.messages.length
quiet.webSocketMessage(phone, JSON.stringify({ type: 'transport-ping', sequence: 1 }))
assert.deepEqual(phone.messages.at(-1), { type: 'transport-pong', sequence: 1 })
assert.equal(cv.messages.length, before)
assert.equal(gamePhone.messages.length, phoneBefore)
assert(phone.attachment.healthAt > 0)
console.log('PASS: relay heartbeat acknowledgement stays on requesting socket, outside controller forwarding')
