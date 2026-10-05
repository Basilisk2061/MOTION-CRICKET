import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3 } from 'three'
import { FIELDING, type FieldingController } from './fielding'
import type { Delivery } from './delivery'

function DebugLine({ points, color }: { points: Vector3[]; color: string }) {
  return <lineSegments>
    <bufferGeometry><bufferAttribute attach="attributes-position"
      args={[new Float32Array(points.flatMap(p => p.toArray())), 3]} /></bufferGeometry>
    <lineBasicMaterial color={color} />
  </lineSegments>
}

// These are the actual height bands used by fieldingClosestApproach, not a
// second collision model. Yellow reach is available only after reaction.
function Envelope({ radius, color }: { radius: number; color: string }) {
  return <>
    <mesh position={[0, FIELDING.COLLECTION_HEIGHT / 2, 0]}>
      <cylinderGeometry args={[radius, radius, FIELDING.COLLECTION_HEIGHT, 24, 1, true]} />
      <meshBasicMaterial color={color} wireframe />
    </mesh>
    <mesh position={[0, .65, 0]}>
      <sphereGeometry args={[radius, 24, 8, 0, Math.PI * 2, Math.PI / 2,
        Math.acos((FIELDING.COLLECTION_HEIGHT - .65) / radius) - Math.PI / 2]} />
      <meshBasicMaterial color={color} wireframe />
    </mesh>
    <mesh position={[0, (.65 + FIELDING.CATCH_MAX_HEIGHT) / 2, 0]}>
      <cylinderGeometry args={[radius, radius, FIELDING.CATCH_MAX_HEIGHT - .65, 24, 1, true]} />
      <meshBasicMaterial color={color} wireframe />
    </mesh>
  </>
}

export default function FieldingDebug({ fielding, game }: { fielding: FieldingController; game: Delivery }) {
  const [view, setView] = useState<{ contact: typeof fielding.debugContact; text: string } | null>(null)
  const elapsed = useRef(0)
  const ended = useRef(game.match)
  const reason = useRef('NONE')
  const overlay = useRef<HTMLPreElement | null>(null)
  useEffect(() => {
    const element = document.createElement('pre')
    Object.assign(element.style, { position: 'fixed', left: '12px', bottom: '10px', color: 'white',
      background: '#000b', padding: '8px', fontSize: '11px', pointerEvents: 'none', zIndex: '20' })
    document.body.appendChild(element)
    overlay.current = element
    return () => { element.remove(); overlay.current = null }
  }, [])
  useEffect(() => { if (overlay.current) overlay.current.textContent = view?.text ?? '' }, [view])
  useFrame((_, dt) => {
    if (ended.current !== game.match) { ended.current = game.match; reason.current = 'NONE' }
    if (game.match.endReason !== 'NONE' && reason.current !== game.match.endReason) {
      reason.current = game.match.endReason
      console.debug('DELIVERY END', { reason: reason.current, result: game.match.result,
        age: game.match.age, position: game.position.toArray(), speed: game.velocity.length() })
    }
    elapsed.current += dt
    if (elapsed.current < .1) return
    elapsed.current = 0
    const c = fielding.debugContact
    const xyz = (v: Vector3) => v.toArray().map(n => n.toFixed(2)).join(', ')
    setView({ contact: c, text: [
      `BALL LIVE: ${game.match.hit && !game.match.result} SPEED: ${game.velocity.length().toFixed(2)}`,
      `PHYSICS SETTLED: ${game.match.physicsSettled} POSSESSION: ${game.fieldingHeld || game.match.held}`,
      `FIELDING STATE: ${fielding.activeFielder?.state ?? 'NONE'} END REASON: ${game.match.endReason}`,
      ...(c ? [`Ball prev/current: ${xyz(c.from)} / ${xyz(c.to)}`,
        `Fielder prev/current: ${xyz(c.start)} / ${xyz(c.end)} ${c.state} active=${c.active}`,
        `Closest: ${c.distance.toFixed(3)} Reach: ${c.reach.toFixed(3)} MISS MARGIN: ${(c.distance-c.reach).toFixed(3)}`,
        `Height: ${c.height.toFixed(2)} Lateral: ${c.lateral.toFixed(2)} ${c.zone} -> ${c.result}`] : []),
      'cyan sweep | red body | green normal reach | yellow active stretch',
      'white closest | blue predicted intercept | magenta contact | orange evaluated center',
    ].join('\n') })
  })
  const c = view?.contact
  return <>
    {c && <>
      <DebugLine points={[c.from, c.to]} color="cyan" />
      <DebugLine points={[c.start, c.end]} color="orange" />
      <group position={c.center}>
        <mesh position={[0, .46, 0]}><cylinderGeometry args={[.22, .22, .92, 16]} /><meshBasicMaterial color="red" wireframe /></mesh>
        <mesh position={[0, 1.165, 0]} scale={[.225, .32, .135]}><sphereGeometry args={[1, 16, 12]} /><meshBasicMaterial color="red" wireframe /></mesh>
        {/* Ground core differs from hand/catch core. */}
        <mesh position={[0, .21, 0]}><cylinderGeometry args={[FIELDING.COLLECTION_RADIUS, FIELDING.COLLECTION_RADIUS, .42, 24]} /><meshBasicMaterial color="lime" wireframe /></mesh>
        <Envelope radius={FIELDING.CATCH_RADIUS} color="lime" />
        {c.active && c.state === 'CHASING' && <Envelope radius={FIELDING.ACTIVE_INTERCEPTION_REACH} color="yellow" />}
      </group>
      {[[c.closest, 'white'], [c.target, 'blue'], [c.center, 'orange'], [c.contact, 'magenta']].map(([p, color], i) =>
        p && <mesh key={i} position={p as Vector3}><sphereGeometry args={[.065, 10, 8]} /><meshBasicMaterial color={color as string} /></mesh>)}
    </>}
  </>
}
