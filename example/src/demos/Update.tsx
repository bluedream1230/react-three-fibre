import React, { useState, useRef, useEffect } from 'react'
import { Canvas, FixedStage, Stage, Standard, useThree, useUpdate } from '@react-three/fiber'
import { a, useSpring } from '@react-spring/three'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

// TODO: Add render with 'auto' | 'manual' options to root.
// TODO: Remove useFrame loop and move useFrame subscribers to the useUpdate loop (inside update stage?)
// TODO: Refactor priority and frames in the store. They are confusing and I don't think necessary.
// TODO: Add a maxDelta in loops for tab safety. (It keeps accumulating.)

const colorA = new THREE.Color('#6246ea')
const colorB = new THREE.Color('#e45858')

function Update() {
  const groupRef = useRef<THREE.Group>(null!)
  const matRef = useRef<THREE.MeshBasicMaterial>(null!)
  const [fixed] = useState(() => ({ scale: new THREE.Vector3(), color: new THREE.Color() }))
  const [prev] = useState(() => ({ scale: new THREE.Vector3(), color: new THREE.Color() }))

  const [active, setActive] = useState(0)
  const state = useThree()
  // create a common spring that will be used later to interpolate other values
  const { spring } = useSpring({
    spring: active,
    config: { mass: 5, tension: 400, friction: 50, precision: 0.0001 },
  })
  // interpolate values from common spring
  const scale = spring.to([0, 1], [1, 2])
  const rotation = spring.to([0, 1], [0, Math.PI])

  useUpdate(({ clock }) => {
    if (groupRef.current) {
      const t = clock.getElapsedTime()
      const scalar = (Math.sin(t) + 2) / 2
      prev.scale.copy(fixed.scale)
      fixed.scale.set(scalar, scalar, scalar)
      // groupRef.current.scale.set(scalar, scalar, scalar)
    }

    if (matRef.current) {
      const t = clock.getElapsedTime()
      const alpha = Math.sin(t) + 1
      prev.color.copy(fixed.color)
      fixed.color.lerpColors(colorA, colorB, alpha)
      // matRef.current.color.lerpColors(colorA, colorB, alpha)
    }
  }, 'fixed')

  useUpdate((state) => {
    // With interpolation of the fixed stage
    const alpha = (state.getStage('fixed') as FixedStage)?.get().alpha
    groupRef.current.scale.lerpVectors(prev.scale, fixed.scale, alpha)
    matRef.current.color.lerpColors(prev.color, fixed.color, alpha)

    if (groupRef.current) {
      groupRef.current.rotation.x = groupRef.current.rotation.y += 0.005
    }
  })

  useEffect(() => {
    state.setStage('fixed', { fixedStep: 1 / 15 })
  }, [state])

  useEffect(() => console.log(state), [state])

  return (
    <group ref={groupRef}>
      <a.mesh rotation-y={rotation} scale-x={scale} scale-z={scale} onClick={() => setActive(Number(!active))}>
        <boxBufferGeometry />
        <meshBasicMaterial ref={matRef} color="#6246ea" />
      </a.mesh>
      <OrbitControls />
    </group>
  )
}

export default function App() {
  const InputStage = new Stage('input')
  const PhysicsStage = new FixedStage('physics')
  const stages = [
    Standard.Early,
    InputStage,
    Standard.Fixed,
    PhysicsStage,
    Standard.Update,
    Standard.Late,
    Standard.Render,
    Standard.After,
  ]

  return (
    <Canvas pipeline={stages}>
      <Update />
    </Canvas>
  )
}
