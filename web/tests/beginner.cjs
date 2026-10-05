const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), ts=require('typescript')
const {Vector3,Quaternion}=require('three')
const cache=new Map()
function load(name) {
  if(cache.has(name)) return cache.get(name)
  const module={exports:{}}
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
  new Function('require','module','exports',code)(id=>id.startsWith('./')?load(id.slice(2)):require(id),module,module.exports)
  cache.set(name,module.exports);return module.exports
}
const {Delivery,beginnerQuality}=load('delivery')
const {PhoneSwing}=load('swingContinuity')
const ctx=(extra={})=>({now:140,swingActive:true,source:'MEASURED',level:'NORMAL',predictionAgeMs:0,reacquiring:false,...extra})
function attempt({x=.28,z=-.9,omega=3,angle=0,context=ctx(),beginner=true,canHit=true}={}) {
  const g=new Delivery(()=>.5);g.state='AFTER_BOUNCE';g.released=true;g.bounced=true;g.deliveryBeginner=beginner
  g.position.set(x,.6,z);g.velocity.set(0,0,16)
  const pose={position:new Vector3(0,1.05,-.65),rotation:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),angle)}
  const saved=pose.position.clone(), rotation=pose.rotation.clone()
  g.step(.04,pose,pose,canHit,{handleVelocity:new Vector3(),angularVelocity:new Vector3(0,0,omega)},context)
  assert(pose.position.equals(saved) && pose.rotation.equals(rotation),'assist must not move visible bat')
  return g
}
const ordinary=attempt()
assert.equal(ordinary.outcome,'HIT','A: imperfect measured position connects')
assert.equal(ordinary.quality,'GOOD','D: ordinary contact is GOOD')
assert.equal(ordinary.contactKind,'ASSISTED');assert(ordinary.velocity.z<0,'assisted face response returns ball')
const predicted=attempt({context:ctx({source:'PREDICTED',level:'SWING-LOSS',predictionAgeMs:120})})
assert.equal(predicted.quality,'GOOD','B: prediction does not force EDGE')
assert.equal(attempt({x:0}).quality,'SWEET','C: excellent measured alignment')
assert.equal(attempt({x:0,context:ctx({level:'DEGRADED'})}).quality,'SWEET','excellent degraded sample can be SWEET')
assert.equal(attempt({x:.33,omega:.8}).quality,'EDGE','E: poor outer/weak contact')
assert.equal(attempt({context:ctx({swingActive:false}),omega:0}).outcome,null,'F: stationary phone')
assert.equal(attempt({z:-4}).outcome,null,'G: very early')
assert.equal(attempt({z:.7}).outcome,'MISSED','H: after contact region')
assert.equal(attempt({x:.8}).outcome,null,'I: outside reach')
const left=attempt({x:0,angle:-.25}),right=attempt({x:0,angle:.25})
assert.equal(left.outcome,'HIT');assert.equal(right.outcome,'HIT')
assert(left.velocity.x*right.velocity.x<0,'J: physical face orientation changes shot direction')
assert.equal(attempt({beginner:false}).outcome,null,'K: strict mode rejects corridor-only pass')
assert.equal(attempt({beginner:false,x:0}).outcome,'HIT','strict physical contact still works')
assert.equal(attempt({angle:Math.PI/2}).outcome,null,'wildly incompatible face misses')
assert.equal(attempt({context:ctx({source:'HELD'})}).outcome,null,'held position cannot request strong assist')
assert.equal(attempt({context:ctx({source:'PREDICTED',predictionAgeMs:230})}).outcome,null,'expired prediction')
assert.equal(attempt({context:ctx({reacquiring:true})}).outcome,null,'no correction sweep')
assert.equal(attempt({canHit:false}).outcome,null,'disconnected authority gate')
const phone=new PhoneSwing()
phone.update(0,0,true,4,2);phone.update(40,40,true,4,2)
assert.equal(attempt({context:ctx({swingActive:phone.update(400,40,true,4,2)})}).outcome,null,'stale phone')
assert.equal(beginnerQuality(new Vector3(0,-.45,0),2,1,0,ctx()).score,1)
assert.equal(beginnerQuality(new Vector3(0,-.45,0),2,1,0,ctx({source:'PREDICTED'})).quality,'GOOD')
console.log('PASS A-K: beginner corridor, deterministic SWEET/GOOD/EDGE, prediction, no idle/early/late/far/stale/incompatible hits, physical direction, strict OFF and unchanged visible bat')
