const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const { Vector3, Quaternion } = require('three'), cache = new Map()
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const m = { exports: {} }; cache.set(name, m.exports)
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'module', 'exports', code)(id => id.startsWith('./') ? load(id.slice(2)) : require(id), m, m.exports)
  cache.set(name, m.exports); return m.exports
}
const { BowlGesture } = load('bowlGesture'), neutral = new Quaternion()
const up = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI)
const gesture = new BowlGesture()
for (let i = 0; i < 20; i++) assert.equal(gesture.update(i * 50, neutral, neutral, i * 50), false)
assert.equal(gesture.holdMs, 0)
let triggers = 0
for (let now = 1000; now <= 3000; now += 50) triggers += Number(gesture.update(now, up, neutral, now))
assert.equal(triggers, 1, 'continuous up triggers once without return')
assert.equal(gesture.armed, false)
gesture.update(3100, neutral, neutral, 3100, false)
assert.equal(gesture.armed, true, 'lowering during active delivery permits next ready gesture')
for (let now = 3200; now <= 5000; now += 50) assert.equal(gesture.update(now, up, neutral, now, false), false)
gesture.update(5050, neutral, neutral, 5050)
for (let now = 5100; now <= 6100; now += 50) {
 assert.equal(gesture.update(now, up, neutral, now), now === 6100)
 if (now < 6100) assert(gesture.holdMs < 1000)
}
const dropped = new BowlGesture()
for (let now = 0; now < 600; now += 50) assert(!dropped.update(now, up, neutral, now))
dropped.update(600, neutral, neutral, 600)
assert.equal(dropped.holdMs, 0)
assert(!dropped.update(650, up, neutral, 650))
assert(!dropped.update(1200, up, neutral, 1200), 'sensor gap interrupts continuous hold')
assert.equal(dropped.holdMs, 0)
// Cooldown still blocks a lowered/re-raised bat, even in READY.
gesture.update(6150, neutral, neutral, 6150)
for (let now = 6200; now < 7600; now += 50) assert(!gesture.update(now, up, neutral, now))
const { SessionScore } = load('sessionScore'), { MatchResult } = load('matchResult')
const innings = new SessionScore(3, () => 0)
function ball(result = 'DOT') { const m = new MatchResult(); m.result = result; m.exitSpeed = 25; return m }
const first = innings.bowlerType
for (let i = 0; i < 5; i++) { assert.equal(innings.bowlerType, first); assert(innings.consume(ball())) }
assert.equal(innings.overNotation, '0.5')
const sixth = ball('FOUR'); assert(innings.consume(sixth)); assert(!innings.consume(sixth))
assert.equal(innings.overNotation, '1.0'); assert.notEqual(innings.bowlerType, first)
for (let i = 0; i < 6; i++) { assert.notEqual(innings.bowlerType, first); innings.consume(ball(i === 0 ? 'BOWLED' : 'SIX')) }
assert.equal(innings.bowlerType, first); assert.equal(innings.wickets, 1)
for (let i = 0; i < 6; i++) innings.consume(ball())
assert(innings.complete); assert.equal(innings.overNotation, '3.0'); assert(!innings.consume(ball('FOUR')))
assert.equal(innings.boundaries4, 1); assert.equal(innings.boundaries6, 5); assert.equal(innings.bestOverRuns, 30)
innings.reset(); assert.equal(innings.overNotation, '0.0'); assert.equal(innings.wickets, 0); assert(!innings.complete)
const { generateDelivery } = load('bowlingVariation'), { bowlerPose, releaseTime } = load('bowling')
const { Delivery, DELIVERY } = load('delivery')
const release = bowlerPose(releaseTime(.4), .4).hand
const fast = ['GOOD_LENGTH','YORKER','BOUNCER','INSWINGER','OUTSWINGER','FULL','SHORT']
const spin = ['OFF_SPIN','LEG_SPIN','TOP_SPIN','STRAIGHTER','FLIGHTED']
const plan = name => generateDelivery(fast.includes(name) ? 'FAST' : 'SPIN', () => .5, false, release, undefined, 0, name)
assert(plan('YORKER').bounceZ > plan('GOOD_LENGTH').bounceZ)
assert(plan('BOUNCER').bounceZ < plan('GOOD_LENGTH').bounceZ)
assert(plan('INSWINGER').swingAcceleration > 0 && plan('OUTSWINGER').swingAcceleration < 0)
assert(plan('OFF_SPIN').spinImpulse > 1.17); assert(plan('LEG_SPIN').spinImpulse < -1.17)
assert.equal(plan('STRAIGHTER').spinImpulse, 0); assert.equal(plan('FLIGHTED').spinImpulse, 0)
assert.equal(plan('TOP_SPIN').forwardImpulse, .72); assert.equal(plan('TOP_SPIN').spinImpulse, 0)
assert.equal(plan('INSWINGER').swingAcceleration, .675); assert.equal(plan('OUTSWINGER').swingAcceleration, -.675)
assert(Math.max(...spin.map(n => plan(n).speed)) < Math.min(...fast.map(n => plan(n).speed)))
assert.notEqual(generateDelivery('FAST', () => 0, false, release, 'GOOD_LENGTH', 2).variation, 'GOOD_LENGTH')
const bat = { position: new Vector3(100, 100, 100), rotation: new Quaternion() }
for (const name of [...fast, ...spin]) {
  const p = plan(name), g = new Delivery(() => .5)
  g.start(); g.plan = p; g.bounceResponse = p.bounce; g.released = true
  g.position.copy(release); g.velocity.copy(p.velocity)
  let beforeBounce = null, afterBounce = null, contactHeight = null
  for (let i = 0; i < 2000 && g.position.z < -.65; i++) {
    const oldX = g.velocity.x, wasBounced = g.bounced
    g.step(1 / 240, bat, bat, false)
    assert(g.position.toArray().every(Number.isFinite)); assert(g.velocity.toArray().every(Number.isFinite))
    if (!wasBounced && g.bounced) { beforeBounce = oldX; afterBounce = g.velocity.x }
    if (g.position.z >= -.65) contactHeight = g.position.y
  }
  assert(g.bounced, name + ' pitches')
  assert(contactHeight > .08 && contactHeight < 1.6, name + ' reaches playable height')
  if (name === 'OFF_SPIN') assert(afterBounce - beforeBounce > .6)
  if (name === 'LEG_SPIN') assert(afterBounce - beforeBounce < -.6)
}
const app = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8')
assert(app.includes('requestBowl(game, session)'))
const { requestBowl } = load('requestBowl'), readyGame = new Delivery(), readyMatch = new SessionScore()
assert(!requestBowl(readyGame, readyMatch, false)); assert.equal(readyGame.state, 'READY')
assert(requestBowl(readyGame, readyMatch)); assert(!requestBowl(readyGame, readyMatch))
readyGame.state = 'READY'; readyMatch.totalLegalBalls = 18
assert(!requestBowl(readyGame, readyMatch)); assert.equal(readyGame.state, 'READY')
assert(app.includes('Over {session.currentOver + 1}'))
assert(app.includes('game.state === \'COMPLETE\''))
assert.equal((app.match(/ref=\{ball\}/g) || []).length, 1)
console.log('PASS: bat-up hold/drop/rearm/cooldown; shared bowl gate; innings/popup; all 12 real trajectories; stronger spin and unchanged fast swing')
