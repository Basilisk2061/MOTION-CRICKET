const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),load=require('./tactical-loader.cjs')
global.localStorage={values:new Map(),getItem(k){return this.values.get(k)??null},setItem(k,v){this.values.set(k,v)}}
const help=load('battingHelp'),{GameModes}=load('gameMode'),{SessionScore}=load('sessionScore')
function component(name,react,fiber={}){
 const m={exports:{}},code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',name+'.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
 new Function('require','module','exports',code)(id=>id==='react'?react:id==='@react-three/fiber'?fiber:id==='./PhoneSetup'?{default:()=>null}:id==='./GuidedSetup'?{default:props=>({type:'div',props:{role:'dialog',children:[{type:'button',props:{children:'Close help',onClick:props.onClose}},{type:'button',props:{children:'Start batting',onClick:props.onComplete}}]}})}:id.endsWith('.css')?{}:id.startsWith('./')?load(id.slice(2)):require(id),m,m.exports);return m.exports.default
}
function fixture(mode,first=false){
 const states=[];let cursor=0,tree;const calls=[]
 const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]},useRef:()=>({current:null}),useEffect:()=>{}}
 const Hud=component('BattingHud',react),modes=new GameModes(new SessionScore(),()=>.5);modes.choose(mode)
 const props={modes,game:{state:'READY'},beginner:true,onAssist:v=>{calls.push(v);props.beginner=v},phoneStatus:'CONNECTED',calibrated:true,onDebug:()=>{},debug:false,initialOnboarding:first,onStart:()=>{props.initialOnboarding=false;calls.push('START')},onSuspend:v=>calls.push(v?'PAUSE':'RESUME')}
 function render(){cursor=0;tree=Hud(props)}
 function nodes(n=tree,out=[]){if(n&&typeof n==='object'){if(typeof n.type==='function')return nodes(n.type(n.props),out);out.push(n);for(const c of [n.props?.children].flat(Infinity))if(c!=null)nodes(c,out)}return out}
 function text(n){if(n&&typeof n.type==='function')return text(n.type(n.props));return typeof n==='string'||typeof n==='number'?String(n):n&&typeof n==='object'?[n.props?.children].flat(Infinity).map(text).join(' '):''}
 render();return {props,calls,render,text:()=>text(tree),buttons:()=>nodes().filter(n=>n.type==='button'),dialog:()=>nodes().some(n=>n.props?.role==='dialog'),click(label){const b=nodes().find(n=>n.type==='button'&&text(n).trim()===label)??nodes().find(n=>n.type==='button'&&text(n).trim().startsWith(label));assert(b,label);if(!b.props.disabled)b.props.onClick();render()}}
}
const first=fixture('FREE_PLAY',true),chase=fixture('TARGET_CHASE',true)
assert(first.dialog());assert(chase.dialog(),'either first batting mode mounts the shared guide');assert(!first.text().includes('balls left'));assert(!first.calls.includes('START'))
first.click('Start batting');assert(!first.dialog());assert(first.calls.includes('START'))
const free=fixture('FREE_PLAY')
assert(!fixture('FREE_PLAY').dialog(),'return does not repeat tutorial');free.click('How to play');assert(free.dialog());assert(free.calls.includes('PAUSE'));free.click('Close help');assert(!free.dialog())
free.props.game.state='FLIGHT';free.render();free.click('How to play');assert(!free.dialog(),'help cannot open in flight');free.props.game.state='READY';free.render()
free.click('Beginner Assist');assert(free.dialog());assert(!free.calls.includes(false),'explanation precedes disable');free.click('Keep on');assert(free.props.beginner)
free.click('Beginner Assist');free.click('Turn off');assert.equal(free.props.beginner,false)
free.click('Beginner Assist');assert(free.dialog(),'OFF also explains');free.click('Keep off');assert.equal(free.props.beginner,false)
free.click('Beginner Assist');free.click('Turn on');assert(free.props.beginner);free.click('Beginner Assist');assert(free.dialog(),'every click explains');free.click('Keep on')
const labels=free.buttons().map(b=>b.props.children).flat(Infinity).filter(s=>typeof s==='string');assert(labels.indexOf('Beginner Assist ')<labels.indexOf('How to play'));assert(labels.indexOf('How to play')<labels.indexOf('Debug '))
for(const [status,calibrated,label] of [['CONNECTED',true,'PHONE READY'],['CONNECTED',false,'CALIBRATION NEEDED'],['DISCONNECTED',false,'PHONE DISCONNECTED'],['STALE',true,'PHONE STALE']]){free.props.phoneStatus=status;free.props.calibrated=calibrated;free.render();assert(free.text().includes(label))}
free.props.game.state='READY';free.render();assert(free.text().includes('NEXT BALL'))
assert(!free.text().includes('Or raise the bat'));assert(!free.text().includes('Recalibrate in webcam window'),'permanent instructions removed, not controls')
free.props.game.state='FLIGHT';free.render();assert(!free.text().includes('NEXT BALL'));assert(free.text().includes('PHONE STALE'),'warnings remain visible during play')
global.localStorage={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};assert.doesNotThrow(()=>help.markSeen('blocked'));assert(help.hasSeen('blocked'))
// Run the actual live map effect/frame callbacks, rather than a fake field model.
const created=[],frames=[]
global.document={createElementNS(ns,name){const n={name,attrs:{},style:{},classList:{add:v=>n.className=v},setAttribute(k,v){this.attrs[k]=v},appendChild(){},remove(){}};created.push(n);return n},body:{appendChild(){}}}
const refs=[],MapView=component('FieldMap',{useRef:v=>{const ref={current:v};refs.push(ref);return ref},useEffect:f=>f()},{useFrame:f=>frames.push(f)})
const {Vector3}=require('three'),fielders=Array.from({length:9},(_,i)=>({position:new Vector3(i,0,-10)})),keeper={position:new Vector3(0,0,2)}
MapView({fielding:{fielders},keeper,tactics:{field:'ATTACKING'},debug:false});frames[0](null,.11)
assert.equal(created[0].className,'live-field-map');const dot=refs[0].current[0],before=dot.attrs.cx;fielders[0].position.x=5;frames[0](null,.11);assert.notEqual(dot.attrs.cx,before,'map follows actual live positions')
assert.equal(refs[1].current.textContent,'','tactical field label hidden in normal play')
const css=fs.readFileSync(path.join(__dirname,'../src/battingHud.css'),'utf8');assert(css.includes('width: 250px'));assert(css.includes('width: 220px'));assert(css.includes('width: 170px'))
const app=fs.readFileSync(path.join(__dirname,'../src/App.tsx'),'utf8')
const tuning=load('gameplayTuning')
assert.equal(tuning.GAMEPLAY.ballVisualScale,1.12)
assert.equal(tuning.GAMEPLAY.beginnerSpeedMultiplier,.90,'Assist pace unchanged')
assert(app.includes('emissiveIntensity={.35}'),'Assist-on visibility is permanent')
assert(!JSON.stringify([help.ASSIST_COPY,help.BATTING_STEPS]).match(/larger|easier.to.see/i),'no obsolete ball-visibility benefit in panel/tutorial/help')
const scaleMatch=app.match(/ball\.current\.scale\.setScalar\(([\s\S]*?)\)/)
assert(scaleMatch)
for(const beginner of [true,false]){
 let scale;new Function('ball','T','game',`ball.current.scale.setScalar(${scaleMatch[1]})`)({current:{scale:{setScalar:value=>scale=value}}},tuning.GAMEPLAY,{deliveryBeginner:beginner})
 assert.equal(scale,1.12,'identical rendered size regardless of Assist')
}
assert(app.includes('DELIVERY.radius'),'visual mesh still uses the existing radius before visual scaling')
assert(app.includes('{onboarding?<div className="batting-preplay"'),'onboarding mounts no Canvas or Play loop')
assert(app.includes("frameloop={helpPaused?'never':'always'}"),'help freezes all frame callbacks')
assert(app.includes('!suspendRef.current &&'));assert(app.includes('if(suspendRef.current)return'))
assert(app.includes('feed.bowlRequests.current=0;feed.publishBowlReady(false'),'phone requests/readiness suppressed during onboarding/help')
// Execute the actual App key handler, paused frame callback and readiness effect.
const source=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
let keyCode,frameCode,pauseCode
function visit(node){
 if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='key')keyCode=node.initializer.getText(source)
 if(ts.isCallExpression(node)&&node.expression.getText(source)==='useFrame'&&node.arguments[0]?.getText(source).includes('if(suspendRef.current)return'))frameCode=node.arguments[0].getText(source)
 if(ts.isCallExpression(node)&&node.expression.getText(source)==='useEffect'&&node.arguments[0]?.getText(source).includes('const block=()=>'))pauseCode=node.arguments[0].getText(source)
 ts.forEachChild(node,visit)
}visit(source)
function fn(code,args,values){const js=ts.transpileModule('module.exports='+code,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,m={exports:{}};new Function(...args,'module',js)(...values,m);return m.exports}
const paused={current:true},actualGame=new (load('delivery').Delivery)(),actualModes=new GameModes(new SessionScore());actualModes.choose('FREE_PLAY')
let requests=0;const request=(...args)=>{requests++;return load('requestBowl').requestBowl(...args)}
const keyHandler=fn(keyCode,['suspendRef','requestBowl','game','session','modes','replay'],[paused,request,actualGame,actualModes.score,actualModes,{inputBlocked:false}])
keyHandler({code:'Space',repeat:false,preventDefault(){}});assert.equal(requests,0);assert.equal(actualGame.state,'READY')
const pausedFrame=fn(frameCode,['suspendRef'],[paused]);assert.doesNotThrow(()=>pausedFrame(null,10),'paused frame exits before any controller, physics, scoring, timer or wicket work')
let interval;const feed={bowlRequests:{current:3},publishBowlReady:ready=>assert.equal(ready,false)}
const pauseEffect=fn(pauseCode,['suspended','modes','feed','setInterval','clearInterval','performance'],[true,actualModes,feed,f=>{interval=f;return 1},()=>{},{now:()=>0}])
const cleanup=pauseEffect();assert.equal(feed.bowlRequests.current,0);feed.bowlRequests.current=1;interval();assert.equal(feed.bowlRequests.current,0,'phone gesture requests are discarded, not queued');cleanup()
paused.current=false;keyHandler({code:'Space',repeat:false,preventDefault(){}});assert.equal(requests,1,'normal Space behavior resumes')
assert.equal(help.battingFeedback({quality:'SWEET',match:{result:null,exitSpeed:18}}).detail,'Exit speed 18.0 game units/s')
assert.equal(help.battingFeedback({quality:'GOOD',match:{result:'FOUR',exitSpeed:25}}).title,'FOUR');assert.equal(help.battingFeedback({quality:null,match:{result:'BOWLED',exitSpeed:0}}).title,'BOWLED')
assert(!help.battingFeedback({quality:'EDGE',match:{result:null,exitSpeed:NaN}}).detail)
console.log('PASS: pre-play/tutorial completion, help READY-only/suspension guards, every-click Assist ON/OFF actions, vertical order, phone states, authoritative feedback, persistence, live map updates. Browser rendering/focus requires visual review.')
