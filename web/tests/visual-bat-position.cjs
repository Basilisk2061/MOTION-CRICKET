const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { Vector3 } = require('three')
const moduleResult = { exports: {} }
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/visualBatPosition.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText
new Function('require', 'module', 'exports', code)(require, moduleResult, moduleResult.exports)
const { VisualBatPosition } = moduleResult.exports
const visual = new VisualBatPosition()
const target = new Vector3(0, 1, 0)
visual.update(target, 1 / 60)
for (let i = 0; i < 150; i++) {
  target.set(Math.sin(i) * .005, 1 + Math.cos(i) * .005, Math.sin(i * 2) * .005)
  const before = target.clone()
  assert.equal(visual.update(target, 1 / 60).distanceTo(new Vector3(0, 1, 0)), 0)
  assert.deepEqual(target, before)
}
// Slow continuous translation releases immediately outside the visual radius.
let previous = visual.position.x
for (let i = 1; i <= 80; i++) {
  target.set(i * .003, 1, 0)
  visual.update(target, 1 / 60)
  assert.ok(visual.position.x >= previous)
  assert.ok(visual.position.distanceTo(target) <= visual.deadband)
  previous = visual.position.x
}
target.set(1, 1.3, -.4)
assert.equal(visual.update(target, 1 / 60).distanceTo(target), 0)
for (let i = 0; i < 12; i++) visual.update(target, 1 / 60)
const anchor = visual.position.clone()
for (let i = 0; i < 100; i++) {
  target.copy(anchor).add(new Vector3(Math.sin(i) * .004, 0, Math.cos(i) * .004))
  assert.equal(visual.update(target, 1 / 60).distanceTo(anchor), 0)
}
visual.update(new Vector3(NaN, Infinity, 0), 1 / 60)
assert.ok(visual.position.toArray().every(Number.isFinite))
console.log('PASS: visual jitter, slow/fast follow, settling, immutable gameplay input, finite output')
const adaptive = new VisualBatPosition()
adaptive.update(new Vector3(), 1 / 60)
for (let i = 0; i < 150; i++) {
  const sample = new Vector3(i % 2 ? .009 : -.009, 0, 0)
  const original = sample.clone()
  assert.equal(adaptive.update(sample, 1 / 60).length(), 0)
  assert.deepEqual(sample, original)
  assert.ok(adaptive.deadband >= .010 && adaptive.deadband <= .020)
}
assert.ok(adaptive.deadband > .015)
for (let i = 0; i < 180; i++)
  adaptive.update(new Vector3(i % 2 ? .0002 : -.0002, 0, 0), 1 / 60)
assert.ok(adaptive.deadband < .012)
assert.ok(adaptive.update(new Vector3(.014, 0, 0), 1 / 60).x > 0)
assert.equal(adaptive.update(new Vector3(.4, .3, -.2), 1 / 60).distanceTo(new Vector3(.4, .3, -.2)), 0)
console.log('PASS: adaptive micro-jitter bounds, calm decay, immediate release, direct fast movement')
