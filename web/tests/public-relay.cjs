// Real endpoint smoke test; no phone sensors or webcam required.
const assert=require('node:assert/strict'), WebSocket=require('ws')
const base=process.argv[2]; if(!base)throw Error('Pass a public HTTPS site URL')
const sockets=[]
function connect(session,role,channel){return new Promise((resolve,reject)=>{
  const u=new URL('/relay',base);u.protocol='wss:';u.searchParams.set('session',session);u.searchParams.set('role',role);if(channel)u.searchParams.set('channel',channel)
  const ws=new WebSocket(u,{origin:new URL(base).origin});ws.messages=[];sockets.push(ws)
  ws.on('message',d=>ws.messages.push(JSON.parse(d)));ws.once('open',()=>resolve(ws));ws.once('error',reject)
})}
const delay=ms=>new Promise(r=>setTimeout(r,ms))
async function received(ws,type,predicate=()=>true){for(let n=0;n<50;n++){const i=ws.messages.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return ws.messages.splice(i,1)[0];await delay(100)}throw Error('Missing '+type)}
function code(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from(require('node:crypto').randomBytes(6),n=>chars[n%32]).join('')}
;(async()=>{try{
  const a=code(),b=code(),game=await connect(a,'game','phone'),cv=await connect(a,'game','cv'),other=await connect(b,'game','phone')
  const phone=await connect(a,'phone'),tracker=await connect(a,'tracker')
  await received(game,'phone-status',m=>m.connected)
  phone.send(JSON.stringify({type:'REQUEST_BOWL'}));await received(game,'REQUEST_BOWL')
  tracker.send(JSON.stringify({type:'controller',timestamp:1,position:{x:1,y:2,z:3}}));assert.equal((await received(cv,'controller')).position.z,3)
  await delay(250);assert(!other.messages.some(m=>m.type==='REQUEST_BOWL'||m.type==='controller'))
  game.send(JSON.stringify({type:'bowling-lab-state',active:true,ready:true}));await received(phone,'bowling-lab-state',m=>m.active&&m.ready)
  phone.send(JSON.stringify({type:'BOWLING_RELEASE',timestamp:2}));await received(game,'BOWLING_RELEASE')
  phone.close();await received(game,'phone-status',m=>!m.connected)
  const reconnected=await connect(a,'phone');await received(game,'phone-status',m=>m.connected)
  reconnected.send(JSON.stringify({type:'REQUEST_BOWL'}));await received(game,'REQUEST_BOWL')
  for(const query of ['session=bad&role=phone','session=K7P4AB&role=intruder']){const r=await fetch(base+'/relay?'+query);assert.equal(r.status,400)}
  console.log('PASS: public WSS, tracker/phone/game routing, different-session isolation, lab routing, disconnect/reconnect and invalid connections')
}finally{for(const ws of sockets)ws.close()}})().catch(e=>{console.error(e.message);process.exitCode=1})
