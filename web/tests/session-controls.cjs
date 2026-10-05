const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const {Vector3,Quaternion}=require('three'),cache=new Map(),frames=[]
function load(name,tsx=false){
  if(cache.has(name))return cache.get(name)
  const m={exports:{}}
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',name+(tsx?'.tsx':'.ts')),'utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
  new Function('require','module','exports',code)(id=>id==='react'&&tsx?{useMemo:f=>f(),useEffect:()=>{}}:
    id==='@react-three/fiber'&&tsx?{useFrame:f=>frames.push(f)}:id.startsWith('./')?load(id.slice(2)):require(id),m,m.exports)
  cache.set(name,m.exports);return m.exports
}
const {PositionStabilizer}=load('positionStabilizer'),{HandleContinuity}=load('swingContinuity')
const origin=new Vector3(.32,1.05,-.65),filter=new PositionStabilizer()
filter.update(origin,0,0)
for(let i=1;i<=60;i++) {
  filter.update(origin.clone().add(new Vector3(Math.sin(i)*.008,Math.cos(i)*.006,0)),i*33,i)
  assert(filter.position.equals(origin),'still samples must stay exactly anchored')
}
filter.update(origin.clone().add(new Vector3(.05,0,0)),2013,61)
assert(filter.position.x>origin.x+.048,'immediate deliberate breakout')
const moving=filter.position.clone()
for(let i=0;i<20;i++)filter.update(new Vector3(99,99,99),2020+i,61)
assert(filter.position.equals(moving),'render duplicates cannot change classification or position')
for(let i=62;i<65;i++)filter.update(origin.clone().add(new Vector3(.05,0,0)),2013+(i-61)*33,i)
assert(filter.locked,'three stable samples relock')
const handle=new HandleContinuity();handle.reset(origin)
for(let i=0;i<30;i++)handle.update(i*33,.016,{received:i*33,sampleId:i,position:origin.clone().add(new Vector3(i?Math.sin(i)*.008:0,0,0)),velocity:new Vector3(4,0,0)},false)
assert(handle.position.distanceTo(origin)<1e-9 && handle.velocity.length()===0,'raw noise must not create gameplay velocity')

