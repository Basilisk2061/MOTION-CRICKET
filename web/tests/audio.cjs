const assert = require('node:assert/strict')
const fs = require('node:fs'), ts = require('typescript')
const code = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../src/gameAudio.ts'),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
const mod = {exports:{}}
new Function('exports','module','require',code)(mod.exports,mod,require('./tactical-loader.cjs'))
const {GameAudio} = mod.exports
const sound = new GameAudio()
sound.impact('SWEET',20) // Safe before a user gesture / without browser audio.
sound.unlock()
let starts=0, resumes=0, closes=0
const param = ()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}})
const node = ()=>({connect(){return this},disconnect(){},start(){starts++},stop(){},gain:param(),frequency:param(),Q:param()})
global.AudioContext = class {
  state='running';sampleRate=48000;currentTime=0;destination={}
  createBuffer(){return {getChannelData(){return new Float32Array(8640)}}}
  createBufferSource(){return node()} createBiquadFilter(){return node()}
  createGain(){return node()} createOscillator(){return node()}
  resume(){resumes++;return Promise.resolve()} close(){closes++;return Promise.resolve()}
}
sound.unlock()
for(const quality of ['SWEET','GOOD','EDGE','BOUNCE']) sound.impact(quality,20)
assert.equal(starts,8); assert.equal(resumes,1)
sound.dispose(); assert.equal(closes,1)
sound.impact('GOOD',20); assert.equal(starts,8)
console.log('PASS: audio unavailable/before unlock safe, all four local synthesis sounds, cleanup and post-disposal safety')
