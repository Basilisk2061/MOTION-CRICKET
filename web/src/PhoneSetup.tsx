import { useEffect, useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'
import { controllerLabel } from './battingHelp'

export function validPhoneURL(value:unknown):value is string{
 try{const u=new URL(String(value));return u.protocol==='https:'&&u.pathname==='/controller'&&!u.search&&!u.hash&& !['localhost','127.0.0.1','0.0.0.0','[::1]'].includes(u.hostname)&&!u.hostname.endsWith('.localhost')&&!u.username&&!u.password}catch{return false}
}
export function phoneQR(value:string){if(!validPhoneURL(value))return '';const code=qrcode(0,'M');code.addData(value);code.make();return code.createSvgTag({cellSize:4,margin:16,scalable:true})}
export default function PhoneSetup({status,calibrated}:{status:string;calibrated:boolean}){
 const [urls,setURLs]=useState<string[]>([]),[selected,setSelected]=useState(''),[message,setMessage]=useState('Finding the secure phone link…'),[copied,setCopied]=useState('')
 useEffect(()=>{let alive=true;const abort=new AbortController()
  fetch('/phone-setup',{signal:abort.signal}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(info=>{
   if(!alive)return;const found:Array<string>=Array.isArray(info.urls)?info.urls.filter(validPhoneURL):[]
   setURLs(found);setSelected(found.find(url=>new URL(url).origin===location.origin)??(found.length===1?found[0]:''));setMessage(typeof info.message==='string'?info.message:'Phone setup unavailable.')
  }).catch(()=>{if(alive)setMessage('The secure phone link is unavailable in this session. Ask the laptop owner to start phone-enabled HTTPS setup.')})
  return()=>{alive=false;abort.abort()}
 },[])
 const svg=useMemo(()=>phoneQR(selected),[selected])
 return <div className="phone-setup-content">
  <strong className="setup-live-status" role="status">{controllerLabel(status,calibrated)}</strong>
  <p>Use the same network as this laptop. Scan the code or open the link on your phone.</p>
  {urls.length>1&&<label>Choose your laptop’s network address<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select network address</option>{urls.map(url=><option key={url}>{url}</option>)}</select></label>}
  {selected?<div className="phone-link-layout">
   <div className="phone-qr" role="img" aria-label="QR code for the phone controller" data-value={selected} dangerouslySetInnerHTML={{__html:svg}}/>
   <div><a className="phone-controller-url" href={selected} target="_blank" rel="noreferrer">{selected}</a>
    <button onClick={async()=>{try{await navigator.clipboard.writeText(selected);setCopied('Link copied')}catch{setCopied('Select and copy the link above')}}}>Copy link</button><small role="status">{copied}</small></div>
  </div>:<p className="setup-unavailable" role="status">{message}</p>}
  <ol><li>Open the link, then tap <b>Enable motion</b> and allow sensor access.</li><li>Hold your normal batting grip and tap <b>Calibrate</b>.</li><li>Keep the page open and the phone securely in your hand.</li></ol>
  <details><summary>Connection help</summary><p>Use the same trusted home network, not guest Wi-Fi. Open the secure link shown above. For this local setup, the phone must trust the laptop owner’s development certificate; ask them for help if the page is not trusted. Do not bypass certificate warnings or trust unknown certificates.</p><p>Keep the controller page visible. If the signal goes stale, unlock the phone and return to that page.</p></details>
 </div>
}
