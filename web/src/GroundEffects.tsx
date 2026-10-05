import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Mesh, MeshBasicMaterial, ShaderMaterial, Vector3 } from 'three'
import type { Delivery } from './delivery'
import { GAMEPLAY as T, DELIVERY } from './gameplayTuning'

function shadowMaterial() {
  return new ShaderMaterial({ transparent: true, depthWrite: false,
    uniforms: { opacity: { value: .3 } },
    vertexShader: 'varying vec2 uvPos; void main(){uvPos=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec2 uvPos; uniform float opacity; void main(){float r=length(uvPos-.5)*2.; float a=exp(-r*r*4.)*(1.-smoothstep(.65,1.,r))*opacity; gl_FragColor=vec4(.10,.12,.07,a);}' })
}
export default function GroundEffects({ game, toe }: { game: Delivery; toe: Vector3 }) {
  const ballShadow = useRef<Mesh>(null), batShadow = useRef<Mesh>(null)
  const dust = useRef<Group>(null), contact = useRef<Group>(null)
  const materials = useMemo(() => [shadowMaterial(), shadowMaterial()], [])
  const puffMaterials = useMemo(() => [0, 1].map(() => new MeshBasicMaterial({ color: '#c6b28c', transparent: true, depthWrite: false })), [])
  const effects = useRef({ bounceId: 0, age: 1, toeAge: 1, grounded: false })
  useEffect(() => () => { materials.forEach(m => m.dispose()); puffMaterials.forEach(m => m.dispose()) }, [materials, puffMaterials])
  useFrame((_, dt) => {
    const e = effects.current
    const height = Math.max(0, game.position.y - T.groundY - DELIVERY.radius)
    if (ballShadow.current) {
      ballShadow.current.visible = game.visible
      ballShadow.current.position.set(game.position.x, T.groundY + .006, game.position.z)
      ballShadow.current.scale.setScalar(.12 + Math.min(height, 3) * .12)
      materials[0].uniforms.opacity.value = .65 / (1 + height * 1.4)
    }
    const toeHeight = Math.max(0, toe.y - T.groundY)
    if (batShadow.current) {
      batShadow.current.position.set(toe.x, T.groundY + .007, toe.z)
      batShadow.current.scale.set(.20 + toeHeight * .22, .30 + toeHeight * .3, 1)
      materials[1].uniforms.opacity.value = .55 / (1 + toeHeight * 2.5)
    }
    if (game.bounceId !== e.bounceId && dust.current) {
      e.bounceId = game.bounceId; e.age = 0
      dust.current.position.copy(game.bouncePosition); dust.current.position.y = T.groundY + .015
    }
    if (toeHeight < T.toeContactHeight && !e.grounded && contact.current) {
      e.toeAge = 0; contact.current.position.set(toe.x, T.groundY + .01, toe.z)
    }
    e.grounded = toeHeight < .04
    e.age += dt; e.toeAge += dt
    for (const [index, group, age] of [[0, dust.current, e.age], [1, contact.current, e.toeAge]] as const) {
      if (!group) continue
      group.visible = age < .35
      puffMaterials[index].opacity = Math.max(0, 1 - age / .35) * .4
      group.children.forEach((particle, i) => {
        const angle = i * 2.4
        particle.position.set(Math.cos(angle) * age * .5, Math.sin(age / .35 * Math.PI) * .06, Math.sin(angle) * age * .5)
        particle.scale.setScalar(.015 + age * .08)
      })
    }
  })
  return <>
    <mesh ref={ballShadow} rotation={[-Math.PI / 2, 0, 0]} material={materials[0]}><planeGeometry args={[2, 2]} /></mesh>
    <mesh ref={batShadow} rotation={[-Math.PI / 2, 0, 0]} material={materials[1]}><planeGeometry args={[2, 2]} /></mesh>
    {[dust, contact].map((ref, j) => <group ref={ref} key={j} visible={false}>
      {Array.from({ length: 7 }, (_, i) => <mesh key={i} material={puffMaterials[j]}><sphereGeometry args={[1, 5, 4]} /></mesh>)}
    </group>)}
  </>
}
