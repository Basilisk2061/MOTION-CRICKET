const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const {Vector3,Quaternion}=require('three'),cache=new Map()
function load(name){
 if(cache.has(name))return cache.get(name)
 const m={exports:{}}
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
 new Function('require','module','exports',code)(id=>id.startsWith('./')?load(id.slice(2)):require(id),m,m.exports)
 cache.set(name,m.exports);return m.exports
}
const {generateDelivery}=load('bowlingVariation'),{Delivery}=load('delivery')
const {bowlerPose,releaseTime}=load('bowling'),release=bowlerPose(releaseTime(.4),.4).hand
const bat={position:new Vector3(100,100,100),rotation:new Quaternion()}
function plan(name,pace=.35,swing=.5,beginner=false){
 const draws=[.5,pace,.5,.5,.5,swing];let i=0
 return generateDelivery('FAST',()=>draws[i++],beginner,release,undefined,0,name)
}
function trajectory(p){
 const g=new Delivery();g.start();g.plan=p;g.bounceResponse=p.bounce;g.released=true
 g.position.copy(release);g.velocity.copy(p.velocity)
 let time=0,bounceTime=null,maxJump=0,lastCurve=0,changes=0
 const vx=p.velocity.x,sign=Math.sign(p.swingAcceleration),t1=(p.bounceZ-release.z)/p.speed
 while(time<5 && g.position.z<-.65){
  const old=g.position.clone(),oldVx=g.velocity.x,wasBounced=g.bounced
  g.step(1/480,bat,bat,false);time+=1/480
  assert(g.position.toArray().every(Number.isFinite));assert(g.velocity.toArray().every(Number.isFinite))
  maxJump=Math.max(maxJump,g.position.distanceTo(old))
  if(!wasBounced && g.bounced){
   bounceTime=time
   assert(Math.abs(g.velocity.x-oldVx)<=Math.abs(p.swingAcceleration)/480+1e-8,'no spin-like bounce kick')
  }
  if(wasBounced)assert(Math.abs(g.velocity.x-oldVx)<1e-10,'swing acceleration is pre-bounce only')
  if(!g.bounced && sign){
   const curve=(g.position.x-release.x-vx*time)*sign
   assert(curve>=lastCurve-1e-9,'swing develops progressively, not a late snap')
   if(time>t1*.25 && time<t1*.75 && curve>lastCurve)changes++
   lastCurve=curve
  }
 }
 assert(bounceTime!==null);assert(maxJump<.1,'no positional teleport')
 assert(Math.abs(g.bouncePosition.z-p.bounceZ)<.08,'pitch location preserved')
 assert(g.position.y>.08 && g.position.y<2.4,'bounded arrival including genuinely rising short/bouncer lengths')
 const t2=(-.65-p.bounceZ)/p.speed
 const expectedX=release.x+p.velocity.x*(t1+t2)+p.swingAcceleration*(.5*t1*t1+t1*t2)
 assert(Math.abs(g.position.x-expectedX)<.04,'preserved swing follows the selected initial line, not artificial final-line compensation')
 if(sign)assert(changes>20,'visible continuous swing before bounce')
 return {speed:p.speed,bounce:bounceTime,after:time-bounceTime,total:time,
  lateral:g.position.x-release.x-vx*time}
}
for(const [band,draw]of [['SLOW',.06],['NORMAL',.35],['QUICK',.77],['EXPRESS',.95]]){
 const t=trajectory(plan('GOOD_LENGTH',draw))
 console.log('PACE',band,Object.fromEntries(Object.entries(t).map(([k,v])=>[k,+v.toFixed(4)])))
}
for(const name of ['INSWINGER','OUTSWINGER']){
 let last=0;const values=[]
 for(const [band,draw]of [['SUBTLE',.075],['NORMAL',.375],['STRONG',.7375],['BIG',.9375]]){
  const p=plan(name,.35,draw),t=trajectory(p)
  assert(Math.sign(p.swingAcceleration)===(name==='INSWINGER'?1:-1))
  assert(Math.abs(t.lateral)>last);last=Math.abs(t.lateral)
  values.push([band,+p.swingAcceleration.toFixed(4),+t.lateral.toFixed(4)])
 }
 console.log('SWING',name,'strength / curve-added batting-zone displacement',values)
}
for(const name of ['GOOD_LENGTH','YORKER','BOUNCER','FULL','SHORT'])for(const pace of [0,.5,1]){
 const p=plan(name,pace,.99);assert.equal(p.swingAcceleration,0);assert.equal(p.spinImpulse,0);trajectory(p)
}
for(const name of ['INSWINGER','OUTSWINGER'])for(const pace of [0,.77,1])for(const swing of [.075,.7375,1]){
 const p=plan(name,pace,swing)
 assert.equal(p.speed,plan(name,pace,.5).speed,'pace and swing draws independent')
 assert.equal(p.swingAcceleration,plan(name,.35,swing).swingAcceleration)
 trajectory(p)
}
console.log('Beginner EXPRESS travel',trajectory(plan('GOOD_LENGTH',.95,.5,true)))
console.log('PASS: real pace/curve trajectories, monotonic opposite swing, progressive flight/no bounce kick, finite/playable extremes, variation identity and independent pace/swing')
