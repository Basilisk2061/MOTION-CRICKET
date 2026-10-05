const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),load=require('./tactical-loader.cjs'),{Vector3}=require('three')
const {FieldingController}=load('fielding'),{FORMATIONS,applyFieldPlan,fieldMapPoint,chooseFieldPlan}=load('fieldPlans')
const {chooseTactic}=load('bowlingTactics'),{OverTactics}=load('overTactics'),{Delivery}=load('delivery'),{SessionScore}=load('sessionScore')
const f=new FieldingController()
// Execute the real Fielders component's frame callbacks against Three.js groups.
const ts=require('typescript'),frames=[],views=new Map(),{Group}=require('three')
function view(name){
 if(views.has(name))return views.get(name)
 const m={exports:{}},code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',name+'.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
 new Function('require','module','exports',code)(id=>id==='react'?{useMemo:fn=>fn(),useRef:value=>({current:value===null?new Group():value})}
  :id==='@react-three/fiber'?{useFrame:(fn,priority=0)=>frames.push({fn,priority})}
  :id.startsWith('./')?view(id.slice(2)):require(id),m,m.exports)
 views.set(name,m.exports);return m.exports
}
const fieldView=view('Fielders').default({fielding:f})
const rendered=fieldView.props.children.map(element=>element.type(element.props).props.ref.current)
function renderFrame(){frames.slice().sort((a,b)=>a.priority-b.priority).forEach(({fn})=>fn({clock:{elapsedTime:0}}))}
for(const plan of Object.keys(FORMATIONS)){
 assert.equal(FORMATIONS[plan].length,9);assert(applyFieldPlan(f,plan,true))
 FORMATIONS[plan].forEach(([role,x,z],i)=>{assert.equal(f.fielders[i].role,role);assert(f.fielders[i].position.equals(new Vector3(x,0,z)))})
 f.reset();FORMATIONS[plan].forEach(([,x,z],i)=>assert(f.fielders[i].position.equals(new Vector3(x,0,z)),'reset preserves selected homes'))
 renderFrame();rendered.forEach((root,i)=>assert(root.position.equals(f.fielders[i].position),'actual rendered group follows selected world position'))
}
applyFieldPlan(f,'FAST_ATTACKING',true);const old=f.fielders.map(x=>x.position.clone())
assert(!applyFieldPlan(f,'FAST_SHORT_BALL',false));f.fielders.forEach((x,i)=>assert(x.position.equals(old[i])))
applyFieldPlan(f,'FAST_SHORT_BALL',true);assert(f.fielders.some((x,i)=>!x.position.equals(old[i])))
assert(fieldMapPoint(new Vector3(-10,0,0)).x<50);assert(fieldMapPoint(new Vector3(0,0,-20)).y<fieldMapPoint(new Vector3()).y)
const before=fieldMapPoint(f.fielders[0].position);f.fielders[0].position.x+=3;assert.notEqual(fieldMapPoint(f.fielders[0].position).x,before.x)
const session=new SessionScore(null,()=>0),game=new Delivery(),tactics=new OverTactics(()=>.1)
assert(tactics.update(game,session,f));const first=tactics.field
game.state='HIT';session.totalLegalBalls=6;assert(!tactics.update(game,session,f));assert.equal(tactics.field,first)
game.state='READY';assert(tactics.update(game,session,f));assert(tactics.field.startsWith('SPIN'))
const map=fs.readFileSync(path.join(__dirname,'../src/FieldMap.tsx'),'utf8'),render=fs.readFileSync(path.join(__dirname,'../src/Fielders.tsx'),'utf8'),app=fs.readFileSync(path.join(__dirname,'../src/App.tsx'),'utf8')
assert(map.includes('fielding.fielders.map(f=>f.position),keeper.position'));assert(map.includes('length:10'))
assert(render.includes('root.current.position.copy(fielder.position)'));assert(app.includes('tactics.update(game,session,fielding)'))
let repeat=0;for(let i=0;i<1000;i++){if(chooseFieldPlan('FAST','SWING_ATTACK',()=>i/1000,['FAST_SWING','FAST_SWING'])==='FAST_SWING')repeat++}
assert(repeat<50,'third identical field strongly discouraged, not deterministic rotation')
assert.notEqual(chooseTactic('FAST',()=>.5,['SWING_ATTACK','SWING_ATTACK']),undefined)
console.log('PASS field plans: ten real nine-player formations, over-only integration, persistent homes, live-ball guard, live 10-marker map, right-handed orientation, anti-repetition and renderer data seam')
