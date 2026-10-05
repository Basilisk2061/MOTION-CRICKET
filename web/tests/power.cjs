const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const {Vector3}=require('three')
function load(name){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
  new Function('require','module','exports',code)(id=>id.startsWith('./')?load(id.slice(2)):require(id),m,m.exports);return m.exports}
const {poweredExit,swingPower}=load('matchResult')
for(const quality of ['GOOD','SWEET']) {
  const v=new Vector3(0,0,-8)
  assert.equal(poweredExit(v,6,quality,true,false),0);assert.equal(v.length(),8,'inactive swing receives no attacking boost')
  poweredExit(v,1.4,quality,true,true);assert.equal(v.length(),8,'tiny movement stays defensive even during swing hysteresis')
}
const v=new Vector3(2,1,-8),direction=v.clone().normalize()
poweredExit(v,3,'GOOD',true,true)
assert(v.length()>20 && v.length()<23,'comfortable swing has useful proportional power')
assert(v.clone().normalize().distanceTo(direction)<1e-10)
assert(swingPower(2.2)>.4&&swingPower(2.2)<.5)
assert(swingPower(3)>.55&&swingPower(3)<.65)
assert(swingPower(4)>.7&&swingPower(4)<.78)
assert(swingPower(6)>.9&&swingPower(6)<.93)
poweredExit(v,100,'SWEET',true,true);assert(v.length()<=40)
assert(swingPower(100)-swingPower(6)<.09,'extreme swing adds little power')
console.log('PASS: inactive/tiny contacts unboosted, comfortable power, safe saturation, unchanged direction')
