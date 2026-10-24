import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { Room } from '../../cloudflare/worker.mjs'
const require = createRequire(import.meta.url), load = require('./tactical-loader.cjs')
const { MotionProgress, ConnectionGeneration } = load('motionTransport')
const epoch = 'a'.repeat(32), otherEpoch = 'b'.repeat(32)
let now = 100000
Date.now = () => now
const sample = (sequence, type = 'controller', e = epoch) => JSON.stringify({
  type, timestamp: sequence, position: {x:1,y:1,z:1}, orientation:{x:0,y:0,z:0,w:1},
  _transport: {epoch:e,sequence},
})
function socket(role, channel) {
  return { readyState:1, bufferedAmount:0, messages:[], closed:[],
    a:{role,channel,session:'K7P4AB',joinedAt:now,rateAt:now,count:0},
    deserializeAttachment(){return structuredClone(this.a)}, serializeAttachment(a){this.a=structuredClone(a)},
    send(data){this.messages.push(JSON.parse(data))}, close(code,reason){this.closed.push({code,reason})},
  }
}
const cv=socket('game','cv'), gp=socket('game','phone'), tracker=socket('tracker','tracker'), phone=socket('phone','phone')
const sockets=[cv,gp,tracker,phone], room=new Room({getWebSockets:()=>sockets,acceptWebSocket:s=>sockets.push(s)})
for(let i=1;i<=100;i++){now+=5;room.webSocketMessage(tracker,sample(i))}
assert.equal(cv.messages.length,8,'Bounded in-flight window, no accumulating send queue')
assert.equal(Object.keys(tracker.a.latest).length,1)
room.webSocketMessage(cv,JSON.stringify({type:'transport-ack',epoch,sequence:8}))
assert.equal(cv.messages.at(-1)._transport.sequence,100,'Newest replaces obsolete burst states')
assert.equal(cv.messages.length,9)
room.webSocketMessage(phone,sample(1,'phone-controller',otherEpoch))
assert.equal(gp.messages.at(-1)._transport.epoch,otherEpoch,'CV backlog does not corrupt PHONE')
gp.bufferedAmount=4096
room.webSocketMessage(phone,sample(2,'phone-controller',otherEpoch))
room.webSocketMessage(tracker,sample(101))
assert.equal(cv.messages.at(-1)._transport.sequence,101,'PHONE congestion does not block CV')
gp.bufferedAmount=0
room.webSocketMessage(gp,JSON.stringify({type:'transport-ack',epoch:otherEpoch,sequence:1}))
assert.equal(gp.messages.at(-1)._transport.sequence,2)
room.webSocketMessage(cv,JSON.stringify({type:'transport-ack',epoch,sequence:10000}))
assert.equal(tracker.a.ack,8,'Impossible ACK cannot release credit')
const previous=cv.messages.length
room.webSocketMessage(tracker,sample(100))
assert.equal(cv.messages.length,previous,'No out-of-order queued replay')
// A fully current cumulative ACK clears pending motion without relying on displacement.
room.webSocketMessage(cv,JSON.stringify({type:'transport-ack',epoch,sequence:101}))
assert.equal(tracker.a.ack,101)
assert.equal(tracker.a.pendingAt,null)
now+=1000
room.webSocketMessage(tracker,JSON.stringify({type:'transport-ping',sequence:1,motion:{epoch,sequence:102}}))
assert.equal(tracker.a.healthAt,now,'Tracker owns the same application lease')
const oldResponse=globalThis.Response
globalThis.Response=class { constructor(body,options){this.status=options.status;this.body=body} }
globalThis.WebSocketPair=class { constructor(){return {0:socket('client','client'),1:socket('tracker','tracker')}} }
const request=new Request('https://play.basilisk2061.workers.dev/relay?session=K7P4AB&role=tracker')
assert.equal(room.fetch(request).status,409,'Healthy tracker cannot be evicted')
now+=6001
assert.equal(room.fetch(request).status,101,'Stale nominally OPEN tracker is replaced')
assert(tracker.a.retired);assert.equal(tracker.readyState,1,'Even delayed close handshakes cannot retain ownership')
const count=cv.messages.length
room.webSocketMessage(tracker,sample(999))
assert.equal(cv.messages.length,count,'Retired socket cannot reclaim role or apply messages')
globalThis.Response=oldResponse
for (const blocked of ['cv','phone']) {
  const t=socket('tracker','tracker'),p=socket('phone','phone'),c=socket('game','cv'),g=socket('game','phone')
  const r=new Room({getWebSockets:()=>[t,p,c,g]})
  for(let i=1;i<=9;i++) {
    now+=1000
    for(const [source,game,type,e,channel] of [[t,c,'controller',epoch,'cv'],[p,g,'phone-controller',otherEpoch,'phone']]) {
      r.webSocketMessage(source,sample(i,type,e))
      if(channel!==blocked) r.webSocketMessage(game,JSON.stringify({type:'transport-ack',epoch:e,sequence:i}))
      if(!source.a.retired) r.webSocketMessage(source,JSON.stringify({type:'transport-ping',sequence:i,motion:{epoch:e,sequence:i}}))
    }
  }
  assert((blocked==='cv'?t:p).a.retired,'Stalled producer released immediately, avoiding 409 retry gap')
  assert((blocked==='cv'?c:g).a.retired,'Only affected game path is retired')
  assert(!(blocked==='cv'?p:t).a.retired,'Other producer remains healthy')
  assert(!(blocked==='cv'?g:c).a.retired,'Other receiver remains healthy')
}
// Room reconstruction retains credit/latest/lease attachments.
const restored=new Room({getWebSockets:()=>sockets})
assert.equal(restored.source('cv'),sockets.at(-1))

