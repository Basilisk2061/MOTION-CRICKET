const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const cache = new Map()
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const m = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',name+'.ts'),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
  new Function('require','module','exports',code)(id=>id.startsWith('./')?load(id.slice(2)):require(id),m,m.exports)
  cache.set(name,m.exports);return m.exports
}
const { deliverySpeed, spinDeliverySpeed, spinTurnStrength, generateDelivery } = load('bowlingVariation')
const { bowlerPose, releaseTime } = load('bowling'), release = bowlerPose(releaseTime(.4),.4).hand
const recipes = [['OFF_SPIN',4,[10.5,13],2],['LEG_SPIN',4,[10.5,13],2],['TOP_SPIN',2,[11,13.5],2],['STRAIGHTER',2,[11.5,14],2],['FLIGHTED',2,[8.5,9.5],1]]
const oldRanges = {OFF_SPIN:[9,11],LEG_SPIN:[9,11],TOP_SPIN:[9.5,11.5],STRAIGHTER:[10,12],FLIGHTED:[8.5,9.5]}
let total=0,oldTotal=0,weight=0,slow=0,normal=0,quick=0,typical=0,oldBand=0,oldBuckets=[0,0,0]
const count=10000
for(const [name,w,range,extension] of recipes){
  for(let i=0;i<count;i++){
    const draw=(i+.5)/count
    const p=generateDelivery('SPIN',()=>draw,false,release,undefined,0,name)
    const expected=spinDeliverySpeed(range,extension,draw,name==='FLIGHTED')
    assert.equal(p.speed,expected);assert(p.speed>=8.5 && p.speed<=16)
    const old=spinDeliverySpeed(oldRanges[name],extension,draw,name==='FLIGHTED')
    total+=p.speed*w;oldTotal+=old*w;weight+=w
    oldBuckets[old<11?0:old<14.5?1:2]+=w
    if(p.speed<11)slow+=w;else if(p.speed<14.5)normal+=w;else quick+=w
    if(p.speed>=10.5 && p.speed<12.5)typical+=w
    if(p.speed<=range[1])oldBand+=w
  }
}
const average=total/weight,oldAverage=oldTotal/weight
assert(average-oldAverage>1.5);assert(normal/weight>.45 && normal/weight<.6);assert(oldBand/weight<.23)
assert(slow/weight>.1 && slow/weight<.2);assert(quick/weight>.30 && quick/weight<.4)
assert.equal(generateDelivery('SPIN',()=>0,false,release,undefined,0,'FLIGHTED').speed,8.5)
assert.equal(generateDelivery('SPIN',()=>1,false,release,undefined,0,'STRAIGHTER').speed,16)
assert(generateDelivery('SPIN',()=>.5,false,release,undefined,0,'FLIGHTED').speed<10)
for(const [range,extension] of [[[14,18],3],[[14,17],3],[[15,18],3],[[13,17],3]]){
  for(let i=0;i<=10000;i++){
    const draw=i/10000
    const old=draw<.9?range[0]+draw/.9*(range[1]-range[0]):range[1]+(draw-.9)/.1*extension
    assert(Math.abs(deliverySpeed(range,extension,draw)-old)<1e-12)
  }
}
for(const [name,,range] of recipes){
  assert.equal(generateDelivery('SPIN',()=>0,false,release,undefined,0,name).speed,range[0])
}
console.log(`PASS: unscaled weighted mean ${oldAverage.toFixed(3)} -> ${average.toFixed(3)}; slow <11 ${(100*slow/weight).toFixed(2)}%, normal 11-14.5 ${(100*normal/weight).toFixed(2)}%, quick >=14.5 ${(100*quick/weight).toFixed(2)}%; endpoints/variation identity/FAST unchanged`)
console.log('Old slow/normal/quick %',oldBuckets.map(v=>(100*v/weight).toFixed(2)))
const turnBuckets=[0,0,0,0]
for(let i=0;i<count;i++){
 const strength=spinTurnStrength((i+.5)/count)
 assert(strength>=.45 && strength<=4.2)
 turnBuckets[strength<1?0:strength<2?1:strength<3.3?2:3]++
}
assert.deepEqual(turnBuckets,[1250,5000,2750,1000])
console.log('Turn subtle/normal/strong/ripping %',turnBuckets.map(v=>100*v/count))
