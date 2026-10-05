const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const {PerspectiveCamera,Vector3}=require('three'),load=require('./tactical-loader.cjs'),d=require('./delivery-diagnostics.cjs')
const {generateDelivery,playableInitialLine}=load('bowlingVariation')
function previousGenerator(){
 const m={exports:{}},source=fs.readFileSync(path.join(__dirname,'../src/bowlingVariation.ts'),'utf8')
  .replace('else { targetX=.35+lineDraw*.45;legSideLine=true }','')
  .replace('if(legSideLine) compensation=0','')
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
 new Function('require','module','exports',code)(id=>id.startsWith('./')?load(id.slice(2)):require(id),m,m.exports)
 return m.exports.generateDelivery
}
const previous=previousGenerator(),buckets=['EXTREME_LEFT','LEFT','CENTRE','RIGHT','EXTREME_RIGHT']
const bucket=x=>x<-.85?buckets[0]:x<-.20?buckets[1]:x<=.30?buckets[2]:x<=.85?buckets[3]:buckets[4]
function line(p){
 const t1=(p.bounceZ-d.release.z)/p.speed,t2=(-.65-p.bounceZ)/(p.speed+p.forwardImpulse)
 const start=d.release.x+p.velocity.x*(t1+t2)
 const movement=p.swingAcceleration*(.5*t1*t1+t1*t2)+p.spinImpulse*t2
 const bounce=d.release.x+p.velocity.x*t1+.5*p.swingAcceleration*t1*t1
 return {intended:p.targetX,start,bounce,final:start+movement,movement,startBucket:bucket(start),finalBucket:bucket(start+movement)}
}
function sample(){return ['GOOD_LENGTH','INSWINGER','OUTSWINGER','OFF_SPIN','LEG_SPIN','TOP_SPIN','FLIGHTED','FAST_MIX','SPIN_MIX'].map(name=>{
 const type=['GOOD_LENGTH','INSWINGER','OUTSWINGER','FAST_MIX'].includes(name)?'FAST':'SPIN',forced=name.endsWith('_MIX')?undefined:name
 const oldRandom=d.rng(701),newRandom=d.rng(701)
 const result={name,type,count:5000,beforeStart:[0,0,0,0,0],afterStart:[0,0,0,0,0],beforeFinal:[0,0,0,0,0],afterFinal:[0,0,0,0,0],examples:[]}
 for(let i=0;i<result.count;i++){
  const a=previous(type,oldRandom,false,d.release,undefined,0,forced,'BALANCED')
  const b=generateDelivery(type,newRandom,false,d.release,undefined,0,forced,'BALANCED')
  for(const key of ['speed','bounce','bounceZ','height','flightGravity','swingAcceleration','spinImpulse','forwardImpulse'])assert.equal(a[key],b[key],key+' frozen')
  assert.equal(a.velocity.y,b.velocity.y);assert.equal(a.velocity.z,b.velocity.z)
  const x=line(a),y=line(b)
  result.beforeStart[buckets.indexOf(x.startBucket)]++;result.afterStart[buckets.indexOf(y.startBucket)]++
  result.beforeFinal[buckets.indexOf(x.finalBucket)]++;result.afterFinal[buckets.indexOf(y.finalBucket)]++
  if(result.examples.length<3&&y.start>.3&&x.start!==y.start){
   const actual=d.aiTrace(b)
   assert(Math.abs(actual.bounceX-y.bounce)<.04);assert(Math.abs(actual.batX-y.final)<.05,'actual runtime follows selected line/movement')
   result.examples.push({variation:b.variation,before:x,after:{...y,actualBounce:actual.bounceX,actualFinal:actual.batX}})
  }
 }
 return result
})}
module.exports={sample,line,buckets}
if(require.main===module){
 const rows=sample()
 if(process.argv.includes('--matrix'))console.log(JSON.stringify({buckets,rows},null,2))
 else{
  const camera=new PerspectiveCamera(70,16/9,.1,100);camera.position.set(0,1.68,.35);camera.lookAt(0,1.35,-12);camera.updateMatrixWorld()
  assert(new Vector3(-.5,1,-5).project(camera).x<0);assert(new Vector3(.5,1,-5).project(camera).x>0)
  for(const r of rows){
   const pct=(key,i)=>r[key][i]/r.count
   assert(pct('afterStart',0)<.025,'extreme-left suppression remains')
   assert(pct('afterStart',1)>.03&&pct('afterStart',2)>.1,'left and centre remain meaningful with variation-specific movement')
   assert(pct('afterStart',3)>.15&&pct('afterStart',3)<.55,'useful but not dominant right starts')
   assert(pct('afterFinal',3)+pct('afterFinal',4)>.04,'right starts can still move back toward stumps with LEG/OUT')
   if(r.name.endsWith('_MIX'))assert(pct('afterFinal',3)+pct('afterFinal',4)>.15,'weighted bowling mixes give useful right-side trajectories')
  }
  assert.equal(playableInitialLine(-2,.01),-2,'rare extreme remains possible')
  assert(playableInitialLine(-2,.5)>-.75,'existing suppression unchanged')
  console.log('PASS: 45,000 paired samples, verified camera POV, two-sided initial/final lines, rare extremes, frozen pace/movement/bounce, real runtime spot checks')
 }
}
