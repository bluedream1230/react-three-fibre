import * as THREE from 'three/src/Three'
import React, { useRef, useEffect, useMemo, useState, useCallback, useContext } from 'react'
import ResizeObserver from 'resize-observer-polyfill'
import { applyProps, render, unmountComponentAtNode } from './reconciler'

export const stateContext = React.createContext()

function useMeasure() {
  const ref = useRef()
  const [bounds, set] = useState({ left: 0, top: 0, width: 0, height: 0 })
  const [ro] = useState(() => new ResizeObserver(([entry]) => set(entry.contentRect)))
  useEffect(() => {
    if (ref.current) ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [{ ref }, bounds]
}

export const Canvas = React.memo(({ children, props, camera, style, ...rest }) => {
  // Local, reactive state
  const canvas = useRef()
  const [ready, setReady] = useState(false)
  const [bind, size] = useMeasure()
  const [intersects, setIntersects] = useState([])
  const [cursor, setCursor] = useState('default')
  const [raycaster] = useState(() => new THREE.Raycaster())
  const [mouse] = useState(() => new THREE.Vector2())
  const [defaultCam, setDefaultCamera] = useState(() => {
    const cam = new THREE.PerspectiveCamera(75, 0, 0.1, 1000)
    cam.position.z = 5
    if (camera) applyProps(cam, camera, {})
    return cam
  })

  // Public state
  const state = useRef({
    ready: false,
    subscribers: [],
    manual: false,
    active: true,
    canvas: undefined,
    gl: undefined,
    camera: undefined,
    scene: undefined,
    size: undefined,
    viewport: (target = new THREE.Vector3(0, 0, 0)) => {
      const distance = state.current.camera.position.distanceTo(target)
      const fov = THREE.Math.degToRad(state.current.camera.fov) // convert vertical fov to radians
      const height = 2 * Math.tan(fov / 2) * distance // visible height
      const width = height * state.current.camera.aspect
      return { width, height }
    },
    subscribe: (fn, main) => {
      state.current.subscribers.push(fn)
      return () => (state.current.subscribers = state.current.subscribers.filter(s => s === fn))
    },
    setManual: takeOverRenderloop => {
      state.current.manual = takeOverRenderloop
      if (takeOverRenderloop) {
        // In manual mode items shouldn't really be part of the internal scene which has adverse effects
        // on the camera being unable to update without explicit calls to updateMatrixWorl()
        state.current.scene.children.forEach(child => state.current.scene.remove(child))
      }
    },
    setDefaultCamera: cam => {
      state.current.camera = cam
      setDefaultCamera(cam)
    },
  })

  // Writes locals into public state for distribution among subscribers, context, etc
  useEffect(() => {
    state.current.ready = ready
    state.current.size = size
    state.current.aspect = size.width / size.height
    state.current.camera = defaultCam
  }, [ready, size, defaultCam])

  // Component mount effect, creates the webGL render context
  useEffect(() => {
    state.current.gl = new THREE.WebGLRenderer({ canvas: canvas.current, antialias: true, alpha: true, ...props })
    state.current.gl.setPixelRatio((window.devicePixelRatio || 2) * 0.5)
    state.current.gl.setClearAlpha(0)
    state.current.canvas = canvas.current
    state.current.scene = new THREE.Scene()
    state.current.scene.__interaction = []

    const renderLoop = function() {
      if (!state.current.active) return
      requestAnimationFrame(renderLoop)
      if (state.current.ready) {
        state.current.subscribers.forEach(fn => fn(state.current))
        if (!state.current.manual && state.current.scene.children.length) {
          state.current.gl.render(state.current.scene, state.current.camera)
        }
      }
    }

    // Start render-loop
    requestAnimationFrame(renderLoop)

    // Clean-up
    return () => {
      state.current.active = false
      unmountComponentAtNode(state.current.scene)
      // TODO: Clean up and dispose scene ...
    }
  }, [])

  // Adjusts default camera
  useEffect(() => {
    if (ready) {
      state.current.gl.setSize(size.width, size.height)
      state.current.camera.aspect = state.current.aspect
      state.current.camera.radius = (size.width + size.height) / 4
      state.current.camera.updateProjectionMatrix()
    }
  }, [ready, size, defaultCam])

  const intersect = useCallback((event, fn) => {
    const canvasRect = canvas.current.getBoundingClientRect()
    const x = ((event.clientX - canvasRect.left) / (canvasRect.right - canvasRect.left)) * 2 - 1
    const y = -((event.clientY - canvasRect.top) / (canvasRect.bottom - canvasRect.top)) * 2 + 1
    mouse.set(x, y, 0.5)
    raycaster.setFromCamera(mouse, state.current.camera)
    // TODO only inspect onbjects that have handlers
    const hits = raycaster.intersectObjects(state.current.scene.__interaction, true).filter(h => h.object.__handlers)
    hits.forEach(fn)
    return hits
  }, [])

  useEffect(() => {
    const hovered = {}
    const handleMove = event => {
      let hover = false
      const hits = intersect(event, data => {
        const object = data.object
        const handlers = object.__handlers
        if (handlers.hover) {
          hover = true
          if (!hovered[object.uuid]) {
            hovered[object.uuid] = object
            handlers.hover(data)
          }
        }
      })

      if (hover) cursor !== 'pointer' && setCursor('pointer')
      else cursor !== 'default' && setCursor('default')

      Object.values(hovered).forEach(object => {
        if (!hits.length || !hits.find(i => i.object === object)) {
          if (object.__handlers.unhover) {
            object.__handlers.unhover()
          }
          delete hovered[object.uuid]
        }
      })

      /*if (intersects.length !== hits.length || intersects.some((h, index) => h.object !== hits[index].object))
        setIntersects(hits)*/
    }

    const handleClick = event => {
      const clicked = {}
      intersect(event, data => {
        const object = data.object
        const handlers = object.__handlers
        if (handlers.click && !clicked[object.uuid]) {
          clicked[object.uuid] = object
          handlers.click(data)
        }
      })
    }

    window.addEventListener('mousemove', handleMove, { passive: true })
    window.addEventListener('mouseup', handleClick, { passive: true })
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleClick)
    }
  })

  // This component is a bridge into the three render context, when it gets rendererd
  // we know we are ready to compile shaders, call subscribers, etc
  const IsReady = useCallback(() => {
    useEffect(() => void setReady(true), [])
    return null
  }, [])

  // Render v-dom into scene
  useEffect(() => {
    if (size.width > 0 && size.height > 0) {
      render(
        <stateContext.Provider value={{ ...state.current }}>
          <IsReady />
          {children}
        </stateContext.Provider>,
        state.current.scene
      )
    }
  })

  // Render the canvas into the dom
  return (
    <div
      {...bind}
      {...rest}
      style={{ cursor, position: 'relative', width: '100%', height: '100%', overflow: 'hidden', ...style }}>
      <canvas ref={canvas} />
    </div>
  )
})
