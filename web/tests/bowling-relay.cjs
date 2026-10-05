const assert=require('node:assert/strict'),http=require('node:http'),{once}=require('node:events'),{WebSocket}=require('ws')
;(async()=>{
 const {phoneRelay}=await import('../phone-relay.mjs'),server=http.createServer()
 phoneRelay().configureServer({httpServer:server});server.listen(0,'127.0.0.1');await once(server,'listening')
 const url=`ws://127.0.0.1:${server.address().port}/phone-ws`,phone=new WebSocket(url+'?role=phone'),game=new WebSocket(url+'?role=game')
 const waitFor=(ws,type)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{ws.off('message',read);reject(new Error('timeout '+type))},2000)
  function read(data){const m=JSON.parse(data);if(m.type===type){clearTimeout(timer);ws.off('message',read);resolve(m)}}
  ws.on('message',read)
 })
 try{
  await Promise.all([once(phone,'open'),once(game,'open')])
  const state=waitFor(phone,'bowling-lab-state');game.send(JSON.stringify({type:'bowling-lab-state',active:true,ready:true}))
  assert.equal((await state).active,true)
  const poseMessage={type:'BOWLING_POSE',timestamp:Date.now(),calibrationId:1,orientation:{x:0,y:0,z:0,w:1},angularVelocity:{x:4,y:1,z:0},angularSpeed:4.5,holding:true,swingIntent:'OUT',target:{x:-.5,z:-6},motion:{state:'MOTION_STARTED',filtered:4,peak:5,paceMetric:0,angle:.5,history:[3,4,5],releaseAt:null,gyro:{x:4,y:1,z:0},coherence:.9}}
  const live=waitFor(game,'BOWLING_POSE');phone.send(JSON.stringify(poseMessage));assert.deepEqual(await live,poseMessage)
  assert(require('./tactical-loader.cjs')('bowlingController').parseBowlingPose(poseMessage),'desktop parser accepts live pose')
  const release={type:'BOWLING_RELEASE',source:'TOUCH_RELEASE',timestamp:Date.now(),id:1,calibrationId:1,
   orientation:{x:0,y:0,z:0,w:1},angularVelocity:{x:4,y:1,z:0}}
  const incoming=waitFor(game,'BOWLING_RELEASE');phone.send(JSON.stringify(release));assert.deepEqual(await incoming,{...release,swingIntent:'NONE'})
  const load=require('./tactical-loader.cjs'),{parseBowlingRelease}=load('bowlingController')
  for(const intent of ['IN','OUT','NONE','invalid']){
   const armed=waitFor(phone,'bowling-lab-state');game.send(JSON.stringify({type:'bowling-lab-state',active:true,ready:true}));await armed
   const source=intent==='IN'?'AUTO_MOTION':release.source
   const received=waitFor(game,'BOWLING_RELEASE');phone.send(JSON.stringify({...release,source,swingIntent:intent,angularSpeed:4.5,target:poseMessage.target}))
   const parsed=parseBowlingRelease(await received)
   assert.equal(parsed.swingIntent,intent==='invalid'?'NONE':intent);assert.equal(parsed.angularSpeed,4.5)
   assert.equal(parsed.source,source)
   assert.deepEqual(parsed.target,poseMessage.target,'same selected target survives release')
  }
  const imu=waitFor(game,'phone-controller')
  phone.send(JSON.stringify({type:'phone-controller',timestamp:Date.now(),calibrated:true,orientation:{x:0,y:0,z:0,w:1}}))
  assert.equal((await imu).calibrated,true,'release does not interfere with IMU stream')
  const rearm=waitFor(phone,'bowling-lab-state');game.send(JSON.stringify({type:'bowling-lab-state',active:true,ready:true}));await rearm
  const volume=waitFor(game,'BOWLING_RELEASE');phone.send(JSON.stringify({...release,id:2,source:'VOLUME_DOWN'}));assert.equal((await volume).source,'VOLUME_DOWN')
  const exit=waitFor(phone,'bowling-lab-state');game.send(JSON.stringify({type:'bowling-lab-state',active:false,ready:false}));assert.equal((await exit).active,false)
  let leaked=false;const check=d=>{if(JSON.parse(d).type==='BOWLING_RELEASE')leaked=true};game.on('message',check)
  phone.send(JSON.stringify({...release,id:3}));await new Promise(r=>setTimeout(r,60));assert(!leaked,'lab events never enter inactive batting mode')
  console.log('PASS: shared relay lab readiness, touch/volume release snapshots, simultaneous IMU, exit isolation; hardware support NOT tested')
 }finally{phone.terminate();game.terminate();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
