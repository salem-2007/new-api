/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MouseEffect } from '../glass-preference'

type FakeContext = {
  setTransform: ReturnType<typeof vi.fn>
  save: ReturnType<typeof vi.fn>
  restore: ReturnType<typeof vi.fn>
  clearRect: ReturnType<typeof vi.fn>
  beginPath: ReturnType<typeof vi.fn>
  moveTo: ReturnType<typeof vi.fn>
  lineTo: ReturnType<typeof vi.fn>
  stroke: ReturnType<typeof vi.fn>
  arc: ReturnType<typeof vi.fn>
  bezierCurveTo: ReturnType<typeof vi.fn>
  fill: ReturnType<typeof vi.fn>
  globalAlpha: number
  fillStyle: string
  strokeStyle: string
  lineWidth: number
  lineCap: string
}

function createFakeContext(): FakeContext {
  return {
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    bezierCurveTo: vi.fn(),
    fill: vi.fn(),
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Largest single clear area seen so far — the whole point of dirty rects. */
function largestClear(context: FakeContext): number {
  let largest = 0
  for (const call of context.clearRect.mock.calls) {
    largest = Math.max(largest, Number(call[2]) * Number(call[3]))
  }
  return largest
}

async function loadModule() {
  vi.resetModules()
  return import('../mouse-effects')
}

function enableFinePointer() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('pointer: fine'),
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList
  )
}

let context: FakeContext

beforeEach(() => {
  context = createFakeContext()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as RenderingContext
  )
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  enableFinePointer()
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('mouse effects', () => {
  it('does not allocate a canvas when no effect is selected', async () => {
    const { syncMouseEffects } = await loadModule()

    syncMouseEffects([])

    expect(document.querySelector('canvas')).toBeNull()
  })

  it('renders the text effect without a canvas', async () => {
    const { syncMouseEffects } = await loadModule()

    syncMouseEffects(['text'] as MouseEffect[])

    expect(document.querySelector('canvas')).toBeNull()
    window.dispatchEvent(new MouseEvent('click', { clientX: 10, clientY: 10 }))
    expect(document.body.textContent).toBe('OpenAI')

    syncMouseEffects([])
  })

  it('runs the firework on a composited, dirty-rect canvas', async () => {
    const { syncMouseEffects } = await loadModule()
    syncMouseEffects(['firework'])

    const canvas = document.querySelector('canvas')
    expect(canvas).not.toBeNull()
    expect(canvas?.style.cssText).toContain('translateZ(0)')
    expect(canvas?.style.cssText).toContain('will-change: transform')
    const canvasWidth = Number(canvas?.width ?? 0)
    const canvasHeight = Number(canvas?.height ?? 0)
    expect(canvasWidth).toBeGreaterThan(0)

    window.dispatchEvent(new MouseEvent('click', { clientX: 80, clientY: 90 }))
    await delay(80)

    expect(context.arc.mock.calls.length).toBeGreaterThan(0)
    expect(context.fill.mock.calls.length).toBeGreaterThan(0)
    // Every frame clears only the burst's bounding box, never the full canvas.
    expect(largestClear(context)).toBeLessThan(canvasWidth * canvasHeight * 0.1)

    syncMouseEffects([])
  })

  it('batches particles into few fills and stops drawing once they expire', async () => {
    const { syncMouseEffects } = await loadModule()
    syncMouseEffects(['firework'])

    window.dispatchEvent(
      new MouseEvent('click', { clientX: 120, clientY: 120 })
    )
    await delay(80)

    // One burst is 44 arcs, drawn through a handful of grouped fills.
    const arcs = context.arc.mock.calls.length
    const fills = context.fill.mock.calls.length
    expect(arcs).toBeGreaterThan(10)
    expect(fills).toBeLessThan(arcs)

    // The burst lives for ~0.85s; afterwards the loop must go idle.
    await delay(1200)
    const settledFills = context.fill.mock.calls.length
    await delay(250)
    expect(context.fill.mock.calls.length).toBe(settledFills)
  })

  it('draws the particle trail around the pointer and clears on leaving', async () => {
    const { syncMouseEffects } = await loadModule()
    syncMouseEffects(['particle'])

    const canvas = document.querySelector('canvas')
    const canvasWidth = Number(canvas?.width ?? 0)
    const canvasHeight = Number(canvas?.height ?? 0)

    // Particles start at the window centre, so parking the pointer there keeps
    // the measurement on the settled footprint rather than on the first catch-up
    // frame, where the trail legitimately spans centre-to-pointer.
    const centreX = Math.floor(window.innerWidth / 2)
    const centreY = Math.floor(window.innerHeight / 2)
    for (let i = 0; i < 6; i++) {
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: centreX + i * 4,
          clientY: centreY,
        })
      )
      await delay(40)
    }

    expect(context.stroke.mock.calls.length).toBeGreaterThan(0)
    expect(context.lineTo.mock.calls.length).toBeGreaterThan(0)
    // A bounded trail box, not a full-canvas wipe: the canvas is ~331k px².
    expect(largestClear(context)).toBeLessThan(canvasWidth * canvasHeight * 0.1)

    const strokesBeforeLeave = context.stroke.mock.calls.length
    window.dispatchEvent(
      new PointerEvent('pointerout', { relatedTarget: null })
    )
    await delay(120)

    // The residue is wiped and the loop goes idle.
    const clearedAfterLeave = context.clearRect.mock.calls.length
    await delay(200)
    expect(context.clearRect.mock.calls.length).toBe(clearedAfterLeave)
    expect(context.stroke.mock.calls.length).toBeGreaterThanOrEqual(
      strokesBeforeLeave
    )

    syncMouseEffects([])
  })
})
