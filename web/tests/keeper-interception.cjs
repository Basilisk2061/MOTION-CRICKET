const assert=require('node:assert/strict'),load=require('./tactical-loader.cjs'),{Vector3}=require('three')
const {KeeperPresentation}=load('keeperPresentation'),{KEEPER_REACH,edgeIntercept}=load('keeperInterception'),{MatchResult}=load('matchResult')
function simulate(x,speed=8,hit=true){
 const k=new KeeperPresentation(),m=new MatchResult(),b={position:new Vector3(x,1,-.65),velocity:new Vector3(0,2,speed),released:true,visible:true,outcome:hit?'HIT':null,state:'HIT',match:m}
 if(hit)m.registerHit(b.position)
 let moved=0,dived=false,maxStep=0,parried=false
 for(let i=0;i<140&&!m.result;i++){
  const old=k.position.clone();k.update(b,.01)
  maxStep=Math.max(maxStep,k.position.distanceTo(old));moved=Math.max(moved,Math.abs(k.position.x));dived ||=k.state.startsWith('DIVE')
  if(hit&&i<13)assert(k.position.equals(new Vector3(0,0,3.4)),'edge reaction delay, no early pursuit')
  const previous=b.position.clone(),oldSpeed=b.velocity.length()
  b.position.addScaledVector(b.velocity,.01);b.position.y-=.5*9.81*.01*.01;b.velocity.y-=9.81*.01
  if(b.position.y<.056){b.position.y=.056;b.velocity.y=0;m.groundAfterHit=true}
  m.update(previous,b.position,b.velocity,.01,{position:k.reach,active:k.catchActive,keeperInterception:true,diving:k.state.startsWith('DIVE')})
  parried ||=!m.held&&b.velocity.length()<oldSpeed*.5
 }
 assert(maxStep<=KEEPER_REACH.diveSpeed*.01+1e-9,'no body teleport')
 return {k,m,b,moved,dived,parried}
}
assert.equal(simulate(0).m.result,'CAUGHT BEHIND')
for(const x of [-.65,.65]){const c=simulate(x);assert(c.moved>.01);assert.equal(c.m.result,'CAUGHT BEHIND')}
for(const x of [-2,2]){const c=simulate(x);assert(c.dived);assert.equal(c.m.result,'CAUGHT BEHIND')}
assert.equal(simulate(5).m.result,null,'wide edge escapes bounded dive')
const hard=simulate(.1,28);assert(hard.parried||!hard.m.held,'fast thick edge never automatic clean catch')
const incoming=simulate(1.2,8,false)
assert(incoming.moved>0,'untouched delivery has its own normal pursuit')
assert(!incoming.dived,'ordinary reachable delivery prefers standing movement')
const caught=simulate(2)
caught.b.state='READY'
for(let i=0;i<300;i++)caught.k.update(caught.b,.01)
assert(caught.k.position.distanceTo(new Vector3(0,0,3.4))<.01)
assert.equal(edgeIntercept({...caught.b,outcome:null},new Vector3(0,0,3.4),0),null)
const low={...caught.b,state:'HIT',outcome:'HIT',position:new Vector3(.3,.056,-.65),velocity:new Vector3(0,0,6)}
assert(edgeIntercept(low,new Vector3(0,0,3.4),.14)?.reachable,'normal low-stop opportunity remains possible')
const high={...low,position:new Vector3(0,4,2),velocity:new Vector3(0,0,20)}
assert.equal(edgeIntercept(high,new Vector3(0,0,3.4),0),null,'above vertical reach beats keeper')
const {Delivery}=load('delivery'),{Quaternion}=require('three'),game=new Delivery(),keeper=new KeeperPresentation()
game.state='HIT';game.camera='BALL_FOLLOW';game.outcome='HIT';game.released=true;game.visible=true
game.position.set(2,1,-.65);game.velocity.set(0,2,8);game.match.registerHit(game.position)
const sameBall=game.position,bat={position:new Vector3(100,100,100),rotation:new Quaternion()}
for(let i=0;i<150&&!game.match.result;i++){
 keeper.update(game,.01)
 game.step(.01,bat,bat,false,undefined,undefined,{position:keeper.reach,active:keeper.catchActive,keeperInterception:true,diving:keeper.state.startsWith('DIVE')})
}
assert.equal(game.match.result,'CAUGHT BEHIND');assert.equal(game.position,sameBall,'real Delivery keeps same ball')
console.log('PASS keeper: reaction/no foreknowledge, left/right movement and dives, physical glove catches, wide misses, hard parry, bounded movement and recovery')
