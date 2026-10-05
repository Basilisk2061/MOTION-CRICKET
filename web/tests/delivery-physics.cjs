const assert=require('node:assert/strict'),load=require('./tactical-loader.cjs')
const d=require('./delivery-diagnostics.cjs'),before=require('./delivery-before.json')
const rows=d.matrices(),{deliveryRebound}=load('deliveryBounce')
for(const system of ['AI','LAB'])for(let index=0;index<3;index++){
 const get=name=>rows.filter(r=>r.system===system&&r.length===name)[index]
 const y=get('YORKER'),f=get('FULL'),g=get('GOOD_LENGTH'),s=get('SHORT')
 assert(y.batY<g.batY);assert(f.batY<s.batY)
 assert(y.stumpY<.76,'representative yorker stays below wicket top')
 assert(g.batY>.8,'meaningful good-length rise');assert(s.peak>g.peak)
 assert(y.up<f.up&&f.up<g.up&&g.up<s.up)
 assert(g.batY>before.bounce.find(r=>r.system===system&&r.length==='GOOD_LENGTH'&&Math.abs(r.pace-g.pace)<1e-6).batY)
}
for(const system of ['AI','LAB'])for(const length of ['GOOD_LENGTH','SHORT']){
 const samples=rows.filter(r=>r.system===system&&r.length===length)
 assert(samples[2].up>samples[0].up);assert(samples[2].peak>samples[0].peak)
}
for(let speed=11;speed<=24;speed++)for(const z of [-1.2,-3.5,-6,-8,-10]){
 const v=deliveryRebound(-7,speed,z)
 assert(v>0&&v<=6.4);assert(deliveryRebound(-7,speed,z,true)>=v)
}
const old=d.lines(true),current=d.lines()
for(let i=0;i<old.length;i++){
 assert(current[i].extremePercent<=old[i].extremePercent)
 for(let j=0;j<2;j++)for(const key of ['swing','spin','intended','releaseX'])assert.equal(current[i].examples[j][key],old[i].examples[j][key])
}
for(const name of ['INSWINGER','OFF_SPIN']){
 const i=current.findIndex(r=>r.name===name)
 assert(current[i].extremePercent<old[i].extremePercent*.15,'extreme left starts become uncommon')
}
const {playableInitialLine}=load('bowlingVariation')
for(const x of [-.38,-.08,0,.32,.48])assert.equal(playableInitialLine(x,.5),x)
assert.equal(playableInitialLine(-2,.01),-2,'occasional genuine wide remains')
assert(playableInitialLine(-2,.5)>-.75)
let off=false,stump=false,leg=false,movementWide=false
const random=d.rng(43)
for(let i=0;i<2000;i++){
 const p=d.aiPlan('OFF_SPIN',.5,'SPIN',random),t1=(p.bounceZ-d.release.z)/p.speed,t2=(-.65-p.bounceZ)/p.speed
 const initial=d.release.x+p.velocity.x*(t1+t2),movement=p.spinImpulse*t2
 off ||= p.targetX<-.1;stump ||= Math.abs(p.targetX)<.09;leg ||= p.targetX>.16
 movementWide ||= initial>=-.75&&initial+movement>.75
}
assert(off&&stump&&leg&&movementWide)
console.log('PASS: AI/Lab bounce hierarchy, low yorkers, livelier pace, bounded top-spin, reduced initial-left tail, unchanged movement/aim variety')
