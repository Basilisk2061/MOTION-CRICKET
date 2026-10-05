const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),load=require('./tactical-loader.cjs')
// Execute the actual phone component's selector/pointer handlers with retained hooks.
module.exports=function phoneFixture(controller,send){
 const hooks=[];let cursor=0
 const react={useEffect:()=>{},useState:initial=>{const i=cursor++;if(!(i in hooks))hooks[i]=initial;return[hooks[i],value=>{hooks[i]=typeof value==='function'?value(hooks[i]):value}]},
  useRef:initial=>{const i=cursor++;return hooks[i]??(hooks[i]={current:initial})}}
 const m={exports:{}},code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/PhoneBowlingPanel.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
 new Function('require','module','exports',code)(id=>id==='react'?react:id.endsWith('.css')?{}:id.startsWith('./')?load(id.slice(2)):require(id),m,m.exports)
 const props={controller,connected:true,fresh:true,enabled:true,ready:true,enable:()=>{},calibrate:()=>{}}
 let tree
 function render(){cursor=0;tree=m.exports.default(props)}
 function find(predicate,node=tree){if(!node||typeof node!=='object')return null;if(predicate(node))return node
  for(const child of [node.props?.children].flat(Infinity)){if(child==null)continue;const result=find(predicate,child);if(result)return result}return null}
 render()
 return {select(intent){find(n=>n.type==='button'&&n.props.children===intent).props.onClick();render()},
  selected(intent){return find(n=>n.type==='button'&&n.props.children===intent).props['aria-pressed']},
  target(u,v){find(n=>n.props?.className==='lab-pitch-target').props.onPointerDown({clientX:10+200*u,clientY:20+240*v,currentTarget:{getBoundingClientRect:()=>({left:10,top:20,width:200,height:240})}});render()},
  tap(){const clock=Date.now;Date.now=()=>controller.pose()?.timestamp??clock();try{find(n=>n.props?.className?.startsWith('touch-bowl')).props.onClick();render()}finally{Date.now=clock}},
  lift(){const button=find(n=>n.props?.className?.startsWith('touch-bowl'));button.props.onPointerUp?.();render()},
  refresh:render,
  marker(){return find(n=>n.type==='ellipse').props},
  texts(){const values=[];function walk(n){if(n==null)return;if(typeof n==='string')values.push(n);else if(typeof n==='object')for(const child of [n.props?.children].flat(Infinity))walk(child)}walk(tree);return values},
  bowl(peak=7){let at=controller.pose()?.timestamp??200;const q=require('three').Quaternion,v=require('three').Vector3,raw=controller.calibration.reference??new q();
   for(let i=0;i<14;i++){at+=20;controller.sample(raw,new v(),at)}
   for(let i=0;i<12;i++){at+=20;controller.sample(raw,new v(-2,0,0),at)}
   for(let i=0;i<=28;i++){at+=20;const speed=peak*Math.sin(Math.PI*i/28);controller.sample(raw,new v(speed,0,0),at)
    const event=controller.takeAutomaticRelease();if(event&&send)send(event)}render()},
  hold(){this.tap()},release(){this.bowl()}}
}
