import { useEffect, useMemo } from 'react'
import Grandstands from './Grandstands'
import { GAMEPLAY as T } from './gameplayTuning'
import Wicket from './Wicket'
import { surfaceTexture } from './surfaceTextures'

export default function Stadium({animatedWicket=false}:{animatedWicket?:boolean}) {
  const pitch = useMemo(()=>surfaceTexture('pitch'),[])
  const grass = useMemo(()=>surfaceTexture('grass'),[])
  useEffect(()=>()=>{pitch.dispose();grass.dispose()},[pitch,grass])
  const wear = useMemo(() => Array.from({ length: 30 }, (_, i) => ({
    x: Math.sin(i * 7.7) * 1.15, z: -19 + (i * .673) % 20, length: .07 + (i % 4) * .045,
  })), [])
  return <>
    <color attach="background" args={['#b9d2df']} />
    <mesh><sphereGeometry args={[170,24,12]} /><shaderMaterial side={1} depthWrite={false}
      vertexShader={'varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}' }
      fragmentShader={'varying vec3 p; void main(){float h=smoothstep(-.05,.8,normalize(p).y);gl_FragColor=vec4(mix(vec3(.78,.84,.82),vec3(.32,.56,.74),h),1.);}'}/></mesh>
    <fog attach="fog" args={['#c7d5d1', 65, 145]} />
    <hemisphereLight args={['#e5f1ff', '#77794e', 1.65]} />
    <directionalLight position={[-12, 24, 8]} intensity={2.4} color="#fff0d3" castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-15} shadow-camera-right={15}
      shadow-camera-top={26} shadow-camera-bottom={-15} shadow-camera-far={85} shadow-normalBias={.015} shadow-bias={-.0002} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, T.groundY - .005, -9]} receiveShadow>
      <planeGeometry args={[220, 220]} /><meshStandardMaterial map={grass} color="#53774d" roughness={1} />
    </mesh>
    {Array.from({ length: 8 }, (_, i) => <mesh key={i} receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, T.groundY - .003 + i * .0001, -9]} scale={[1, 1.2, 1]}>
      <ringGeometry args={[i * 4.5, (i + 1) * 4.5, 80]} /><meshStandardMaterial map={grass} color={i % 2 ? '#638652' : '#5c804e'} roughness={.95} />
    </mesh>)}
    <mesh position={[0, T.groundY - .018, -9.2]} receiveShadow>
      <boxGeometry args={[3.05, .036, 23]} /><meshStandardMaterial map={pitch} roughness={.97} />
    </mesh>
    <mesh position={[0, T.groundY + .001, -9.2]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[1.25, 20]} /><meshStandardMaterial color="#baa980" transparent opacity={.45} depthWrite={false} />
    </mesh>
    {wear.map((mark, i) => <mesh key={i} position={[mark.x, T.groundY + .002, mark.z]} rotation={[-Math.PI / 2, 0, i * 1.4]}>
      <planeGeometry args={[.025, mark.length]} /><meshBasicMaterial color="#857858" transparent opacity={.38} depthWrite={false} />
    </mesh>)}
    {[-.35, .87, -17.28, -18.5].map(z => <mesh key={z} position={[0, T.groundY + .003, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[3.5, .055]} /><meshStandardMaterial color="#e5ddc5" />
    </mesh>)}
    {[-1.32, 1.32].flatMap(x => [-.1, -18.4].map(z => <mesh key={`${x}:${z}`} position={[x, T.groundY + .004, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[.05, 2.5]} /><meshStandardMaterial color="#e5ddc5" />
    </mesh>))}
    {!animatedWicket&&<Wicket z={.87}/>}<Wicket z={-18.5} />
    <mesh position={[0, .05, -9]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1.2, 1]}>
      <torusGeometry args={[35.8, .035, 5, 100]} /><meshStandardMaterial color="#ddd0a9" />
    </mesh>
    <Grandstands />
  </>
}