let clock=0
const progress=new MotionProgress()
for(let i=1;i<=100;i++){clock+=100;progress.observe({epoch,sequence:i},i,true,clock);assert(!progress.stalled(clock))}
for(let i=101;i<=172;i++){clock+=100;progress.observe({epoch,sequence:i},100,true,clock)}
assert(progress.stalled(clock),'Advancing producer with no applied progress stalls even with healthy heartbeat')
progress.observe({epoch,sequence:172},100,false,clock)
assert(!progress.stalled(clock),'Disconnected consumer is not an expected motion path')
progress.observe({epoch:otherEpoch,sequence:1},1,true,clock)
assert(!progress.stalled(clock),'New producer generation resets evidence, not physical values')

const callbacks=[]
globalThis.setTimeout=fn=>(callbacks.push(fn),callbacks.length)
globalThis.clearTimeout=()=>{}
const owner=new ConnectionGeneration(), first=owner.begin()
let connections=0
assert(owner.retry(first,()=>connections++))
const queued=callbacks.at(-1), second=owner.begin()
assert(!owner.retry(first,()=>connections++),'Old close callback cannot schedule another reconnect')
queued();assert.equal(connections,0);assert(owner.owns(second),'Queued old retry cannot disrupt new connection')
owner.dispose();assert(!owner.owns(second))

// Exercise the actual browser watcher, not only its progress model.
let tick, time=0
globalThis.performance={now:()=>time}
globalThis.setInterval=fn=>(tick=fn,1);globalThis.clearInterval=()=>{}
globalThis.WebSocket={OPEN:1}
globalThis.CloseEvent=class {constructor(type,options){Object.assign(this,options)}}
const {watchTransport}=load('transportHealth')
let closeReason='', sent=0
const browser={readyState:1,bufferedAmount:0,handlers:{},addEventListener(n,f){this.handlers[n]=f},removeEventListener(){},
  send(data){const m=JSON.parse(data);if(m.type==='transport-ping')this.handlers.message({data:JSON.stringify({type:'transport-pong',sequence:m.sequence,motion:{epoch,sequence:++sent,acknowledged:0,expected:true}})})},
  close(code,reason){closeReason=reason;this.readyState=2},onclose(){},
}
const health=watchTransport(browser,true);browser.handlers.open()
for(let i=0;i<9&&browser.readyState===1;i++){time+=1000;tick()}
assert.equal(closeReason,'Motion delivery stalled','Healthy heartbeat cannot mask stale delivery')
health()
time=0;sent=0;closeReason='';browser.readyState=1
const stationary=watchTransport(browser,true);browser.handlers.open()
for(let i=1;i<=100;i++) {
  time+=100; assert(stationary.accept(sample(i))); tick()
}
assert.equal(closeReason,'','Fresh identical samples keep the actual watcher healthy')
assert(stationary.accept(sample(1,'controller',otherEpoch)),'Producer restart does not wait for a pong')
assert(!stationary.accept(sample(101,'controller',epoch)),'Old epoch cannot replay into new state')
stationary()
browser.readyState=1
browser.send=data=>{const m=JSON.parse(data);if(m.type==='transport-ping')browser.handlers.message({data:JSON.stringify({type:'transport-pong',sequence:m.sequence,motion:{epoch:otherEpoch,sequence:1,acknowledged:0,expected:true}})})}
const restart=watchTransport(browser,true);browser.handlers.open();restart.accept(sample(100))
time+=1000;tick()
assert.equal(restart.progress.acknowledged,0,'A new producer heartbeat cannot inherit old epoch applied/ACK sequence')
restart()
console.log('PASS: independent streams, bounded latest-state credit, cumulative ACK validation, tracker stale/healthy leases, retired sockets, restoration, motion-vs-heartbeat, stationary sequences and generation races')
