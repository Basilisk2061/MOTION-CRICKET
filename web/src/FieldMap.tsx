import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { FieldingController } from './fielding'
import type { KeeperPresentation } from './keeperPresentation'
import type { OverTactics } from './overTactics'
import { fieldMapPoint } from './fieldPlans'

export default function FieldMap({fielding,keeper,tactics,debug}:{fielding:FieldingController;keeper:KeeperPresentation;tactics:OverTactics;debug:boolean}) {
  const dots=useRef<SVGCircleElement[]>([]),label=useRef<SVGTextElement|null>(null),age=useRef(0)
  const keeperLabel=useRef<SVGTextElement|null>(null)
  const lastTrace=useRef<Record<string,unknown>|null>(null)
  useEffect(()=>{
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg')
    svg.setAttribute('viewBox','0 0 100 112');svg.setAttribute('aria-label','Live cricket field positions');svg.setAttribute('role','img')
    svg.classList.add('live-field-map')
    const add=(name:string,attrs:Record<string,string>)=>{const node=document.createElementNS(ns,name);Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,v));svg.appendChild(node);return node}
    add('ellipse',{cx:'50',cy:'50',rx:'46',ry:'46',fill:'#193d2c',stroke:'#eeeeee','stroke-width':'.8'})
    add('ellipse',{cx:'50',cy:'50',rx:'27',ry:'30',fill:'none',stroke:'#b8c6a4','stroke-width':'.4','stroke-dasharray':'1.2 1.5'})
    add('rect',{x:'47.5',y:'33',width:'5',height:'27',fill:'#bc9f69'})
    add('circle',{cx:'50',cy:'60',r:'1.5',fill:'#fff'})
    add('line',{x1:'44',x2:'56',y1:'60',y2:'60',stroke:'#ffffff','stroke-width':'.7'})
    const top=add('text',{x:'50',y:'30',fill:'#eee','text-anchor':'middle','font-size':'4'});top.textContent='BOWLER'
    const bottom=add('text',{x:'50',y:'68',fill:'#eee','text-anchor':'middle','font-size':'4'});bottom.textContent='BATSMAN'
    label.current=add('text',{x:'50',y:'106',fill:'#eeeeee','text-anchor':'middle','font-size':'4.2'}) as SVGTextElement
    dots.current=Array.from({length:10},(_,i)=>add('circle',{r:i===9?'1.8':'1.5',fill:i===9?'#ffffff':'#e8ece1'}) as SVGCircleElement)
    keeperLabel.current=add('text',{fill:'#ffffff','font-size':'4'}) as SVGTextElement
    keeperLabel.current.textContent='WK'
    document.body.appendChild(svg)
    return()=>{svg.remove();dots.current=[]}
  },[])
  useFrame((_,dt)=>{
    age.current+=dt;if(age.current<.1)return;age.current=0;
    [...fielding.fielders.map(f=>f.position),keeper.position].forEach((p,i)=>{
      const v=fieldMapPoint(p),dot=dots.current[i];if(!dot)return
      dot.setAttribute('cx',String(v.x));dot.setAttribute('cy',String(v.y))
      if(i===9&&keeperLabel.current){keeperLabel.current.setAttribute('x',String(v.x+2));keeperLabel.current.setAttribute('y',String(v.y+1))}
    })
    if(label.current)label.current.textContent=debug?(tactics.field?.replaceAll('_',' ')??''):''
    if(debug && tactics.trace && tactics.trace!==lastTrace.current){
      lastTrace.current=tactics.trace
      console.debug('OVER FIELD PLAN',{...tactics.trace,rendered:fielding.fielders.map(f=>({role:f.role,XYZ:f.renderedPosition?.toArray()}))})
    }
  })
  return null
}
