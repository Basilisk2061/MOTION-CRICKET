import { networkInterfaces } from 'node:os'
import { X509Certificate } from 'node:crypto'

export function phoneSetupInfo({enabled,interfaces=networkInterfaces(),certificate,port=5173}) {
  if(!enabled)return {urls:[],message:'This session is desktop-only. Phone motion needs the phone-enabled secure server.'}
  const cert=typeof certificate==='string'||Buffer.isBuffer(certificate)?new X509Certificate(certificate):certificate
  const addresses=Object.entries(interfaces).filter(([name])=>!/(virtual|vbox|vmware|loopback|hamachi|tailscale)/i.test(name))
    .flatMap(([,entries])=>entries??[]).filter(a=>!a.internal&&a.family==='IPv4')
    .map(a=>a.address).filter(ip=>/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)&&cert?.checkIP(ip))
  const urls=[...new Set(addresses)].sort().map(ip=>`https://${ip}:${port}/controller`)
  return {urls,message:urls.length?'Use the address for the network shared by your phone and laptop.':'No active local-network address matches the secure certificate. Ask the laptop owner to update phone setup.'}
}
export function phoneSetupPlugin(enabled,certificate){return {
  name:'motion-phone-setup',
  configureServer(server){server.middlewares.use('/phone-setup',(req,res)=>{
    if(req.method!=='GET'){res.statusCode=405;res.end();return}
    const address=server.httpServer?.address(),port=typeof address==='object'&&address?address.port:server.config.server.port
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store')
    res.end(JSON.stringify(phoneSetupInfo({enabled,certificate,port})))
  })}
}}
