const assert=require('node:assert/strict'),{Quaternion,Vector3,Euler}=require('three'),load=require('./tactical-loader.cjs')
const {BowlingController,bowlingParameters,parseBowlingPose}=load('bowlingController')
const {bowlingPreview,handoffPosition,PREVIEW_TUNING:T}=load('bowlingPreview'),{BowlingPhysics}=load('bowlingPhysics')
const c=new BowlingController(),neutral=new Quaternion().setFromEuler(new Euler(.3,.4,.2))
c.calibrate(neutral);c.sample(neutral,new Vector3(4,0,0),100)
let pose=c.pose();assert(parseBowlingPose(pose));assert(bowlingPreview(pose).orientation.angleTo(new Quaternion())<1e-7)
assert.deepEqual(bowlingPreview(pose).position.toArray(),[0,2,-18])
const make=(pitch,yaw)=>{const q=new Quaternion().setFromEuler(new Euler(pitch,yaw,0));return {...pose,aim:undefined,orientation:{x:q.x,y:q.y,z:q.z,w:q.w}}}
assert(bowlingPreview(make(0,.4)).position.x>0);assert(bowlingPreview(make(0,-.4)).position.x<0)
assert(bowlingPreview(make(.4,0)).position.z<-18);assert(bowlingPreview(make(-.4,0)).position.z>-18)
for(let i=0;i<2000;i++){
 const p=bowlingPreview({...make(Math.sin(i)*2,Math.cos(i)*2),holding:i%2===0}).position
 assert(Math.abs(p.x)<=T.X+1e-9);assert(Math.abs(p.y-2)<=T.Y+T.HOLD_LIFT+1e-9);assert(Math.abs(p.z+18)<=T.Z+1e-9)
}
const a=bowlingPreview(make(.4,.3)),b=bowlingPreview(make(.4,.3));assert.deepEqual(a.position.toArray(),b.position.toArray(),'no integrated drift')
const physics=new BowlingPhysics();assert.equal(physics.state,'READY','pose never releases physics')
const release={...pose,type:'BOWLING_RELEASE',source:'TOUCH_RELEASE',id:1}
const before=bowlingParameters(release);bowlingPreview(pose);assert.deepEqual(bowlingParameters(release),before)
assert(physics.release(before));assert(!physics.release(before),'one delivery only')
const offset=a.position.clone().sub(physics.position),start=handoffPosition(physics.position,offset,0)
assert(start.distanceTo(a.position)<1e-12)
assert(handoffPosition(physics.position,offset,T.HANDOFF_SECONDS).equals(physics.position))
console.log('PASS: calibrated neutral/seam quaternion, semantic off/leg/full/short, 2000 bounded drift-free poses, pose/release authority, unchanged controls, handoff error <1e-12 units')
