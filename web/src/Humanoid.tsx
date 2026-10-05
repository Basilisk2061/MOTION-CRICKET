import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Mesh, SphereGeometry, CylinderGeometry, MeshStandardMaterial, Vector3 } from 'three'

const sphere = new SphereGeometry(1, 12, 8), limb = new CylinderGeometry(.8, 1, 1, 10)
const kit = new MeshStandardMaterial({ color: '#e9e3cc', roughness: .88 })
const trim = new MeshStandardMaterial({ color: '#254f50', roughness: .8 })
const skin = new MeshStandardMaterial({ color: '#a97653', roughness: .9 })
const pads = new MeshStandardMaterial({ color: '#f1ebdc', roughness: .85 })
const up = new Vector3(0, 1, 0)
export function humanPose() {
  return { hip: new Vector3(0,.85,0), shoulder: new Vector3(0,1.35,0), head: new Vector3(0,1.64,0),
    elbows: [-1,1].map(x=>new Vector3(x*.25,1,0)), hands: [-1,1].map(x=>new Vector3(x*.25,.65,0)),
    knees: [-1,1].map(x=>new Vector3(x*.12,.45,0)), feet: [-1,1].map(x=>new Vector3(x*.12,.08,.04)) }
}
function Segment({ a, b, radius, material = kit }: { a: Vector3; b: Vector3; radius: number; material?: MeshStandardMaterial }) {
  const ref = useRef<Mesh>(null), direction = useRef(new Vector3())
  useFrame(() => {
    const m = ref.current!; direction.current.subVectors(b,a)
    m.position.copy(a).add(b).multiplyScalar(.5); m.scale.set(radius,direction.current.length(),radius)
    m.quaternion.setFromUnitVectors(up,direction.current.normalize())
  })
  return <mesh ref={ref} geometry={limb} material={material} castShadow receiveShadow />
}
export default function Humanoid({ pose, keeper = false }: { pose: ReturnType<typeof humanPose>; keeper?: boolean }) {
  const torso = useRef<Mesh>(null), head = useRef<Group>(null), pelvis = useRef<Mesh>(null)
  const shoulders = useRef([-1,1].map(()=>new Vector3())), hips = useRef([-1,1].map(()=>new Vector3()))
  const hands = useRef<(Mesh|null)[]>([]), feet = useRef<(Mesh|null)[]>([])
  const direction = useRef(new Vector3())
  useFrame(() => {
    torso.current!.position.copy(pose.hip).lerp(pose.shoulder,.57)
    torso.current!.quaternion.setFromUnitVectors(up,direction.current.copy(pose.shoulder).sub(pose.hip).normalize())
    pelvis.current!.position.copy(pose.hip); head.current!.position.copy(pose.head)
    head.current!.rotation.y = (pose.head.x-pose.hip.x)*1.6
    for(let i=0;i<2;i++) {
      shoulders.current[i].copy(pose.shoulder); shoulders.current[i].x += i ? .22 : -.22
      hips.current[i].copy(pose.hip); hips.current[i].x += i ? .115 : -.115
      hands.current[i]!.position.copy(pose.hands[i]); feet.current[i]!.position.copy(pose.feet[i])
    }
  }, -.25)
  return <group>
    <mesh ref={pelvis} geometry={sphere} material={kit} scale={[.19,.15,.13]} castShadow />
    <mesh ref={torso} geometry={sphere} material={kit} scale={[.225,.32,.135]} castShadow receiveShadow>
      <mesh position={[.38,.33,.91]} geometry={sphere} material={trim} scale={[.12,.12,.04]} />
    </mesh>
    <group ref={head}>
      <mesh position={[0,-.16,0]} geometry={sphere} material={skin} scale={[.065,.10,.065]} castShadow />
      <mesh position={[0,-.21,0]} rotation={[Math.PI/2,0,0]} material={trim}><torusGeometry args={[.067,.012,4,12]} /></mesh>
      <mesh geometry={sphere} material={skin} scale={[.105,.14,.10]} castShadow />
      <mesh position={[0,-.015,.099]} geometry={sphere} material={skin} scale={[.025,.035,.035]} />
      <mesh position={[0,.09,0]} geometry={sphere} material={trim} scale={[.112,.065,.108]} castShadow />
      <mesh position={[0,.07,.08]} geometry={sphere} material={trim} scale={[.11,.013,.09]} />
    </group>
    {[0,1].map(i=><group key={i}>
      <Segment a={shoulders.current[i]} b={pose.elbows[i]} radius={.065} />
      <Segment a={pose.elbows[i]} b={pose.hands[i]} radius={.044} material={skin} />
      <mesh ref={m=>{hands.current[i]=m}} geometry={sphere} material={keeper ? trim : skin} scale={keeper ? [.085,.10,.055] : [.045,.058,.038]} castShadow>
        {keeper && [-.45,0,.45].map(x=><mesh key={x} position={[x,.25,.78]} geometry={sphere} material={pads} scale={[.16,.6,.2]} />)}
      </mesh>
      <Segment a={hips.current[i]} b={pose.knees[i]} radius={.088} />
      <Segment a={pose.knees[i]} b={pose.feet[i]} radius={keeper ? .095 : .062} material={keeper ? pads : kit} />
      <mesh ref={m=>{feet.current[i]=m}} geometry={sphere} material={trim} scale={[.078,.06,.15]} castShadow receiveShadow />
    </group>)}
  </group>
}
