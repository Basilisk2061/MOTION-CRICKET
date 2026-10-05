const assert=require('node:assert/strict'),load=require('./tactical-loader.cjs')
const {Quaternion,Euler,Vector3}=require('three')
const {BowlingController,bowlingParameters,parseBowlingRelease,parseBowlingPose}=load('bowlingController')
const {pitchTapTarget,pitchTargetUV,defaultBowlingTarget}=load('bowlingTarget')
const {bowlingPreview}=load('bowlingPreview'),{bowlingLandingGuide}=load('bowlingLandingGuide')
const {BowlingPhysics}=load('bowlingPhysics'),{bowlingFeedback}=load('bowlingFeedback'),{LAB_TUNING:T}=load('bowlingLabTuning')
const fixture=require('./phone-bowling-fixture.cjs')
const cases=[{x:-.12,z:-6},{x:0,z:-6},{x:0,z:-1.6},{x:-.6,z:-3.5},{x:-.12,z:-8.1},{x:.4,z:-8.1}]
for(const target of cases){const uv=pitchTargetUV(target),roundTrip=pitchTapTarget(uv.u,uv.v);assert(Math.abs(roundTrip.x-target.x)<1e-12);assert(Math.abs(roundTrip.z-target.z)<1e-12)}
assert.deepEqual(pitchTapTarget(-5,-5),{x:1,z:-1.2});assert.deepEqual(pitchTapTarget(5,5),{x:-1,z:-10})
function event(target,pitch=0,yaw=0,intent='NONE',omega=4){
 const q=new Quaternion().setFromEuler(new Euler(pitch,yaw,0))
 return {type:'BOWLING_RELEASE',source:'TOUCH_RELEASE',timestamp:200,id:1,calibrationId:1,target,swingIntent:intent,
 orientation:{x:q.x,y:q.y,z:q.z,w:q.w},angularVelocity:{x:omega,y:0,z:0}}
}
for(const target of cases)for(const pitch of [-.2,0,.2])for(const yaw of [-.14,0,.14]){
 const p=bowlingParameters(event(target,pitch,yaw));assert.deepEqual(p.selectedTarget,target)
 assert(Math.abs(p.line-target.x)<.003);assert(Math.abs(p.bounceZ-target.z)<.003)
}
for(const target of cases)for(const pitch of [-1.4,-.4,0,.4,1.4])for(const yaw of [-1.4,-.4,0,.4,1.4]){
 const input=event(target,pitch,yaw),p=bowlingParameters(input)
 assert(Math.abs(p.lineError)<=.30+1e-9);assert(Math.abs(p.lengthError)<=.80+1e-9)
 assert(Math.abs(p.line-target.x)<=.30+1e-9);assert(Math.abs(p.bounceZ-target.z)<=.80+1e-9)
 assert.deepEqual(bowlingParameters(input),p,'identical physical releases are deterministic')
 assert(p.line>=-1&&p.line<=1&&p.bounceZ>=-10&&p.bounceZ<=-1.2)
}
const moderate=bowlingParameters(event(defaultBowlingTarget(),.4,.4));assert(Math.abs(moderate.lineError)<.1);assert(Math.abs(moderate.lengthError)<.2)
assert(!parseBowlingRelease({...event(cases[0]),target:{x:NaN,z:-6}}))
let maxBounceError=0,count=0
for(const target of cases)for(const intent of ['NONE','IN','OUT'])for(const angles of [[0,0],[.4,.4],[-.4,-.4]])for(const omega of [.1,4,20]){
 const release=event(target,...angles,intent,omega),p=bowlingParameters(release),guide=bowlingLandingGuide(p),g=new BowlingPhysics();g.release(p)
 for(let i=0;i<2000&&!g.bounced;i++)g.step(1/120)
 assert(g.bounced);const error=Math.hypot(g.bouncePosition.x-p.line,g.bouncePosition.z-p.bounceZ)
 assert(error<1e-7,'compensated swing reaches actual requested bounce');maxBounceError=Math.max(maxBounceError,error)
 const dx=(g.bouncePosition.x-guide.center.x)/guide.radiusX,dz=(g.bouncePosition.z-guide.center.z)/guide.radiusZ
 assert(dx*dx+dz*dz<=1+1e-9)
 assert.equal(p.swingMagnitude,intent==='NONE'?0:Math.min(4,1.6+2.4*p.intensity));assert.equal(p.speed,11+12*p.intensity)
 const vx=g.velocity.x;g.step(.01);assert(Math.abs(g.velocity.x-vx)<1e-9)
 count++
}
const example={x:-.5,z:-6},paths={}
for(const intent of ['NONE','IN','OUT']){
 const p=bowlingParameters(event(example,0,0,intent)),g=new BowlingPhysics();g.release(p)
 const t=(p.bounceZ+18)/p.speed;let time=0,points=[]
 for(const fraction of [.25,.5,.75,1]){const end=t*fraction;while(time<end-1e-12){const dt=Math.min(1/240,end-time);g.step(dt);time+=dt}points.push(g.position.x)}
 paths[intent]=points;assert(Math.abs(points[3]-example.x)<1e-8)
 console.log(`${intent}: flight ${t.toFixed(3)}s; X @25/50/75/bounce ${points.map(n=>n.toFixed(3)).join('/')}`)
 const f=bowlingFeedback(g);assert.equal(f.accuracy,'ON TARGET');assert(f.targetError<1e-8)
}
assert(paths.IN[1]<paths.NONE[1]);assert(paths.OUT[1]>paths.NONE[1])
for(let i=0;i<4;i++)assert(Math.abs(paths.IN[i]+paths.OUT[i]-2*paths.NONE[i])<1e-8,'mirrored swing about straight trajectory')
const c=new BowlingController();assert.deepEqual(c.target,defaultBowlingTarget());c.calibrate(new Quaternion())
c.sample(new Quaternion(),new Vector3(4,0,0),200)
let releases=[];const phone=fixture(c,event=>releases.push(event))
const uv=pitchTargetUV(example);phone.target(uv.u,uv.v);assert(Math.abs(c.target.x-example.x)<1e-9);assert(Math.abs(c.target.z-example.z)<1e-9)
phone.select('OUT');phone.tap();phone.lift();assert(c.holding);assert.equal(releases.length,0)
const pose=c.pose(),p=bowlingPreview(parseBowlingPose(pose)).controls;assert.deepEqual(p.selectedTarget,c.target)
phone.target(1,1);assert.deepEqual(c.target,p.selectedTarget,'target cannot change while armed')
phone.tap();assert.equal(releases.length,0);phone.bowl();assert.equal(releases.length,1);assert.deepEqual(releases[0].target,pose.target);assert.equal(releases[0].swingIntent,'OUT')
const saved={...c.target},g=new BowlingPhysics();g.release(bowlingParameters(releases[0]));g.reset()
assert.deepEqual(c.target,saved);assert(phone.selected('OUT'),'intent persists');c.calibrate(new Quaternion());assert.deepEqual(c.target,defaultBowlingTarget())
console.log(`PASS: 6 continuous tap regions, target authority, bounded deterministic physical errors, ${count} compensated/guide trajectories (max error ${maxBounceError}), mirrored visible flights, exact phone/desktop intent, arm/release and target persistence`)
