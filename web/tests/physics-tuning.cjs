const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const { Vector3, Quaternion } = require('three'), cache = new Map()
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const m = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'module', 'exports', code)(id => id.startsWith('./') ? load(id.slice(2)) : require(id), m, m.exports)
  cache.set(name, m.exports); return m.exports
}
const { generateDelivery } = load('bowlingVariation'), { bowlerPose, releaseTime, chooseDelivery } = load('bowling')
const release = bowlerPose(releaseTime(.4), .4).hand
for (let i = 0; i <= 100; i++) {
  const random = () => i / 101
  const off = generateDelivery('SPIN', random, false, release, undefined, 0, 'OFF_SPIN')
  const leg = generateDelivery('SPIN', random, false, release, undefined, 0, 'LEG_SPIN')
  assert(off.spinImpulse >= 1.45 && off.spinImpulse <= 1.85)
  assert.equal(off.spinImpulse, -leg.spinImpulse)
  assert(off.velocity.toArray().every(Number.isFinite))
  const inside = generateDelivery('FAST', random, false, release, undefined, 0, 'INSWINGER')
  const outside = generateDelivery('FAST', random, false, release, undefined, 0, 'OUTSWINGER')
  assert(inside.swingAcceleration >= .6075 && inside.swingAcceleration <= .7425)
  assert.equal(inside.swingAcceleration, -outside.swingAcceleration)
}
for (const variation of ['GOOD_LENGTH', 'YORKER', 'BOUNCER', 'FULL', 'SHORT']) {
  const p = generateDelivery('FAST', () => .5, false, release, undefined, 0, variation)
  assert.equal(p.swingAcceleration, 0); assert.equal(p.spinImpulse, 0); assert.equal(p.forwardImpulse, 0)
}
for (const variation of ['TOP_SPIN', 'STRAIGHTER', 'FLIGHTED']) {
  const p = generateDelivery('SPIN', () => .5, false, release, undefined, 0, variation)
  assert.equal(p.spinImpulse, 0)
  if (variation === 'TOP_SPIN') assert.equal(p.forwardImpulse, .72)
}
const { FieldingController, fielderInteraction } = load('fielding'), { Delivery } = load('delivery')
assert.equal(fielderInteraction(.1, 5, false), 'CLEAN')
assert.equal(fielderInteraction(.1, 15, true), 'CLEAN')
assert.equal(fielderInteraction(.65, 22, false), 'DEFLECT')
assert.equal(fielderInteraction(.3, 22, false), 'DEFLECT')
assert.equal(fielderInteraction(.1, 22, false), 'BLOCK')
assert.equal(fielderInteraction(.35, 35, false), 'DEFLECT')
function intercept(speed, offset, height) {
  const g = new Delivery(), f = new FieldingController()
  g.position.set(-10, height, -4); g.velocity.set(0, 0, speed)
  f.startFielding(g.position, g.velocity)
  const active = f.activeFielder; active.state = 'CHASING'; active.position.set(-10 + offset, 0, -4)
  const samePosition = g.position, sameVelocity = g.velocity
  const update = f.update(.001, g.position, g.velocity, true)
  assert.equal(g.position, samePosition); assert.equal(g.velocity, sameVelocity)
  assert.equal(f.fielders.filter(x => x.active).length, 1)
  return { g, f, update }
}
const slow = intercept(5, .1, .06); assert(slow.update.captureBall)
slow.g.holdBallForFielder(slow.update.holdPosition); assert(slow.g.fieldingHeld)
assert(intercept(15, .1, 1.2).update.caught)
const hard = intercept(22, .3, .06); assert(!hard.update.captureBall); assert(hard.g.velocity.length() < 22); assert(!hard.g.fieldingHeld)
const beat = intercept(35, 1.15, .06); assert(!beat.update.captureBall); assert.equal(beat.g.velocity.length(), 35)
const { poweredExit, swingPower } = load('matchResult'), { MATCH: M } = load('gameplayTuning')
function legacy(v, omega, quality, active) {
  if (active && v.length() > 1e-8) v.setLength(Math.min(24, Math.max(v.length(), 20 * swingPower(omega) * M.QUALITY_POWER[quality])))
  return v
}
for (const [omega, quality, v, active] of [
  [2, 'GOOD', new Vector3(0, 2, -8), true], [5, 'SWEET', new Vector3(0, 8, -18), true],
  [15, 'EDGE', new Vector3(0, 12, -20), true], [15, 'SWEET', new Vector3(0, 0, -24), true],
  [0, 'GOOD', new Vector3(0, 2, -8), false],
]) {
  const expected = legacy(v.clone(), omega, quality, active), actual = v.clone()
  poweredExit(actual, omega, quality, true, active); assert(actual.distanceTo(expected) < 1e-9)
}
const angle = 25 * Math.PI / 180
const loft = new Vector3(0, Math.sin(angle) * 24, -Math.cos(angle) * 24)
const enhanced = loft.clone(); poweredExit(enhanced, 12, 'SWEET', true, true)
assert(enhanced.length() > 26 && enhanced.length() <= 28)
const saturated = loft.clone(); poweredExit(saturated, 100, 'SWEET', true, true); assert(saturated.length() <= 28 + 1e-9)
const pose = { position: new Vector3(100, 100, 100), rotation: new Quaternion() }
function simulate(velocity) {
  const g = new Delivery(); g.state = 'HIT'; g.outcome = 'HIT'; g.camera = 'BALL_FOLLOW'; g.released = true
  g.position.set(.32, 1, -.65); g.velocity.copy(velocity); g.match.registerHit(g.position)
  for (let i = 0; i < 2200 && !g.match.result; i++) g.step(1 / 240, pose, pose, false)
  return g.match
}
assert.notEqual(simulate(loft).result, 'SIX', 'old capped 25-degree trajectory falls short')
assert.equal(simulate(enhanced).result, 'SIX', 'earned loft physically clears rope before bounce')
assert.notEqual(simulate(new Vector3(0, 0, -28)).result, 'SIX', 'flat shot still bounces before boundary')
console.log('PASS: bounded spin/swing, deterministic catch/pickup/block/deflect/beat, same live ball, unchanged ordinary/edge/flat power, capped earned loft physically scores SIX')
