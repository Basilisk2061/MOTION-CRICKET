import { useEffect, useMemo } from 'react'
import type { ThreeElements } from '@react-three/fiber'
import { Shape } from 'three'
import { surfaceTexture } from '../surfaceTextures'

type Props = ThreeElements['group'] & { showPivot?: boolean }

// Local origin is the right-hand control point, inside the handle.
// +Y points toward the handle cap; the blade extends down -Y.
// Broad face is toward +Z. Approximate metre scale: 0.87 long, 0.108 wide.
export default function CricketBat({ showPivot = false, ...transform }: Props) {
  const wood=useMemo(()=>surfaceTexture('wood'),[])
  useEffect(()=>()=>wood.dispose(),[wood])
  const blade = useMemo(() => {
    const shape = new Shape()
    shape.moveTo(-0.012, -0.16)
    shape.quadraticCurveTo(-0.023, -0.185, -0.048, -0.225)
    shape.quadraticCurveTo(-0.052, -0.24, -0.051, -0.28)
    shape.lineTo(-0.05, -0.65)
    shape.quadraticCurveTo(-0.05, -0.688, -0.032, -0.696)
    shape.quadraticCurveTo(0, -0.708, 0.032, -0.696)
    shape.quadraticCurveTo(0.05, -0.688, 0.05, -0.65)
    shape.lineTo(0.051, -0.28)
    shape.quadraticCurveTo(0.052, -0.24, 0.048, -0.225)
    shape.quadraticCurveTo(0.023, -0.185, 0.012, -0.16)
    shape.closePath()
    return shape
  }, [])

  return (
    <group {...transform} name="BatRoot">
      <group name="CricketBatGeometry">
        <mesh position={[0, -0.02, 0]} castShadow>
          <cylinderGeometry args={[0.014, 0.012, 0.34, 24]} />
          <meshStandardMaterial color="#262c30" roughness={0.94} />
        </mesh>
        {Array.from({ length: 23 }, (_, i) => (
          <mesh key={i} position={[0, 0.14 - i * 0.012, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.0135, 0.0012, 6, 24]} />
            <meshStandardMaterial color="#485052" roughness={0.95} />
          </mesh>
        ))}
        <mesh position={[0, 0.152, 0]}>
          <cylinderGeometry args={[0.016, 0.016, 0.008, 24]} />
          <meshStandardMaterial color="#9cb4a1" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0, -0.016]} castShadow receiveShadow>
          <extrudeGeometry args={[blade, {
            depth: 0.032, steps: 1, bevelEnabled: true,
            bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 3, curveSegments: 10,
          }]} />
          <meshStandardMaterial map={wood} roughness={0.68} />
        </mesh>
        {/* A tapered raised spine on the rear gives the blade a sculpted back. */}
        <mesh position={[0, -0.445, -0.021]} scale={[1, 1, 0.65]} castShadow>
          <cylinderGeometry args={[0.007, 0.019, 0.43, 3]} />
          <meshStandardMaterial color="#c9a56f" roughness={0.72} />
        </mesh>
        <mesh position={[0, -0.29, 0.020]}>
          <boxGeometry args={[0.076, 0.035, 0.001]} />
          <meshStandardMaterial color="#344f45" roughness={0.8} />
        </mesh>
      </group>
      {showPivot && (
        <mesh name="RightHandPivotMarker" renderOrder={1}>
          <sphereGeometry args={[0.022, 16, 12]} />
          <meshBasicMaterial color="#8ef2c5" wireframe transparent opacity={0.8} depthTest={false} />
        </mesh>
      )}
    </group>
  )
}
