const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const {Vector3,Quaternion}=require('three'),cache=new Map()
function load(name){
  if(cache.has(name))return cache.get(name)
  const m={exports:{}},code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
  new Function('require','module','exports',code)(id=>id.startsWith('./')?load(id.slice(2)):require(id),m,m.exports)
  cache.set(name,m.exports);return m.exports
}
const {MatchResult,poweredExit,swingPower}=load('matchResult'),{Delivery}=load('delivery')
const v=(x,y,z)=>new Vector3(x,y,z)
const good=v(2,1,-12),original=good.clone().normalize()
poweredExit(good,3,'GOOD',true)
assert(good.length()>27 && good.clone().normalize().distanceTo(original)<1e-10,'A: useful power without direction change')
assert(swingPower(6)>.96 && swingPower(60)-swingPower(6)<.04,'B: saturation')
for(const direction of [v(-3,1,-10),v(3,1,-10),v(0,8,-10)]){
  const unit=direction.clone().normalize();poweredExit(direction,4,'SWEET',true)
  assert(direction.clone().normalize().distanceTo(unit)<1e-10,'L: left/right/loft direction preserved')
}
for(const grounded of [false,true]){
  const m=new MatchResult();m.registerHit(v(0,.6,-.65));m.groundAfterHit=grounded
  m.update(v(35,grounded?.056:3,-9),v(36,grounded?.056:3,-9),v(28,0,0),.04)
  assert.equal(m.result,grounded?'FOUR':'SIX','C/D: boundary classification')
}
for(const [distance,result] of [[1,'DOT'],[8,'1 RUN'],[20,'2 RUNS'],[30,'3 RUNS']]){
  const m=new MatchResult();m.registerHit(v(0,.6,-9));m.groundAfterHit=true
  m.update(v(distance,.056,-9),v(distance,.056,-9),v(0,0,0),.02)
  assert.equal(m.result,result,'E: distance runs only on resolution')
}
const airborne=new MatchResult();airborne.registerHit(v(0,1,-9))
airborne.update(v(0,2,-9),v(20,2,-9),v(25,1,0),.1);assert.equal(airborne.result,null)
const bowled=new MatchResult();bowled.update(v(0,.4,.7),v(0,.4,1),v(0,0,16),.02)
assert.equal(bowled.result,'BOWLED','F: unhit wicket')
const hitWicket=new MatchResult();hitWicket.registerHit(v(0,.4,0))
hitWicket.update(v(0,.4,.7),v(0,.4,1),v(0,0,16),.02);assert.equal(hitWicket.result,null,'G: bat prevents bowled')
for(const [hit,grounded,result] of [[true,false,'CAUGHT BEHIND'],[true,true,'DOT'],[false,false,'DOT']]){
  const m=new MatchResult();if(hit)m.registerHit(v(.4,.8,0));m.groundAfterHit=grounded
  const position=v(.4,.8,3.1),velocity=v(0,0,20),glove={position:v(.4,.8,2.92),active:true}
  m.update(v(.4,.8,2.7),position,velocity,.02,glove)
  assert.equal(m.result,result,'H/I/J: aerial catch versus grounded/unhit collect')
  assert(m.held && velocity.length()===0 && position.equals(glove.position))
}
const unreachable=new MatchResult(),fast=v(0,0,35)
unreachable.update(v(2.5,.8,2.7),v(2.5,.8,3.2),fast,.02,{position:v(0,.8,2.92),active:true})
assert.equal(unreachable.result,null);assert.equal(fast.z,35,'K: unreachable ball continues')
// Exercise integration, post-hit ground flag, result reset, and boundary-capable controlled swing.
const pose={position:v(5,1,-.65),rotation:new Quaternion()}
const game=new Delivery();game.state='AFTER_BOUNCE';game.released=true;game.bounced=true
game.position.set(0,.4,.7);game.velocity.set(0,0,16)
game.step(.03,pose,pose,false);assert.equal(game.match.result,'BOWLED');assert.equal(game.velocity.length(),0)
game.state='READY';game.start();assert.equal(game.match.result,null);assert.equal(game.match.groundAfterHit,false)
const ground=new Delivery();ground.state='HIT';ground.outcome='HIT';ground.camera='BALL_FOLLOW';ground.released=true;ground.bounced=true
ground.position.set(0,.056,-.65);ground.velocity.set(0,0,-1);poweredExit(ground.velocity,3,'GOOD',true);ground.match.registerHit(ground.position)
for(let i=0;i<600 && !ground.match.result;i++)ground.step(1/60,pose,pose,false)
assert.equal(ground.match.result,'FOUR','comfortable GOOD ground shot has real boundary potential')
assert.equal(ground.match.groundAfterHit,true)
console.log('PASS A-L: power/saturation/direction, ground FOUR/aerial SIX, distance runs, bowled precedence, keeper stop/catch/grounded collect/unreachable miss, delivery reset and simulated controlled-swing boundary')
