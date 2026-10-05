import { useEffect, useMemo, useRef } from 'react'
import { BufferGeometry, Float32BufferAttribute, Color, InstancedMesh, Object3D, CanvasTexture, SRGBColorSpace } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const STANDS = [
  {start:0,length:.92,rows:16}, {start:1.05,length:.88,rows:14},
  {start:2.10,length:.92,rows:18}, {start:3.15,length:.90,rows:16},
  {start:4.20,length:.84,rows:20}, {start:5.25,length:.91,rows:15},
]
const rowAt=(row:number)=>({r:39+row*.86+(row>=8?2:0),y:row<8?1.7+row*.5:6.7+(row-8)*.6})

// Closed radial blocks give stands real volume, including end walls and risers.
function sector(inner:number,outer:number,bottom:number,top:number,start:number,length:number,slope=0) {
  const vertices:number[]=[]
  const point=(r:number,y:number,a:number)=>[Math.cos(a)*r,y+(r-inner)*slope,Math.sin(a)*r*1.2-9]
  const quad=(a:number[],b:number[],c:number[],d:number[])=>vertices.push(...a,...b,...c,...a,...c,...d)
  const slices=16
  for(let i=0;i<slices;i++) {
    const a=start+length*i/slices,b=start+length*(i+1)/slices
    quad(point(inner,top,a),point(inner,top,b),point(outer,top,b),point(outer,top,a))
    quad(point(inner,bottom,b),point(inner,top,b),point(inner,top,a),point(inner,bottom,a))
    quad(point(outer,bottom,a),point(outer,top,a),point(outer,top,b),point(outer,bottom,b))
    if(i===0) quad(point(inner,bottom,a),point(inner,top,a),point(outer,top,a),point(outer,bottom,a))
    if(i===slices-1) quad(point(outer,bottom,b),point(outer,top,b),point(inner,top,b),point(inner,bottom,b))
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));geometry.computeVertexNormals()
  return geometry
}
function labelTexture(lines:string[],background='#16383a') {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256
  const c=canvas.getContext('2d')!;c.fillStyle=background;c.fillRect(0,0,512,256)
  c.textAlign='center';c.fillStyle='#e8e3ce'
  lines.forEach((line,i)=>{c.font=i===0?'bold 35px sans-serif':'29px monospace';c.fillText(line,256,65+i*67)})
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;return texture
}
function Crowd() {
  const bodies=useRef<InstancedMesh>(null),heads=useRef<InstancedMesh>(null)
  const seats=useMemo(()=>STANDS.flatMap((stand,index)=>Array.from({length:stand.rows},(_,row)=>{
    const {r,y}=rowAt(row),count=Math.floor(stand.length*r/.57)
    return Array.from({length:count},(_,seat)=>{
      if(seat%20<2 || (seat*13+row*7+index)%29===0) return null // radial stair aisles + occasional empty seats
      const a=stand.start+(seat+.5)/count*stand.length
      return {x:Math.cos(a)*(r+.4),z:Math.sin(a)*(r+.4)*1.2-9,y:y+.26,angle:-a-Math.PI/2,color:(seat*7+row*3+index)%6}
    }).filter(s=>s!==null)
  }).flat()),[])
  useEffect(()=>{
    const o=new Object3D(),colors=['#516568','#8b8b79','#a3937d','#526879','#756861','#afb09c']
    seats.forEach((s,i)=>{
      o.position.set(s.x,s.y,s.z);o.rotation.y=s.angle;o.scale.set(.21,.25,.14);o.updateMatrix()
      bodies.current!.setMatrixAt(i,o.matrix);bodies.current!.setColorAt(i,new Color(colors[s.color]))
      o.position.y+=.35;o.scale.set(.105,.12,.105);o.updateMatrix();heads.current!.setMatrixAt(i,o.matrix)
    })
    for(const m of [bodies.current!,heads.current!]) {m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere()}
    bodies.current!.instanceColor!.needsUpdate=true
  },[seats])
  return <>
    <instancedMesh ref={bodies} args={[undefined,undefined,seats.length]}><sphereGeometry args={[1,6,4]} /><meshStandardMaterial roughness={1} /></instancedMesh>
    <instancedMesh ref={heads} args={[undefined,undefined,seats.length]}><sphereGeometry args={[1,6,4]} /><meshStandardMaterial color="#a18b71" roughness={1} /></instancedMesh>
  </>
}
function Stand({stand}:{stand:typeof STANDS[number]}) {
  const geometry=useMemo(()=>{
    const rows=Array.from({length:stand.rows},(_,i)=>{const {r,y}=rowAt(i);return sector(r,r+.86,0,y,stand.start,stand.length)})
    const merged=mergeGeometries(rows);rows.forEach(g=>g.dispose());return merged
  },[stand])
  const top=rowAt(stand.rows-1),mid=stand.start+stand.length/2
  const roof=useMemo(()=>sector(top.r-8,top.r+2,top.y+2.6,top.y+3.15,stand.start-.01,stand.length+.02,.045),[stand,top.r,top.y])
  const concourse=useMemo(()=>sector(45.9,48,5.2,5.4,stand.start,stand.length),[stand])
  useEffect(()=>()=>{geometry.dispose();roof.dispose();concourse.dispose()},[geometry,roof,concourse])
  return <>
    <mesh geometry={geometry} receiveShadow><meshStandardMaterial color="#657c80" roughness={.95} side={2} /></mesh>
    <mesh geometry={concourse}><meshStandardMaterial color="#c4c1af" roughness={1} side={2} /></mesh>
    <mesh geometry={roof}><meshStandardMaterial color="#c5cfca" roughness={.8} side={2} /></mesh>
    {[.08,.35,.65,.92].map((fraction,i)=>{
      const angle=stand.start+stand.length*fraction,r=top.r+.7,height=top.y+3
      return <group key={i} position={[Math.cos(angle)*r,0,Math.sin(angle)*r*1.2-9]} rotation={[0,-angle,0]}>
        <mesh position={[0,height/2,0]}><cylinderGeometry args={[.16,.23,height,6]} /><meshStandardMaterial color="#a6b5b2" /></mesh>
        <mesh position={[-4.5,height-.5,0]} rotation={[0,0,.08]}><boxGeometry args={[10,.30,.24]} /><meshStandardMaterial color="#637d80" /></mesh>
      </group>
    })}
    <group position={[Math.cos(mid)*39,0,Math.sin(mid)*39*1.2-9]} rotation={[0,-mid-Math.PI/2,0]}>
      <mesh position={[0,1.15,.08]}><boxGeometry args={[2.6,2.3,.20]} /><meshStandardMaterial color="#203237" /></mesh>
      <mesh position={[0,2.4,.18]}><boxGeometry args={[3.1,.30,.7]} /><meshStandardMaterial color="#c9c6b5" /></mesh>
    </group>
  </>
}
function Floodlights() {
  return <>{[-1,1].flatMap(x=>[-1,1].map(z=><group key={`${x}:${z}`} position={[x*34,0,z*36-9]} rotation={[0,Math.atan2(-x,-z),0]}>
    {[-.4,.4].map(a=><mesh key={a} position={[a,10,0]}><cylinderGeometry args={[.10,.18,20,6]} /><meshStandardMaterial color="#8f9f9d" /></mesh>)}
    {Array.from({length:8},(_,i)=><mesh key={i} position={[0,1.5+i*2.3,0]} rotation={[0,0,i%2?.35:-.35]}><boxGeometry args={[.85,.08,.08]} /><meshStandardMaterial color="#708784" /></mesh>)}
    <mesh position={[0,20,0]}><boxGeometry args={[4.2,2.5,.25]} /><meshStandardMaterial color="#435d62" /></mesh>
    {Array.from({length:15},(_,i)=><mesh key={i} position={[(i%5-2)*.76,19.3+Math.floor(i/5)*.7,.20]} rotation={[Math.PI/2+.18,0,0]}><cylinderGeometry args={[.24,.19,.22,8]} /><meshStandardMaterial color="#e0e4d9" emissive="#ddd6b2" emissiveIntensity={.18} /></mesh>)}
  </group>))}</>
}
export default function Grandstands() {
  const score=useMemo(()=>labelTexture(['MOTION CRICKET','HOME  0/0','OVERS  0.0']),[])
  const ads=useMemo(()=>labelTexture(['MC SPORTS','PLAY THE SHOT']),[])
  useEffect(()=>()=>{score.dispose();ads.dispose()},[score,ads])
  return <>
    {STANDS.map((stand,i)=><Stand key={i} stand={stand} />)}<Crowd /><Floodlights />
    <group position={[25,9,-49]} rotation={[0,-.48,0]}>
      <mesh><boxGeometry args={[8,4.4,.8]} /><meshStandardMaterial color="#9aa8a2" /></mesh>
      <mesh position={[0,0,.42]}><planeGeometry args={[7.3,3.7]} /><meshBasicMaterial map={score} toneMapped={false} /></mesh>
    </group>
    <group position={[0,0,-39]}>
      <mesh position={[0,.25,0]}><boxGeometry args={[10,.5,1.1]} /><meshStandardMaterial color="#a5b0a4" /></mesh>
      {Array.from({length:8},(_,i)=><mesh key={i} position={[(i-3.5)*1.15,3.1,0]}><boxGeometry args={[1.12,5.4,.22]} /><meshStandardMaterial color="#e1e0ce" roughness={1} /></mesh>)}
      {[-4.65,4.65].map(x=><mesh key={x} position={[x,3.1,0]}><boxGeometry args={[.12,5.7,.35]} /><meshStandardMaterial color="#778e85" /></mesh>)}
    </group>
    {[.3,2.6,3.5,5.7].map(a=><group key={a} position={[Math.cos(a)*37,.6,Math.sin(a)*37*1.2-9]} rotation={[0,-a-Math.PI/2,0]}>
      <mesh><boxGeometry args={[5.4,1.1,.15]} /><meshStandardMaterial color="#c9ccba" /></mesh>
      <mesh position={[0,0,.08]}><planeGeometry args={[5.2,1]} /><meshBasicMaterial map={ads} /></mesh>
    </group>)}
  </>
}
