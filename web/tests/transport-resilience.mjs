import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {Room} from '../../cloudflare/worker.mjs'
const load=createRequire(import.meta.url)('./tactical-loader.cjs')
const {watchTransport,isTransportHeartbeat}=load('transportHealth')
const {ConnectionGeneration}=load('motionTransport')
globalThis.WebSocket={OPEN:1}
globalThis.CloseEvent=class {constructor(type,options){Object.assign(this,options)}}
globalThis.location={search:''}

// Virtual-time integration: actual Room.fetch, browser watchdog, owner/retry,
// epoch barriers, ACKs and both independent channels. No sleeps or real sockets.
function run({duration=12000,faults=[],rtt=100,jitter=0,seed=17,suspend=null,mainPause=null,moving=false}={}){
 let now=100000,id=0,random=seed,joins=0
 const base=now,events=[],cancelled=new Set(),servers=[],recoveries=[],applied={CV:[],PHONE:[]}
 const rng=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/2**32}
 const schedule=(at,fn)=>{const key=++id;events.push({at,key,fn});return key}
 const later=(ms,fn)=>schedule(now+ms,fn)
 globalThis.performance={now:()=>now};Date.now=()=>now
 globalThis.setTimeout=(fn,ms)=>later(ms,fn);globalThis.clearTimeout=k=>cancelled.add(k)
 globalThis.setInterval=(fn,ms)=>{const key=++id;const repeat=()=>{if(cancelled.has(key))return;fn();later(ms,repeat)};later(ms,repeat);return key}
 globalThis.clearInterval=k=>cancelled.add(k)
 const doc={hidden:false,listeners:new Set(),addEventListener(n,f){this.listeners.add(f)},removeEventListener(n,f){this.listeners.delete(f)}}
 globalThis.document=doc
 const room=new Room({getWebSockets:()=>servers,acceptWebSocket:s=>servers.push(s)})
 const calibration={CV:12345,PHONE:54321},neutral=[.1,.2,.3,.9],neutralBefore=JSON.stringify(neutral)
 const peers={}
 const blocked=(stream,direction,m)=>faults.some(f=>now-base>=f.start&&now-base<f.end&&(!f.stream||f.stream===stream)&&
   (f.kind==='all'||(f.kind==='motion'&&direction==='down'&&m._transport)||
    (f.kind==='ack'&&direction==='up'&&m.type==='transport-ack')))
 const delay=()=>Math.max(1,rtt/2+(rng()-.5)*jitter)
 for(const stream of ['CV','PHONE'])for(const producer of [false,true]){
  const key=stream+(producer?'producer':'game'),role=producer?(stream==='CV'?'tracker':'phone'):'game'
  const peer=peers[key]={owner:new ConnectionGeneration(),ws:null,health:null,epoch:crypto.randomUUID().replaceAll('-',''),sequence:0,meta:null,lastAck:0}
  const connect=()=>{
   const generation=peer.owner.begin();joins++
   const ws={readyState:0,bufferedAmount:0,handlers:{},onopen:null,onmessage:null,onerror:null,onclose:null,
    addEventListener(n,f){(this.handlers[n]??=new Set()).add(f)},removeEventListener(n,f){this.handlers[n]?.delete(f)},
    send(data){const m=JSON.parse(data);if(blocked(stream,'up',m))return;const target=this.server;later(delay(),()=>{if(!blocked(stream,'up',m))room.webSocketMessage(target,data)})},
    close(code,reason){this.readyState=3;const target=this.server;if(target)later(500,()=>room.webSocketClose(target,code,reason))}}
   peer.ws=ws;peer.lastAck=0;peer.lastEpoch=''
   if(producer){peer.epoch=crypto.randomUUID().replaceAll('-','');peer.sequence=0;peer.meta=null}
   const health=watchTransport(ws,true,producer?()=>peer.meta:undefined,generation,peer.owner.reconnects,peer.owner.stalls,stream)
   peer.health=health
   ws.onclose=e=>{if(!peer.owner.owns(generation))return;health();recoveries.push({stream,producer,at:now-base,reason:e.reason});peer.owner.retry(generation,connect,e.reason)}
   ws.onmessage=e=>{
    if(!peer.owner.owns(generation))return
    if(isTransportHeartbeat(e.data)){
     if(health.progress.epoch!==peer.lastEpoch){peer.lastEpoch=health.progress.epoch;peer.lastAck=0}
     if(health.progress.acknowledged>peer.lastAck){peer.lastAck=health.progress.acknowledged;peer.owner.healthy(generation)}return
    }
    const m=JSON.parse(e.data)
    if(producer&&m.type==='transport-resync'){peer.epoch=m.epoch;peer.sequence=0;peer.meta=null;return}
    if(!producer&&m._transport&&health.accept(e.data)){
     peer.owner.healthy(generation)
     assert.equal(m.calibrationId,calibration[stream]);assert.deepEqual(m.neutral,neutral)
     applied[stream].push({at:now-base,capture:m.timestamp-base,epoch:m._transport.epoch,sequence:m._transport.sequence,orientation:m.orientation})
    }
   }
   globalThis.WebSocketPair=class {constructor(){
    const server={readyState:1,bufferedAmount:0,a:{},closing:false,
     deserializeAttachment(){return structuredClone(this.a)},serializeAttachment(a){this.a=structuredClone(a)},
     send(data){const m=JSON.parse(data);if(blocked(stream,'down',m))return;later(delay(),()=>{
      // A blackhole also drops packets already in flight when it begins.
      // Delayed (rather than dropped) packets are covered by recovery-freshness.
      if(ws.readyState!==1||blocked(stream,'down',m))return
      for(const f of ws.handlers.message??[])f({data});ws.onmessage?.({data})
     })},close(code,reason){if(this.closing)return;this.closing=true;later(delay(),()=>{
      this.readyState=3
      if(ws.readyState!==1)return;ws.readyState=3;for(const f of ws.handlers.close??[])f({code,reason});ws.onclose?.({code,reason})
     })}}
    ws.server=server;return {0:ws,1:server}
   }}
   const url=peer.owner.url(`https://play.motioncricket.workers.dev/relay?session=K7P4AB&role=${role}${producer?'':`&channel=${stream.toLowerCase()}`}`,true,generation)
   const response=room.fetch(new Request(url));assert.equal(response.status,101,'Same owner replacement is never blocked by an OPEN zombie')
   later(delay(),()=>{ws.readyState=1;for(const f of ws.handlers.open??[])f();ws.onopen?.()})
  }
  peer.connect=connect;connect()
  if(producer){const sample=()=>{
   if(peer.ws.readyState===1&&!doc.hidden){
    peer.meta={epoch:peer.epoch,sequence:++peer.sequence}
    peer.ws.send(JSON.stringify({type:stream==='CV'?'controller':'phone-controller',timestamp:now,
     calibrationId:calibration[stream],neutral,position:{x:moving?Math.sin(now/200):1,y:1,z:1},
     orientation:{x:0,y:moving?Math.sin(now/400):0,z:0,w:moving?Math.cos(now/400):1},_transport:peer.meta}))
   }
   later(1000/(stream==='CV'?30:60),sample)
  };later(20,sample)}
 }
 if(suspend){later(suspend.start,()=>{doc.hidden=true;for(const f of [...doc.listeners])f()});later(suspend.end,()=>{doc.hidden=false;for(const f of [...doc.listeners])f()})}
 while(events.length){events.sort((a,b)=>a.at-b.at||a.key-b.key);const e=events.shift();if(e.at>base+duration)break;
  let at=e.at;if(mainPause&&at>=base+mainPause.start&&at<base+mainPause.end)at=base+mainPause.end
  now=Math.max(now,at);if(!cancelled.has(e.key))e.fn()}
 for(const peer of Object.values(peers)){peer.health();peer.owner.dispose()}
 assert.equal(JSON.stringify(neutral),neutralBefore,'Transport never resets neutral/calibration')
 for(const stream of ['CV','PHONE']){
  assert(applied[stream].length>0)
  for(let i=1;i<applied[stream].length;i++){
   const a=applied[stream][i-1],b=applied[stream][i]
   if(a.epoch===b.epoch)assert(b.sequence>a.sequence,'Reordered/old motion cannot replay')
  }
  const tail=applied[stream].filter(x=>x.at>duration-1000)
  assert(tail.length>5,'No unrecovered stream at end')
  assert(tail.every(x=>x.at-x.capture<750),'Recovery delivers current physical state')
 }
 return {recoveries,applied,joins}
}
globalThis.Response=class {constructor(body,options){Object.assign(this,options)}}
const normal=run({duration:20000,rtt:400,jitter:100})
assert.equal(normal.recoveries.length,0,'High RTT/jitter and stationary 30/60Hz sequences are healthy')
for(const kind of ['all','motion','ack'])for(const stream of ['CV','PHONE',null])for(const seconds of [1,3,10]){
 const result=run({duration:seconds*1000+8000,faults:[{start:2000,end:2000+seconds*1000,stream,kind}]})
 if(seconds>1){
  for(const affected of stream?[stream]:['CV','PHONE']){
   const first=result.recoveries.find(x=>x.stream===affected)
   assert(first,`${kind} ${affected} dead OPEN path is recovered`)
   assert(first.at-2000<=1500,`Recovery starts within 1.5s: ${first.at-2000}`)
  }
 }
 if(stream)assert(result.recoveries.every(x=>x.stream===stream),'Healthy stream never restarts')
 const later=result.recoveries.filter(x=>x.at>2000+seconds*1000+2500)
 assert.equal(later.length,0,'No reconnect loop once useful delivery returns')
 console.log(`${kind} ${stream??'BOTH'} ${seconds}s outage: PASS firstRecovery=${result.recoveries[0]?.at-2000||'freshness-only'}ms`)
}
const resume=run({duration:10000,suspend:{start:2000,end:7000}})
assert(resume.recoveries.every(x=>x.at>=7000),'Hidden tab never runs overdue watchdog recoveries')
assert.equal(resume.recoveries.filter(x=>x.at===7000).length,4,'Exactly one resume refresh per connection')
const slept=run({duration:11000,mainPause:{start:2000,end:7000}})
assert.equal(slept.recoveries.filter(x=>x.at===7000).length,4,'Long main-thread suspension causes one refresh, not overdue reconnect bursts')
assert(slept.recoveries.every(x=>x.at>=7000))
const active=run({moving:true,faults:[{start:2000,end:5000,kind:'all'}]})
assert(new Set(active.applied.PHONE.filter(x=>x.at>7000).map(x=>x.orientation.y)).size>10,'Active swing follows changing current orientation after recovery')
// Real fetch ownership identity + late CLOSE/ACK, including rejected duplicate owners.
{
 const sockets=[],room=new Room({getWebSockets:()=>sockets,acceptWebSocket:s=>sockets.push(s)})
 const stub=()=>({readyState:1,a:{},messages:[],deserializeAttachment(){return structuredClone(this.a)},serializeAttachment(a){this.a=structuredClone(a)},send(d){this.messages.push(d)},close(){}})
 globalThis.WebSocketPair=class {constructor(){return {0:stub(),1:stub()}}}
 const request=(owner,generation)=>new Request(`https://play.motioncricket.workers.dev/relay?session=K7P4AB&role=phone&owner=${owner}&generation=${generation}`)
 const owner='a'.repeat(32);assert.equal(room.fetch(request(owner,1)).status,101);const old=sockets[0]
 assert.equal(room.fetch(request('b'.repeat(32),2)).status,409,'Unrelated healthy owner is not evicted')
 assert.equal(room.fetch(request(owner,2)).status,101);const current=sockets[1]
 room.webSocketClose(old,4000,'late close');assert.equal(room.source('phone'),current)
 room.webSocketMessage(old,JSON.stringify({type:'transport-ping',sequence:999}));assert.equal(room.source('phone'),current)
 assert.equal(room.fetch(request(owner,1)).status,409,'Older generation cannot rejoin')
 const gameRequest=new Request('https://play.motioncricket.workers.dev/relay?session=K7P4AB&role=game&channel=cv&owner='+ 'c'.repeat(32)+'&generation=1')
 assert.equal(room.fetch(gameRequest).status,101)
 room.webSocketClose(current,4000,'closed');current.readyState=3
 const restored=new Room({getWebSockets:()=>sockets,acceptWebSocket:s=>sockets.push(s)})
 assert.equal(restored.fetch(request(owner,1)).status,409,'Hibernation preserves owner high-water even after current role closes')
}
const faults=[]
let s=191;const rand=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/2**32}
for(let t=5000;t<1800000-20000;t+=15000){const n=rand();faults.push({start:t,end:t+1500+Math.floor(rand()*4000),stream:n<.33?'CV':n<.66?'PHONE':null,kind:['all','motion','ack'][Math.floor(rand()*3)]})}
const soak=run({duration:1800000,rtt:200,jitter:250,faults,seed:431})
for(const f of faults){
 for(const stream of f.stream?[f.stream]:['CV','PHONE']){
  assert(soak.recoveries.some(x=>x.stream===stream&&x.at>=f.start&&x.at<=f.start+1500),'Every injected stall starts timely recovery '+JSON.stringify({fault:f,stream,recoveries:soak.recoveries.filter(x=>x.stream===stream&&x.at>=f.start&&x.at<f.start+4000)}))
  assert(soak.applied[stream].some(x=>x.at>=f.end&&x.at<f.end+4000),'Every injected stall fully recovers')
 }
}
console.log(`PASS: 30-minute virtual soak, ${faults.length} injected outages, zero unrecovered; stream isolation, stale ownership/ACK, suspension, stationary sequences, 30Hz CV/60Hz phone, jitter/reordering and calibration preservation`)
