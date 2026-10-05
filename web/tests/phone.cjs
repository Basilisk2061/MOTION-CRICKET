const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { Quaternion, Vector3 } = require('three')
const { WebSocket } = require('ws')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { pathToFileURL } = require('node:url')

function load(name) {
  const source = fs.readFileSync(path.join(__dirname, '../src', `${name}.ts`), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => id.startsWith('./') ? load(id.slice(2)) : require(id), module, module.exports)
  return module.exports
}
const p = load('phone'), c = load('controller'), { Delivery, sweptContact } = load('delivery')
const closeQ = (a, b) => assert(a.angleTo(b) < 1e-6)
const neutral = p.deviceQuaternion(120, 80, -35)
const neutralBat = p.relativeBat(neutral, neutral)
const expectedBlade = new Vector3(0, 1, 0).applyQuaternion(neutral).applyQuaternion(p.worldToPlayer(neutral))
assert(new Vector3(0, -1, 0).applyQuaternion(neutralBat).distanceTo(expectedBlade) < 1e-6)
const moved = p.deviceQuaternion(140, 95, -15)
assert(p.relativeBat(neutral, moved).angleTo(neutralBat) > .1)
closeQ(p.relativeBat(neutral, neutral), neutralBat)
const wrapNeutral = p.deviceQuaternion(359, 0, 0)
assert(p.relativeBat(wrapNeutral, p.deviceQuaternion(1, 0, 0)).angleTo(p.relativeBat(wrapNeutral, wrapNeutral)) < .04)
// Apply known player-space rotations to arbitrary tilted grips. Orientation and
// gyro must agree in the player frame, not the phone's tilted neutral frame.
for (const grip of [neutral, p.deviceQuaternion(0, 45, 0), p.deviceQuaternion(30, 0, 0)]) {
  const basis = p.worldToPlayer(grip), rest = p.relativeBat(grip, grip)
  assert(new Vector3(0, 0, 1).applyQuaternion(basis).distanceTo(new Vector3(0, 1, 0)) < 1e-6)
  for (const axis of [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]) {
    const delta = new Quaternion().setFromAxisAngle(axis, .1)
    const current = basis.clone().invert().multiply(delta).multiply(basis).multiply(grip)
    closeQ(p.relativeBat(grip, current), delta.clone().multiply(rest))
    const deviceRate = axis.clone().applyQuaternion(basis.clone().invert()).applyQuaternion(current.clone().invert())
      .multiplyScalar(180 / Math.PI)
    assert(p.gyroToBat({ beta: deviceRate.x, gamma: deviceRate.y, alpha: deviceRate.z }, p.relativeBat(grip, current)).distanceTo(axis) < 1e-6)
  }
}
const hand = c.parseController(JSON.stringify({ type: 'controller', timestamp: 1, calibrated: true,
  state: 'DEGRADED', sampleAccepted: true, position: { x: .5, y: .5, z: .5 }, velocity: { x: 1, y: 1, z: 1 } }))
const grip = p.deviceQuaternion(0, 45, 0), frame = p.worldToPlayer(grip)
const blade = rotation => new Vector3(0, -1, 0).applyQuaternion(rotation)
const restBlade = blade(p.relativeBat(grip, grip))
const tilt = (axis, angle) => blade(p.relativeBat(grip,
  frame.clone().invert().multiply(new Quaternion().setFromAxisAngle(axis, angle)).multiply(frame).multiply(grip)))
assert(tilt(new Vector3(1,0,0), .1).y > restBlade.y)
assert(tilt(new Vector3(1,0,0), -.1).y < restBlade.y)
assert(tilt(new Vector3(0,1,0), -.1).x > restBlade.x)
assert(tilt(new Vector3(0,1,0), .1).x < restBlade.x)
assert.equal(c.cvPositionStatus(true, { message: hand, received: 100 }, 120), 'DEGRADED')
const target = c.toPlayerPosition(hand.position), base = new Vector3(...c.BASE_RIGHT_HAND_POSITION)
assert(target.x > base.x && target.y > base.y && target.z < base.z)
assert(Math.abs(target.z - base.z) < .2)
const display = base.clone()
c.stepHandle(display, target, 1/60, 1)
assert(display.x > base.x && display.y > base.y && display.z < base.z)
assert.equal(c.cvPositionStatus(true, { message: { ...hand, sampleAccepted: false }, received: 100 }, 120), 'REJECTED / HOLD')
assert.equal(c.cvPositionStatus(true, { message: hand, received: 100 }, 1000), 'STALE')
assert.equal(c.cvPositionStatus(true, { message: { ...hand, calibrated: false }, received: 100 }, 120), 'NOT_CALIBRATED')
const extreme = c.toPlayerPosition({ x: 100, y: 100, z: 100 }).sub(base)
assert(extreme.length() <= c.HANDLE_RANGE.length() + 1e-6)
const limited = base.clone(); c.stepHandle(limited, c.toPlayerPosition({x:100,y:100,z:100}), 1/60, 10)
assert(limited.distanceTo(base) <= 4/60 + 1e-6)
assert.equal(c.toPlayerVelocity({ x: 1, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }).x, 0)
const axis = new Vector3(0, 1, 0).applyQuaternion(p.PHONE_TO_BAT)
assert(axis.distanceTo(new Vector3(0, -1, 0)) < 1e-6)
assert(new Vector3(0, 0, 1).applyQuaternion(p.PHONE_TO_BAT).distanceTo(new Vector3(0, 0, 1)) < 1e-6)
const omega = p.gyroToBat({ alpha: 0, beta: 180, gamma: 0 }, new Quaternion())
assert(omega.distanceTo(new Vector3(-Math.PI, 0, 0)) < 1e-6)
assert(p.pointVelocity(new Vector3(1, 0, 0), new Vector3(0, 0, 2), new Vector3(0, -.5, 0)).distanceTo(new Vector3(2, 0, 0)) < 1e-6)
assert(p.quaternionVelocity(new Quaternion(), new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), .1), .1).distanceTo(new Vector3(0, 0, 1)) < 1e-6)
assert.equal(p.phoneStatus(true, 100, 200), 'CONNECTED')
assert.equal(p.phoneStatus(true, 100, 500), 'STALE')
assert.equal(p.phoneStatus(false, 100, 200), 'DISCONNECTED')
const message = { type: 'phone-controller', timestamp: 1, calibrated: true, calibrationId: 1,
  orientation: { x: 0, y: 0, z: 0, w: 1 }, angularVelocity: { x: 0, y: 0, z: 0 },
  acceleration: null, accelerationMagnitude: null, swingSpeed: 0, sensorHz: 60, screenAngle: 0 }
