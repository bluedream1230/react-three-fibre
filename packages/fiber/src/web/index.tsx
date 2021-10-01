import * as THREE from 'three'
import * as React from 'react'
// @ts-ignore
import { ConcurrentRoot } from 'react-reconciler/constants'
import { UseStore } from 'zustand'

import { is, dispose } from '../core/utils'
import { createStore, StoreProps, isRenderer, context, RootState, Size } from '../core/store'
import { createRenderer, extend, Root } from '../core/renderer'
import { createLoop, addEffect, addAfterEffect, addTail } from '../core/loop'
import { createPointerEvents as events, getEventPriority } from './events'
import { Canvas } from './Canvas'
import { EventManager } from '../core/events'

const roots = new Map<Element, Root>()
const { invalidate, advance } = createLoop(roots)
const { reconciler, applyProps } = createRenderer(roots, getEventPriority)

export type RenderProps<TCanvas extends Element> = Omit<StoreProps, 'gl' | 'events' | 'size'> & {
  gl?: THREE.WebGLRenderer | Partial<THREE.WebGLRendererParameters>
  events?: (store: UseStore<RootState>) => EventManager<TCanvas>
  size?: Size
  onCreated?: (state: RootState) => void
}

const createRendererInstance = <TElement extends Element>(
  gl: THREE.WebGLRenderer | Partial<THREE.WebGLRendererParameters> | undefined,
  canvas: TElement,
): THREE.WebGLRenderer =>
  isRenderer(gl as THREE.WebGLRenderer)
    ? (gl as THREE.WebGLRenderer)
    : new THREE.WebGLRenderer({
        powerPreference: 'high-performance',
        canvas: canvas as unknown as HTMLCanvasElement,
        antialias: true,
        alpha: true,
        ...gl,
      })

function createRoot<TCanvas extends Element>(canvas: TCanvas) {
  return {
    render: (element: React.ReactNode) => render(element, canvas),
    unmount: () => unmountComponentAtNode(canvas),
  }
}

function render<TCanvas extends Element>(
  element: React.ReactNode,
  canvas: TCanvas,
  { gl, size, events, onCreated, ...props }: RenderProps<TCanvas> = {},
): UseStore<RootState> {
  // Allow size to take on container bounds initially
  if (!size) {
    size = {
      width: canvas.parentElement?.clientWidth ?? 0,
      height: canvas.parentElement?.clientHeight ?? 0,
    }
  }

  let root = roots.get(canvas)
  let fiber = root?.fiber
  let store = root?.store
  let state = store?.getState()

  if (fiber && state) {
    const lastProps = state.internal.lastProps

    // When a root was found, see if any fundamental props must be changed or exchanged

    // Check pixelratio
    if (props.dpr !== undefined && !is.equ(lastProps.dpr, props.dpr)) state.setDpr(props.dpr)
    // Check size
    if (!is.equ(lastProps.size, size)) state.setSize(size.width, size.height)

    // For some props we want to reset the entire root

    // Changes to the color-space
    const linearChanged = props.linear !== lastProps.linear
    if (linearChanged) {
      unmountComponentAtNode(canvas)
      fiber = undefined
    }
  }

  if (!fiber) {
    // If no root has been found, make one

    // Create gl
    const glRenderer = createRendererInstance(gl, canvas)

    // Enable VR if requested
    if (props.vr) {
      glRenderer.xr.enabled = true
      glRenderer.setAnimationLoop((timestamp) => advance(timestamp, true))
    }

    // Create store
    store = createStore(applyProps, invalidate, advance, { gl: glRenderer, size, ...props })
    const state = store.getState()
    // Create renderer
    fiber = reconciler.createContainer(store, ConcurrentRoot, false, null)
    // Map it
    roots.set(canvas, { fiber, store })
    // Store events internally
    if (events) state.set({ events: events(store) })
  }

  if (store && fiber) {
    reconciler.updateContainer(
      <Provider store={store} element={element} onCreated={onCreated} target={canvas} />,
      fiber,
      null,
      () => undefined,
    )
    return store
  } else {
    throw 'Error creating root!'
  }
}

function Provider<TElement extends Element>({
  store,
  element,
  onCreated,
  target,
}: {
  onCreated?: (state: RootState) => void
  store: UseStore<RootState>
  element: React.ReactNode
  target: TElement
}) {
  React.useEffect(() => {
    const state = store.getState()
    // Flag the canvas active, rendering will now begin
    state.set((state) => ({ internal: { ...state.internal, active: true } }))
    // Connect events
    state.events.connect?.(target)
    // Notifiy that init is completed, the scene graph exists, but nothing has yet rendered
    if (onCreated) onCreated(state)
  }, [])
  return <context.Provider value={store}>{element}</context.Provider>
}

function unmountComponentAtNode<TElement extends Element>(canvas: TElement, callback?: (canvas: TElement) => void) {
  const root = roots.get(canvas)
  const fiber = root?.fiber
  if (fiber) {
    const state = root?.store.getState()
    if (state) state.internal.active = false
    reconciler.updateContainer(null, fiber, null, () => {
      if (state) {
        setTimeout(() => {
          try {
            state.events.disconnect?.()
            state.gl?.renderLists?.dispose?.()
            state.gl?.forceContextLoss?.()
            dispose(state)
            roots.delete(canvas)
            if (callback) callback(canvas)
          } catch (e) {
            /* ... */
          }
        }, 500)
      }
    })
  }
}

const act = reconciler.act
function createPortal(children: React.ReactNode, container: THREE.Object3D): React.ReactNode {
  return reconciler.createPortal(children, container, null, null)
}

reconciler.injectIntoDevTools({
  bundleType: process.env.NODE_ENV === 'production' ? 0 : 1,
  rendererPackageName: '@react-three/fiber',
  version: '17.0.2',
})

export * from '../core/hooks'
export {
  context,
  render,
  unmountComponentAtNode,
  createPortal,
  events,
  reconciler,
  applyProps,
  dispose,
  invalidate,
  advance,
  extend,
  addEffect,
  addAfterEffect,
  addTail,
  Canvas,
  act,
  roots as _roots,
}
