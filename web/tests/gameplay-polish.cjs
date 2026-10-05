const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const {Vector3,Quaternion}=require('three'),cache=new Map()
function load(name){if(cache.has(name))return cache.get(name);const m={exports:{}}
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
  new Function('require','module','exports',code)(id=>id.startsWith('./')?load(id.slice(2)):require(id),m,m.exports);cache.set(name,m.exports);return m.exports}
const {BowlGesture}=load('bowlGesture'),neutral=new Quaternion(),lift=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.7)
const gesture=new BowlGesture();let triggers=0
for(let i=0;i<20;i++)assert(!gesture.update(i*33,new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.sin(i)*.05),neutral,i))
for(let i=0;i<9;i++)triggers+=gesture.update(1000+i*33,lift,neutral,100+i)
assert.equal(triggers,0,'lifting alone never starts delivery')
assert(gesture.update(1350,neutral,neutral,120),'lift-hold-return triggers once')
assert(!gesture.update(1400,neutral,neutral,121),'no double trigger')
for(let i=0;i<9;i++)assert(!gesture.update(1600+i*33,lift,neutral,130+i),'cooldown')
assert(!gesture.update(1950,neutral,neutral,150))
const incomplete=new BowlGesture();incomplete.update(0,lift,neutral,0);assert(!incomplete.update(3000,neutral,neutral,1),'incomplete timeout')
assert(!gesture.update(4000,lift,neutral,200,false),'disallowed state')
const {KeeperPresentation,keeperIntercept,KEEPER}=load('keeperPresentation'),{MatchResult}=load('matchResult')
const ball=(p,v)=>({position:p,velocity:v,released:true,visible:true,outcome:'HIT',state:'HIT',match:{held:false,stopped:false}})
const straight=ball(new Vector3(0,.8,.5),new Vector3(0,0,10)),stationary=new KeeperPresentation()
stationary.update(straight,1/60);assert(stationary.position.equals(new Vector3(0,0,KEEPER.z)),'straight ball does not move keeper')
function simulate(p,v){const k=new KeeperPresentation(),b=ball(p,v),match=new MatchResult();match.hit=true;let caught=false,maxZ=k.position.z,maxX=0
  for(let i=0;i<100;i++){
    const before=k.position.clone();k.update(b,1/120)
    assert(k.position.distanceTo(before)<=KEEPER.speed/120+1e-8,'no teleport')
    maxZ=Math.max(maxZ,k.position.z);maxX=Math.max(maxX,Math.abs(k.position.x))
    const from=b.position.clone();b.position.addScaledVector(b.velocity,1/120);b.position.y-=.5*9.81/120**2;b.velocity.y-=9.81/120
    if(b.position.y<.056){b.position.y=.056;b.velocity.y=0;match.groundAfterHit=true}
    match.update(from,b.position,b.velocity,1/120,{position:k.reach,active:k.state!=='TRACKING'&&k.state!=='RECOVER'})
    if(match.held){caught=true;break}
  }return {k,b,match,caught,maxZ,maxX}}
const lateral=simulate(new Vector3(1,.8,.5),new Vector3(0,0,6))
assert(lateral.maxX>.05,'reachable lateral ball moves keeper');assert(lateral.caught,'reachable lateral ball intercepted')
const behind=simulate(new Vector3(.2,2.0,2.5),new Vector3(.25,1.2,4))
assert(behind.maxZ>3.5,'keeper retreats for high edge');assert(behind.caught,'behind keeper edge intercepted')
assert.equal(behind.match.result,'CAUGHT BEHIND','airborne edge uses existing dismissal logic')
assert.equal(keeperIntercept(ball(new Vector3(5,3,3),new Vector3(12,5,12))),null,'unreachable edge')
assert.equal(keeperIntercept({...straight,fieldingHeld:true}),null,'fielder ownership disables keeper')
const {FieldingController}=load('fielding'),field=new FieldingController()
assert.equal(field.fielders.find(f=>f.role==='POINT').homePosition.x,-12)
assert.equal(field.fielders.find(f=>f.role==='DEEP_COVER').homePosition.x,-26.4)
const owned=ball(new Vector3(1,1,4),new Vector3());owned.match={held:true,stopped:true}
behind.k.position.set(1,0,4.5);owned.state='COMPLETE'
for(let i=0;i<240;i++)behind.k.update(owned,1/60)
assert(behind.k.position.distanceTo(new Vector3(0,0,KEEPER.z))<.01,'keeper returns home')
let plays=[];global.Audio=class{paused=true;constructor(src){this.src=src}play(){this.paused=false;plays.push(this.src);return Promise.resolve()}pause(){this.paused=true}removeAttribute(){}load(){}}
global.AudioContext=class{state='running';sampleRate=48000;createBuffer(){return{getChannelData(){return new Float32Array(10)}}}resume(){return Promise.resolve()}close(){return Promise.resolve()}}
const {GameAudio}=load('gameAudio'),audio=new GameAudio();audio.unlock();audio.unlock()
assert.equal(plays.filter(p=>p.includes('crowd')).length,1,'one continuous ambience loop')
audio.event('bowler-release');audio.event('keeper-glove');assert.equal(plays.length,3);audio.dispose()
const app=fs.readFileSync(path.join(__dirname,'../src/App.tsx'),'utf8'),effects=fs.readFileSync(path.join(__dirname,'../src/MatchEffects.tsx'),'utf8')
assert(app.includes("event.code === 'Space'")&&app.includes('if(!session.out) game.start()'),'Space backup remains')
assert(app.includes('!game.fieldingHeld && !game.match.held'),'exclusive capture guard')
assert(effects.includes("if(game.released&&!s.released)audio.event('bowler-release')"),'release event edge fires once')
console.log('PASS: gesture jitter/hold/return/cooldown, Space, straight/lateral/behind/unreachable keeper, ownership, recovery, deeper formation, single ambience and release event')
