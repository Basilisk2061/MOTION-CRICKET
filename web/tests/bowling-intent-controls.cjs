const assert=require('node:assert/strict'),load=require('./tactical-loader.cjs'),phoneFixture=require('./phone-bowling-fixture.cjs')
const {Quaternion,Euler,Vector3}=require('three'),{BowlingController,bowlingParameters,parseBowlingRelease}=load('bowlingController')
const {LAB_TUNING:T,swingWorldSign}=load('bowlingLabTuning'),{BowlingPhysics}=load('bowlingPhysics'),{bowlingFeedback,lengthLabel,lineLabel}=load('bowlingFeedback')
function event(pitch=0,yaw=0,omega=3,intent='NONE'){
 const q=new Quaternion().setFromEuler(new Euler(pitch,yaw,0))
 return {type:'BOWLING_RELEASE',source:'TOUCH_RELEASE',timestamp:200,id:1,calibrationId:1,swingIntent:intent,
 orientation:{x:q.x,y:q.y,z:q.z,w:q.w},angularVelocity:{x:omega,y:0,z:0}}
}
const neutral=bowlingParameters(event())
assert.equal(neutral.line,T.DEFAULT_TARGET_X);assert.equal(neutral.bounceZ,-6);assert.equal(neutral.swingAcceleration,0)
assert.equal(swingWorldSign('IN'),1);assert.equal(swingWorldSign('OUT'),-1)
for(const intent of [undefined,'invalid',null,5]){assert.equal(parseBowlingRelease({...event(),swingIntent:intent}).swingIntent,'NONE');assert.equal(bowlingParameters({...event(),swingIntent:intent}).swingAcceleration,0)}
const off=bowlingParameters(event(0,.2)),farOff=bowlingParameters(event(0,.5)),leg=bowlingParameters(event(0,-.2))
assert(off.line>neutral.line&&farOff.line>off.line&&leg.line<neutral.line)
assert.equal(bowlingParameters(event(0,2)).line,T.DEFAULT_TARGET_X+T.MAX_RELEASE_LINE_ERROR)
for(const a of [-.02,.02]){assert.equal(bowlingParameters(event(a,a)).line,T.DEFAULT_TARGET_X);assert.equal(bowlingParameters(event(a,a)).bounceZ,-6)}
const lengths=[T.MAX_PITCH_TARGET,-3.5,-6,-8.1,T.MIN_PITCH_TARGET].map(z=>bowlingParameters({...event(),target:{x:0,z}}).bounceZ)
assert(lengths.every((n,i)=>!i||n<lengths[i-1]));assert(Math.abs(lengths[0]-T.MAX_PITCH_TARGET)<1e-9);assert(Math.abs(lengths[4]-T.MIN_PITCH_TARGET)<1e-9)
assert.equal(lengthLabel(lengths[0]),'YORKER / VERY FULL');assert.equal(lengthLabel(lengths[2]),'GOOD LENGTH');assert.equal(lengthLabel(lengths[4]),'BOUNCER LENGTH')
for(let a=-.6;a<.6;a+=.001){const first=bowlingParameters(event(a,a)),next=bowlingParameters(event(a+.001,a+.001));assert(Math.abs(first.line-next.line)<.01);assert(Math.abs(first.bounceZ-next.bounceZ)<.02)}
const gentle=bowlingParameters(event(0,0,.5,'IN')),normal=bowlingParameters(event(0,0,4,'IN')),strong=bowlingParameters(event(0,0,20,'IN'))
assert(gentle.speed<normal.speed&&normal.speed<strong.speed&&strong.speed>22)
assert(gentle.swingMagnitude<normal.swingMagnitude&&normal.swingMagnitude<strong.swingMagnitude)
assert(bowlingParameters(event(0,0,1e6)).speed<=T.PACE_MAX);assert.equal(bowlingParameters(event(0,0,.1)).speed,T.PACE_MIN)
assert(Math.abs(bowlingParameters(event(0,0,3.01)).speed-neutral.speed)<.02)
for(const omega of [.5,4,20]){const p=bowlingParameters(event(.2,.2,omega));assert.equal(p.line,bowlingParameters(event(.2,.2,3)).line);assert.equal(p.bounceZ,bowlingParameters(event(.2,.2,3)).bounceZ)}
function sampled(speeds){const c=new BowlingController();c.calibrate(new Quaternion());speeds.forEach((n,i)=>c.sample(new Quaternion(),new Vector3(n,0,0),100+i*10));return c.release('TOUCH_RELEASE',200,'IN')}
const steady=sampled(Array(11).fill(4)),spikes=Array(11).fill(4);spikes[5]=1000
assert.equal(sampled(spikes).angularSpeed,steady.angularSpeed,'isolated gyro spike trimmed')
assert(sampled(Array(11).fill(20)).angularSpeed>19,'sustained fast action preserved')
const alternating=sampled(Array.from({length:11},(_,i)=>i%2?20:-20));assert.equal(alternating.angularSpeed,20,'motion magnitude does not cancel with changing direction')
const c=new BowlingController(),reference=new Quaternion().setFromEuler(new Euler(.2,.3,.1));c.calibrate(reference)
for(let t=100;t<=200;t+=10)c.sample(reference,new Vector3(4,0,0),t)
const phoneEvents=[],phone=phoneFixture(c,event=>phoneEvents.push(event))
assert(phone.selected('NONE'));phone.select('OUT');phone.hold();phone.release();assert.equal(phoneEvents[0].swingIntent,'OUT');assert(phone.selected('OUT'))
assert.equal(bowlingParameters(phoneEvents[0]).line,T.DEFAULT_TARGET_X);assert.equal(bowlingParameters(phoneEvents[0]).bounceZ,-6,'comfortable independent calibration is neutral')
phone.hold();assert.equal(phoneEvents.length,1,'first tap never releases');phone.lift();assert(c.holding,'finger lift stays armed')
function flight(intent,pitch=0,yaw=0,omega=4){
 const g=new BowlingPhysics(),p=bowlingParameters(event(pitch,yaw,omega,intent));g.release(p)
 let previousCurve=0,bounceVx=null
 for(let i=0;i<2000&&g.state==='FLIGHT';i++){
  const was=g.bounced,vx=g.velocity.x,old=g.position.clone();g.step(1/240)
  assert(g.position.toArray().every(Number.isFinite));assert(g.position.distanceTo(old)<.16)
  if(!was){assert(Math.abs(g.swingDisplacement)>=previousCurve-1e-10);previousCurve=Math.abs(g.swingDisplacement)}
  if(!was&&g.bounced)bounceVx=g.velocity.x
  if(was&&g.state==='FLIGHT'&&g.position.y>.056)assert(Math.abs(g.velocity.x-vx)<1e-10,'no conventional acceleration after bounce')
 }
 assert(g.bounced);assert(Math.abs(g.bouncePosition.z-p.bounceZ)<1e-7);assert(bounceVx!==null)
 return g
}
const none=flight('NONE'),inside=flight('IN'),outside=flight('OUT')
assert.equal(none.swingDisplacement,0);assert(inside.preBounceSwingDisplacement>0&&outside.preBounceSwingDisplacement<0)
assert(Math.abs(inside.preBounceSwingDisplacement+outside.preBounceSwingDisplacement)<1e-9,'mirrored conventional curves')
assert(Math.abs((inside.bouncePosition.x-none.bouncePosition.x)+(outside.bouncePosition.x-none.bouncePosition.x))<1e-9)
for(const pitch of [-.6,-.4,0,.35,.6]){
 const g=flight('IN',pitch),f=bowlingFeedback(g)
 assert.equal(f.length,lengthLabel(g.bouncePosition.z));assert.equal(f.line,lineLabel(g.wicketPlanePosition.x))
 assert.equal(f.speed,g.releaseSpeed);assert.equal(f.kmh,g.releaseSpeed*3.6);assert.equal(f.pitchDistance,-g.bouncePosition.z)
}
assert.equal(bowlingFeedback(inside).swing,'INSWING');assert.equal(bowlingFeedback(outside).swing,'OUTSWING');assert.equal(bowlingFeedback(none).swing,'NONE')
const actual=bowlingFeedback(inside);assert.notEqual(actual.line,lineLabel(inside.parameters.line),'feedback is actual, not requested, line')
assert.equal(bowlingFeedback(flight('IN',0,0,.1)).swing,'INSWING','selected gentle delivery now has a visible baseline')
console.log('PASS: semantic/legacy intent, selected targets/bounded errors, robust pace, actual phone READY/automatic release, mirrored pre-bounce swing/bounce cutoff and actual feedback')