const {FieldingController,fielderAttachment,FIELDING}=load('fielding'),{Delivery,DELIVERY}=load('delivery')
const {MatchResult}=load('matchResult'),{SessionScore}=load('sessionScore')
function capture(height,grounded){
  const f=new FieldingController(),g=new Delivery(),ball=new Vector3(-10,height,-4)
  g.state='HIT';g.camera='BALL_FOLLOW';g.released=true;g.outcome='HIT';g.position.copy(ball)
  g.match.registerHit(ball);g.match.groundAfterHit=grounded
  f.startFielding(ball,new Vector3());const active=f.activeFielder;active.state='CHASING';active.position.set(-10,0,-4);active.facing=.6
  const u=f.update(.016,ball,new Vector3(),true)
  assert(u.captureBall && u.holdPosition)
  if(u.caught&&!grounded)assert(g.match.registerFielderCatch())
  g.holdBallForFielder(u.holdPosition)
  return {f,g,active}
}
const caught=capture(1.3,false)
assert.equal(caught.g.match.result,'CAUGHT')
caught.active.position.x+=.25;caught.active.facing+=.3
const held=caught.f.update(.016,caught.g.position,caught.g.velocity,false)
caught.g.moveHeldBall(held.holdPosition)
assert(caught.g.position.distanceTo(fielderAttachment(caught.active))<1e-9,'result cannot stop attachment updates')
const pickup=capture(.06,true),start=pickup.g.position.clone()
let u
const pickupDelay=FIELDING.COLLECTION_TIME+FIELDING.PICKUP_HOLD_TIME
for(let i=0;i<Math.ceil(pickupDelay/.016);i++){
  u=pickup.f.update(.016,pickup.g.position,pickup.g.velocity,true)
  pickup.g.moveHeldBall(u.holdPosition)
  assert(pickup.g.position.distanceTo(fielderAttachment(pickup.active))<1e-9)
  assert.equal(pickup.f.fielders.filter(f=>f.active).length,1)
  if((i+1)*.016<pickupDelay) assert.equal(pickup.active.state,'COLLECTING','pickup must hold before throwing')
}
assert(pickup.g.position.y>start.y+1 && pickup.active.state==='THROWING')
assert.equal(pickup.g.match.result,null,'ground pickup is not a catch')
const air=capture(1.3,false)
for(let i=0;i<Math.ceil(FIELDING.CATCH_HOLD_TIME/.016);i++) {
  const update=air.f.update(.016,air.g.position,air.g.velocity,true)
  air.g.moveHeldBall(update.holdPosition)
  assert(air.g.position.distanceTo(fielderAttachment(air.active))<1e-9,'catch keeps the same ball attached')
  if((i+1)*.016<FIELDING.CATCH_HOLD_TIME) assert.equal(air.active.state,'COLLECTING')
}
assert.equal(air.active.state,'THROWING')
const bouncedCatch=capture(1.0,true);assert.equal(bouncedCatch.g.match.result,null,'airborne interception after bounce is still collection')
pickup.g.match.finalizeDistance()
const target=new Vector3(0,1,.87),seconds=pickup.g.position.distanceTo(target)/FIELDING.THROW_SPEED
const velocity=target.clone().sub(pickup.g.position).divideScalar(seconds);velocity.y+=.5*DELIVERY.gravity*seconds
const sameBall=pickup.g.position
pickup.g.releaseFieldThrow(pickup.g.position.clone(),velocity,seconds)
const pose={position:origin,rotation:new Quaternion()}
for(let i=0;i<150&&pickup.g.fieldingReturn;i++)pickup.g.step(1/60,pose,pose,false)
assert.strictEqual(pickup.g.position,sameBall);assert(pickup.g.position.distanceTo(target)<1e-7,'same ball reaches return target')
const positions=pickup.f.fielders.map(f=>f.position.clone())
pickup.f.reset();assert(pickup.f.fielders.every(f=>f.position.equals(f.homePosition))&&pickup.f.activeFielder===null)

const session=new SessionScore()
for(const result of ['1 RUN','FOUR','2 RUNS']){
  const m=new MatchResult();m.result=result
  for(let i=0;i<120;i++)session.consume(m)
}
assert.equal(session.total,7)
for(const result of ['CAUGHT','BOWLED','CAUGHT BEHIND']){
  const s=new SessionScore(),m=new MatchResult();s.total=7;m.result=result;s.consume(m)
  const extra=new MatchResult();extra.result='SIX';s.consume(extra)
  assert.equal(s.total,7);assert.equal(s.out,result);s.reset();assert.equal(s.total,0);assert.equal(s.out,null)
}

const BallTrail=load('BallTrail',true).default,g=new Delivery(),element=BallTrail({game:g}),line=element.props.object
const frame=frames.at(-1),draw=t=>frame({clock:{elapsedTime:t}})
g.visible=true;g.state='BOWLING';draw(0);assert.equal(line.geometry.drawRange.count,0,'no incoming trail')
g.match.registerHit(g.position);g.position.set(0,1,0);draw(.01)
g.bouncePosition.set(.1,.056,.1);g.bounceId++;g.position.set(.2,.3,.2);draw(.03)
const points=line.geometry.getAttribute('position')
assert.equal(line.geometry.drawRange.count,4);assert(Math.abs(points.getY(1)-.056)<1e-6,'bounce vertex preserved')
g.match=new MatchResult();draw(.04);assert.equal(line.geometry.drawRange.count,0,'next delivery clears trail')
line.geometry.dispose();line.material.dispose()
console.log('PASS: stationary lock, immediate breakout, unique-sample relock/velocity, world-space catch/pickup attachment, single active fielder, same-ball return, catch eligibility, 7 runs counted once, dismissal freeze/reset, trail bounce/reset')
