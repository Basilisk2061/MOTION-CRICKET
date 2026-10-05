const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const {Vector3}=require('three'),cache=new Map()
function load(name){
 if(cache.has(name))return cache.get(name)
 const m={exports:{}}
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
 new Function('require','module','exports',code)(id=>id.startsWith('./')?load(id.slice(2)):require(id),m,m.exports)
 cache.set(name,m.exports);return m.exports
}
const {FieldingController,fieldingClosestApproach,FIELDING}=load('fielding')
function crossing(height,speed,passive=false,offset=0){
 const fielding=new FieldingController(),ball=new Vector3(offset,height,-1),velocity=new Vector3(0,0,speed)
 fielding.startFielding(ball,velocity)
 const owner=fielding.activeFielder
 for(const f of fielding.fielders)f.position.set(50+f.id,0,50)
 owner.position.set(passive?10:0,0,0);owner.state='CHASING';owner.runSpeed=0
 const contactFielder=passive?fielding.fielders.find(f=>f!==owner):owner
 contactFielder.position.set(0,0,0)
 fielding.debugEnabled=true
 fielding.debugAge=.5 // permit the existing throttled near-miss trace
 ball.z=1
 const result=fielding.update(.01,ball,velocity,true)
 fielding.finishDebugFrame(ball)
 let trace
 const old=console.debug
 try{console.debug=(_label,value)=>{trace=value};fielding.recordPhysicsStep(ball,ball)}
 finally{console.debug=old}
 assert.equal(fielding.activeFielder,owner)
 return {ball,velocity,result,trace}
}
for(const height of [.056,.12,.30,.42,.43,.52,.65,.90]){
 for(const speed of [6,12,40,100])for(const passive of [false,true]){
  const c=crossing(height,speed,passive)
  assert(c.result.captureBall || c.velocity.length()<speed,'central low crossing always interacts')
  assert(Math.abs(c.ball.z)<1e-9,'response at swept crossing')
  assert.equal(c.trace.contactZone,'LOWER_BODY')
  assert.equal(c.trace.lateralOffsetFromFielder,0)
  if(passive || speed>=40) assert(!c.result.captureBall && c.velocity.length()<2,'physical block, not magnetic possession')
 }
}
// Moving relative sweep has the same continuous lower-body coverage.
for(const height of [.056,.3,.52,.9]){
 const approach=fieldingClosestApproach(new Vector3(-1,height,0),new Vector3(1,height,0),
  new Vector3(1,0,0),new Vector3(-1,0,0))
 assert(approach && approach.distance<.24,'no central vertical tunnel')
}
for(const offset of [-1.001,1.001]){
 const c=crossing(.3,40,false,offset)
 assert.equal(c.velocity.z,40);assert.equal(c.ball.z,1);assert.equal(c.trace.contactZone,'NONE')
}
// Just outside visual feet is NOT outside existing hand/collection reach.
for(const offset of [-.23,.23]){
 const c=crossing(.12,6,true,offset)
 assert.equal(c.trace.contactZone,'NORMAL','existing passive reach already extends beyond stance')
}
const chest=crossing(1.2,15)
assert(chest.result.caught);assert.equal(chest.trace.contactZone,'HAND_REACH')
assert.deepEqual([FIELDING.COLLECTION_RADIUS,FIELDING.CATCH_RADIUS,FIELDING.ACTIVE_INTERCEPTION_REACH],[.72,.62,1])
console.log('PASS: ground/ankle/shin/knee/pelvis central sweeps, moderate/hard active/passive contacts, moving sweep, outside actual reach, existing chest catch, diagnostic zones; no uncovered stance tunnel')
