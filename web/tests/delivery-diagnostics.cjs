const load=require('./tactical-loader.cjs'),{Vector3,Quaternion}=require('three')
const {generateDelivery}=load('bowlingVariation'),{Delivery}=load('delivery'),{BowlingPhysics}=load('bowlingPhysics'),{bowlerPose,releaseTime}=load('bowling')
const release=bowlerPose(releaseTime(.4),.4).hand,bat={position:new Vector3(100,100,100),rotation:new Quaternion()}
// Reproduce the previous solver for before/after diagnostics with identical draws.
function legacyGenerator(){
 const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),m={exports:{}}
 const source=fs.readFileSync(path.join(__dirname,'../src/bowlingVariation.ts'),'utf8')
  .replace("deliveryRebound(vy-flightGravity*t1,speed,bounceZ,variation==='TOP_SPIN',spinType,spinImpulse)",'(height-floor+.5*DELIVERY.gravity*t2*t2)/t2')
  .replace('height=reboundHeight(floor,rebound,t2)','')
  .replace('playableInitialLine(targetX-lateralTravel*compensation,lineDraw)','targetX-lateralTravel*compensation')
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
 new Function('require','module','exports',code)(id=>id.startsWith('./')?load(id.slice(2)):require(id),m,m.exports)
 return m.exports.generateDelivery
}
const generateLegacy=legacyGenerator()
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
function trace(g,lab=false){let at=0,bounceAt=0,batAt=0,down=0,up=0,batY=null,batX=null,stumpY=null,bounceX=null;const h=1/1000
 for(let i=0;i<6000;i++){
  const old=g.position.clone(),before=g.velocity.y,was=g.bounced
  if(lab)g.step(h);else g.step(h,bat,bat,false)
  at+=h
  if(!was&&g.bounced){bounceAt=at;down=before;up=g.velocity.y;bounceX=g.bouncePosition.x}
  for(const [z,key] of [[-.65,'bat'],[lab?0:.87,'stump']])if(old.z<z&&g.position.z>=z){const fraction=(z-old.z)/(g.position.z-old.z),y=old.y+(g.position.y-old.y)*fraction;if(key==='bat'){batY=y;batX=old.x+(g.position.x-old.x)*fraction;batAt=at-h+h*fraction}else stumpY=y}
  if(batY!==null&&(stumpY!==null||g.match?.stopped||g.state==='DONE'))break
 }
 return {bounceZ:g.bouncePosition.z,down,up,timeToBat:batAt-bounceAt,batY,batX,stumpY,peak:g.bouncePosition.y+up*up/(2*9.81),bounceX,finalX:g.position.x}
}
function aiPlan(name,pace=.5,type='FAST',random,legacy=false){let i=0;const draws=[.5,pace,.5,.5,.5,.5];return (legacy?generateLegacy:generateDelivery)(type,random??(()=>draws[i++]??.5),false,release,undefined,0,name,random?'CHANNEL_PRESSURE':undefined)}
function aiTrace(p){const g=new Delivery(()=>.5);g.start();g.plan=p;g.bounceResponse=p.bounce;g.released=true;g.position.copy(release);g.velocity.copy(p.velocity);return trace(g)}
function matrices(){const rows=[]
 for(const name of ['YORKER','FULL','GOOD_LENGTH','SHORT'])for(const pace of [.05,.5,.95]){const p=aiPlan(name,pace);rows.push({system:'AI',length:name,pace:p.speed,...aiTrace(p)})}
 for(const [name,z] of [['YORKER',-1.3],['FULL',-3.5],['GOOD_LENGTH',-6],['SHORT',-8]])for(const speed of [11,17,23]){const g=new BowlingPhysics();g.release({speed,bounceZ:z,line:.9,spin:0,swingAcceleration:0});rows.push({system:'LAB',length:name,pace:speed,...trace(g,true)})}
 return rows
}
function lines(legacy=false){return ['GOOD_LENGTH','INSWINGER','OUTSWINGER','STRAIGHTER','TOP_SPIN','OFF_SPIN','LEG_SPIN'].map(name=>{
 const type=['STRAIGHTER','TOP_SPIN','OFF_SPIN','LEG_SPIN'].includes(name)?'SPIN':'FAST',random=rng(83),examples=[];let extreme=0
 for(let i=0;i<2000;i++){const p=aiPlan(name,.5,type,random,legacy),t1=(p.bounceZ-release.z)/p.speed,t2=(-.65-p.bounceZ)/(p.speed+p.forwardImpulse),initial=release.x+p.velocity.x*(t1+t2);if(initial<-.75)extreme++
  if(i<2){const t=aiTrace(p);examples.push({intended:p.targetX,releaseX:release.x,initial,bounceX:t.bounceX,batX:t.batX,movement:t.batX-initial,extreme:initial<-.75,swing:p.swingAcceleration,spin:p.spinImpulse})}
 }return {name,extremePercent:extreme/20,examples}
 })}
module.exports={matrices,lines,trace,aiPlan,aiTrace,release,rng}
if(require.main===module)console.log(JSON.stringify({bounce:matrices(),beforeLines:lines(true),lines:lines()},null,2))