assert(p.parsePhone(JSON.stringify(message)))
// Screen UI rotation does not alter fixed hardware-axis pose.
assert.deepEqual(p.parsePhone(JSON.stringify({ ...message, screenAngle: 90 })).orientation, message.orientation)
assert.equal(p.parsePhone(JSON.stringify({ ...message, orientation: { x: 0, y: 0, z: 0, w: 0 } })), null)
const pose = x => ({ position: new Vector3(x, 1.05, -.65), rotation: new Quaternion() })
assert(sweptContact(new Vector3(.32, .6, -2), new Vector3(.32, .6, 1), pose(.32), pose(.32)))
const miss = new Delivery(() => .5); miss.start()
for (let i = 0; i < 1800; i++) {
  miss.step(1 / 120, pose(3), pose(3), true)
  if (!miss.outcome) assert.equal(miss.camera, 'BATSMAN_VIEW')
}
assert.equal(miss.outcome, 'MISSED'); assert.equal(miss.state, 'READY')
const hit = new Delivery(() => .5); hit.start()
for (let i = 0; i < 1200 && !hit.outcome; i++) hit.step(1 / 120, pose(.32), pose(.32), true,
  { handleVelocity: new Vector3(), angularVelocity: new Vector3(0, 0, 3) })
assert.equal(hit.outcome, 'HIT'); assert.equal(hit.camera, 'BALL_FOLLOW'); assert(hit.velocity.x > 0)

async function relayTest() {
  const { phoneRelay } = await import(pathToFileURL(path.join(__dirname, '../phone-relay.mjs')))
  const server = createServer()
  phoneRelay().configureServer({ httpServer: server })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const url = `ws://127.0.0.1:${server.address().port}/phone-ws`
  const clients = []
  const connect = role => {
    const ws = new WebSocket(`${url}?role=${role}`); clients.push(ws)
    ws.messages = []; ws.on('message', raw => ws.messages.push(JSON.parse(raw)))
    return ws
  }
  const wait = async predicate => {
    for (let i = 0; i < 100; i++) {
      if (predicate()) return
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    assert.fail('Relay condition timed out')
  }
  try {
    const game = connect('game'); await once(game, 'open')
    await wait(() => game.messages.some(m => m.type === 'phone-status' && !m.connected))
    const phone = connect('phone'); await once(phone, 'open')
    await wait(() => game.messages.some(m => m.type === 'phone-status' && m.connected))
    phone.send('invalid JSON')
    for (let timestamp = 1; timestamp <= 30; timestamp++) phone.send(JSON.stringify({ ...message, timestamp }))
    await wait(() => game.messages.some(m => m.type === 'phone-controller' && m.timestamp === 30))
    assert(game.messages.filter(m => m.type === 'phone-controller').length < 30)
    phone.close(); await once(phone, 'close')
    await wait(() => game.messages.at(-1)?.connected === false)
    const reconnect = connect('phone'); await once(reconnect, 'open')
    reconnect.send(JSON.stringify({ ...message, timestamp: 31 }))
    await wait(() => game.messages.some(m => m.timestamp === 31))
    console.log('PASS: gravity-aligned up/down/left/right, tilted grips, gyro consistency, neutral/return/wrap, accepted DEGRADED CV position, bounded handle movement, stale/rejected holds, point velocity, collision/camera gates, relay reconnect')
  } finally {
    for (const ws of clients) ws.terminate()
    await new Promise(resolve => server.close(resolve))
  }
}
relayTest().catch(error => { console.error(error); process.exitCode = 1 })
