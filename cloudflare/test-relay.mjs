import assert from 'node:assert/strict'
import worker, { Room, connection, validMessage } from './worker.mjs'
const makeURL = (session,role,channel='') => new URL(`https://demo.example/relay?session=${session}&role=${role}&channel=${channel}`)
assert(connection(makeURL('K7P4AB','game','cv')))
assert.equal(connection(makeURL('bad','phone')),null)
assert.equal(connection(makeURL('K7P4AB','intruder')),null)
assert.equal(connection(makeURL('K7P4AB','game','tracker')),null)
assert.equal(validMessage('phone','not-json'),null)
assert.equal(validMessage('phone',JSON.stringify({type:'phone-controller',timestamp:1,padding:'x'.repeat(4096)})),null)
assert.equal(validMessage('tracker',JSON.stringify({type:'REQUEST_BOWL'})),null)
function socket(role,channel) {
  return {readyState:1,bufferedAmount:0,a:{role,channel,ready:false,labActive:false,labReady:false,rateAt:Date.now(),count:0},sent:[],
    deserializeAttachment(){return {...this.a}},serializeAttachment(a){this.a={...a}},send(d){this.sent.push(JSON.parse(d))},close(){this.readyState=3}}
}
const cv=socket('game','cv'), game=socket('game','phone'), phone=socket('phone','phone'), tracker=socket('tracker','tracker')
const room = new Room({getWebSockets:()=>[cv,game,phone,tracker]})
const otherGame=socket('game','phone'), otherRoom=new Room({getWebSockets:()=>[otherGame]})
room.webSocketMessage(phone,JSON.stringify({type:'REQUEST_BOWL'}))
assert.equal(game.sent.at(-1).type,'REQUEST_BOWL'); assert.equal(cv.sent.length,0);assert.equal(otherGame.sent.length,0)
room.webSocketMessage(tracker,JSON.stringify({type:'controller',timestamp:1,position:{x:1,y:2,z:3}}))
assert.equal(cv.sent.at(-1).position.z,3);assert.equal(game.sent.length,1)
room.webSocketMessage(game,JSON.stringify({type:'bowling-lab-state',active:true,ready:true}))
room.webSocketMessage(phone,JSON.stringify({type:'BOWLING_RELEASE',timestamp:1}))
assert.equal(game.sent.at(-1).type,'BOWLING_RELEASE');assert.equal(game.a.labReady,false)
room.webSocketMessage(phone,JSON.stringify({type:'BOWLING_RELEASE',timestamp:2}))
assert.equal(game.sent.filter(m=>m.type==='BOWLING_RELEASE').length,1,'Release readiness is consumed once')
room.webSocketClose(phone,1000);assert.equal(game.sent.at(-1).connected,false)
const seen=[];const env={ROOMS:{idFromName:n=>n,get:id=>({fetch:()=>{seen.push(id);return new Response('ok')}})}}
for(const session of ['K7P4AB','H2J3MN'])await worker.fetch(new Request(makeURL(session,'phone'),{headers:{Upgrade:'websocket'}}),env)
assert.deepEqual(seen,['K7P4AB','H2J3MN'],'Session codes select separate objects')
assert.equal((await worker.fetch(new Request(makeURL('bad','phone')),env)).status,400)
assert.equal((await worker.fetch(new Request(makeURL('K7P4AB','phone'),{headers:{Upgrade:'websocket',Origin:'https://evil.example'}}),env)).status,403)
assert.equal((await worker.fetch(new Request('https://demo.example/health'),env)).status,200)
assert.equal(otherRoom.sockets().length,1)
console.log('PASS: same-room routing, room isolation, channel/role validation, malformed/oversize messages, readiness and disconnect status')
