const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
;(async()=>{
 const {phoneSetupInfo,phoneSetupPlugin}=await import('../phone-setup.mjs')
 // Synthetic network fixtures, not the developer's actual LAN address.
 const interfaces={Ethernet:[{family:'IPv4',internal:false,address:'192.168.10.20'}],Loopback:[{family:'IPv4',internal:true,address:'127.0.0.1'}],VirtualBox:[{family:'IPv4',internal:false,address:'192.168.56.1'}]}
 const certificate={checkIP:ip=>ip==='192.168.10.20'?ip:undefined}
 const info=phoneSetupInfo({enabled:true,interfaces,certificate,port:5173});assert.deepEqual(info.urls,['https://192.168.10.20:5173/controller'])
 assert.equal(phoneSetupInfo({enabled:false,interfaces,certificate}).urls.length,0);assert.equal(phoneSetupInfo({enabled:true,interfaces,certificate:{checkIP:()=>undefined}}).urls.length,0)
 let endpoint;phoneSetupPlugin(false).configureServer({middlewares:{use:(route,fn)=>{assert.equal(route,'/phone-setup');endpoint=fn}},httpServer:{address:()=>({port:5173})},config:{server:{port:5173}}})
 let payload;endpoint({method:'GET'},{setHeader(){},end:v=>payload=JSON.parse(v)});assert.deepEqual(payload.urls,[])
 const m={exports:{}},code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/PhoneSetup.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
 const load=require('./tactical-loader.cjs'),qr=require('qrcode-generator')
 new Function('require','module','exports',code)(id=>id==='qrcode-generator'?{default:qr}:id.startsWith('./')?load(id.slice(2)):require(id),m,m.exports)
 const {validPhoneURL,phoneQR}=m.exports
 for(const url of ['https://localhost:5173/controller','https://127.0.0.1:5173/controller','http://192.168.10.20:5173/controller','https://0.0.0.0/controller']){assert(!validPhoneURL(url));assert.equal(phoneQR(url),'')}
 const url=info.urls[0];assert(validPhoneURL(url));const expected=qr(0,'M');expected.addData(url);expected.make();assert.equal(phoneQR(url),expected.createSvgTag({cellSize:4,margin:16,scalable:true}),'QR encodes exactly the visible URL')
 const state=[],effects=[];let cursor=0,first=true
 const react={useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>state[i]=v]},useMemo:f=>f(),useEffect:f=>{if(first)effects.push(f)}}
 const live={exports:{}}
 new Function('require','module','exports',code)(id=>id==='react'?react:id==='qrcode-generator'?{default:qr}:id.startsWith('./')?load(id.slice(2)):require(id),live,live.exports)
 global.location={origin:'https://localhost:5173'};global.fetch=async path=>{assert.equal(path,'/phone-setup');return {ok:true,json:async()=>info}}
 const render=()=>{cursor=0;const tree=live.exports.default({status:'CONNECTED',calibrated:true});first=false;return tree}
 render();effects.forEach(f=>f());await new Promise(resolve=>setImmediate(resolve));const tree=render()
 function nodes(n,out=[]){if(n&&typeof n==='object'){out.push(n);for(const c of [n.props?.children].flat(Infinity))if(c!=null)nodes(c,out)}return out}
 const all=nodes(tree),qrNode=all.find(n=>n.props?.className==='phone-qr'),link=all.find(n=>n.props?.className==='phone-controller-url')
 assert.equal(qrNode.props['data-value'],url);assert.equal(link.props.href,url);assert.equal(link.props.children,url);assert.equal(qrNode.props.dangerouslySetInnerHTML.__html,phoneQR(url))
 console.log('PASS: certificate/interface-verified LAN URL, no loopback/plain HTTP/guessed URLs, desktop-only/unmatched-cert handling, metadata endpoint, real QR equals controller URL')
})().catch(error=>{console.error(error);process.exitCode=1})
