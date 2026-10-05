const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const {Group,Vector3,PerspectiveCamera,Scene}=require('three'),load=require('./tactical-loader.cjs')
const {ReplayRecorder,captureTransforms,applyTransforms,replayResult,REPLAY_MAX_FRAMES}=load('replayRecorder')
const {ReplayPlayback,ReplaySession,ReplayCamera}=load('replayPlayback')
const {SessionScore}=load('sessionScore'),{MatchResult}=load('matchResult')
for(const result of ['FOUR','SIX','BOWLED','CAUGHT','CAUGHT BEHIND'])assert(replayResult(result))
for(const result of [null,'DOT','1 RUN','2 RUNS','3 RUNS','MISSED'])assert(!replayResult(result))
const ball=new Group(),bat=new Group(),bail=new Group(),fielder=new Group(),keeper=new Group(),objects=[ball,bat,bail,fielder,keeper]
const recorder=new ReplayRecorder();recorder.event('release',0);assert(!recorder.event('release',1))
for(let i=0;i<=100;i++){
 const t=i/30;ball.position.set(t,1-t*.1,-18+t*8);bat.position.set(t*.2,1,-.65);bat.rotation.z=t
 bail.position.y=t>2?(t-2)*.7:0;fielder.position.x=t;keeper.rotation.z=-t*.1
 recorder.record(t,objects,ball.position,t>=2)
}
recorder.event('contact',2);recorder.event('wicket',2.1)
const clip=recorder.clip('BOWLED',2.1);assert(clip)
const saved=clip.frames[60].transforms.slice();ball.position.set(999,999,999);bat.position.set(-999,0,0)
assert.deepEqual(clip.frames[60].transforms,saved,'snapshots own their transforms')
applyTransforms(objects,saved);assert(Math.abs(ball.position.x-2)<1e-6);assert(Math.abs(bat.position.x-.4)<1e-6)
const playback=new ReplayPlayback(clip);assert.equal(playback.focus,2.1)
let frames=0;while(!playback.finished&&frames++<2000)playback.step(1/60)
assert(playback.finished);assert(playback.age>=3&&playback.age<7,'restrained clip duration')
for(let i=101;i<4000;i++)recorder.record(i/30,objects,ball.position,true)
assert(recorder.frames.length<=REPLAY_MAX_FRAMES);assert.equal(recorder.frames[0].at,0)
recorder.clear();assert.equal(recorder.frames.length,0);assert.equal(recorder.events.length,0);assert.equal(recorder.clip('SIX',10),null)
for(const result of ['FOUR','SIX','BOWLED','CAUGHT','CAUGHT BEHIND']){
 const camera=new ReplayCamera(result);camera.update(new Vector3(20,2,-30),true,.016,.9)
 assert(camera.position.toArray().every(Number.isFinite));assert(camera.position.y>1)
}
let frame
function component(name,react={}){
 const m={exports:{}},code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',name+'.tsx'),'utf8'),
 {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
 new Function('require','module','exports',code)(id=>id==='react'?{useMemo:f=>f(),useRef:v=>({current:v}),useEffect:()=>{},...react}:
 id==='@react-three/fiber'?{useFrame:f=>frame=f}:id.endsWith('.css')?{}:id.startsWith('./')?load(id.slice(2)):require(id),m,m.exports)
 return m.exports.default
}
function lifecycle(result){
 const replay=new ReplaySession(),score=new SessionScore(null,()=>.5),match=new MatchResult()
 const game={state:'BOWLING',match,released:true,bounceId:0,fieldingHeld:false,position:new Vector3(0,2,-18),step:()=>assert.fail('never simulate replay')}
 const liveBall=new Group(),liveBat=new Group(),liveBail=new Group(),liveFielder=new Group(),liveKeeper=new Group(),hidden=new Group()
 const roots=[liveBall,liveBat,liveBail,liveFielder,liveKeeper].map(current=>({current}))
 const director=component('ReplayDirector');director({game,score,replay,roots,hidden:[{current:hidden}],suspended:false})
 const camera=new PerspectiveCamera(),scene=new Scene(),draws=[]
 const context={scene,camera,clock:{elapsedTime:0},gl:{render:()=>draws.push({ball:liveBall.position.clone(),bat:liveBat.position.clone(),bail:liveBail.position.clone(),fielder:liveFielder.position.clone(),keeper:liveKeeper.position.clone(),hidden:hidden.visible})}}
 const render=(time,dt=1/60)=>{context.clock.elapsedTime=time;frame(context,dt)}
 for(let i=0;i<=60;i++){
  const t=i/60;game.position.set(t,1,-18+t*18);liveBall.position.copy(game.position)
  liveBat.position.set(t*.1,1,-.65);liveFielder.position.set(t*3,0,-10);liveKeeper.position.set(t*.3,0,3.4)
  if(i===20)game.bounceId++
  if(i>=40){match.hit=result!=='BOWLED';match.age=(i-40)/60}
  if(i===60){match.result=result;game.state='COMPLETE';if(result==='BOWLED')match.wicketImpact={timestamp:match.age}}
  render(t)
 }
 assert(replay.pending);assert(!replay.blocked,'live outcome first')
 for(let i=61;i<170;i++){
  liveBail.position.y=(i-60)/60;render(i/60)
 }
 assert(!replay.blocked,'wait for authoritative score finalization')
 assert(score.consume(match));const scored=JSON.stringify({total:score.total,balls:score.totalLegalBalls,wickets:score.wickets,result:game.match.result})
 render(3)
 assert(replay.playing,'eligible result triggers after hold and scoring')
 assert(replay.playback.clip.events.some(e=>e.type==='bounce'))
 if(result==='BOWLED')assert(replay.playback.clip.end>=2.45,'recorded full wicket hold')
 liveBat.position.set(99,99,99);liveBall.position.set(88,88,88);liveBail.position.set(77,77,77)
 for(let i=0;i<30;i++)render(3+i/60)
 assert(draws.at(-1).bat.x<2,'live controller does not control replay bat')
 assert(draws.at(-1).ball.x<5,'recorded ball, not live state')
 assert(draws.at(-1).bail.y<3,'recorded wicket transforms')
 assert(draws.at(-1).fielder.x<3,'recorded fielder movement')
 assert(draws.at(-1).keeper.x<.3,'recorded keeper movement')
 assert.equal(draws.at(-1).hidden,false)
 assert.deepEqual(liveBat.position.toArray(),[99,99,99],'restore live visual exactly after draw')
 assert.deepEqual(liveBall.position.toArray(),[88,88,88]);assert(hidden.visible)
 assert.equal(JSON.stringify({total:score.total,balls:score.totalLegalBalls,wickets:score.wickets,result:game.match.result}),scored)
 assert(replay.consumeKey('Space'));assert.equal(replay.phase,'EXITING');replay.tick(.2);assert(!replay.blocked)
 assert(!score.consume(match),'same result cannot score twice')
 const next=new MatchResult();game.match=next;game.state='BOWLING';game.bounceId=8;render(4)
 assert(!replay.pending);assert(!replay.blocked,'no stale result replay')
}
for(const result of ['FOUR','SIX','BOWLED','CAUGHT','CAUGHT BEHIND'])lifecycle(result)
const session=new ReplaySession();session.begin(clip)
let key,prevented=0,stopped=0
global.window={addEventListener:(_,f)=>{key=f},removeEventListener:()=>{}}
component('ReplayOverlay',{useSyncExternalStore:()=>{},useEffect:f=>f()})({session})
key({code:'Escape',preventDefault:()=>prevented++,stopImmediatePropagation:()=>stopped++})
assert.equal(prevented,1);assert.equal(stopped,1);assert.equal(session.phase,'EXITING')
session.tick(.1);session.consumeKey('Space');session.tick(.07);assert(!session.blocked,'held skip key cannot prolong exit')
const app=fs.readFileSync(path.join(__dirname,'../src/App.tsx'),'utf8')
assert(app.includes('!replay.inputBlocked &&'));assert(app.includes('if(replay.blocked){'))
assert(app.includes('feed.bowlRequests.current=0;feed.publishBowlReady(false,performance.now());bowlGesture.pause();return'))
// Execute the actual early-return branch, not just an equivalent mock guard.
const source=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
let mainFrame
function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(source)==='useFrame'&&node.arguments[0]?.getText(source).includes('if(suspendRef.current)return'))mainFrame=node.arguments[0].getText(source);ts.forEachChild(node,visit)}
visit(source)
const mainModule={exports:{}},mainCode=ts.transpileModule('module.exports='+mainFrame,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
let readiness,gesturePaused=0;const feed={bowlRequests:{current:4},publishBowlReady:value=>{readiness=value}}
new Function('suspendRef','replay','feed','performance','bowlGesture','module',mainCode)({current:false},{blocked:true},feed,{now:()=>1},{pause:()=>gesturePaused++},mainModule)
assert.doesNotThrow(()=>mainModule.exports(null,.016));assert.equal(feed.bowlRequests.current,0);assert.equal(readiness,false);assert.equal(gesturePaused,1)
console.log('PASS: all eligible results, non-highlights excluded, bounded independent transforms, recorded bat/ball/wickets/fielders/keeper, live scoring safety/hold, skip capture, phone guards, next-delivery reset')
