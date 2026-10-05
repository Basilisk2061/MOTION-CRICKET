import { WebSocketServer, WebSocket } from 'ws'

// Development-only, one phone, replaceable latest sample, no historical queue.
export function phoneRelay() {
  return {
    name: 'motion-cricket-phone',
    configureServer(server) {
      const relay = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false })
      let phone = null, latest = null, version = 0, received = 0
      const games = new Map()
      const labs = new Map()
      const status = () => JSON.stringify({ type: 'phone-status', connected: !!phone })
      const send = (socket, data) => {
        if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 4096) return false
        socket.send(data); return true
      }
      const announce = () => { for (const game of games.keys()) send(game, status()) }
      const upgrade = (request, socket, head) => {
        const url = new URL(request.url, 'http://local')
        if (url.pathname !== '/phone-ws') return
        // Only pages served by this host may use the LAN relay.
        try {
          if (request.headers.origin && new URL(request.headers.origin).host !== request.headers.host) {
            socket.destroy(); return
          }
        } catch { socket.destroy(); return }
        relay.handleUpgrade(request, socket, head, ws => {
          ws.alive = true
          ws.on('pong', () => { ws.alive = true })
          ws.on('error', () => ws.close())
          if (url.searchParams.get('role') === 'phone') {
            if (phone) { ws.close(1008, 'Another phone is connected'); return }
            phone = ws; latest = null; version++; announce()
            if(labs.size)send(phone,JSON.stringify({type:'bowling-lab-state',active:true,ready:[...labs.values()].some(Boolean)}))
            ws.on('message', (data, binary) => {
              if (binary) return
              try {
                const m = JSON.parse(data.toString())
                const target=m.target&&[m.target.x,m.target.z].every(Number.isFinite)?{x:m.target.x,z:m.target.z}:null
                if((m.type==='BOWLING_POSE'||m.type==='BOWLING_RELEASE')&&m.target!=null&&!target)return
                const motion=m.motion&&['IDLE','READY','MOTION_STARTED','COOLDOWN'].includes(m.motion.state)
                  &&[m.motion.filtered,m.motion.peak,m.motion.paceMetric,m.motion.angle].every(Number.isFinite)
                  &&Array.isArray(m.motion.history)&&m.motion.history.length<=60&&m.motion.history.every(Number.isFinite)
                  &&(m.motion.releaseAt===null||Number.isFinite(m.motion.releaseAt))
                  &&(!m.motion.gyro||[m.motion.gyro.x,m.motion.gyro.y,m.motion.gyro.z].every(Number.isFinite))
                  ?{state:m.motion.state,filtered:m.motion.filtered,peak:m.motion.peak,paceMetric:m.motion.paceMetric,
                    angle:m.motion.angle,history:m.motion.history,releaseAt:m.motion.releaseAt,...(m.motion.gyro?{gyro:m.motion.gyro}:{}),
                    ...(Number.isFinite(m.motion.coherence)?{coherence:m.motion.coherence}:{})}:null
                if(m.type==='BOWLING_POSE'){
                  const q=m.orientation,v=m.angularVelocity
                  if(typeof m.holding!=='boolean'||!Number.isFinite(m.timestamp)||!Number.isFinite(m.calibrationId)||m.calibrationId<1
                    ||!q||!v||![q.x,q.y,q.z,q.w,v.x,v.y,v.z].every(Number.isFinite)
                    ||Math.abs(Math.hypot(q.x,q.y,q.z,q.w)-1)>.05||Math.hypot(v.x,v.y,v.z)>80)return
                  const pose=JSON.stringify({type:'BOWLING_POSE',timestamp:m.timestamp,calibrationId:m.calibrationId,
                    orientation:q,angularVelocity:v,holding:m.holding,swingIntent:m.swingIntent==='IN'||m.swingIntent==='OUT'?m.swingIntent:'NONE',
                    ...(Number.isFinite(m.angularSpeed)&&m.angularSpeed>=0&&m.angularSpeed<=40?{angularSpeed:m.angularSpeed}:{}),
                    ...(target?{target}:{}),...(motion?{motion}:{})})
                  for(const game of labs.keys())send(game,pose)
                  return
                }
                if(m.type==='BOWLING_RELEASE'){
                  const q=m.orientation,v=m.angularVelocity
                  if(!['VOLUME_DOWN','TOUCH_RELEASE','AUTO_MOTION'].includes(m.source) || ![m.timestamp,m.id,m.calibrationId].every(Number.isFinite)
                    || m.id<1 || m.calibrationId<1 || !q || !v || ![q.x,q.y,q.z,q.w,v.x,v.y,v.z].every(Number.isFinite)
                    || Math.abs(Math.hypot(q.x,q.y,q.z,q.w)-1)>.05 || Math.hypot(v.x,v.y,v.z)>80)return
                  if(m.angularSpeed!==undefined&&(!Number.isFinite(m.angularSpeed)||m.angularSpeed<0||m.angularSpeed>40))return
                  const normalized=JSON.stringify({type:'BOWLING_RELEASE',source:m.source,timestamp:m.timestamp,id:m.id,
                    calibrationId:m.calibrationId,orientation:q,angularVelocity:v,
                    swingIntent:m.swingIntent==='IN'||m.swingIntent==='OUT'?m.swingIntent:'NONE',
                    ...(m.angularSpeed===undefined?{}:{angularSpeed:m.angularSpeed}),...(target?{target}:{})})
                  for(const [game,ready] of labs)if(ready){send(game,normalized);labs.set(game,false)}
                  return
                }
                if (m.type === 'REQUEST_BOWL') {
                  for (const game of games.keys()) send(game, JSON.stringify({ type: 'REQUEST_BOWL' }))
                  return
                }
                if (m.type !== 'phone-controller' || typeof m.calibrated !== 'boolean'
                  || !Number.isFinite(m.timestamp) || !m.orientation
                  || !['x', 'y', 'z', 'w'].every(k => Number.isFinite(m.orientation[k]))) return
                latest = JSON.stringify(m); received = Date.now(); version++
              } catch { /* Ignore malformed samples. */ }
            })
            ws.on('close', () => {
              if (phone === ws) { phone = null; latest = null; version++; announce() }
            })
          } else {
            games.set(ws, -1); send(ws, status())
            ws.on('message', (data, binary) => {
              if (binary) return
              try {
                const m = JSON.parse(data.toString())
                if(m.type==='bowling-lab-state' && typeof m.active==='boolean' && typeof m.ready==='boolean'){
                  if(m.active)labs.set(ws,m.ready);else labs.delete(ws)
                  if(phone)send(phone,JSON.stringify({type:'bowling-lab-state',active:labs.size>0,ready:[...labs.values()].some(Boolean)}))
                }
                if (m.type === 'bowl-ready' && typeof m.ready === 'boolean')
                  if(phone)send(phone, JSON.stringify({ type: 'bowl-ready', ready: m.ready }))
              } catch { /* Ignore unrelated game messages. */ }
            })
            ws.on('close', () => {
              games.delete(ws)
              if(labs.delete(ws) && phone)send(phone,JSON.stringify({type:'bowling-lab-state',active:labs.size>0,ready:[...labs.values()].some(Boolean)}))
            })
          }
        })
      }
      server.httpServer.on('upgrade', upgrade)
      const timer = setInterval(() => {
        if (!latest || Date.now() - received > 350) return
        for (const [game, sent] of games) {
          if (sent !== version && send(game, latest)) games.set(game, version)
        }
      }, 1000 / 60)
      const heartbeat = setInterval(() => {
        for (const ws of relay.clients) {
          if (!ws.alive) ws.terminate()
          else { ws.alive = false; ws.ping() }
        }
      }, 5000)
      server.httpServer.once('close', () => {
        clearInterval(timer); clearInterval(heartbeat)
        for (const ws of relay.clients) ws.terminate()
        relay.close()
      })
    },
  }
}
