import { MutableRefObject, useLayoutEffect, useRef } from 'react'
import { Root } from './renderer'
import { RootState } from './store'

export interface UpdateCallback {
  (state: RootState, delta: number, frame?: THREE.XRFrame | undefined): void
}

export type UpdateCallbackRef = MutableRefObject<UpdateCallback>

export type FixedStageOptions = { fixedStep?: number; maxSubSteps?: number }

export class Stage {
  name: string
  subscribers: UpdateCallbackRef[]

  constructor(name: string) {
    this.name = name
    this.subscribers = []
  }

  frame(state: RootState, delta: number, frame?: THREE.XRFrame | undefined) {
    const subs = this.subscribers

    for (let i = 0; i < subs.length; i++) {
      subs[i].current(state, delta)
    }
  }

  add(callback: UpdateCallbackRef) {
    this.subscribers = [...this.subscribers, callback]

    return () => {
      this.subscribers = this.subscribers.filter((cb) => {
        return cb !== callback
      })
    }
  }
}

const FPS_30 = 1 / 30

export class FixedStage extends Stage {
  private fixedStep: number
  private maxSubsteps: number
  private accumulator: number
  private factor: number

  constructor(name: string, fixedStep = FPS_30, maxSubSteps = 5) {
    super(name)

    this.fixedStep = fixedStep
    this.maxSubsteps = maxSubSteps
    this.accumulator = 0
    this.factor = 0
  }

  frame(state: RootState, delta: number, frame?: THREE.XRFrame | undefined) {
    const initialTime = performance.now()
    let substeps = 0

    this.accumulator += delta

    while (this.accumulator >= this.fixedStep && substeps < this.maxSubsteps) {
      this.accumulator -= this.fixedStep
      substeps++

      super.frame(state, this.fixedStep)

      if (performance.now() - initialTime > this.fixedStep * 1000) {
        // The framerate is not interactive anymore. Better bail out.
        break
      }
    }
    // If the this.accumulator is bigger than delta, set it to 1.
    // It should never be bigger than delta unless something went wrong.
    this.accumulator = this.accumulator % this.fixedStep
    this.factor = this.accumulator / this.fixedStep
  }

  set(options: FixedStageOptions) {
    const { fixedStep, maxSubSteps } = options
    if (fixedStep) this.fixedStep = fixedStep
    if (maxSubSteps) this.maxSubsteps = maxSubSteps
  }

  get() {
    return {
      fixedStep: this.fixedStep,
      maxSubsteps: this.maxSubsteps,
      accumulator: this.accumulator,
      factor: this.factor,
    }
  }
}

const Early = new Stage('early')
const Fixed = new FixedStage('fixed')
const Update = new Stage('update')
const Late = new Stage('late')
const Render = new Stage('render')
const After = new Stage('after')

export const Standard = { Early, Fixed, Update, Late, Render, After }
export const StandardPipeline = [Early, Fixed, Update, Late, Render, After]
