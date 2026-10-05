const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const {Vector3,Quaternion}=require('three'),cache=new Map()
function load(name){
 if(cache.has(name))return cache.get(name)
 const m={exports:{}}
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
 new Function('require','module','exports',code)(id=>id.startsWith('./')?load(id.slice(2)):require(id),m,m.exports)
 cache.set(name,m.exports);return m.exports
}
const {Delivery}=load('delivery'),{FieldingController}=load('fielding')
const bat={position:new Vector3(100,100,100),rotation:new Quaternion()}
function crossing(speed,mode,offset=.1,height=1.2){
 const game=new Delivery(),fielding=new FieldingController()
 game.state='HIT';game.outcome='HIT';game.released=true
 game.position.set(offset,height,-10.4);game.velocity.set(0,0,speed);game.match.registerHit(game.position)
 if(height<.42)game.match.groundAfterHit=true
 fielding.startFielding(game.position,game.velocity)
 const owner=fielding.activeFielder
 for(const f of fielding.fielders)f.position.set(50+f.id,0,-20)
 owner.position.set(mode==='passive'?10:0,0,-10)
 owner.state=mode==='reacting'?'REACTING':'CHASING';owner.reactionAge=0;owner.reactionDelay=.38
 if(mode==='passive')fielding.fielders.find(f=>f!==owner).position.set(0,0,-10)
 const position=game.position,velocity=game.velocity
 // Same ordering as App: physics, movement/contact, hold, render, next physics.
 game.step(.05,bat,bat,false)
 const update=fielding.update(.05,game.position,game.velocity,game.match.hit&&!game.match.result&&!game.match.held)
 if(update.captureBall && update.holdPosition){
  if(update.caught&&!game.match.groundAfterHit)game.match.registerFielderCatch()
  game.holdBallForFielder(update.holdPosition)
 }
 const rendered=game.position.clone(),outgoing=game.velocity.clone()
 fielding.finishDebugFrame(game.position)
 game.step(.05,bat,bat,false)
 assert.equal(game.position,position);assert.equal(game.velocity,velocity)
 assert.equal(fielding.activeFielder,owner,'physical contact does not change ownership')
 return {game,fielding,update,rendered,outgoing}
}
for(const mode of ['passive','reacting'])for(const speed of [18,60]){
 const c=crossing(speed,mode)
 assert(c.outgoing.length()<2,mode+' central body must block, even without catch eligibility')
 assert(!c.update.captureBall && !c.game.fieldingHeld)
 assert(c.game.position.z<-9.8,'next frame cannot continue unchanged behind fielder')
}
const caught=crossing(18,'active')
assert(caught.update.caught && caught.game.fieldingHeld)
assert(caught.game.position.equals(caught.rendered),'next physics preserves the same held ball')
const outside=crossing(18,'passive',1.1)
assert(!outside.update.captureBall && outside.outgoing.z>17 && outside.game.position.z>-9.5)
for(const mode of ['passive','reacting','active']){
 const ground=crossing(12,mode,.1,.06)
 assert(ground.game.fieldingHeld || ground.outgoing.length()<2,'moderate rolling ball cannot phase through')
}
const app=fs.readFileSync(path.join(__dirname,'../src/App.tsx'),'utf8')
assert(app.indexOf('game.step(')<app.indexOf('fielding.update('))
assert(app.indexOf('fielding.update(')<app.indexOf('ball.current.position.copy('))
console.log('PASS: real Delivery -> fielding -> render -> next physics; passive/reacting central moderate/hard blocks, active catch, outside miss, same ball and unchanged owner')
