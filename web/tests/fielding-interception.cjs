const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const { Vector3 } = require('three'), cache = new Map()
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const m = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',name+'.ts'),'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS},
  }).outputText
  new Function('require','module','exports',code)(id=>id.startsWith('./')?load(id.slice(2)):require(id),m,m.exports)
  cache.set(name,m.exports);return m.exports
}
const { FieldingController, fieldingClosestApproach, FIELDING } = load('fielding')
const { Delivery } = load('delivery')
function setup(offset, height=.06, speed=60) {
  const game=new Delivery(), fielding=new FieldingController()
  game.position.set(offset,height,-1.5);game.velocity.set(0,0,speed)
  fielding.startFielding(game.position,game.velocity)
  const active=fielding.activeFielder
  for(const f of fielding.fielders)f.position.set(50+f.id,0,50)
  active.position.set(0,0,0);active.state='CHASING'
  active.reactionAge=active.reactionDelay
  return {game,fielding,active}
}
function cross(offset,height=.06,options={}) {
  const context=setup(offset,height)
  const {game,fielding,active}=context
  if(options.reacting){active.state='REACTING';active.reactionDelay=.1;active.reactionAge=.09}
  if(options.unrelated){active.position.set(10,0,0);fielding.fielders.find(f=>f!==active).position.set(0,0,0)}
  const position=game.position,velocity=game.velocity
  game.position.z=1.5
  const update=fielding.update(.05,game.position,game.velocity,true)
  assert.equal(game.position,position);assert.equal(game.velocity,velocity)
  if(game.velocity.length()<60) assert(game.position.z<1.5,'contact resolves before the passed endpoint')
  else assert.equal(game.position.z,1.5,'miss leaves the ball untouched')
  assert(!game.fieldingHeld);assert(!update.captureBall)
  assert.equal(fielding.fielders.filter(f=>f.active).length,1)
  return {...context,update}
}
const central=cross(0);assert(central.game.velocity.length()<=1.2)
const stretch=cross(.88);assert(stretch.game.velocity.length()<60);assert(Math.abs(stretch.game.velocity.x)>0)
assert.equal(cross(.88,.06,{unrelated:true}).game.velocity.length(),60)
assert.equal(cross(1.6).game.velocity.length(),60)
assert.equal(cross(.1,3).game.velocity.length(),60)
assert(stretch.game.velocity.length()>central.game.velocity.length(),'outer reach removes less energy than central block')
assert(cross(0,.06,{reacting:true}).game.velocity.length()<=1.2,'reaction ending this frame still permits swept contact')
const pending=setup(0);pending.active.state='REACTING';pending.active.reactionDelay=.38;pending.active.reactionAge=0
pending.game.position.z=1.5;pending.fielding.update(.05,pending.game.position,pending.game.velocity,true)
assert(pending.game.velocity.length()<2,'unreacted player still physically blocks a central body impact')
for(const [height,speed] of [[.06,5],[.06,12],[1.2,15]]){
  const {game,fielding}=setup(.1,height,speed)
  game.position.z=0
  const update=fielding.update(.001,game.position,game.velocity,true)
  assert(update.captureBall);assert.equal(update.caught,height>.42)
}
const approach=fieldingClosestApproach(new Vector3(.85,.06,-1.5),new Vector3(.85,.06,1.5),new Vector3(),new Vector3())
assert(Math.abs(approach.distance-.85)<1e-9);assert.equal(approach.point.z,0)
assert.equal(fieldingClosestApproach(new Vector3(0,3,-1),new Vector3(0,3,1),new Vector3(),new Vector3()),null)
assert.equal(FIELDING.ACTIVE_INTERCEPTION_REACH,1)
console.log('PASS A–J: central block, active stretch deflection, unrelated/outside/high misses, full-frame tunnelling, clean pickup/catch, graded energy loss, reaction-to-chase transition, same real ball')

// Resolve at swept contact, never at the endpoint already behind the player.
for (const [height,speed,clean] of [[.06,5,true],[.06,12,true],[.06,20,false],
  [.95,15,true],[1.5,18,true],[1.8,23,true],[1.2,60,false]]) {
  const {game,fielding,active}=setup(0,height,speed)
  active.runSpeed=0 // isolate contact from already-tested chasing
  const realBall=game.position
  game.position.z=1.5
  const result=fielding.update(.05,game.position,game.velocity,true)
  assert.equal(game.position,realBall,'the same Delivery ball is retained')
  assert.equal(result.captureBall,clean)
  assert.equal(result.caught,clean && height>.42)
  assert(Math.abs(game.position.z)<1e-9,'response occurs at crossing, not behind fielder')
  if(clean) assert(result.holdPosition.distanceTo(game.position)<1e-9,'capture starts at actual contact')
  else assert(game.velocity.length()<2 && !game.fieldingHeld)
}
const moving=fieldingClosestApproach(new Vector3(-1,1.2,0),new Vector3(1,1.2,0),
  new Vector3(1,0,0),new Vector3(-1,0,0))
assert(moving.distance<1e-9 && moving.point.distanceTo(new Vector3(0,1.2,0))<1e-9)
// Below the normal hand column: vertical distance must participate in minimization.
const sloped=fieldingClosestApproach(new Vector3(.9965,.64,-.1),new Vector3(.9965,.44,.1),new Vector3(),new Vector3())
assert(sloped.distance<1,'3D sweep finds reachable lower-hand contact missed by flat minimization')
assert(Math.abs(sloped.point.z+.055)<1e-9,'closest time includes vertical separation')
for(const [offset,height] of [[1.001,1.2],[0,2.151]]) {
  const {game,fielding,active}=setup(offset,height,15)
  active.runSpeed=0;game.position.z=1.5
  assert(!fielding.update(.05,game.position,game.velocity,true).captureBall)
  assert.equal(game.velocity.z,15);assert.equal(game.position.z,1.5)
}
const edge=setup(.88,1.2,35)
edge.active.runSpeed=0;edge.game.position.z=1.5
const edgeResult=edge.fielding.update(.05,edge.game.position,edge.game.velocity,true)
assert(!edgeResult.captureBall && edge.game.velocity.length()<35)
assert.equal(edge.game.position.z,0,'airborne parry resolves at contact')
const behind=setup(0,1.2,15)
behind.active.runSpeed=0;behind.game.position.z=1.5
// Establish a segment wholly behind/outside reach, rather than an earlier crossing.
behind.fielding.reset();behind.fielding.startFielding(behind.game.position,behind.game.velocity)
behind.fielding.activeFielder.position.set(0,0,0)
behind.fielding.activeFielder.state='CHASING';behind.fielding.activeFielder.runSpeed=0
behind.game.position.z=2
assert(!behind.fielding.update(.001,behind.game.position,behind.game.velocity,true).captureBall)
assert.equal(behind.game.velocity.z,15)
const mover=setup(.1,1.2,15)
const start=mover.active.position.clone()
const ballStart=mover.game.position.clone()
mover.game.position.z=1.5
const ballEnd=mover.game.position.clone()
const movingResult=mover.fielding.update(.05,mover.game.position,mover.game.velocity,true)
assert(movingResult.caught && !mover.active.position.equals(start))
const expectedContact=fieldingClosestApproach(ballStart,ballEnd,start,mover.active.position)
assert(mover.game.position.distanceTo(expectedContact.point)<1e-9,'moving fielder captures during relative crossing')
console.log('PASS swept contact position: slow/moderate ground, waist/chest/decent airborne, hard block, moving relative sweep and lower-hand 3D reach')
