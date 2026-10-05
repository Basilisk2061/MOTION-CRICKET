const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const { Vector3, Quaternion, Euler } = require('three')
const cache = new Map()
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const source = fs.readFileSync(path.join(__dirname, '../src', `${name}.ts`), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => id.startsWith('./') ? load(id.slice(2)) : require(id), module, module.exports)
  cache.set(name, module.exports); return module.exports
}
const { Delivery, sweptContact, hitQuality } = load('delivery')
const { GAMEPLAY: T, DELIVERY, constrainBatToGround } = load('gameplayTuning')
const { chooseDelivery, releaseTime, bowlerPose } = load('bowling')
let seed = 1747
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
const pose = (x = 0) => ({ position: new Vector3(x, 1.05, -.65), rotation: new Quaternion() })
const bat = pose(), farBat = pose(3)
const stages = [.0, .4, 1.76, 2.0, releaseTime(.4), releaseTime(.4)+.2]
  .map(time => bowlerPose(time,.4).state)
assert.deepEqual(stages,['PAUSE','RUN_UP','GATHER','BOWLING_ARM_ROTATION','RELEASE','FOLLOW_THROUGH'])
const from = x => new Vector3(x, .6, -2), to = x => new Vector3(x, .6, 1)
assert(sweptContact(from(0), to(0), bat, bat))
assert(sweptContact(from(.11), to(.11), bat, bat, true))
assert(!sweptContact(from(.11), to(.11), bat, bat, false))
assert(!sweptContact(from(.5), to(.5), bat, bat, true, true))
assert(sweptContact(from(.15), to(.15), bat, bat, true, true))
assert(!sweptContact(new Vector3(.15,.6,-.54), new Vector3(.15,.6,-.3), bat, bat, true, true))
assert.equal(hitQuality(new Vector3(0,-.45,0), 2, false, 1), 'SWEET')
assert.equal(hitQuality(new Vector3(.045,-.6,0), 2, false, 1), 'GOOD')
assert.equal(hitQuality(new Vector3(.08,-.45,0), 2, false, 1), 'EDGE')
assert.equal(hitQuality(new Vector3(0,-.45,0), 2, true, 1), 'EDGE')
function closePass(x, swing, behind = false, beginner = true) {
  const game = new Delivery(() => .5)
  game.state = 'AFTER_BOUNCE'; game.released = true; game.bounced = true
  game.deliveryBeginner = beginner
  game.position.set(x, .6, behind ? -.54 : -.9); game.velocity.set(0,0,16)
  game.step(.04, bat, bat, true, { handleVelocity: new Vector3(), angularVelocity: new Vector3(0,0,swing) })
  return game
}
assert.equal(closePass(.21, 0).outcome, null)
assert.equal(closePass(.21, 3).outcome, 'HIT')
assert.equal(closePass(.21, 3).assistedHit, true)
assert.equal(closePass(.21, 3, false, false).outcome, null)
assert.equal(closePass(.21, 3, true).outcome, null)
assert.equal(closePass(.8, 12).outcome, null)
assert(closePass(0, 3).velocity.x > 0)
assert(closePass(0, -3).velocity.x < 0)

const tiers = [0,0,0], variants = new Set()
for (let i=0; i<1000; i++) {
  const release = bowlerPose(releaseTime(.4), .4).hand
  const plan = chooseDelivery(random, true, release)
  tiers[plan.tier]++
  assert(plan.velocity.z >= 10.8 && plan.velocity.z <= 16.2)
  assert(plan.targetX >= -.14 && plan.targetX <= .78)
  assert(plan.height >= .4 && plan.height <= 1.02)
  assert(plan.bounce > .25 && plan.bounce < 1)
  variants.add(`${plan.velocity.z.toFixed(2)}:${plan.bounceZ.toFixed(2)}`)
}
assert(tiers[0]>640 && tiers[0]<760); assert(tiers[1]>140 && tiers[1]<260)
assert(variants.size>950)
for (let i=0; i<80; i++) {
  const game = new Delivery(random); game.start()
  const releaseAt = releaseTime(game.pause)
  game.step(releaseAt, farBat, farBat, false)
  assert(game.released)
  assert(game.position.distanceTo(bowlerPose(releaseAt, game.pause).hand)<1e-8)
  let steps=0
  while (game.position.z < -.65 && steps++<1000) {
    game.step(1/240, farBat, farBat, false)
    assert.equal(game.camera, 'BATSMAN_VIEW')
  }
  assert(game.bounced && game.bounceId===1)
  assert(Math.abs(game.position.y - game.plan.height)<.08)
  assert(game.position.y < 1.12 && game.position.y > .30)
  assert(Math.abs(game.bouncePosition.z - game.plan.bounceZ)<.09)
}
for (let i=0; i<200; i++) {
  const rotation = new Quaternion().setFromEuler(new Euler(random()*6,random()*6,random()*6))
  const original = rotation.clone(), position = new Vector3(0,random()-.5,0)
  constrainBatToGround(position,rotation)
  assert(rotation.angleTo(original)<1e-6)
  for (const x of [-.058,.058]) for (const y of [-.72,.17]) for (const z of [-.035,.025]) {
    assert(new Vector3(x,y,z).applyQuaternion(rotation).add(position).y>=T.groundY-1e-8)
  }
}
const miss = new Delivery(() => .5); miss.start()
for(let i=0;i<1500;i++) miss.step(1/120,farBat,farBat,false)
assert.equal(miss.outcome,'MISSED');assert.equal(miss.state,'READY');miss.start();assert.equal(miss.state,'BOWLING')
console.log('PASS: padded swept hits, strict toggle, bounded assist/no stationary or behind/far assist, hit qualities, directional response, 1000 weighted deliveries, 80 simulated bounce/height/release checks, 200 ground poses, miss-camera/return/repeat')
