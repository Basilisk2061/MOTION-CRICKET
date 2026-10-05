const assert=require('node:assert/strict'),load=require('./tactical-loader.cjs'),{Vector3,Quaternion}=require('three')
const {KeeperPresentation}=load('keeperPresentation'),{normalDeliveryIntercept,edgeIntercept,KEEPER_REACH}=load('keeperInterception')
const {Delivery}=load('delivery'),bat={position:new Vector3(100,100,100),rotation:new Quaternion()}
function fixture(x,y=1,speed=12,vy=2,z=-3){
 const game=new Delivery(),keeper=new KeeperPresentation()
 game.state='AFTER_BOUNCE';game.released=true;game.visible=true;game.bounced=true
 game.position.set(x,y,z);game.velocity.set(0,vy,speed)
 return {game,keeper,moved:0,dived:false}
}
function frame(c,dt=.01){
 const old=c.keeper.position.clone();c.keeper.update(c.game,dt)
 assert(c.keeper.position.distanceTo(old)<=KEEPER_REACH.diveSpeed*dt+1e-9,'no body teleport')
 c.moved=Math.max(c.moved,Math.abs(c.keeper.position.x));c.dived ||=c.keeper.state.startsWith('DIVE')
 c.game.step(dt,bat,bat,false,undefined,undefined,{position:c.keeper.reach,active:c.keeper.catchActive,keeperInterception:true,diving:c.keeper.state.startsWith('DIVE')})
}
function finish(c){for(let i=0;i<750&&!c.game.match.result;i++)frame(c);return c}
for(const x of [0,-.8,.8]){
 const c=finish(fixture(x));assert(c.game.match.held,'routine untouched delivery is taken')
 assert.equal(c.game.match.result,'DOT');assert.equal(c.game.match.hit,false)
 if(x)assert(c.moved>.05,'actual normal lateral movement')
 assert(!c.dived,'modest normal delivery does not require dramatic dive')
}
const wide=finish(fixture(5));assert(!wide.game.match.held);assert(wide.moved>.1,'wide ball attempted, not magnetic')
const high=finish(fixture(.4,1.85,8,1,-.65));assert(high.game.match.held,'reachable high take')
const low=finish(fixture(.4,.15,12,0,-.65));assert(low.game.match.held,'low gather inside unchanged glove radius')
const recovering=fixture(-.8)
recovering.keeper.state='RECOVER';recovering.keeper.position.x=1.2
finish(recovering);assert(recovering.game.match.held,'new incoming delivery cannot remain stuck in previous recovery state')
const bowled=finish(fixture(0,.3,12,0,-2));assert.equal(bowled.game.match.result,'BOWLED');assert(!bowled.game.match.held,'stumps before keeper')
const tooHigh=finish(fixture(.4,4,20,0,-.65));assert(!tooHigh.game.match.held)
// Incoming movement toward +X cannot continue after an actual trajectory change to -X.
const redirect=fixture(1.1,1,8,2,-3)
for(let i=0;i<20;i++)frame(redirect)
assert(redirect.keeper.position.x>0);assert.equal(redirect.keeper.mode,'NORMAL_KEEPING')
const frozen=redirect.keeper.position.clone(),oldGloves=redirect.keeper.reach.clone()
redirect.game.outcome='HIT';redirect.game.state='HIT';redirect.game.camera='BALL_FOLLOW'
redirect.game.match.registerHit(redirect.game.position)
redirect.game.position.set(-1.5,1,-.65);redirect.game.velocity.set(0,2,6)
for(let i=0;i<13;i++){
 frame(redirect);assert.equal(redirect.keeper.mode,'EDGE_REACTION')
 assert(redirect.keeper.position.equals(frozen),'cancel old normal body target during 140ms delay')
 assert(redirect.keeper.reach.distanceTo(oldGloves)<1e-10,'cancel old normal glove target')
 assert(!redirect.keeper.catchActive);assert(!redirect.keeper.state.startsWith('DIVE'))
}
for(let i=0;i<8;i++)frame(redirect)
assert(redirect.keeper.position.x<frozen.x,'react toward opposite edge only after delay')
assert(redirect.keeper.state.startsWith('DIVE')||redirect.keeper.state==='MOVING')
finish(redirect);assert.equal(redirect.game.match.result,'CAUGHT BEHIND','transition retains genuine reachable edge catch')
// Prediction activates on the observed incoming delivery, never on a future edge.
const normal=fixture(.8)
assert(normalDeliveryIntercept(normal.game,normal.keeper.position))
assert.equal(edgeIntercept(normal.game,normal.keeper.position,0),null)
assert.equal(normalDeliveryIntercept({...normal.game,released:false},normal.keeper.position),null)
assert.equal(normalDeliveryIntercept({...normal.game,outcome:'HIT'},normal.keeper.position),null)
// Full runtime from start/run-up through release, pitch bounce and missed-ball take.
let takes=0,bowledCount=0
for(const type of ['FAST','SPIN'])for(let seed=1;seed<=16;seed++){
 let value=seed;const random=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296}
 const game=new Delivery(random),c={game,keeper:new KeeperPresentation(),moved:0,dived:false}
 game.bowlerType=type;game.start()
 for(let i=0;i<650&&!game.match.result;i++)frame(c)
 if(game.match.result==='BOWLED')bowledCount++
 else {assert(game.match.held,'actual generated routine delivery must reach keeper take');takes++}
}
assert.equal(takes+bowledCount,32)
assert.deepEqual(KEEPER_REACH,{reaction:.14,moveSpeed:3.8,diveSpeed:5.8,standingShift:1.45,diveShift:2.5,standingArm:.55,diveArm:1.05,minHeight:.12,maxHeight:2.05,diveSeconds:.55,cleanSpeed:22,diveCleanSpeed:18})
console.log(`PASS A-J: normal/left/right/high/low takes, wide/high misses, bowled precedence, normal -> opposite edge target cancellation, 140ms reaction/no future-edge pursuit; actual started deliveries ${takes} takes/${bowledCount} bowled; unchanged edge constants`)
