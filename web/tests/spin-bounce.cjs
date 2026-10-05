const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const load=require('./tactical-loader.cjs'),d=require('./delivery-diagnostics.cjs')
function generator(length,previous=false){
 const m={exports:{}},source=fs.readFileSync(path.join(__dirname,'../src/bowlingVariation.ts'),'utf8')
  .replace('let bounceZ = bounceDraw,','let bounceZ = '+length+',')
  .replace('spinType,spinImpulse)',previous?'undefined,0)':'spinType,spinImpulse)')
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
 new Function('require','module','exports',code)(id=>id.startsWith('./')?load(id.slice(2)):require(id),m,m.exports)
 return m.exports.generateDelivery
}
function matrix(previous=false){const rows=[]
 for(const name of ['OFF_SPIN','LEG_SPIN','TOP_SPIN','FLIGHTED'])for(const [length,z]of [['FULL',-3],['GOOD_LENGTH',-5.25],['SHORT',-7]]){
  const p=generator(z,previous)('SPIN',()=>.5,false,d.release,undefined,0,name)
  rows.push({name,length,pace:p.speed,spin:p.spinImpulse,forward:p.forwardImpulse,...d.aiTrace(p)})
 }return rows
}
module.exports={matrix}
if(require.main===module){
 if(process.argv.includes('--matrix'))console.log(JSON.stringify({spin:matrix(process.argv.includes('--before')),pace:d.matrices()},null,2))
 else {
  const rows=matrix(),before=require('./spin-bounce-before.json')
  for(const name of ['OFF_SPIN','LEG_SPIN','TOP_SPIN','FLIGHTED']){
   const r=rows.filter(r=>r.name===name)
   assert(r[0].batY<r[1].batY&&r[1].batY<r[2].batY,'length still controls rise')
   assert(r.every(r=>r.batY>.15&&r.peak<1.8),'readable, bounded spin bounce')
   if(name!=='FLIGHTED')assert(r[1].batY>.45,'ordinary spin visibly rises')
  }
  for(let i=0;i<rows.length;i++){
   assert.equal(rows[i].spin,before.spin[i].spin);assert.equal(rows[i].pace,before.spin[i].pace)
   assert(rows[i].up>before.spin[i].up)
  }
  const {deliveryRebound}=load('deliveryBounce')
  for(const z of [-3,-5.25,-7])assert(deliveryRebound(-3.5,14,z,true,'TOP_SPIN')>deliveryRebound(-3.5,14,z,false,'OFF_SPIN',1.7))
  for(const name of ['OFF_SPIN','LEG_SPIN','TOP_SPIN','FLIGHTED'])for(const pace of [0,.5,1]){
   let i=0;const draws=[.5,pace,.5,.5,.5,1]
   const p=generator(-5.25)('SPIN',()=>draws[i++],false,d.release,undefined,0,name),r=d.aiTrace(p)
   assert(r.batY>.25&&r.peak<1.8,'slow/quick spin remains readable without super-ball bounce')
  }
  const pace=d.matrices()
  for(let i=0;i<pace.length;i++)for(const key of ['pace','down','up','batY','stumpY','bounceZ'])assert.equal(pace[i][key],before.pace[i][key],'FAST and Lab unchanged')
  console.log('PASS: visible OFF/LEG rise, bounded TOP bite/FLIGHTED, length hierarchy, frozen turn/pace, exact FAST/Lab baseline')
 }
}
