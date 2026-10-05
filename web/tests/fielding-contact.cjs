const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const cache = new Map()
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const m = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', name + '.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
  new Function('require','module','exports',code)(id => id.startsWith('./') ? load(id.slice(2)) : require(id), m, m.exports)
  cache.set(name, m.exports); return m.exports
}
const { FieldingController, fielderInteraction, FIELDING } = load('fielding')
const { Delivery } = load('delivery')
function contact(speed, offset, height = .06) {
  const g = new Delivery(), f = new FieldingController()
  g.position.set(-10, height, -4); g.velocity.set(0, 0, speed)
  f.startFielding(g.position, g.velocity)
  const active = f.activeFielder
  active.state = 'CHASING'; active.position.set(-10 + offset, 0, -4)
  const position = g.position, velocity = g.velocity, point = position.clone()
  const update = f.update(.001, position, velocity, true)
  assert.equal(g.position, position); assert.equal(g.velocity, velocity)
  assert(position.equals(point), 'contact never teleports the real ball')
  assert.equal(f.fielders.filter(x => x.active).length, 1)
  return { g, f, update }
}
for (const speed of [5, 12]) assert(contact(speed, .1).update.captureBall)
for (const speed of [25, 40, 100]) {
  const { g, f, update } = contact(speed, .1)
  assert(!update.captureBall && !update.caught && !g.fieldingHeld)
  assert(Math.hypot(g.velocity.x, g.velocity.z) <= 1.2)
  assert.equal(g.velocity.x, 0, 'central blocks do not invent a lateral kick')
  const next = f.update(.016, g.position, g.velocity, true)
  assert(next.captureBall, 'normal collection is available immediately after a block')
}
const glance = contact(40, .35)
assert(!glance.update.captureBall && !glance.g.fieldingHeld)
assert(glance.g.velocity.length() < 40 && Math.abs(glance.g.velocity.x) > 0)
const opposite = contact(40, -.35)
assert.equal(Math.sign(opposite.g.velocity.x), -Math.sign(glance.g.velocity.x))
for (const height of [.06, 1.2]) {
  const outside = contact(40, 1.15, height)
  assert(!outside.update.captureBall); assert.equal(outside.g.velocity.length(), 40)
}
assert(contact(15, .1, 1.2).update.caught, 'manageable central airborne catch preserved')
const hardAir = contact(40, .1, 1.2)
assert(!hardAir.update.captureBall && !hardAir.update.caught)
assert(hardAir.g.velocity.length() < 2, 'hard central airborne contact is blocked, not ignored')
const airGlance = contact(40, .5, 1.2)
assert(!airGlance.update.captureBall && airGlance.g.velocity.length() < 40)
for (const airborne of [false, true]) {
  const radius = airborne ? FIELDING.CATCH_RADIUS : FIELDING.COLLECTION_RADIUS
  for (const speed of [5, 20, 40, 100]) {
    assert.notEqual(fielderInteraction(radius, speed, airborne), 'BEAT')
    assert.equal(fielderInteraction(radius + .001, speed, airborne), 'BEAT')
  }
}
console.log('PASS A–F: clean pickup/catch, central hard ground/air block, live glancing deflection, outside-reach miss, same ball/no snap, immediate post-block collection')
