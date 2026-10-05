const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
global.localStorage={data:new Map(),getItem(k){return this.data.get(k)??null},setItem(k,v){this.data.set(k,v)}}
const load=require('./tactical-loader.cjs'),settings=load('audioSettings')
assert.deepEqual(settings.getAudioSettings(),{crowd:100,sfx:100,crowdMuted:false,sfxMuted:false})
let changes=0;const unsubscribe=settings.subscribeAudio(()=>changes++)
settings.setAudioSettings({crowd:35,sfx:65,crowdMuted:false,sfxMuted:false})
assert.equal(settings.audioLevel('crowd'),.35);assert.equal(settings.audioLevel('sfx'),.65);assert.equal(changes,1)
const stored=JSON.parse([...localStorage.data.values()][0]);assert.equal(stored.crowd,35)
const audioCode=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/audioSettings.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
const reloaded={exports:{}};new Function('module','exports',audioCode)(reloaded,reloaded.exports);assert.deepEqual(reloaded.exports.getAudioSettings(),stored)
const clips=[];global.Audio=class{paused=true;constructor(url){this.url=url;clips.push(this)}play(){this.paused=false;return Promise.resolve()}pause(){}removeAttribute(){}load(){}}
const param=()=>({value:0,setValueAtTime(v){this.value=v},exponentialRampToValueAtTime(){}})
const gains=[];const node=()=>({gain:param(),frequency:param(),Q:param(),connect(){return this},start(){},stop(){},disconnect(){}})
global.AudioContext=class{state='running';currentTime=0;sampleRate=48000;destination={};createGain(){const n=node();gains.push(n);return n}createBuffer(){return{getChannelData:()=>new Float32Array(10)}}createBufferSource(){return node()}createBiquadFilter(){return node()}createOscillator(){return node()}resume(){return Promise.resolve()}close(){return Promise.resolve()}}
const {GameAudio}=load('gameAudio'),audio=new GameAudio();audio.unlock();audio.event('keeper-glove');audio.wicketImpact(20,1);audio.impact('GOOD',20)
assert.equal(clips[0].volume,.06*.35);assert.equal(clips[1].volume,.18*.65);assert.equal(clips[2].volume,.95*.65)
settings.setAudioSettings({...settings.getAudioSettings(),crowdMuted:true});assert.equal(clips[0].volume,0);assert.equal(clips[1].volume,.18*.65)
settings.setAudioSettings({...settings.getAudioSettings(),sfx:25,sfxMuted:true});assert.equal(clips[1].volume,0);assert.equal(gains[0].gain.value,0)
settings.setAudioSettings({...settings.getAudioSettings(),sfxMuted:false});assert.equal(gains[0].gain.value,.25);assert.equal(clips[2].volume,.95*.25)
audio.dispose();audio.unlock();settings.setAudioSettings({...settings.getAudioSettings(),sfx:80});assert.equal(gains.at(-1).gain.value,.8);audio.dispose();unsubscribe()
function component(name,react,overrides={}){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/'+name+'.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','module','exports',code)(id=>overrides[id]??(id==='react'?react:id.endsWith('.css')?{}:id.startsWith('./')?load(id.slice(2)):require(id)),m,m.exports);return m.exports}
const states=[],effects=[];let cursor=0,tree;const calls=[],keys={}
global.document={querySelector:()=>null,activeElement:null};global.HTMLButtonElement=class{};global.window={addEventListener:(k,f)=>keys[k]=f,removeEventListener:()=>{}}
const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]},useRef:()=>({current:null}),useEffect:f=>effects.push(f)}
const Menu=component('GameMenu',react,{'./AudioSettingsPanel':{default:()=>null}}).default
const props={onSuspend:v=>calls.push(v),onMainMenu:()=>calls.push('MAIN')}
function render(){cursor=0;effects.length=0;tree=Menu(props)}
function nodes(n=tree,out=[]){if(n&&typeof n==='object'){out.push(n);for(const c of[n.props?.children].flat(Infinity))if(c!=null)nodes(c,out)}return out}
function click(text){const b=nodes().find(n=>n.type==='button'&&n.props.children===text);assert(b,text);b.props.onClick();render()}
render();click('MENU');assert(calls.at(-1));assert(nodes().some(n=>n.props.role==='dialog'));click('RESUME');assert.equal(calls.at(-1),false);assert(!nodes().some(n=>n.props.role==='dialog'))
click('MENU');click('SETTINGS');assert(nodes().some(n=>typeof n.type==='function'));click('BACK');click('MAIN MENU');assert.deepEqual(calls.slice(-2),[false,'MAIN'])
render();effects[0]();let stopped=0;keys.keydown({key:'Escape',preventDefault(){},stopImmediatePropagation(){stopped++}});render();assert.equal(stopped,1);assert(calls.at(-1));effects[0]();keys.keydown({key:' ',code:'Space',target:{},preventDefault(){},stopImmediatePropagation(){stopped++}});assert.equal(stopped,2);keys.keydown({key:'Escape',preventDefault(){},stopImmediatePropagation(){}});render();assert.equal(calls.at(-1),false)
states.length=0;cursor=0;tree=component('AudioSettingsPanel',react).default();effects.at(-1)();
const input=nodes().find(n=>n.type==='input'&&n.props.id==='volume-crowd');input.props.onChange({target:{value:'48'}});assert.equal(settings.getAudioSettings().crowd,48)
const mute=nodes().find(n=>n.type==='button');mute.props.onClick();assert.equal(settings.getAudioSettings().crowdMuted,false)
assert(!load('menuNavigation').MENU_CHOICES.MAIN.some(c=>c.label==='TRAINING'))
global.__PUBLIC_RELAY__=true;global.location={origin:'https://play.motioncricket.workers.dev',search:'?session=K7P4AB',pathname:'/'}
const Launch=component('TrackerLaunch',react,{'./TrackerDownload':{default:()=>null},'./publicSession':{PUBLIC_RELAY:true,currentSession:()=> 'K7P4AB'}})
assert.equal(Launch.trackerJoinURL('K7P4AB'),'motioncricket://join?session=K7P4AB');for(const v of ['ABC123','bad','K7P4AB&x=1'])assert.equal(Launch.trackerJoinURL(v),null)
states.length=0;cursor=0;tree=Launch.default();const link=nodes().find(n=>n.type==='a');assert.equal(link.props.href,'motioncricket://join?session=K7P4AB');assert.equal(states[0],false);link.props.onClick();assert.equal(states[0],true)
const panel=fs.readFileSync(path.join(__dirname,'../src/PhoneBowlingPanel.tsx'),'utf8');assert(panel.includes('fill="#444444"'));assert(!panel.includes('#88795c'))
const css=fs.readFileSync(path.join(__dirname,'../src/bowlingLab.css'),'utf8');assert(css.includes('.phone-bowling{background:#101010'));assert(css.includes('.phone-bowling .touch-bowl.armed{background:#494949}'))
console.log('PASS: pause/resume/main menu/Escape/key isolation, persisted immediate crowd/SFX/mute, neutral bowling presentation and explicit validated tracker launch')
