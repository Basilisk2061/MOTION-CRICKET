const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const {Vector3,Quaternion}=require('three'),cache=new Map()
function load(name){
 if(cache.has(name))return cache.get(name)
 const m={exports:{}}
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
 new Function('require','module','exports',code)(id=>id.startsWith('./')?load(id.slice(2)):require(id),m,m.exports)
 cache.set(name,m.exports);return m.exports
}
const {Delivery}=load('delivery'),{MatchResult}=load('matchResult'),{FieldingController,fieldingClosestApproach}=load('fielding')
const {MATCH,DELIVERY}=load('gameplayTuning'),bat={position:new Vector3(100,100,100),rotation:new Quaternion()}
function fixture(speed=0){
 const game=new Delivery(),fielding=new FieldingController()
 game.state='HIT';game.outcome='HIT';game.camera='BALL_FOLLOW';game.released=true;game.visible=true
 game.position.set(0,.056,-10);game.velocity.set(speed,0,0);game.match.registerHit(game.position);game.match.groundAfterHit=true
 fielding.startFielding(game.position,game.velocity)
 const owner=fielding.activeFielder
 for(const f of fielding.fielders)f.position.set(100+f.id,0,-10)
 owner.position.set(-65,0,-10);owner.state='CHASING';owner.target.copy(owner.position)
 return {game,fielding}
}
function frame(c){
 const {game,fielding}=c
 game.step(.05,bat,bat,false)
 const u=fielding.update(.05,game.position,game.velocity,game.match.hit&&!game.match.result&&!game.match.held)
 if(u.captureBall){if(u.caught&&!game.match.groundAfterHit)game.match.registerFielderCatch();game.holdBallForFielder(u.holdPosition)}
 if(game.fieldingHeld&&u.holdPosition)game.moveHeldBall(u.holdPosition)
 if(game.fieldingHeld&&u.collected&&!game.match.result){game.match.finalizeDistance();game.releaseFieldThrow(game.position.clone(),new Vector3(0,3,5),.25)}
 return u
}
for(const speed of [0,.4,3]){
 const c=fixture(speed),ball=c.game.position
 for(let i=0;i<170;i++){frame(c);assert.equal(c.game.match.result,null,'slow/settled shot stays live beyond old 8s timeout');assert(c.game.visible)}
 assert(c.game.match.physicsSettled)
 let picked=false
 for(let i=0;i<250&&!c.game.match.result;i++){const u=frame(c);picked ||=u.captureBall}
 assert(picked,'actual chase must reach and collect stationary ball')
 assert.equal(c.game.match.endReason,'FIELDER_COLLECTION');assert.equal(c.game.position,ball)
 assert.equal(c.game.match.result,'DOT','unchanged distance scoring')
 for(let i=0;i<100&&c.game.state!=='READY';i++)frame(c)
 assert.equal(c.game.state,'READY','only resolved collection permits next delivery')
}
// Existing distance-scoring thresholds remain authoritative on explicit collection.
for(const fraction of [.01,...MATCH.RUN_THRESHOLDS.map(v=>v+.01)]){
 const m=new MatchResult();m.registerHit(new Vector3());m.distance=fraction*MATCH.BOUNDARY_RADIUS;m.finalizeDistance()
 assert.equal(m.result,fraction<MATCH.RUN_THRESHOLDS[0]?'DOT':fraction<MATCH.RUN_THRESHOLDS[1]?'1 RUN':fraction<MATCH.RUN_THRESHOLDS[2]?'2 RUNS':'3 RUNS')
}
for(const grounded of [true,false]){
 const m=new MatchResult();m.registerHit(new Vector3());m.groundAfterHit=grounded
 m.update(new Vector3(),new Vector3(MATCH.BOUNDARY_RADIUS+1,.1,MATCH.BOUNDARY_CENTER_Z),new Vector3(5,0,0),.01)
 assert.equal(m.result,grounded?'FOUR':'SIX');assert.equal(m.endReason,'BOUNDARY')
}
const catchResult=new MatchResult();catchResult.registerHit(new Vector3());assert(catchResult.registerFielderCatch());assert.equal(catchResult.result,'CAUGHT');assert.equal(catchResult.endReason,'CATCH')
const wicket=new MatchResult();wicket.update(new Vector3(MATCH.STUMP_X[0],.2,MATCH.WICKET_Z-1),new Vector3(MATCH.STUMP_X[0],.2,MATCH.WICKET_Z+1),new Vector3(0,0,15),.01);assert.equal(wicket.result,'BOWLED');assert.equal(wicket.endReason,'WICKET')
for(const invalid of [false,true]){
 const c=fixture();c.game.match.age=invalid?0:120
 if(invalid)c.game.position.x=NaN
 frame(c);assert.equal(c.game.match.endReason,'FAILSAFE');assert(c.game.position.toArray().every(Number.isFinite))
}
// Reach boundary: slow reacted reach can secure a ball; speed changes response, not contact.
function sweep(offset,speed,height=.056,moving=false){
 const f=new FieldingController(),p=new Vector3(offset,height,-1),v=new Vector3(0,0,speed)
 f.startFielding(p,v);const owner=f.activeFielder
 for(const x of f.fielders)x.position.set(50+x.id,0,50)
 owner.position.set(moving?-.2:0,0,0);owner.state='CHASING';owner.runSpeed=moving?6.2:0
 owner.target.set(.2,0,0);f.debugEnabled=true;p.z=1
 const u=f.update(.05,p,v,true)
 return {f,p,v,u}
}
for(const height of [.056,1.2]){
 assert(sweep(.1,5,height).u.captureBall)
 assert(sweep(.85,5,height).u.captureBall,'reacted slow stretch is secure, not unconditional parry')
 const hard=sweep(.1,60,height);assert(!hard.u.captureBall);assert(hard.v.length()<3)
 assert.equal(sweep(1.001,60,height).v.z,60)
 for(const x of [.7,.9,.999,1.001,1.2]){
  const c=sweep(x,40,height);assert.equal(c.f.debugContact.result==='MISS',x>1)
  assert.equal(c.f.debugContact.distance>c.f.debugContact.reach,x>1)
 }
}
const moving=sweep(.8,40,.056,true);assert(moving.v.z<40,'relative swept moving reach contacts narrow static miss')
const a=new Vector3(.9,.056,-1),b=new Vector3(.9,.056,1),s=new Vector3(-.2,0,0),e=new Vector3(.2,0,0)
assert(fieldingClosestApproach(a,b,s,s).distance>1)
assert(fieldingClosestApproach(a,b,s,e).distance<1,'moving relative sweep reaches ball outside static start envelope')
// First shot-frame displacement must not be discarded by startFielding.
const first=new FieldingController(),start=new Vector3(0,.056,-1),end=new Vector3(0,.056,1),vel=new Vector3(0,0,60)
first.startFielding(end,vel,start);const owner=first.activeFielder
for(const f of first.fielders)f.position.set(50+f.id,0,50)
owner.position.set(0,0,0);owner.state='REACTING';owner.reactionDelay=1
first.update(.05,end,vel,true);assert(vel.length()<2)
const renderer=fs.readFileSync(path.join(__dirname,'../src/Fielders.tsx'),'utf8')
assert(renderer.includes('useFrame(() => {'),'render transform synchronizes after priority-0 simulation')
console.log('PASS: slow/zero-speed live chase and pickup -> scoring -> next delivery; boundary/catch/wicket; invalid/120s failsafe; reach sweep/height/speed boundary; first shot-frame sweep')
