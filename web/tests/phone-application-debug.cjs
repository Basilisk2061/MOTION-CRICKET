const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const {Quaternion}=require('three')
function load(name){
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
  const m={exports:{}};new Function('require','module','exports',code)(id=>id.startsWith('./')?load(id.slice(2)):require(id),m,m.exports);return m.exports
}
const {PhoneApplicationDebug}=load('phoneApplicationDebug')
const q=new Quaternion(),moved=new Quaternion().setFromAxisAngle({x:0,y:1,z:0},.5)
const debug=new PhoneApplicationDebug()
let sequence=0
function accept(rotation=q){
  const receipt={message:{orientation:rotation},received:++sequence*10}
  const wire=JSON.stringify({type:'phone-controller',_transport:{epoch:'a'.repeat(32),sequence},orientation:rotation})
  debug.rawMessage(wire);debug.accept(receipt,wire);return receipt
}
let receipt=accept()
debug.hold('PHONE_STATUS_DISCONNECTED',{connected:false})
let report=debug.report(15)
assert.equal(report.APPLICATION.boundary,'A: ACCEPTED_NOT_CONSUMED')
assert.equal(report.APPLICATION.reason,'PHONE_STATUS_DISCONNECTED')
assert.equal(report.TRANSPORT.ageMs,5)
debug.consume(receipt,q,q,16);debug.finalTransform(q,{});debug.drawn(q,17);debug.report(18)
receipt=accept();debug.consume(receipt,q,q,21)
assert.equal(debug.report(22).APPLICATION.boundary,'B: CONSUMED_QUATERNION_UNCHANGED')
receipt=accept(moved);debug.consume(receipt,moved,q,31)
assert.equal(debug.report(32).APPLICATION.boundary,'C: TARGET_CHANGED_BAT_UNCHANGED')
debug.finalTransform(moved,{orientation:moved.toArray()})
assert.equal(debug.report(33).APPLICATION.boundary,'D: BAT_CHANGED_DRAW_UNCHANGED')
debug.drawn(moved,34)
assert.equal(debug.report(35).APPLICATION.drawnQuaternionChanging,true)
// Re-rendering one receipt must not count as another consumed sample.
debug.consume(receipt,moved,q,36)
assert.equal(debug.report(37).APPLICATION.delta.consumed,0)
assert.equal(debug.consumedAt,31)
// Observation must neither mutate its inputs nor mistake quaternion sign for movement.
const original=moved.toArray();debug.finalTransform({x:-moved.x,y:-moved.y,z:-moved.z,w:-moved.w},{})
assert.equal(debug.report(38).APPLICATION.delta.final,0)
assert.deepEqual(moved.toArray(),original)
const controller=fs.readFileSync(path.join(__dirname,'../src/controller.ts'),'utf8')
const phone=fs.readFileSync(path.join(__dirname,'../src/PhoneController.tsx'),'utf8')
assert(/if\(debugTransport\s*&&\s*!phoneApplication.current\)/.test(controller))
assert(phone.includes("const diagnostic = debug ? setInterval"))
assert(phone.includes("[PHONE SENSOR]"))
console.log('Phone application diagnostics: A/B/C/D, ages, gates, receipt identity and passive observation PASS')
