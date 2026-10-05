const assert=require('node:assert/strict'),{Quaternion,Euler,Vector3}=require('three'),load=require('./tactical-loader.cjs')
const {BowlingController,TapRelease,bowlingParameters}=load('bowlingController'),{BowlingPhysics}=load('bowlingPhysics')
const {bowlingLandingGuide}=load('bowlingLandingGuide'),{bowlingPreview}=load('bowlingPreview')
const {LAB_TUNING:T,swingWorldSign}=load('bowlingLabTuning'),{lengthLabel}=load('bowlingFeedback')
const fixture=require('./phone-bowling-fixture.cjs')
function event(pitch=0,yaw=0,intent='NONE'){
 const q=new Quaternion().setFromEuler(new Euler(pitch,yaw,0))
 return {type:'BOWLING_RELEASE',source:'TOUCH_RELEASE',timestamp:200,id:1,calibrationId:1,swingIntent:intent,
 orientation:{x:q.x,y:q.y,z:q.z,w:q.w},angularVelocity:{x:4,y:1,z:0},angularSpeed:4}
}
const center=bowlingParameters(event());assert.equal(center.line,T.DEFAULT_TARGET_X);assert.equal(lengthLabel(center.bounceZ),'GOOD LENGTH')
for(const a of [-.08,-.04,0,.04,.08]){const p=bowlingParameters(event(a,a));assert.equal(p.line,T.DEFAULT_TARGET_X);assert.equal(p.bounceZ,-6)}
assert(bowlingParameters(event(0,.3)).line>center.line);assert(bowlingParameters(event(0,-.3)).line<center.line)
assert(bowlingPreview({...event(0,.3),type:'BOWLING_POSE',holding:false}).position.x>0)
assert.equal(swingWorldSign('IN'),1);assert.equal(swingWorldSign('OUT'),-1)
assert(bowlingParameters(event(-.3)).bounceZ>-6);assert(bowlingParameters(event(.3)).bounceZ<-6)
for(let a=-.6;a<.6;a+=.001){const p=bowlingParameters(event(a,a)),next=bowlingParameters(event(a+.001,a+.001))
 assert(Math.abs(p.line-next.line)<.01);assert(Math.abs(p.bounceZ-next.bounceZ)<.025)}
assert.equal(bowlingParameters({...event(),target:{x:2,z:-1}}).line,1);assert.equal(bowlingParameters({...event(),target:{x:-2,z:-20}}).line,-1)
assert(Math.abs(bowlingParameters({...event(),target:{x:0,z:-1}}).bounceZ+1.2)<1e-9);assert.equal(bowlingParameters({...event(),target:{x:0,z:-20}}).bounceZ,-10)
let maxError=0
for(const swing of ['NONE','IN','OUT'])for(const pitch of [-.6,-.3,0,.3,.6])for(const yaw of [-.5,0,.5]){
 const release=event(pitch,yaw,swing),p=bowlingParameters(release),guide=bowlingLandingGuide(p),g=new BowlingPhysics()
 assert.equal(guide.radiusX,T.LANDING_RADIUS_X);assert.equal(guide.radiusZ,T.LANDING_RADIUS_Z)
 g.release(p);for(let i=0;i<1200&&!g.bounced;i++)g.step(1/120)
 assert(g.bounced);maxError=Math.max(maxError,guide.center.distanceTo(g.bouncePosition))
 assert(guide.center.distanceTo(g.bouncePosition)<1e-7,'preview includes actual swing/trajectory')
 const intensity=1-Math.exp(-(4-.25)/5)
 assert.equal(p.speed,11+12*intensity);assert.equal(p.swingMagnitude,swing==='NONE'?0:Math.min(T.MAX_USER_SWING,T.BASE_SELECTED_SWING+T.MOTION_SWING_CONTRIBUTION*intensity))
}
const c=new BowlingController();c.calibrate(new Quaternion())
for(let t=100;t<=200;t+=10)c.sample(new Quaternion().setFromEuler(new Euler(.2,.3,0)),new Vector3(4,0,0),t)
const pose=c.pose(),preview=bowlingPreview(pose).controls,released=c.release('TOUCH_RELEASE',200)
assert.equal(preview.line,bowlingParameters(released).line);assert.equal(preview.bounceZ,bowlingParameters(released).bounceZ)
assert.equal(preview.speed,bowlingParameters(released).speed)
const gate=new TapRelease();assert(!gate.tap(true));assert(gate.armed);assert(gate.tap(true));assert(!gate.armed)
assert(!gate.volume());assert(!gate.tap(true));assert(gate.volume());assert(!gate.volume());gate.tap(true);gate.cancel();assert(!gate.armed)
const phoneController=new BowlingController();phoneController.calibrate(new Quaternion());phoneController.sample(new Quaternion(),new Vector3(4,0,0),200)
let count=0;const phone=fixture(phoneController,()=>count++)
phone.tap();assert(phoneController.holding);assert.equal(count,0);phone.lift();assert(phoneController.holding)
for(let i=0;i<20;i++)phoneController.pose();assert.equal(count,0)
phone.tap();assert.equal(count,0,'second tap cannot release');phone.bowl();assert.equal(count,1);assert(!phoneController.holding)
console.log(`PASS: gentle/inverted Lab-only controls, jitter-neutral GOOD length, smooth bounds, 45 physics landing comparisons (max error ${maxError}), identical prospective release window, actual first-tap/lift/second-tap and armed Volume Down gate; pace/swing unchanged`)
