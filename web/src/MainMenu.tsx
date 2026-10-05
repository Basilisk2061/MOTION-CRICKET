import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import type { GameMode } from './gameMode'
import { MENU_CHOICES, menuBack, type MenuPage } from './menuNavigation'
import './gameMenu.css'
import GuidedSetup from './GuidedSetup'
import { HELP_KEYS, hasSeen } from './battingHelp'
import type { SetupStatus } from './onboarding'

function Pavilion(){
 return <>
  <color attach="background" args={['#080c0f']}/><fog attach="fog" args={['#080c0f',7,23]}/>
  <ambientLight intensity={.3}/><directionalLight position={[2,6,3]} intensity={2.5} color="#d5dce3" castShadow/>
  <pointLight position={[3,2,-6]} intensity={22} color="#e0d6bf"/>
  <mesh rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[36,36]}/><meshStandardMaterial color="#1c2427" roughness={.9}/></mesh>
  {[-5,5].map(x=><mesh key={x} position={[x,2,-5]}><boxGeometry args={[.6,4,18]}/><meshStandardMaterial color="#151d21"/></mesh>)}
  {[0,1,2,3].map(i=><group key={i} position={[0,0,-i*4]}>
   <mesh position={[0,4,0]}><boxGeometry args={[10,.25,.4]}/><meshStandardMaterial color="#354046"/></mesh>
   <mesh position={[3,3.85,0]}><boxGeometry args={[2,.025,.12]}/><meshBasicMaterial color="#dad8c9"/></mesh>
  </group>)}
  <mesh position={[2.8,.17,-.5]} castShadow><sphereGeometry args={[.17,24,16]}/><meshStandardMaterial color="#6a1821" roughness={.7}/></mesh>
  <group position={[3.3,.65,-1]} rotation={[0,-.4,-.22]}>
   <mesh castShadow><boxGeometry args={[.22,1.1,.075]}/><meshStandardMaterial color="#b4a98a"/></mesh>
   <mesh position={[0,.8,0]}><cylinderGeometry args={[.025,.025,.5,12]}/><meshStandardMaterial color="#302f2b"/></mesh>
  </group>
 </>
}
export default function MainMenu({page,onNavigate,onChoose,onLab,phoneConnected,setupStatus,onSetupDone}:{page:MenuPage;onNavigate:(page:MenuPage)=>void;
 onChoose:(mode:GameMode)=>void;onLab:()=>void;phoneConnected:boolean;setupStatus:SetupStatus;onSetupDone:()=>void}){
 const [guide,setGuide]=useState<number|null>(()=>hasSeen(HELP_KEYS.tutorial)?null:0)
 const [firstVisit,setFirstVisit]=useState(()=>!hasSeen(HELP_KEYS.tutorial))
 const closeGuide=()=>{setGuide(null);setFirstVisit(false);onSetupDone()}
 const [selected,setSelected]=useState(0),buttons=useRef<(HTMLButtonElement|null)[]>([])
 const choices=MENU_CHOICES[page]
 const activate=(index:number)=>{
  const choice=choices[index]
  if(!choice){if(page!=='MAIN')onNavigate(menuBack(page));else setGuide(index===choices.length?0:2);return}
  if(choice.page)onNavigate(choice.page)
  else if(choice.mode)onChoose(choice.mode)
  else if(choice.lab)onLab()
 }
 useEffect(()=>setSelected(0),[page])
 useEffect(()=>{
  const count=choices.length+(page==='MAIN'?2:1)
  const key=(e:KeyboardEvent)=>{
   if(guide!==null)return
   if(e.key==='Escape' && page!=='MAIN'){e.preventDefault();onNavigate(menuBack(page))}
   if(e.key==='ArrowUp'||e.key==='ArrowDown'){
    e.preventDefault();const next=(selected+(e.key==='ArrowDown'?1:-1)+count)%count
    setSelected(next);buttons.current[next]?.focus()
   }
   // Enter on a focused button uses its native click, never dispatches twice.
   if(e.key==='Enter' && !(e.target instanceof HTMLButtonElement)){e.preventDefault();activate(selected)}
  }
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
 },[page,selected,onNavigate,choices,guide])
 return <main className="game-menu-screen">
  <Canvas shadows dpr={[1,1.5]} camera={{position:[1,1.6,6],fov:48}}><Pavilion/></Canvas>
  <section className="game-menu-content" aria-label={`${page} menu`}>
   <div className="game-menu-brand"><span>PHYSICAL PLAY. REAL CRICKET.</span><h1>MOTION<br/>CRICKET<span className="brand-dot">.</span></h1></div>
   <div key={page} className="game-menu-page">
    {page!=='MAIN' && <h2>{page}</h2>}
    {page==='TRAINING'||page==='RECORDS'?<p className="menu-coming">Coming soon.<br/><small>More ways to play are on the way.</small></p>:null}
    {page==='SETTINGS' && <p className="menu-coming">Controller setup is on your phone.<br/><small>Motion permissions and calibration remain in the controller.</small></p>}
    <nav aria-label="Game navigation">
     {choices.map((choice,index)=><button key={choice.label} ref={element=>{buttons.current[index]=element}}
      className={`game-menu-option ${selected===index?'selected':''}`} onMouseEnter={()=>setSelected(index)}
      onFocus={()=>setSelected(index)} onClick={()=>activate(index)}>
      <span className="menu-cursor" aria-hidden="true">›</span>{choice.label}
      {choice.description && <small>{choice.description}</small>}
     </button>)}
     {page==='MAIN'&&['HOW TO PLAY','TRACKER / SETUP'].map((label,index)=><button key={label}
      ref={element=>{buttons.current[choices.length+index]=element}}
      className={`game-menu-option menu-help ${selected===choices.length+index?'selected':''}`}
      onMouseEnter={()=>setSelected(choices.length+index)} onFocus={()=>setSelected(choices.length+index)}
      onClick={()=>setGuide(index===0?0:2)}><span className="menu-cursor" aria-hidden="true">›</span>{label}</button>)}
     {page!=='MAIN' && <button className={`game-menu-option menu-back ${selected===choices.length?'selected':''}`}
      ref={element=>{buttons.current[choices.length]=element}} onMouseEnter={()=>setSelected(choices.length)}
      onFocus={()=>setSelected(choices.length)} onClick={()=>onNavigate(menuBack(page))}>BACK</button>}
    </nav>
   </div>
  </section>
  <p className="game-menu-phone"><i className={phoneConnected?'online':''}/>PHONE — {phoneConnected?'CONNECTED':'NOT CONNECTED'}</p>
  <footer className="game-menu-footer"><span>MOTION CRICKET / EARLY ACCESS</span><span>↑ ↓ SELECT · ENTER PLAY · ESC BACK</span></footer>
  {guide!==null&&<GuidedSetup initialStep={guide} firstVisit={firstVisit} status={setupStatus}
    onClose={closeGuide} onComplete={()=>{closeGuide();onNavigate('BATTING')}}/>}
 </main>
}
