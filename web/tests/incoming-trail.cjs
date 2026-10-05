const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),load=require('./tactical-loader.cjs')
const {Vector3}=require('three'),{TRAIL_STYLE}=load('ballTrailHistory')
function run(beginner){
 let frame
 const m={exports:{}},code=ts.transpileModule(fs.readFileSync('src/BallTrail.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
 new Function('require','module','exports',code)(id=>id==='react'?{useMemo:f=>f(),useEffect:()=>{}}:id==='@react-three/fiber'?{useFrame:f=>frame=f}:id.startsWith('./')?load(id.slice(2)):require(id),m,m.exports)
 const game={match:{hit:false,stopped:false},released:true,outcome:null,state:'IN_FLIGHT',fieldingHeld:false,fieldingReturn:false,visible:true,bounceId:0,position:new Vector3(0,1,-8),bouncePosition:new Vector3(0,.056,-6),beginner}
 const line=m.exports.default({game}).props.object,geometry=line.geometry
 const step=t=>frame({clock:{elapsedTime:t}})
 step(0);game.position.set(0,.1,-6.1);step(.02)
 game.bounceId++;game.position.set(0,.15,-5.9);step(.04)
 assert.equal(geometry.drawRange.count,6,'incoming actual history survives bounce with explicit contact point')
 const position=geometry.getAttribute('position'),opacity=geometry.getAttribute('opacity')
 assert(Math.abs(position.getZ(0)+8)<1e-6);assert(Math.abs(position.getZ(3)+6)<1e-6)
 assert(Math.abs(position.getY(3)-.056)<1e-6)
 for(let i=0;i<geometry.drawRange.count;i++)assert(position.getZ(i)<=game.position.z+1e-6,'no future position')
 const alpha=opacity.getX(5);assert(alpha<=.120001)
 step(.17);assert.equal(geometry.drawRange.count,0,'short incoming history expires')
 game.match.hit=true;game.outcome='HIT';step(.18);game.position.z++;step(.20)
 assert(geometry.getAttribute('opacity').getX(1)>.4,'existing post-hit strength')
 const buffer=position.array
 for(let i=0;i<300;i++){game.position.z+=.02;step(.21+i*.001)}
 assert(geometry.drawRange.count<=382);assert.equal(position.array,buffer,'reuse GPU buffer')
 game.state='READY';game.released=false;game.match={hit:false,stopped:false};step(.6)
 assert.equal(geometry.drawRange.count,0,'reset clears all history')
 return alpha
}
assert.equal(run(false),run(true),'Assist does not affect visibility')
assert.deepEqual(TRAIL_STYLE.hit,{duration:4,points:192,opacity:.42})
const app=fs.readFileSync('src/App.tsx','utf8'),tuning=load('gameplayTuning')
assert.equal(tuning.DELIVERY.radius,.036);assert.equal(tuning.GAMEPLAY.ballVisualScale,1.12)
assert(app.includes('T.ballVisualScale,'));assert(app.includes('emissiveIntensity={.35}'))
console.log('PASS: actual incoming history, bounce continuity, no prediction, bounded reused buffers, distinct post-hit trail, reset, identical Assist visuals')
