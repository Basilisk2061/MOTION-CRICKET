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
function plan(name,turn=.5,pace=.5,beginner=false){
 const draws=[.5,pace,.5,.5,.5,turn];let index=0
 return generateDelivery('SPIN',()=>draws[index++],beginner,release,undefined,0,name)
}
function trajectory(p){
 const g=new Delivery(()=>.5);g.start();g.plan=p;g.bounceResponse=p.bounce;g.released=true
 g.position.copy(release);g.velocity.copy(p.velocity)
 let time=0,bounceTime=null,bounceX=0,beforeX=0,peak=release.y,contactHeight=0,maxStep=0
 while(time<6 && g.position.z<-.65){
  const old=g.position.clone(),vx=g.velocity.x,wasBounced=g.bounced
  g.step(1/480,bat,bat,false);time+=1/480
  assert(g.position.toArray().every(Number.isFinite));assert(g.velocity.toArray().every(Number.isFinite))
  maxStep=Math.max(maxStep,g.position.distanceTo(old));peak=Math.max(peak,g.position.y)
  if(!wasBounced && g.bounced){bounceTime=time;bounceX=g.position.x;beforeX=vx}
  contactHeight=g.position.y
 }
 assert(bounceTime!==null);assert(contactHeight>=.056-1e-9 && contactHeight<2.4,'bounded physical bounce, including slower balls that land again')
 assert(maxStep<.08,'no positional teleport');assert(Math.abs(g.position.x)<2,'strong movement may still take a reasonable starting line wide')
 assert(Math.abs(g.bouncePosition.z-p.bounceZ)<.08,'pitch length preserved')
 return {time,bounceTime,after:time-bounceTime,peak,gravity:p.flightGravity,
  turnDisplacement:g.position.x-bounceX-beforeX*(time-bounceTime)}
}
for(const name of ['OFF_SPIN','LEG_SPIN']){
 let last=0
 const values=[]
 for(const draw of [.06,.375,.75,.95]){
  const p=plan(name,draw),sample=trajectory(p),magnitude=Math.abs(sample.turnDisplacement)
  assert(magnitude>last);last=magnitude
  assert(Math.sign(sample.turnDisplacement)===(name==='OFF_SPIN'?1:-1))
  assert(Math.abs(p.spinImpulse)/p.speed<.6,'turn stays far below a right-angle change')
  values.push([p.spinImpulse.toFixed(3),sample.turnDisplacement.toFixed(3)])
 }
 console.log(name,'impulse / post-bounce displacement',values)
}
for(const name of ['TOP_SPIN','STRAIGHTER','FLIGHTED']){
 const p=plan(name,.99);assert.equal(p.spinImpulse,0);trajectory(p)
 assert.equal(p.forwardImpulse,name==='TOP_SPIN'?.72:0)
}
const normal=trajectory(plan('OFF_SPIN')),flighted=trajectory(plan('FLIGHTED'))
assert.equal(normal.peak,release.y,'normal spin descends immediately instead of rising/hanging')
assert(plan('OFF_SPIN').velocity.y<=-.65)
assert(plan('FLIGHTED').speed<plan('OFF_SPIN').speed)
assert(flighted.time>normal.time);assert(flighted.peak>normal.peak)
// Pace and turn use different draws: all slow/quick + subtle/ripping combinations exist.
for(const pace of [0,1])for(const turn of [.06,.95,1]){
 const p=plan('OFF_SPIN',turn,pace);trajectory(p)
 assert(p.speed>=8.5 && p.speed<=16)
}
for(const name of ['GOOD_LENGTH','YORKER','BOUNCER','INSWINGER','OUTSWINGER','FULL','SHORT']){
 trajectory(generateDelivery('FAST',()=>.5,false,release,undefined,0,name))
}
console.log('Normal flight',normal,'FLIGHTED',flighted)
console.log('Beginner normal OFF travel',trajectory(plan('OFF_SPIN',.5,.5,true)))
for(const name of ['OFF_SPIN','LEG_SPIN','TOP_SPIN','STRAIGHTER','FLIGHTED']) {
 console.log('TRAVEL',name,[0,.5,1].map(pace=>{
  const p=plan(name,.5,pace),t=trajectory(p)
  if(name!=='FLIGHTED' && pace===.5) assert(t.time>=1.1 && t.time<=1.3,'representative normal spin creates arrival pressure')
  if(name==='FLIGHTED' && pace===.5) assert(Math.abs(t.time-1.79583333333337)<1e-9,'FLIGHTED trajectory unchanged')
  return {speed:+p.speed.toFixed(3),bounce:+t.bounceTime.toFixed(3),after:+t.after.toFixed(3),total:+t.time.toFixed(3)}
 }))
}
// Freeze the exact turn mapping independently of the new pace ranges.
for(let i=0;i<=10000;i++) {
 const draw=i/10000
 const expected=draw<.125?.45+draw/.125*.45:draw<.625?1.1+(draw-.125)/.5*.8:
  draw<.9?2.2+(draw-.625)/.275*.9:3.4+(draw-.9)/.1*.8
 assert.equal(plan('OFF_SPIN',draw).spinImpulse,expected)
 assert.equal(plan('LEG_SPIN',draw).spinImpulse,-expected)
}
console.log('PASS: actual OFF/LEG monotonic turn trajectories, finite/playable/no teleport, pitch/contact height, independent pace/turn and variation identities')
