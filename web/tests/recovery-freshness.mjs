import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {Room} from '../../cloudflare/worker.mjs'
const require=createRequire(import.meta.url), load=require('./tactical-loader.cjs')
const {watchTransport}=load('transportHealth')
let clock=100000
Date.now=()=>clock
globalThis.performance={now:()=>clock}
globalThis.location={search:'?motionDebug=1'}
globalThis.CloseEvent=class {constructor(type,options){Object.assign(this,options)}}

// Event-driven, actual relay + browser watcher. RTT is each relay/client round
// trip; producer->game capture latency is therefore approximately one RTT.
function simulate(hz,rtt,stallSeconds=0,stream='CV',motionOnly=false,types=1){
 const base=100000,end=8000,d=rtt/2,stallEnd=2000+stallSeconds*1000
 const events=[],applied=[],logs=[],raw=[],commands=[];let id=0,seq=0,epoch='a'.repeat(32),lastDownlink=0,latestCapture=base,maxOutstanding=0
 const cancelled=new Set()
 const schedule=(at,fn)=>{const key=++id;events.push({at,key,fn});return key}
 globalThis.setTimeout=(fn,ms)=>schedule(clock-base+ms,fn)
 globalThis.clearTimeout=key=>cancelled.add(key)
 globalThis.setInterval=(fn,ms)=>{const key=++id;const repeat=()=>{if(cancelled.has(key))return;fn();schedule(clock-base+ms,repeat)};schedule(clock-base+ms,repeat);return key}
 globalThis.clearInterval=key=>cancelled.add(key)
 clock=base
 const socket=(role,channel)=>({readyState:1,bufferedAmount:0,a:{role,channel,session:'K7P4AB',joinedAt:clock,rateAt:clock,count:0},
  deserializeAttachment(){return structuredClone(this.a)},serializeAttachment(a){this.a=structuredClone(a)},send(){},close(){this.readyState=3}})
 const source=socket(stream==='CV'?'tracker':'phone',stream==='CV'?'tracker':'phone'),game=socket('game',stream==='CV'?'cv':'phone')
 const room=new Room({getWebSockets:()=>[source,game]})
 const client={readyState:1,bufferedAmount:0,handlers:{},onclose(){},
  addEventListener(n,f){(this.handlers[n]??=[]).push(f)},removeEventListener(n,f){this.handlers[n]=(this.handlers[n]??[]).filter(x=>x!==f)},
  send(data){schedule(clock-base+d,()=>room.webSocketMessage(game,data))},close(){this.readyState=3}}
 globalThis.WebSocket={OPEN:1}
 const oldInfo=console.info;console.info=(...args)=>logs.push(args)
 const health=watchTransport(client,true,undefined,1,0,0,stream)
 for(const f of client.handlers.open??[])f()
 const emit=()=>{
  for(const type of (stream==='PHONE'?['phone-controller']:['controller','bat']).slice(0,types)){
   const data=JSON.stringify({type,timestamp:latestCapture,position:{x:1,y:1,z:1},orientation:{x:0,y:0,z:0,w:1},_transport:{epoch,sequence:++seq}})
   schedule(clock-base+d,()=>room.webSocketMessage(source,data))
  }
 }
 source.send=data=>{
  const m=JSON.parse(data)
  if(m.type==='transport-resync')schedule(clock-base+d,()=>{
   if(epoch===m.epoch)return
   epoch=m.epoch;seq=0;emit() // Current physical snapshot only, minted after the challenge.
  })
 }
 game.send=data=>{
  const m=JSON.parse(data);let at=clock-base+d
  if(stallSeconds&&at>=2000&&at<stallEnd&&(!motionOnly||m._transport))at=stallEnd
  if(!motionOnly){at=Math.max(at,lastDownlink);lastDownlink=at}
  schedule(at,()=>{
   if(client.readyState!==1)return
   for(const f of client.handlers.message??[])f({data})
   if(m._transport){raw.push({at,capture:m.timestamp,epoch:m._transport.epoch});if(health.accept(data))applied.push({at,capture:m.timestamp,epoch:m._transport.epoch,sequence:m._transport.sequence,type:m.type})}
   else if(m.type==='REQUEST_BOWL')commands.push(m)
  })
 }
 for(let t=0;t<end;t+=1000/hz)schedule(t,()=>{latestCapture=base+t;emit()})
 for(let t=500;t<end;t+=1000)schedule(t,()=>room.webSocketMessage(source,JSON.stringify({type:'transport-ping',sequence:t+1,...(seq?{motion:{epoch,sequence:seq}}:{})})))
 if(stream==='PHONE')schedule(3500,()=>room.webSocketMessage(source,JSON.stringify({type:'REQUEST_BOWL'})))
 while(events.length){events.sort((a,b)=>a.at-b.at||a.key-b.key);const e=events.shift();if(e.at>end)break;clock=base+e.at;if(cancelled.has(e.key))continue;e.fn();maxOutstanding=Math.max(maxOutstanding,game.a.inflight?.length??0);assert(maxOutstanding<=8)}
 if(!stallSeconds)assert.equal(health.recoveries(),0,'Normal 30/60Hz RTT matrix must not trigger freshness recovery')
 health();console.info=oldInfo
 const normal=applied.filter(x=>x.at>=1000&&x.at<7000&&x.type!=='bat')
 const post=applied.filter(x=>x.at>=stallEnd),current=post.find(x=>x.capture>=base+stallEnd-1000/hz)
 if(stallSeconds){assert(current,'Current state recovered');assert(post.every(x=>base+x.at-x.capture<750),'No stale physical history reaches gameplay after recovery');assert(raw.some(x=>base+x.at-x.capture>1000),'Scenario actually delivered stale raw packets')}
 assert(!source.a.retired&&!game.a.retired,'Freshness recovery does not need to disconnect a healthy socket')
 const statuses=logs.filter(x=>x[0]===`[MOTION TRANSPORT ${stream}]`).map(x=>x[1])
 assert(statuses.length&&statuses.every(x=>x.stream===stream))
 for(const key of ['socket','generation','epoch','producer','applied','acknowledged','motionAge','heartbeatAge','reconnects','stallRecoveries','motion'])assert(key in statuses.at(-1))
 if(stallSeconds&&motionOnly)assert(statuses.some(x=>x.heartbeat==='HEALTHY'&&x.motion==='STALLED'))
 if(stream==='PHONE')assert.equal(commands.length,1,'Discrete commands bypass continuous freshness filtering')
 return {hz,rtt,stream,types,stallSeconds,motionOnly,maxOutstanding,normalHz:+(normal.length/6).toFixed(1),firstCurrentMs:stallSeconds?Math.round(current.at-stallEnd):null,oldestAppliedMs:stallSeconds?Math.round(Math.max(...post.map(x=>base+x.at-x.capture))):Math.round(Math.max(...normal.map(x=>base+x.at-x.capture)))}
}

