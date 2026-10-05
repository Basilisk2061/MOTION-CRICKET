const assert = require('node:assert/strict')
const http = require('node:http')
const { once } = require('node:events')
const { WebSocket } = require('ws')
;(async () => {
  const { phoneRelay } = await import('../phone-relay.mjs')
  const server = http.createServer()
  phoneRelay().configureServer({ httpServer: server })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const url = `ws://127.0.0.1:${server.address().port}/phone-ws`
  const phone = new WebSocket(url + '?role=phone'), game = new WebSocket(url + '?role=game')
  try {
    await Promise.all([once(phone, 'open'), once(game, 'open')])
    const readiness = once(phone, 'message')
    game.send(JSON.stringify({ type: 'bowl-ready', ready: true }))
    assert.deepEqual(JSON.parse((await readiness)[0]), { type: 'bowl-ready', ready: true })
    const request = new Promise(resolve => game.on('message', data => {
      if (JSON.parse(data).type === 'REQUEST_BOWL') resolve(JSON.parse(data))
    }))
    phone.send(JSON.stringify({ type: 'REQUEST_BOWL' }))
    assert.deepEqual(await request, { type: 'REQUEST_BOWL' })
    const busy = once(phone, 'message')
    game.send(JSON.stringify({ type: 'bowl-ready', ready: false }))
    assert.equal(JSON.parse((await busy)[0]).ready, false)
    console.log('PASS: existing socket relays phone BOWL requests and authoritative game readiness')
  } finally {
    phone.terminate(); game.terminate(); server.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
