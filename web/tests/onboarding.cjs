const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const load=require('./tactical-loader.cjs')
global.__PUBLIC_RELAY__=true
global.location={origin:'https://motion-cricket.motion-cricket.workers.dev',search:'?session=K7P4AB',pathname:'/'}
global.localStorage={getItem:()=>null,setItem:()=>{}}
const {SETUP_STEPS,setupCanAdvance,trackerAsset,TRACKER_FILE}=load('onboarding')
assert.equal(SETUP_STEPS.length,9)
const status={webcamConnected:false,webcamCalibrated:false,phoneConnected:false,phoneCalibrated:false}
assert(!setupCanAdvance(3,status));assert(!setupCanAdvance(4,status));assert(setupCanAdvance(0,status))
const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/GuidedSetup.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
const state=[],effects=[];let cursor=0,completed=0,closed=0
const react={useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>state[i]=typeof v==='function'?v(state[i]):v]},useRef:()=>({current:null}),useEffect:f=>effects.push(f)}
const m={exports:{}}
new Function('require','module','exports',code)(id=>id==='react'?react:id==='./PhoneSetup'||id==='./TrackerDownload'||id==='./TrackerLaunch'?{default:()=>null}:id.endsWith('.css')?{}:id.startsWith('./')?load(id.slice(2)):require(id),m,m.exports)
const props={status,firstVisit:true,onComplete:()=>completed++,onClose:()=>closed++}
let tree
const render=()=>{cursor=0;effects.length=0;tree=m.exports.default(props)}
function nodes(n=tree,out=[]){if(n&&typeof n==='object'){out.push(n);for(const c of [n.props?.children].flat(Infinity))if(c!=null)nodes(c,out)}return out}
function text(n=tree){return typeof n==='string'||typeof n==='number'?String(n):n&&typeof n==='object'?[n.props?.children].flat(Infinity).map(c=>c==null?'':text(c)).join(' '):''}
function click(label){const b=nodes().find(n=>n.type==='button'&&text(n).trim().startsWith(label));assert(b,label);if(!b.props.disabled)b.props.onClick();render()}
render();assert(text().includes('YOUR BODY.'));click('GET STARTED');assert(text().includes('Windows laptop'));click('← BACK');assert(text().includes('Your body is the controller'))
click('GET STARTED');click('NEXT');assert(text().includes('Extract it.'));click('NEXT');assert(text().includes('K7P4AB'));click('NEXT');assert.equal(state[0],3,'Connection gate remains until live status is ready')
status.webcamConnected=status.phoneConnected=true;render();click('NEXT');assert(text().includes('Make this stance yours.'));click('NEXT');assert.equal(state[0],4)
status.webcamCalibrated=status.phoneCalibrated=true;render();click('NEXT');assert(text().includes('Move your right hand'));click('NEXT');assert(text().includes('about 1 second'));assert(text().includes('SPACE'))
click('NEXT');assert(text().includes('Runs are scored automatically'));click('NEXT');assert(text().includes('READY.'));click('START BATTING');assert.equal(completed,1)
assert(load('battingHelp').hasSeen(load('battingHelp').HELP_KEYS.tutorial),'Completion persistence/returning-player path')
click('SKIP SETUP');assert.equal(closed,1,'Skip always available')
const listeners={};global.window={addEventListener:(k,f)=>listeners[k]=f,removeEventListener:()=>{}}
global.document={activeElement:null};global.HTMLButtonElement=class {}
render();const cleanup=effects.at(-1)();let stopped=0
listeners.keydown({key:'ArrowLeft',code:'ArrowLeft',preventDefault(){},stopImmediatePropagation(){stopped++}});assert.equal(state[0],7);assert.equal(stopped,1)
listeners.keydown({key:'Escape',code:'Escape',preventDefault(){},stopImmediatePropagation(){}});assert.equal(closed,2);cleanup()
const assetURL='https://github.com/Basilisk2061/MOTION-CRICKET/releases/download/tracker-v1/'+TRACKER_FILE
assert.equal(trackerAsset([{assets:[{name:TRACKER_FILE,browser_download_url:assetURL}]}]),assetURL)
assert.equal(trackerAsset([]),null);assert.equal(trackerAsset([{draft:true,assets:[{name:TRACKER_FILE,browser_download_url:assetURL}]}]),null)
assert.equal(trackerAsset([{assets:[{name:TRACKER_FILE,browser_download_url:'https://evil.example/'+TRACKER_FILE}]}]),null)
const menu=fs.readFileSync(path.join(__dirname,'../src/MainMenu.tsx'),'utf8')
assert(menu.includes("hasSeen(HELP_KEYS.tutorial)?null:0"));assert(menu.includes("['HOW TO PLAY','TRACKER / SETUP']"));assert(menu.includes("onNavigate('BATTING')"))
console.log('PASS: nine steps, Back/Next, live readiness gates, skip, completion persistence, keyboard isolation, menu re-entry and safe complete-ZIP release discovery')
