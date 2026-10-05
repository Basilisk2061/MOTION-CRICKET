const assert=require('node:assert/strict'),load=require('./tactical-loader.cjs'),{Quaternion,Vector3}=require('three')
const {BowlingMotion,MOTION_TUNING:M}=load('bowlingMotion'),{BowlingController,bowlingParameters}=load('bowlingController')
const {BowlingPhysics}=load('bowlingPhysics'),{pitchTapTarget,pitchTargetUV}=load('bowlingTarget'),fixture=require('./phone-bowling-fixture.cjs')
function sequence(peak,step=20,spike=false){const values=Array(14).fill(0);for(let i=0;i<12;i++)values.push(-2);for(let i=0;i<=28;i++)values.push(peak*Math.sin(Math.PI*i/28));if(spike)values[43]=40;return values.map((signed,i)=>({speed:Math.abs(signed),signed,at:(i+1)*step}))}
function detect(values){const d=new BowlingMotion();d.arm(0);const events=[];for(const s of values){const metric=d.update(s.speed,s.at,{x:s.signed??s.speed,y:0,z:0});if(metric!==null)events.push(metric)}return {d,events}}
for(const speeds of [Array(300).fill(0),Array.from({length:300},(_,i)=>i%2?.4:.1),Array.from({length:300},(_,i)=>i%5===0?40:.1),Array(300).fill(1.3)]){
 const result=detect(speeds.map((speed,i)=>({speed,at:(i+1)*20})));assert.equal(result.events.length,0)
}
const waiting=detect(Array(300).fill(0).map((speed,i)=>({speed,at:(i+1)*20})));assert.equal(waiting.d.state,'READY')
waiting.d.cancel();assert.equal(waiting.d.state,'IDLE')
function gesture(back,forward,{smooth=false,quiet=14}={}){
 const vectors=Array.from({length:quiet},()=>({x:0,y:0,z:0}))
 for(let i=0;i<=20;i++)vectors.push({x:-back*Math.sin(Math.PI*i/20),y:0,z:0})
 if(smooth){vectors.splice(vectors.length-6,6);for(let i=0;i<=10;i++){const a=Math.PI*i/10;vectors.push({x:-3*Math.cos(a),y:3*Math.sin(a),z:0})}}
 if(forward)for(let i=0;i<=28;i++)vectors.push({x:forward*Math.sin(Math.PI*i/28),y:0,z:0})
 vectors.push(...Array.from({length:20},()=>({x:0,y:0,z:0})))
 return vectors
}
function vectorDetect(vectors){const d=new BowlingMotion();d.arm(0);const events=[];vectors.forEach((v,i)=>{const n=d.update(Math.hypot(v.x,v.y,v.z),(i+1)*20,v);if(n!==null)events.push({n,at:(i+1)*20,debug:d.debug()})});return {d,events}}
for(const back of [7,30])assert.equal(vectorDetect(gesture(back,0)).events.length,0,'backswing peak/deceleration never release')
assert.equal(vectorDetect(gesture(4,7)).events.length,1)
assert.equal(vectorDetect(gesture(4,7,{smooth:true})).events.length,1,'curved reversal without stop')
const gentle=vectorDetect(gesture(25,3)),strong=vectorDetect(gesture(2,12))
assert.equal(gentle.events.length,1);assert.equal(strong.events.length,1);assert(strong.events[0].n>gentle.events[0].n*2,'pace ignores preparation peak')
const noise=Array.from({length:30},(_,i)=>({x:i%2?.3:-.3,y:.1,z:0}))
assert.equal(vectorDetect(noise).events.length,0)
assert.equal(vectorDetect([...noise,...gesture(3,7)]).events.length,1,'reposition then valid action')
const cancelled=vectorDetect(gesture(4,0));cancelled.d.cancel();assert.equal(cancelled.d.debug().preparationDirection,null);assert.equal(cancelled.d.state,'IDLE');cancelled.d.arm(1000);assert.equal(cancelled.d.debug().preparationPeak,0)
// Conservative fallback: quiet READY dwell, then a strong coherent action.
const fallback=[...Array.from({length:40},()=>({x:0,y:0,z:0})),...Array.from({length:14},()=>({x:5,y:0,z:0})),...Array.from({length:10},()=>({x:2,y:0,z:0}))]
const fallbackResult=vectorDetect(fallback);assert.equal(fallbackResult.events.length,1);assert(fallbackResult.events[0].debug.forwardOnly)
const immediate=[...Array.from({length:14},()=>({x:-8,y:0,z:0})),...Array.from({length:20},()=>({x:0,y:0,z:0}))]
assert.equal(vectorDetect(immediate).events.length,0,'immediate pull-back cannot use fallback')
console.log('PASS: back-only/fast-back-only, reversal/curved transition, forward-only pace, reposition/jitter, cancel/fresh READY, conservative fallback/immediate pull-back')
for(const step of [16,20,33,50])for(const peak of [2.8,7,15]){
 const {d,events}=detect(sequence(peak,step));assert.equal(events.length,1,`peak ${peak}, cadence ${step}`)
 for(let i=1;i<100;i++)assert.equal(d.update(20,2000+i*step),null,'follow-through cannot release twice')
 assert.equal(d.state,'COOLDOWN')
}
const normal=detect(sequence(7)).events[0],spike=detect(sequence(7,20,true)).events[0];assert(spike<normal*1.2,'one spike cannot dominate pace')
for(const direction of [{x:0,y:0,z:1},{x:1/Math.sqrt(3),y:1/Math.sqrt(3),z:1/Math.sqrt(3)}]){
 const d=new BowlingMotion();d.arm(0);let count=0
 for(const s of sequence(7))if(d.update(s.speed,s.at,{x:direction.x*s.signed,y:direction.y*s.signed,z:direction.z*s.signed})!==null)count++
 assert.equal(count,1,'no single-axis dependency')
}
const shake=new BowlingMotion();shake.arm(0);let shakeCount=0
sequence(7).forEach((s,i)=>{if(shake.update(s.speed,s.at,{x:i%2?s.speed:-s.speed,y:0,z:0})!==null)shakeCount++})
assert.equal(shakeCount,0,'fast alternating shake is not a coherent bowling action')
const target={x:-.5,z:-6},rows=[]
for(const peak of [2.8,7,15])for(const intent of ['NONE','IN','OUT']){
 const c=new BowlingController();c.calibrate(new Quaternion());c.selectTarget(target);c.swingIntent=intent
 c.sample(new Quaternion(),new Vector3(),0);assert(c.arm(0));let event=null
 for(const s of sequence(peak)){c.sample(new Quaternion(),new Vector3(0,s.signed,0),s.at);const e=c.takeAutomaticRelease();if(e){assert(!event);event=e}}
 assert(event);assert.equal(event.source,'AUTO_MOTION');assert.deepEqual(event.target,target);assert.equal(event.swingIntent,intent)
 const p=bowlingParameters(event),g=new BowlingPhysics();g.release(p);for(let i=0;i<2000&&!g.bounced;i++)g.step(1/240)
 assert(g.bounced);assert(g.bouncePosition.distanceTo(new Vector3(target.x,.056,target.z))<1e-7)
 assert(p.speed>=11&&p.speed<=23);assert(p.swingMagnitude=== (intent==='NONE'?0:Math.min(4,1.6+2.4*p.intensity)))
 rows.push({peak,intent,metric:event.angularSpeed,speed:p.speed,curve:g.preBounceSwingDisplacement})
 assert.equal(c.takeAutomaticRelease(),null)
}
const rates=rows.filter(r=>r.intent==='NONE');assert(rates[0].speed<rates[1].speed&&rates[1].speed<rates[2].speed);assert(rates[2].speed<23)
for(const row of rates)console.log(`Peak ${row.peak} rad/s -> robust metric ${row.metric.toFixed(3)} -> ${row.speed.toFixed(3)} units/s`)
const c=new BowlingController();c.calibrate(new Quaternion());c.sample(new Quaternion(),new Vector3(),200)
const phone=fixture(c)
for(const [u,v] of [[.1,.1],[.9,.1],[.1,.9],[.9,.9],[.5,.5]]){
 phone.target(u,v);const marker=phone.marker();assert(Math.abs(marker.cx-u*100)<1e-8);assert(Math.abs(marker.cy-v*100)<1e-8)
 const uv=pitchTargetUV(c.target);assert(Math.abs(uv.u-u)<1e-8);assert(Math.abs(uv.v-v)<1e-8)
 assert.deepEqual(c.pose().target,pitchTapTarget(u,v),'laptop intended marker uses the same selected world target')
}
assert.equal(pitchTapTarget(0,0).z,-1.2);assert.equal(pitchTapTarget(1,1).z,-10)
assert(pitchTapTarget(0,.5).x>0);assert(pitchTapTarget(1,.5).x<0,'screen/world X mirrors once to match the laptop bowler camera')
const texts=phone.texts();assert(texts.includes('BATSMAN / CREASE'));assert(texts.includes('BOWLER'));assert(!texts.includes('TAP TO RELEASE'))
phone.tap();phone.lift();assert(c.holding);assert.equal(c.takeAutomaticRelease(),null);phone.tap();assert.equal(c.takeAutomaticRelease(),null,'second button press never releases')
c.cancel();phone.refresh();assert(!c.holding);assert.equal(c.motion.state,'IDLE')
console.log('PASS: stationary/noise/press/lift/spike/tiny-shake guards, waiting/cancel, slow/normal/fast auto-release across 4 cadences, follow-through cooldown, robust monotonic pace, same target with IN/NONE/OUT, actual rendered SVG corner/center markers')
