const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const { Vector3, Quaternion } = require('three'), cache = new Map()
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const m = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require','module','exports',code)(id => id.startsWith('./') ? load(id.slice(2)) : require(id), m, m.exports)
  cache.set(name, m.exports); return m.exports
}
const { SessionScore } = load('sessionScore'), { GameModes, generateTarget } = load('gameMode')
const { MatchResult } = load('matchResult'), { Delivery, DELIVERY } = load('delivery'), { requestBowl } = load('requestBowl')
function result(name) { const m = new MatchResult(); m.result = name; m.exitSpeed = 26; return m }
const score = new SessionScore(3, () => 0), modes = new GameModes(score, () => .5), game = new Delivery()
assert.equal(modes.status, 'MENU'); assert(!requestBowl(game, score, true, modes.status))
modes.choose('FREE_PLAY'); assert.equal(score.overs, null)
for (let over = 0; over < 52; over++) {
  const bowler = score.bowlerType
  for (let ball = 0; ball < 6; ball++) {
    assert.equal(score.bowlerType, bowler); assert(modes.consume(result('FOUR'), true))
  }
  assert.notEqual(score.bowlerType, bowler); assert.equal(modes.status, 'PLAYING')
}
assert.equal(score.overNotation, '52.0'); assert.equal(score.total, 1248)
assert.equal(score.boundaries4, 312); assert.equal(score.bestOverRuns, 24)
assert(modes.consume(result('BOWLED'), false)); assert.equal(modes.status, 'COMPLETE')
assert(!requestBowl(game, score, true, modes.status))
modes.choose('FREE_PLAY'); assert.equal(score.total, 0); assert.equal(score.overNotation, '0.0'); assert.equal(score.wickets, 0)
modes.choose('TARGET_CHASE'); assert.equal(modes.status, 'INTRO'); assert.equal(modes.target, 38)
assert(!requestBowl(game, score, true, modes.status)); modes.begin()
for (let i = 0; i < 18; i++) modes.consume(result('DOT'), true)
assert.equal(modes.status, 'LOST'); assert.equal(modes.ballsRemaining, 0)
modes.choose('TARGET_CHASE'); modes.begin()
for (let i = 0; i < 6; i++) modes.consume(result('SIX'), true)
assert.equal(modes.runsNeeded, 2); assert.equal(modes.ballsRemaining, 12)
assert(modes.consume(result('FOUR'), false)); assert.equal(modes.status, 'WON')
assert.equal(modes.ballsRemaining, 11); assert(!modes.consume(result('FOUR'), true))
assert(!requestBowl(game, score, true, modes.status)); modes.menu(); assert.equal(modes.status, 'MENU')
assert.equal(generateTarget(() => 0), 30); assert.equal(generateTarget(() => 1), 45)
let draw = 0
const replay = new GameModes(new SessionScore(), () => (draw += .1))
replay.choose('TARGET_CHASE'); const oldTarget = replay.target
replay.choose('TARGET_CHASE'); assert.notEqual(replay.target, oldTarget)
const { generateDelivery } = load('bowlingVariation'), { bowlerPose, releaseTime } = load('bowling')
const { GAMEPLAY: T } = load('gameplayTuning'), release = bowlerPose(releaseTime(.4), .4).hand
function plan(type, variation, draw = .5) { return generateDelivery(type, () => draw, false, release, undefined, 0, variation) }
assert.equal(plan('FAST','FULL',0).speed, 13); assert.equal(plan('SPIN','FLIGHTED',0).speed, 8.5)
assert.equal(plan('FAST','GOOD_LENGTH',1).speed, 21); assert.equal(plan('SPIN','STRAIGHTER',1).speed, 14)
assert(plan('FAST','GOOD_LENGTH').speed > plan('SPIN','OFF_SPIN').speed)
const off = plan('SPIN','OFF_SPIN'), flighted = plan('SPIN','FLIGHTED')
assert(off.velocity.y <= .3); assert(flighted.velocity.y > off.velocity.y)
assert(flighted.velocity.y ** 2 / (2 * flighted.flightGravity) > off.velocity.y ** 2 / (2 * off.flightGravity))
const oldT1 = (off.bounceZ - release.z) / off.speed
const oldVy = (T.groundY + DELIVERY.radius - release.y + .5 * DELIVERY.gravity * oldT1 ** 2) / oldT1
assert(off.velocity.y < oldVy)
const pose = { position: new Vector3(100,100,100), rotation: new Quaternion() }
for (const variation of ['OFF_SPIN','LEG_SPIN','TOP_SPIN','STRAIGHTER','FLIGHTED']) {
  for (const draw of [0,.5,.95,1]) {
    const p = plan('SPIN',variation,draw), g = new Delivery()
    g.start(); g.plan = p; g.bounceResponse = p.bounce; g.released = true; g.position.copy(release); g.velocity.copy(p.velocity)
    for (let i = 0; i < 2400 && g.position.z < -.65; i++) {
      g.step(1/240,pose,pose,false); assert(g.position.toArray().every(Number.isFinite))
    }
    assert(g.bounced); assert(g.position.y > .08 && g.position.y < 1.6, variation + ' stays hittable')
    if (variation === 'OFF_SPIN' || variation === 'LEG_SPIN') assert(Math.abs(p.spinImpulse) >= 1.45 && Math.abs(p.spinImpulse) <= 1.85)
    if (variation === 'TOP_SPIN') assert.equal(p.forwardImpulse,.72)
  }
}
const app = fs.readFileSync(path.join(__dirname,'../src/App.tsx'),'utf8')
assert(app.includes('modes.status === \'PLAYING\''))
assert(app.includes('modes={modes}'))
const view = fs.readFileSync(path.join(__dirname,'../src/ModeOverlay.tsx'),'utf8')
for (const text of ['FREE PLAY','TARGET CHASE','START INNINGS','CHANGE MODE','INNINGS OVER','TARGET CHASED','TARGET MISSED']) assert(view.includes(text))
console.log('PASS: unlimited 52-over Free Play, one-wicket finish, chase win/loss, legal-ball counts, replay/menu guards; unchanged minimums, higher speed tails, lower spin flight, loopier flighted, real bounce/hittable trajectories')
