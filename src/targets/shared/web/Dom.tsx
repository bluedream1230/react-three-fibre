import { Vector3, Group, Object3D, Camera, PerspectiveCamera, OrthographicCamera } from 'three'
import React, { useRef, useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { Assign } from 'utility-types'

import { useFrame, useThree } from '../../../hooks'
import { ReactThreeFiber } from '../../../three-types'

const vector = new Vector3()
function calculatePosition(el: Object3D, camera: Camera, size: { width: number; height: number }) {
  vector.setFromMatrixPosition(el.matrixWorld)
  vector.project(camera)
  const widthHalf = size.width / 2
  const heightHalf = size.height / 2
  return [vector.x * widthHalf + widthHalf, -(vector.y * heightHalf) + heightHalf]
}

function isObjectBehindCamera(el: Object3D, camera: Camera) {
  const objectPos = new Vector3().setFromMatrixPosition(el.matrixWorld)
  const cameraPos = new Vector3().setFromMatrixPosition(camera.matrixWorld)
  const deltaCamObj = objectPos.sub(cameraPos)
  const camDir = new Vector3()
  camera.getWorldDirection(camDir)

  return deltaCamObj.angleTo(camDir) > Math.PI / 2
}

function objectScale(el: Object3D, camera: Camera) {
  if (camera instanceof PerspectiveCamera) {
    const vFOV = (camera.fov * Math.PI) / 180
    const dist = el.position.distanceTo(camera.position)

    return 1 / (2 * Math.tan(vFOV / 2) * dist)
  }
  if (camera instanceof OrthographicCamera) {
    return camera.zoom
  }
  return 1
}

function objectZIndex(el: Object3D, camera: Camera, zIndexRange: Array<number>) {
  if (camera instanceof PerspectiveCamera || camera instanceof OrthographicCamera) {
    const dist = el.position.distanceTo(camera.position)
    const A = (zIndexRange[1] - zIndexRange[0]) / (camera.far - camera.near)
    const B = zIndexRange[1] - A * camera.far
    return Math.round(A * dist + B)
  }
  return undefined
}

export interface DomProps
  extends Omit<Assign<React.HTMLAttributes<HTMLDivElement>, ReactThreeFiber.Object3DNode<Group, typeof Group>>, 'ref'> {
  children: React.ReactElement
  prepend?: boolean
  center?: boolean
  eps?: number
  portal?: React.MutableRefObject<HTMLElement>
  scaleFactor?: number
  zIndexRange?: Array<number>
}

export const Dom = React.forwardRef(
  (
    {
      children,
      eps = 0.001,
      style,
      className,
      prepend,
      center,
      portal,
      scaleFactor,
      zIndexRange = [16777271, 0],
      ...props
    }: DomProps,
    ref: React.Ref<HTMLDivElement>
  ) => {
    const { gl, scene, camera, size } = useThree()
    const [el] = useState(() => document.createElement('div'))
    const group = useRef<Group>(null)
    const old = useRef([0, 0])
    const target = portal?.current ?? gl.domElement.parentNode

    useEffect(() => {
      if (group.current) {
        scene.updateMatrixWorld()
        const vec = calculatePosition(group.current, camera, size)
        el.style.cssText = `position:absolute;top:0;left:0;transform:translate3d(${vec[0]}px,${vec[1]}px,0);transform-origin:0 0;`
        if (target) {
          if (prepend) target.prepend(el)
          else target.appendChild(el)
        }
        return () => {
          if (target) target.removeChild(el)
          ReactDOM.unmountComponentAtNode(el)
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target])

    useEffect(
      () =>
        void ReactDOM.render(
          <div
            style={{ transform: center ? 'translate3d(-50%,-50%,0)' : 'none', ...style }}
            className={className}
            ref={ref}>
            {children}
          </div>,
          el
        )
    )

    useFrame(() => {
      if (group.current) {
        const vec = calculatePosition(group.current, camera, size)
        if (Math.abs(old.current[0] - vec[0]) > eps || Math.abs(old.current[1] - vec[1]) > eps) {
          el.style.display = !isObjectBehindCamera(group.current, camera) ? 'block' : 'none'
          const scale = scaleFactor === undefined ? 1 : objectScale(group.current, camera) * scaleFactor
          el.style.transform = `translate3d(${vec[0]}px,${vec[1]}px,0) scale(${scale})`
          el.style.zIndex = `${objectZIndex(group.current, camera, zIndexRange)}`
        }
        old.current = vec
      }
    })

    return <group {...props} ref={group} />
  }
)
