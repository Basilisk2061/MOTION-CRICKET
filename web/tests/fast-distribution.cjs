const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const cache = new Map()
function load(name) {
 if (cache.has(name)) return cache.get(name)
 const m = { exports: {} }
 const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',name+'.ts'),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
 new Function('require','module','exports',code)(id=>id.startsWith('./')?load(id.slice(2)):require(id),m,m.exports)
 cache.set(name,m.exports);return m.exports
}
const { generateDelivery, fastDeliverySpeed, spinDeliverySpeed, fastPaceBand, fastSwingBand, fastSwingMultiplier } = load('bowlingVariation')
const { bowlerPose, releaseTime } = load('bowling'), release = bowlerPose(releaseTime(.4),.4).hand
const recipes = [
 ['GOOD_LENGTH',5,[14,18]],['YORKER',1,[14,17]],['BOUNCER',1,[15,18]],
 ['INSWINGER',2,[14,17]],['OUTSWINGER',2,[14,17]],['FULL',3,[13,17]],['SHORT',3,[14,18]],
]
let total=0, oldTotal=0, weight=0, bands=[0,0,0,0], oldBands=[0,0,0,0]
for(const [name,w,range] of recipes){
 for(let i=0;i<10000;i++){
  const draw=(i+.5)/10000
  const p=generateDelivery('FAST',()=>draw,false,release,undefined,0,name)
  const old=draw<.75?range[0]+Math.pow(draw/.75,.65)*(range[1]-range[0]):range[1]+(draw-.75)/.25*3
  assert.equal(p.speed,fastDeliverySpeed(range,6,draw));assert.equal(p.variation,name)
  assert(p.speed>=range[0] && p.speed<=range[1]+6)
  total+=p.speed*w;oldTotal+=old*w;weight+=w
  bands[['SLOW','NORMAL','QUICK','EXPRESS'].indexOf(fastPaceBand(p.speed))]+=w
  oldBands[['SLOW','NORMAL','QUICK','EXPRESS'].indexOf(fastPaceBand(old))]+=w
  assert.equal(p.flightGravity,9.81);assert.equal(p.spinImpulse,0)
  if(!['INSWINGER','OUTSWINGER'].includes(name))assert.equal(p.swingAcceleration,0)
 }
 assert.equal(generateDelivery('FAST',()=>0,false,release,undefined,0,name).speed,range[0])
 assert.equal(generateDelivery('FAST',()=>1,false,release,undefined,0,name).speed,range[1]+6)
}
const mean=total/weight, oldMean=oldTotal/weight, fractions=bands.map(v=>v/weight)
assert(mean-oldMean>1.5);assert(fractions[0]>=.1 && fractions[0]<=.15)
assert(fractions[1]>=.5 && fractions[1]<=.55);assert(fractions[2]>=.2 && fractions[2]<=.25)
assert(fractions[3]>=.1 && fractions[3]<=.15)
assert.equal(generateDelivery('FAST',()=>0,false,release,undefined,0,'FULL').speed,13)
assert.equal(generateDelivery('FAST',()=>1,false,release,undefined,0,'GOOD_LENGTH').speed,24)
const spin = [['OFF_SPIN',[10.5,13],2,4],['LEG_SPIN',[10.5,13],2,4],['TOP_SPIN',[11,13.5],2,2],['STRAIGHTER',[11.5,14],2,2],['FLIGHTED',[8.5,9.5],1,2]]
let spinSum=0,spinWeight=0
for(const [name,range,extension,w]of spin){
 for(let i=0;i<=10000;i++){
  const draw=i/10000,p=generateDelivery('SPIN',()=>draw,false,release,undefined,0,name)
  const expected=spinDeliverySpeed(range,extension,draw,name==='FLIGHTED')
  assert.equal(p.speed,expected,'SPIN uses its updated independent sampler')
  spinSum+=p.speed*w;spinWeight+=w
 }
}
assert(mean>spinSum/spinWeight+3,'FAST stays clearly faster on average')
const swings=[0,0,0,0]
for(let i=0;i<10000;i++){
 const draw=(i+.5)/10000,multiplier=fastSwingMultiplier(draw)
 assert(multiplier>=.2 && multiplier<=2.7)
 swings[['SUBTLE','NORMAL','STRONG','BIG'].indexOf(fastSwingBand(draw))]++
}
assert.deepEqual(swings,[1500,4500,2750,1250])
console.log(`PASS: FAST mean ${oldMean.toFixed(3)} -> ${mean.toFixed(3)}; old slow/normal/quick/express ${oldBands.map(v=>(100*v/weight).toFixed(2)).join('/')}%; new ${fractions.map(v=>(100*v).toFixed(2)).join('/')}%; 13-24 endpoints and SPIN unchanged; swing % ${swings.map(n=>n/100).join('/')}`)
