const assert=require('node:assert/strict'),load=require('./tactical-loader.cjs'),{Vector3,Quaternion}=require('three')
const {wicketImpact,WICKET_VISUAL:T}=load('wicketImpact'),{WicketPresentation}=load('wicketPresentation')
const {MatchResult}=load('matchResult'),{Delivery}=load('delivery'),{BowlingPhysics}=load('bowlingPhysics'),{bowlingParameters}=load('bowlingController')
const {WicketPresentationHold,WICKET_PRESENTATION_HOLD_MS}=load('wicketLifecycle'),{GameModes}=load('gameMode'),{SessionScore}=load('sessionScore')
const v=(x,y,z)=>new Vector3(x,y,z)
const light=wicketImpact(v(-.125,.45,.87),v(0,0,4),0,.02),model=new WicketPresentation()
let sounds=0;assert(model.accept(light,()=>sounds++));assert(!model.accept(light,()=>sounds++));assert.equal(sounds,1)
assert.equal(light.struckStump,0);assert(light.strength<T.LIGHT);assert(!model.bails[0].attached);assert(model.bails[1].attached)
assert.equal(model.stumps[1].velocity.length(),0);assert.equal(model.stumps[2].velocity.length(),0)
const hard=wicketImpact(v(0,.24,.87),v(3,0,30),1,.02);model.accept(hard)
assert.equal(hard.struckStump,1);assert(hard.strength>=T.HARD);assert(model.bails.every(b=>!b.attached))
assert(model.stumps[1].angularVelocity.length()>model.stumps[0].angularVelocity.length()*4)
for(let i=0;i<600;i++){model.step(1/120);for(const p of [...model.stumps,...model.bails])assert([...p.position.toArray(),...p.rotation.toArray(),...p.velocity.toArray()].every(Number.isFinite))}
assert(model.stumps[1].rotation.length()>1);assert(model.bails.every(b=>b.position.y<.02));assert.equal(model.cameraOffset().length(),0)
const a=new WicketPresentation(),b=new WicketPresentation()
a.accept(wicketImpact(v(0,.35,0),v(5,0,24),1));b.accept(wicketImpact(v(0,.35,0),v(-5,0,24),1))
for(let i=0;i<40;i++){a.step(1/120);b.step(1/120)}
assert(Math.abs(a.stumps[1].position.x+b.stumps[1].position.x)<1e-10);assert(Math.abs(a.stumps[1].rotation.z+b.stumps[1].rotation.z)<1e-10)
assert(Math.abs(a.bails[0].position.x+b.bails[1].position.x)<1e-10)
const initial=JSON.stringify(new WicketPresentation())
for(let i=0;i<100;i++){model.accept(wicketImpact(v(0,.4,.87),v(2,0,25),i));model.step(.05);model.reset();assert.equal(JSON.stringify(model),initial)}
// Existing unhit/BOWLED and bat-prevents-BOWLED fixtures, without unrelated power tests.
const match=new MatchResult(),position=v(0,.4,1),velocity=v(0,0,16)
match.update(v(0,.4,.7),position,velocity,.02);assert.equal(match.result,'BOWLED');assert.equal(velocity.length(),0)
assert.equal(match.wicketImpact.ballVelocity.z,16);assert.equal(match.wicketImpact.position.z,.87)
const event=match.wicketImpact;match.update(v(0,.4,.7),position,velocity,.02);assert.equal(match.wicketImpact,event)
const modes=new GameModes(new SessionScore());modes.choose('FREE_PLAY');assert(modes.consume(match,false));assert.equal(modes.status,'COMPLETE','scoring/dismissal still immediate')
const hold=new WicketPresentationHold();assert(hold.active(event,100));assert(hold.active(event,100+WICKET_PRESENTATION_HOLD_MS-1),'terminal overlay withheld while impact animates')
assert(!hold.active(event,100+WICKET_PRESENTATION_HOLD_MS),'existing result UI becomes eligible after hold');assert(!hold.active(event,2000),'same event never restarts hold')
const appSource=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/App.tsx'),'utf8')
assert(appSource.includes('{!wicketHolding && !replay.inputBlocked && <ModeOverlay'),'actual terminal overlay respects live wicket hold and replay')
assert(!hold.active(null,2000));assert(hold.active({...event},2100),'new wicket starts a fresh hold')
const caughtHold=new WicketPresentationHold();assert(!caughtHold.active(null,0),'caught/no physical impact receives no hold')
const presented=new WicketPresentation();let battingSounds=0;presented.accept(event,()=>battingSounds++);presented.accept(match.wicketImpact,()=>battingSounds++);assert.equal(battingSounds,1)
const hit=new MatchResult();hit.registerHit(v(0,.4,0));hit.update(v(0,.4,.7),v(0,.4,1),v(0,0,16),.02);assert.equal(hit.result,null);assert.equal(hit.wicketImpact,null)
const pose={position:v(5,1,-.65),rotation:new Quaternion()},game=new Delivery()
game.state='AFTER_BOUNCE';game.released=true;game.bounced=true;game.position.set(0,.4,.7);game.velocity.set(0,0,16)
game.step(.03,pose,pose,false);assert.equal(game.match.result,'BOWLED');assert(game.match.wicketImpact);assert.equal(game.velocity.length(),0)
game.state='READY';game.start();assert.equal(game.match.wicketImpact,null);assert.equal(game.match.result,null)
function lab(x,intent='NONE'){
 const physics=new BowlingPhysics();physics.release(bowlingParameters({type:'BOWLING_RELEASE',source:'AUTO_MOTION',timestamp:1,id:1,calibrationId:1,
  orientation:{x:0,y:0,z:0,w:1},angularVelocity:{x:4,y:0,z:0},target:{x,z:-1.3},swingIntent:intent}))
 for(let i=0;i<2000&&physics.state==='FLIGHT';i++)physics.step(1/240)
 return physics
}
const direct=lab(0);assert(direct.hitStumps);assert(direct.wicketImpact.speed>10);assert.equal(direct.velocity.length(),0)
let labSounds=0;const labModel=new WicketPresentation([-.105,0,.105],.725);labModel.accept(direct.wicketImpact,()=>labSounds++);labModel.accept(direct.wicketImpact,()=>labSounds++);assert.equal(labSounds,1)
const miss=lab(.9);assert(!miss.hitStumps);assert.equal(miss.wicketImpact,null);assert(!labModel.accept(miss.wicketImpact,()=>labSounds++));assert.equal(labSounds,1)
for(const intent of ['IN','OUT']){const g=lab(0,intent);assert.equal(!!g.wicketImpact,g.hitStumps,'presentation never creates wickets from swing proximity')}
const labEvent=direct.wicketImpact,initialBailY=labModel.bails[0].position.y
for(let i=0;i<300;i++){direct.step(1/240);labModel.step(1/240)}
assert(direct.wicketHolding);assert.equal(direct.wicketImpact,labEvent);assert.equal(direct.state,'DONE');assert.notEqual(labModel.bails[0].position.y,initialBailY,'bails animate throughout hold')
direct.reset();assert.equal(direct.state,'DONE','manual reset cannot cut the impact short');assert.equal(direct.wicketImpact,labEvent)
for(let i=0;i<61;i++){direct.step(1/240);labModel.step(1/240)}
assert(direct.ready);assert.equal(direct.wicketImpact,null);labModel.reset();assert(labModel.bails.every(b=>b.attached));assert(labModel.stumps.every(s=>s.velocity.length()===0))
// Exercise the actual audio method; missing/rejected assets remain non-fatal.
let plays=0,paths=[],clips=[]
global.Audio=class{constructor(path){paths.push(path);clips.push(this)}play(){plays++;return Promise.reject(new Error('missing test asset'))}pause(){}removeAttribute(){}load(){}}
global.AudioContext=class{sampleRate=1000;state='running';createBuffer(_channels,length){return {getChannelData:()=>new Float32Array(length)}}resume(){return Promise.resolve()}close(){return Promise.resolve()}}
const {GameAudio}=load('gameAudio'),audio=new GameAudio();audio.unlock(false)
const soundModel=new WicketPresentation();soundModel.accept(event,(speed,strength)=>audio.wicketImpact(speed,strength));soundModel.accept(event,(speed,strength)=>audio.wicketImpact(speed,strength))
assert.equal(plays,1);assert.deepEqual(paths,['/audio/stump-impact.ogg']);assert.equal(clips[0].volume,.70+.25*event.strength);assert.equal(clips[0].playbackRate,1.02-.04*event.strength);assert(clips[0].volume>.70&&clips[0].volume<=.95);audio.dispose()
console.log('PASS: unchanged impulse physics/100 resets, authoritative batting BOWLED + immediate scoring/deferred result UI, 1500ms hold, animated Lab wicket/manual-reset guard/automatic reset, once-only increased audio gain/rate/missing-asset safety')