// Epoch/credit tests operate on the actual Room independent of timing simulation.
function creditTests(){
 clock=100000
 const mk=(role,channel)=>({readyState:1,bufferedAmount:0,messages:[],a:{role,channel,session:'K7P4AB',rateAt:clock,count:0},deserializeAttachment(){return structuredClone(this.a)},serializeAttachment(a){this.a=structuredClone(a)},send(d){this.messages.push(JSON.parse(d))},close(){this.readyState=3}})
 for(const channel of ['cv','phone']){
  const source=mk(channel==='cv'?'tracker':'phone',channel==='cv'?'tracker':'phone'),game=mk('game',channel)
  const healthy=mk('game',channel==='cv'?'phone':'cv'),healthySource=mk(channel==='cv'?'phone':'tracker',channel==='cv'?'phone':'tracker')
  const room=new Room({getWebSockets:()=>[source,game,healthy,healthySource]}),old='a'.repeat(32),fresh='b'.repeat(32),type=channel==='cv'?'controller':'phone-controller'
  const sample=(sequence,epoch,timestamp=sequence)=>JSON.stringify({type,timestamp,_transport:{epoch,sequence}})
  room.webSocketMessage(source,sample(101,old))
  for(let i=102;i<=150;i++)room.webSocketMessage(source,sample(i,old))
  const unaffected=JSON.stringify([healthy.a,healthySource.a])
  room.webSocketMessage(game,JSON.stringify({type:'transport-resync',previousEpoch:old,epoch:fresh}))
  assert(game.a.recovery);assert.equal(game.a.inflight.length,0)
  room.webSocketMessage(source,sample(151,old))
  assert.equal(source.a.received,150,'Delayed old epoch is ignored')
  room.webSocketMessage(source,sample(1,fresh,150))
  room.webSocketMessage(source,sample(2,fresh,151))
  room.webSocketMessage(source,sample(3,fresh,152))
  const sourceBeforeOld = JSON.stringify(source.a)
  room.webSocketMessage(source,sample(999,old))
  assert.equal(JSON.stringify(source.a),sourceBeforeOld,'Old packet after fresh epoch cannot overwrite motion or lease health')
  assert.equal(game.a.inflight.length,2,'Recovery window is exactly two current samples')
  assert.equal(game.messages.at(-2).timestamp,150,'Recovery starts from current state, not 102..149')
  const before=JSON.stringify([game.a,source.a])
  room.webSocketMessage(game,JSON.stringify({type:'transport-ack',epoch:old,sequence:101}))
  assert.equal(JSON.stringify([game.a,source.a]),before,'Old ACK cannot release credit or advance health')
  room.webSocketMessage(game,JSON.stringify({type:'transport-ack',epoch:fresh,sequence:2}))
  assert(!game.a.recovery)
  for(let i=4;i<=12;i++)room.webSocketMessage(source,sample(i,fresh,149+i))
  assert.equal(game.a.inflight.length,8,'Fresh ACK restores normal window')
  assert.equal(JSON.stringify([healthy.a,healthySource.a]),unaffected,'Recovery leaves the other stream untouched')
 }
}
creditTests()
const normal=[],recovery=[]
for(const hz of [30,60])for(const rtt of [50,100,200,400]){
 normal.push(simulate(hz,rtt))
 for(const seconds of [1,3])recovery.push(simulate(hz,rtt,seconds))
}
console.log('NORMAL capture-to-application latency');console.table(normal)
console.log('RECOVERY: first current state and oldest gameplay-applied sample');console.table(recovery)
console.log('Heartbeat-responsive motion stalls / PHONE commands / two CV message types')
console.table([simulate(60,100,3,'PHONE',true),simulate(60,400,3,'CV',true,2)])
console.log('PASS: freshness barrier, delayed recovery response rejection, old epoch/ACK exclusion, two->eight credits, stationary sequences, discrete commands, stream isolation and explicit CV/PHONE diagnostics')
