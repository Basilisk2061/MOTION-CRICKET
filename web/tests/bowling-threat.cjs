const assert=require('node:assert/strict'),load=require('./tactical-loader.cjs'),{Vector3,Quaternion}=require('three')
const {generateDelivery}=load('bowlingVariation'),{TACTICS}=load('bowlingTactics'),{Delivery}=load('delivery'),{bowlerPose,releaseTime}=load('bowling')
const release=bowlerPose(releaseTime(.4),.4).hand,bat={position:new Vector3(100,100,100),rotation:new Quaternion()}
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
function trace(p){
 const g=new Delivery(()=>.5);g.start();g.plan=p;g.bounceResponse=p.bounce;g.released=true;g.position.copy(release);g.velocity.copy(p.velocity)
 let atBat=null,arrival=null,elapsed=0
 for(let i=0;i<450&&g.position.z<1.1&&!g.match.stopped;i++){
  g.step(.01,bat,bat,false)
  elapsed+=.01
  if(!atBat&&g.position.z>=-.65){atBat=g.position.clone();arrival=elapsed}
 }
 assert(g.position.toArray().every(Number.isFinite))
 return {category:g.match.result==='BOWLED'?'STUMP_THREAT':atBat?.y>.85?'SHORT_BALL_THREAT':atBat&&atBat.x>=-.85&&atBat.x<.12?'EDGE_CHANNEL':'LOW_THREAT',atBat,arrival,bounceZ:g.bouncePosition.z}
}
const yorkerRng=rng(92)
console.log('YORKER AUDIT',Array.from({length:6},()=>{
 const p=generateDelivery('FAST',yorkerRng,false,release,undefined,0,'YORKER','YORKER_ATTACK'),t=trace(p)
 return {pitchZ:+t.bounceZ.toFixed(2),batHeight:+t.atBat.y.toFixed(2),arrival:+t.arrival.toFixed(2),threat:t.category}
}))
const summaries=[]
for(const beginner of [false,true])for(const type of ['FAST','SPIN']){
 for(const tactic of [undefined,...TACTICS[type]]){
  const random=rng(839),counts={STUMP_THREAT:0,EDGE_CHANNEL:0,SHORT_BALL_THREAT:0,LOW_THREAT:0}
  for(let i=0;i<240;i++)counts[trace(generateDelivery(type,random,beginner,release,undefined,0,undefined,tactic)).category]++
  const rates=Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,+(v/240*100).toFixed(1)]))
  summaries.push({type,tactic,counts,beginner});console.log(type,beginner?'BEGINNER':'STANDARD',tactic??'OLD',rates)
 }
 const old=summaries.find(x=>x.type===type&&x.beginner===beginner&&!x.tactic).counts.STUMP_THREAT
 const attack=summaries.filter(x=>x.type===type&&x.beginner===beginner&&x.tactic).reduce((n,x)=>n+x.counts.STUMP_THREAT,0)/6
 assert(attack>old,'tactics create more real unplayed stump intersections')
 assert(summaries.filter(x=>x.type===type&&x.beginner===beginner&&x.tactic).every(x=>x.counts.STUMP_THREAT<180),'not all deliveries attack stumps')
}
// Actual bat-ball collisions, not invented edge velocities.
let edges=0;const edgesBy={KEEPER_CHANCE:0,SLIP_GULLY_CHANCE:0,SAFE_EDGE:0,BOUNDARY_EDGE:0},examples=[]
const {FORMATIONS}=load('fieldPlans'),{fieldingClosestApproach}=load('fielding'),{edgeIntercept}=load('keeperInterception')
for(const x of [-.19,-.13,-.10,-.07,.07,.10,.13,.19])for(const angle of [-.65,-.35,0,.35,.65])for(const speed of [12,20])for(const height of [.65,1.2]){
 const g=new Delivery();g.beginner=false;g.deliveryBeginner=false;g.state='AFTER_BOUNCE';g.released=true;g.bounced=true
 g.visible=true
 const pose={position:new Vector3(0,height+.5,-.65),rotation:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),angle)}
 g.position.set(x,height,-1);g.velocity.set(0,0,speed)
 for(let i=0;i<30&&!g.outcome;i++)g.step(.005,pose,pose,true)
 if(g.quality!=='EDGE')continue
 edges++;const v=g.velocity.clone(),t=v.z>0?(2.92-g.position.z)/v.z:-1
 const point=g.position.clone().addScaledVector(v,Math.max(0,t));point.y-=.5*9.81*Math.max(0,t)**2
 const opportunity=edgeIntercept(g,new Vector3(0,0,3.4),.14)
 let slip=false,plane=null
 const slipCenters=FORMATIONS.FAST_SWING.filter(([role])=>['SLIP','SECOND_SLIP','GULLY'].includes(role)).map(([,x,z])=>new Vector3(x,0,z))
 for(let i=0;i<450&&!g.match.result;i++){
   const previous=g.position.clone();g.step(.02,bat,bat,false)
   if(!plane&&previous.z<=2.92&&g.position.z>=2.92)plane=previous.clone().lerp(g.position,(2.92-previous.z)/(g.position.z-previous.z))
   if(!g.match.groundAfterHit)for(const center of slipCenters){const a=fieldingClosestApproach(previous,g.position,center,center);if(a&&a.distance<=1)slip=true}
 }
 const kind=opportunity?.reachable?'KEEPER_CHANCE':slip?'SLIP_GULLY_CHANCE':['FOUR','SIX'].includes(g.match.result)?'BOUNDARY_EDGE':'SAFE_EDGE'
 edgesBy[kind]++;if(examples.length<6||kind==='SLIP_GULLY_CHANCE'&&examples.length<8)examples.push({velocity:v.toArray().map(n=>+n.toFixed(2)),speed:+v.length().toFixed(2),keeperPlane:plane?.toArray().map(n=>+n.toFixed(2))??null,kind})
}
assert(edges>0);console.log('PHYSICAL EDGE SAMPLE',edges,edgesBy,examples)
console.log('PASS: real Delivery unplayed threat audit before/after by plan; actual EDGE collision sample (opportunity labels, not guaranteed catches or a playtest frequency estimate)')
