import * as THREE from 'three'
import React, { useState, useEffect, useRef } from 'react'
import { Canvas, createPortal } from '@react-three/fiber'

const customCamera = new THREE.PerspectiveCamera()

export default function App() {
  const [scene1] = useState(() => new THREE.Scene())
  const [scene2] = useState(() => new THREE.Scene())
  const [foo, setFoo] = React.useState(2)
  const [mounted, mount] = React.useReducer(() => true, false)
  React.useEffect(() => {
    setTimeout(mount, 1000)
    setTimeout(() => setFoo(3), 2000)
  }, [])

  const [o] = React.useState(() => new THREE.Group())

  return (
    <Canvas>
      <Cube position={[-0.5, 0, 0]} color="hotpink" />
      {createPortal(
        <group>
          {mounted && <Cube position={[0, 0.5, 0]} color="lightblue" />}
          {createPortal(<Cube position={[0.5, 0, 0]} color="aquamarine" />, scene2, { foo })}
        </group>,
        scene1,
        { foo: 1, camera: customCamera },
      )}
      <primitive object={scene1} />
      <primitive object={scene2} />
    </Canvas>
  )
}

function Cube({ color, ...props }: any) {
  const ref = React.useRef<THREE.Mesh>(null!)
  useEffect(() => {
    console.log(`from within ${color}.useEffect`, (ref.current as any).__r3f.context)
  })
  return (
    <mesh ref={ref} {...props}>
      <boxGeometry />
      <meshBasicMaterial color={color} />
    </mesh>
  )
}
