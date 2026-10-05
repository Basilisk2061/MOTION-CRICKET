const assert = require('node:assert/strict')
const load = require('./tactical-loader.cjs')
let now = 0, tick
global.performance = { now: () => now }
global.setInterval = fn => { tick = fn; return 1 }
global.clearInterval = () => { tick = null }
global.CloseEvent = class extends Event { constructor(type, options) { super(type); Object.assign(this, options) } }
class Socket extends EventTarget {
  static OPEN = 1
  constructor() { super(); this.readyState = 0; this.bufferedAmount = 0; this.sent = []; this.closed = 0 }
  send(data) { this.sent.push(JSON.parse(data)) }
  close() { this.closed++; this.readyState = 2 }
  open() { this.readyState = 1; this.dispatchEvent(new Event('open')) }
  pong(sequence) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({type:'transport-pong',sequence}) })) }
}
global.WebSocket = Socket
const { watchTransport, isTransportHeartbeat } = load('transportHealth')
let reconnects = 0
const socket = new Socket()
socket.onclose = () => reconnects++
watchTransport(socket, true); socket.open()
for (let i=0;i<100;i++) { now+=1000; tick(); socket.pong(socket.sent.at(-1).sequence) }
assert.equal(reconnects, 0, 'Stationary/healthy heartbeat never reconnects')
const last = socket.sent.at(-1).sequence
for(let i=0;i<6;i++){now+=1000;tick();socket.pong(last)}
assert.equal(reconnects,0)
now+=1000;tick()
assert.equal(reconnects,1, 'Missing fresh acknowledgement retires half-open socket')
assert.equal(socket.closed,1)
assert.equal(socket.onmessage,null, 'Retired socket cannot deliver old controller state')
assert.equal(tick,null)
const reconnected = new Socket(); watchTransport(reconnected,true);reconnected.open();now+=1000;tick()
assert.equal(reconnected.sent[0].type,'transport-ping')
assert.equal(reconnected.sent.length,1,'No old motion backlog')
assert(isTransportHeartbeat(JSON.stringify({type:'transport-pong',sequence:1})))
assert(!isTransportHeartbeat(JSON.stringify({type:'phone-controller'})))
const fs=require('node:fs')
for(const file of ['controller.ts','PhoneController.tsx']){
 const source=fs.readFileSync(require('node:path').join(__dirname,'../src',file),'utf8')
 assert(source.includes('if (isTransportHeartbeat(event.data)) return'),file+' excludes health traffic')
}
assert(fs.readFileSync(require('node:path').join(__dirname,'../src/PhoneController.tsx'),'utf8').includes('sent = -1'), 'Phone resumes latest sensor state on reconnect')
console.log('PASS: healthy/fresh/stale heartbeat, immediate retirement, clean reconnect, no backlog, receiver separation and phone resume')
