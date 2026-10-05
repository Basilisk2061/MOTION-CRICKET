const assert=require('node:assert/strict'),load=require('./tactical-loader.cjs')
const {Quaternion,Euler,Vector3,PerspectiveCamera}=require('three')
const {BowlingController,bowlingParameters,parseBowlingRelease}=load('bowlingController')
const {BowlingPhysics}=load('bowlingPhysics'),{bowlingLandingGuide,playableDelivery}=load('bowlingLandingGuide')
const {LAB_TUNING:T}=load('bowlingLabTuning'),{lengthLabel}=load('bowlingFeedback')
const q=(pitch,yaw)=>new Quaternion().setFromEuler(new Euler(pitch,yaw,0))
function event(pitch=0,yaw=0,omega=4,intent='NONE'){
 const rotation=q(pitch,yaw)
 return {type:'BOWLING_RELEASE',source:'TOUCH_RELEASE',timestamp:200,id:1,calibrationId:1,swingIntent:intent,
 orientation:{x:rotation.x,y:rotation.y,z:rotation.z,w:rotation.w},angularVelocity:{x:omega,y:0,z:0}}
}
for(const pitch of [-.32,-.20,0,.20,.32])for(const yaw of [-.22,-.14,0,.14,.22]){
 const p=bowlingParameters(event(pitch,yaw));assert(Math.abs(p.line)<=.18);assert.equal(lengthLabel(p.bounceZ),'GOOD LENGTH');assert(playableDelivery(p))
}
assert.equal(lengthLabel(bowlingParameters({...event(),target:{x:0,z:-3.5}}).bounceZ),'FULL')
assert.equal(lengthLabel(bowlingParameters({...event(),target:{x:0,z:-8.1}}).bounceZ),'SHORT')
assert(bowlingParameters(event(0,.35)).line>T.DEFAULT_TARGET_X);assert(bowlingParameters(event(0,.48)).line>bowlingParameters(event(0,.35)).line)
const c=new BowlingController();c.calibrate(new Quaternion())
for(let t=0;t<=200;t+=10)c.sample(q(.35,.4),new Vector3(),t)
const anchor=bowlingParameters({...c.pose(),type:'BOWLING_RELEASE',source:'TOUCH_RELEASE',id:1})
for(let i=1;i<=200;i++){
 c.sample(q(.35+(i%2?.002:-.002),.4+(i%2?.002:-.002)),new Vector3(),200+i*10)
 const p=bowlingParameters({...c.pose(),type:'BOWLING_RELEASE',source:'TOUCH_RELEASE',id:1})
 assert(Math.abs(p.line-anchor.line)<.003);assert(Math.abs(p.bounceZ-anchor.bounceZ)<.003,'tilted jitter only produces tiny release error')
}
const before=c.pose();c.sample(q(-.7,-.7),new Vector3(),2200);assert.deepEqual(c.pose(),before,'repeated timestamp cannot advance aim')
for(let t=2210;t<=2310;t+=10)c.sample(q(.65,.6),new Vector3(),t)
const pose=c.pose(),release=c.release('TOUCH_RELEASE',2310,'IN')
assert(parseBowlingRelease(release));assert.deepEqual(release.target,pose.target)
const prospect=bowlingParameters({...pose,type:'BOWLING_RELEASE',source:'TOUCH_RELEASE',id:1,swingIntent:'IN'})
const released=bowlingParameters(release);assert.equal(prospect.line,released.line);assert.equal(prospect.bounceZ,released.bounceZ)
assert(released.line>anchor.line+.05);assert(released.bounceZ<anchor.bounceZ-.1,'deliberate change creates a bounded responsive error')
let comparisons=0
for(const intent of ['NONE','IN','OUT'])for(const pitch of [-.7,-.55,0,.55,.7])for(const omega of [.1,4,20]){
 const p=bowlingParameters(event(pitch,.2,omega,intent)),guide=bowlingLandingGuide(p),g=new BowlingPhysics();g.release(p)
 for(let i=0;i<1500&&!g.bounced;i++)g.step(1/120)
 assert(g.bounced);const dx=(g.bouncePosition.x-guide.center.x)/guide.radiusX,dz=(g.bouncePosition.z-guide.center.z)/guide.radiusZ
 assert(dx*dx+dz*dz<=1+1e-9);assert(Math.abs(g.preBounceSwingDisplacement)<=T.MAX_PREBOUNCE_SWING_DISPLACEMENT+1e-8)
 const vx=g.velocity.x;g.step(.01);assert(Math.abs(g.velocity.x-vx)<1e-9,'conventional acceleration ends at bounce')
 comparisons++
}
const camera=new PerspectiveCamera(52,16/9,.03,100);camera.position.set(0,2.1,-19.5);camera.lookAt(0,.8,0);camera.updateMatrixWorld()
const traces={}
for(const intent of ['NONE','IN','OUT']){
 const p=bowlingParameters(event(0,0,4,intent)),g=new BowlingPhysics();g.release(p)
 const duration=(p.bounceZ+18)/p.speed,displacements=[],points=[];let elapsed=0
 for(const fraction of [.25,.5,.75,1]){
  const target=duration*fraction
  while(elapsed<target-1e-12){const dt=Math.min(1/240,target-elapsed);g.step(dt);elapsed+=dt}
  displacements.push(fraction===1?g.preBounceSwingDisplacement:g.swingDisplacement);points.push(g.position.clone())
 }
 traces[intent]={displacements,points}
 assert(g.position.toArray().every(Number.isFinite))
 console.log(`${intent}: release ${g.releaseSpeed.toFixed(3)} units/s; flight ${duration.toFixed(3)} s; magnitude ${p.swingMagnitude.toFixed(3)}; acceleration ${p.swingAcceleration.toFixed(3)}; swing @25/50/75/bounce ${displacements.map(n=>n.toFixed(3)).join('/')}`)
}
assert(traces.NONE.displacements.every(n=>Math.abs(n)<1e-9))
for(let i=0;i<4;i++){assert(traces.IN.displacements[i]>0);assert(Math.abs(traces.IN.displacements[i]+traces.OUT.displacements[i])<1e-8)}
assert(Math.abs(traces.IN.displacements[0]/traces.IN.displacements[3]-.0625)<1e-7,'quadratic progressive curve, not a jump')
const pixels=Math.abs(traces.IN.points[1].clone().project(camera).x-traces.NONE.points[1].clone().project(camera).x)*960
assert(pixels>15,'compensated curve stays visibly separate mid-flight before returning to its target')
console.log(`PASS: 25 near-target neutral states; tiny tilted release variation/bounded deliberate error; shared pose/release target; ${comparisons} swing-aware landing regions; mirrored progressive swing, zero NONE, bounce cutoff; projected mid-flight deviation ${pixels.toFixed(1)}px at 1920x1080 (not a physical visibility claim)`)
