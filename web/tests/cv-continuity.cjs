const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const {Vector3}=require('three'),cache=new Map()
function load(name){
  if(cache.has(name))return cache.get(name)
  const m={exports:{}},code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
  new Function('require','module','exports',code)(id=>id.startsWith('./')?load(id.slice(2)):require(id),m,m.exports)
  cache.set(name,m.exports);return m.exports
}
const {HandleContinuity}=load('swingContinuity')
const origin=new Vector3(.32,1.05,-.65),h=new HandleContinuity();h.reset(origin)
const sample=(id,position,extra={})=>({sampleId:id,sampleTime:id*33,received:id*33,position,velocity:null,...extra})
for(let i=0;i<50;i++) {
  const position=origin.clone().add(new Vector3(i*.004,0,-i*.002))
  h.update(i*33,.016,sample(i,position),false)
  assert(h.position.equals(position),'every new filtered Python sample applies directly')
  assert.equal(h.predictionAgeMs,0);assert(!h.reacquiring)
}
const fast=origin.clone().add(new Vector3(.6,.4,-.15))
h.update(50*33,.016,sample(50,fast),true)
assert(h.position.equals(fast),'first fast sample follows without gate or transition cap')
assert(h.velocity.length()>4,'fast velocity is not capped to 4 units/s')
const before=h.position.clone()
for(let i=0;i<20;i++)h.update(50*33+i,.001,sample(50,origin),true)
assert(h.position.equals(before),'duplicates cannot update position')
h.update(51*33,.016,sample(51,origin,{estimated:true}),true)
assert(h.position.equals(before));assert.equal(h.velocity.length(),0);assert.equal(h.predictionAgeMs,0)
h.update(52*33,.016,sample(52,origin),true)
assert(h.position.equals(origin),'first valid sample after hold resumes immediately')
h.update(53*33,.016,sample(53,new Vector3(NaN,0,0)),true)
assert(h.position.equals(origin),'invalid positions hold safely')
h.update(60*33,.016,null,true);assert(h.position.equals(origin));assert.equal(h.predictionAgeMs,0)
console.log('PASS: direct new samples, slow/fast XYZ, no velocity cap/gate/prediction, duplicates, invalid hold and first-sample recovery')
