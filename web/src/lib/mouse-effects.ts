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
/**
 * 鼠标动画集 v3（流畅度优化版）
 *
 * v2 已经把四个效果合并到「共享 canvas + 单 rAF + 0.75x 分辨率」，但滑动仍然卡：
 * 每帧全屏 clearRect/destination-out 淡出、每个效果各自监听鼠标事件（未节流）、
 * 高分屏下空转、没有帧率上限。v3 的优化点：
 * 1. 帧率上限：每个效果声明目标帧率（烟花 60 / 爱心 40 / 轨道 30），运动按时间
 *    步长推进，掉帧时速度不变、不抖。
 * 2. 脏矩形擦除：不再整屏清屏，只擦「上一帧 + 本帧」画过的包围盒；轨道效果从全屏
 *    destination-out 淡出改成有界渐隐拖尾，像素开销从 ~1M 降到 ~10K。
 * 3. 指针事件节流：全局只挂 1 个 passive pointermove，只记录最新坐标，效果在帧里
 *    采样（原来是每个效果各挂一个监听，爱心还在事件回调里做逻辑）。
 * 4. 空闲即停：没有存活粒子时不描边、不清屏；仅 text 效果时完全不起 canvas/rAF
 *    （text 是纯 DOM + CSS 动画）；没有任何效果时移除全局监听。
 * 5. 合批绘制：烟花/爱心按「颜色 + 量化透明度」分组，一次 path + fill 覆盖同组所有
 *    粒子（240 个火花从 240 次 fill 降到十几次）。
 * 6. 降级：页面隐藏 / 窗口失焦 / 滚动中（捕获阶段监听 + 140ms 静默窗口）暂停绘制。
 * 7. 合成层与分辨率：canvas 提升为独立合成层（translateZ + will-change），避免连带
 *    重绘页面；分辨率按视口面积分档（大屏降采样），且不超过 0.9 设备像素/CSS 像素。
 * 8. 粒子上限：烟花 240 / 爱心 48 / 轨道 18，外加全局 320 的兜底上限。
 *
 * 效果：firework(点击烟花) / heart(滑动爱心) / text(点击文字·供应商名) / particle(轨道拖尾)
 */
import type { MouseEffect } from './glass-preference'

type Cleaner = () => void

interface EffectHandle {
  /** 绘制一帧。`step` 为距上一帧的时长，单位是「60fps 帧」。 */
  frame: (step: number) => void
  cleanup: Cleaner
  /** 纯 DOM 效果（text）不占用 canvas 与 rAF。 */
  usesCanvas: boolean
  /** 目标帧率换算出的最小帧间隔（毫秒），限流后 step 才能按真实间隔换算。 */
  frameInterval: number
  nextFrameAt: number
  /** 上一次真正绘制的时间戳，用于计算该效果自己的时间步长。 */
  lastFrameAt: number
  /** 是否还有内容要画，决定循环是否继续占用 rAF。 */
  hasWork: () => boolean
}

interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

// ============================================================================
// 共享画布与主循环
// ============================================================================

/** 一帧的时间基准，用于把「每帧位移」常量换算成时间步长。 */
const BASE_FRAME_MS = 1000 / 60
/** 单帧最大步长：切换回前台或长任务之后不让粒子瞬移。 */
const MAX_STEP = 3
/** 滚动结束后继续暂停的静默时间。 */
const SCROLL_IDLE_MS = 140
/** 全局粒子数兜底上限。 */
const MAX_TOTAL_SPRITES = 320

const effects = new Map<MouseEffect, EffectHandle>()

let surfaceCanvas: HTMLCanvasElement | null = null
let surfaceCtx: CanvasRenderingContext2D | null = null
let loopRunning = false
let rafId = 0
let pointerAttached = false
let scrollAttached = false
let resizeAttached = false
let lifecycleAttached = false
let resizeTimer: ReturnType<typeof setTimeout> | undefined
let scrollIdleTimer: ReturnType<typeof setTimeout> | undefined
let scrolling = false
let totalSprites = 0

const isDesktop = () =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches

/** 共享指针状态：事件只写这四个字段，效果每帧读一次。 */
const pointer = {
  x: 0,
  y: 0,
  inside: false,
  movedAt: 0,
}

function onPointerMove(event: PointerEvent) {
  pointer.x = event.clientX
  pointer.y = event.clientY
  pointer.inside = true
  pointer.movedAt = performance.now()
  // 循环可能因为「无内容可画」而停止，指针再次移动时唤醒它。
  if (!loopRunning) wake()
}

function onPointerOut(event: PointerEvent) {
  // relatedTarget 非空说明只是在页面元素之间移动，不算离开窗口。
  if (event.relatedTarget) return
  pointer.inside = false
}

function onScroll() {
  // 滚动本身已经占满主线程，动画让路；停止后再静置一小段时间才恢复。
  scrolling = true
  if (scrollIdleTimer) clearTimeout(scrollIdleTimer)
  scrollIdleTimer = setTimeout(() => {
    scrolling = false
    wake()
  }, SCROLL_IDLE_MS)
}

/** 恢复绘制：重置时间步长基准，避免暂停期间累积出一个大跳跃。 */
function onResume() {
  if (shouldPause()) return
  for (const effect of effects.values()) effect.lastFrameAt = 0
  wake()
}

function attachLifecycle() {
  if (lifecycleAttached || typeof window === 'undefined') return
  lifecycleAttached = true
  window.addEventListener('focus', onResume)
  document.addEventListener('visibilitychange', onResume)
}

function attachPointer() {
  if (pointerAttached || typeof window === 'undefined') return
  pointerAttached = true
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerout', onPointerOut, { passive: true })
}

function attachScroll() {
  if (scrollAttached || typeof window === 'undefined') return
  scrollAttached = true
  // 内部滚动容器（列表、表格）的 scroll 事件不冒泡，所以用捕获阶段。
  window.addEventListener('scroll', onScroll, { passive: true, capture: true })
}

function attachResize() {
  if (resizeAttached || typeof window === 'undefined') return
  resizeAttached = true
  window.addEventListener(
    'resize',
    () => {
      // 拖拽窗口时 resize 触发非常密集，防抖后再改画布尺寸。
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        applySurfaceSize()
        clearSurface()
      }, 150)
    },
    { passive: true }
  )
}

function shouldPause(): boolean {
  if (typeof document === 'undefined') return true
  if (document.hidden) return true
  if (scrolling) return true
  return !document.hasFocus()
}

/** 分辨率分档：效果都是柔光粒子，大屏宁可降采样也要帧率。 */
function resolveRenderScale(): number {
  const area = window.innerWidth * window.innerHeight
  let quality = 0.65
  if (area > 2_400_000) {
    quality = 0.45
  } else if (area > 1_300_000) {
    quality = 0.55
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
  return Math.min(dpr * quality, 0.9)
}

function applySurfaceSize() {
  const canvas = surfaceCanvas
  const ctx = surfaceCtx
  if (!canvas || !ctx || typeof window === 'undefined') return

  const scale = resolveRenderScale()
  const width = Math.max(1, Math.floor(window.innerWidth * scale))
  const height = Math.max(1, Math.floor(window.innerHeight * scale))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  canvas.style.width = `${window.innerWidth}px`
  canvas.style.height = `${window.innerHeight}px`
  // 修改 width/height 会重置上下文状态，缩放矩阵必须重新应用。
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
}

/**
 * 全画布清屏。必须先切回单位矩阵：画布缓冲区是 CSS 像素 × scale，
 * 在缩放矩阵下 clearRect 只能清掉一部分（v2 的残留 bug）。
 */
function clearSurface() {
  const canvas = surfaceCanvas
  const ctx = surfaceCtx
  if (!canvas || !ctx) return
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.restore()
}

function getSurface(): {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
} | null {
  if (surfaceCanvas && surfaceCtx) {
    return { canvas: surfaceCanvas, ctx: surfaceCtx }
  }
  if (typeof document === 'undefined') return null

  const canvas = document.createElement('canvas')
  // 独立合成层：动画只重绘自身，不连带重绘页面其它部分。
  canvas.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:9985;will-change:transform;transform:translateZ(0);'
  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) return null

  document.body.appendChild(canvas)
  surfaceCanvas = canvas
  surfaceCtx = ctx
  applySurfaceSize()
  attachScroll()
  attachResize()
  attachLifecycle()
  return { canvas, ctx }
}

function wake() {
  if (effects.size === 0 || loopRunning) return
  startLoop()
}

function startLoop() {
  if (loopRunning || typeof window === 'undefined') return
  loopRunning = true
  rafId = requestAnimationFrame(tick)
}

function stopLoop() {
  if (!loopRunning) return
  loopRunning = false
  cancelAnimationFrame(rafId)
  rafId = 0
}

function tick(timestamp: number) {
  if (!loopRunning) return
  rafId = requestAnimationFrame(tick)

  if (shouldPause()) {
    // 暂停期间彻底让出 rAF：由 focus / visibilitychange / scroll / pointermove 唤醒。
    for (const effect of effects.values()) effect.lastFrameAt = 0
    stopLoop()
    return
  }

  let busy = false
  for (const effect of effects.values()) {
    if (!effect.usesCanvas || !effect.hasWork()) continue
    busy = true
    if (timestamp < effect.nextFrameAt) continue
    // 时间步长按「该效果上一次真正绘制」计算：限流到 30fps 的效果拿到两倍
    // 步长，运动速度与 60fps 一致（若用 tick 间隔，限流就会让动画变慢）。
    const previous = effect.lastFrameAt
    effect.lastFrameAt = timestamp
    effect.nextFrameAt = timestamp + effect.frameInterval
    effect.frame(
      previous ? Math.min((timestamp - previous) / BASE_FRAME_MS, MAX_STEP) : 1
    )
  }
  // 所有效果都没有内容可画时让出 rAF，不再空转。
  if (!busy) stopLoop()
}

function growRect(rect: Rect | null, x: number, y: number, pad: number): Rect {
  if (!rect) return { x0: x - pad, y0: y - pad, x1: x + pad, y1: y + pad }
  if (x - pad < rect.x0) rect.x0 = x - pad
  if (y - pad < rect.y0) rect.y0 = y - pad
  if (x + pad > rect.x1) rect.x1 = x + pad
  if (y + pad > rect.y1) rect.y1 = y + pad
  return rect
}

function unionRect(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b
  if (!b) return a
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  }
}

function clearRect(ctx: CanvasRenderingContext2D, rect: Rect) {
  ctx.clearRect(rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0)
}

function trackSprite(delta: number) {
  totalSprites += delta
}

/** 还能再生成多少粒子：兼顾单个效果的上限和全局兜底上限。 */
function spriteBudget(headroom: number): number {
  return Math.max(0, Math.min(headroom, MAX_TOTAL_SPRITES - totalSprites))
}

// ============================================================================
// 效果实现
// ============================================================================

interface CanvasEffectFactory {
  (ctx: CanvasRenderingContext2D, wakeLoop: () => void): EffectHandle
}

/** 轨道拖尾：18 个绕光标旋转的粒子，各自保留一小段渐隐拖尾。 */
const makeParticleRenderer: CanvasEffectFactory = (ctx) => {
  const COLORS = ['#00bdff', '#4d39ce', '#088eff']
  const COUNT = 18
  const TRAIL_POINTS = 10
  const BANDS = 4
  const TAU = Math.PI * 2

  const particles = Array.from({ length: COUNT }, () => ({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    radius: Math.random() * 1.2 + 0.5,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    radians: Math.random() * TAU,
    velocity: 0.04 + Math.random() * 0.02,
    distance: 12 + Math.random() * 20,
    lastMouse: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    trail: [] as { x: number; y: number }[],
  }))

  // dirty 为上一帧画过的区域，本帧会与新区域取并集后一起擦除。
  let dirty: Rect | null = null

  ctx.lineCap = 'round'

  return {
    usesCanvas: true,
    frameInterval: 1000 / 30,
    nextFrameAt: 0,
    lastFrameAt: 0,
    // 指针离开窗口时还需要一帧把残留擦掉，所以 dirty 也计入工作量。
    hasWork: () => pointer.inside || dirty !== null,
    cleanup: () => {
      dirty = null
      clearSurface()
    },
    frame: (step) => {
      if (!pointer.inside) {
        // 指针移出窗口：擦掉最后一帧的拖尾，然后让循环自然停下。
        if (dirty) {
          clearRect(ctx, dirty)
          dirty = null
        }
        return
      }

      // 指数平滑按时间步长校正：1-(1-k)^step，帧率变化时光标跟随手感一致。
      const follow = Math.min(1, 1 - Math.pow(1 - 0.06, step))
      let next: Rect | null = null

      for (const particle of particles) {
        particle.radians += particle.velocity * step
        particle.lastMouse.x += (pointer.x - particle.lastMouse.x) * follow
        particle.lastMouse.y += (pointer.y - particle.lastMouse.y) * follow
        const spread = particle.distance + Math.sin(particle.radians) * 24
        particle.x = particle.lastMouse.x + Math.cos(particle.radians) * spread
        particle.y = particle.lastMouse.y + Math.sin(particle.radians) * spread

        particle.trail.push({ x: particle.x, y: particle.y })
        if (particle.trail.length > TRAIL_POINTS) particle.trail.shift()
        for (const point of particle.trail) {
          next = growRect(next, point.x, point.y, particle.radius + 2)
        }
      }

      const both = unionRect(dirty, next)
      if (both) clearRect(ctx, both)
      dirty = next
      if (!next) return

      for (const particle of particles) {
        const trail = particle.trail
        if (trail.length < 2) continue
        ctx.strokeStyle = particle.color
        ctx.lineWidth = particle.radius
        const last = trail.length - 1
        // 拖尾分 4 段透明度带绘制：段内一次 stroke，段间连续不留缝。
        for (let band = 0; band < BANDS; band++) {
          const from = Math.floor((band * last) / BANDS)
          const to = Math.floor(((band + 1) * last) / BANDS)
          if (to <= from) continue
          ctx.globalAlpha = 0.16 + 0.74 * ((band + 1) / BANDS)
          ctx.beginPath()
          ctx.moveTo(trail[from].x, trail[from].y)
          for (let i = from + 1; i <= to; i++) {
            ctx.lineTo(trail[i].x, trail[i].y)
          }
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
    },
  }
}

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: number
}

/** 点击烟花：按「颜色 + 量化透明度」合批，一次 fill 覆盖同组所有火花。 */
const makeFireworkRenderer: CanvasEffectFactory = (ctx, wakeLoop) => {
  const HUES = [210, 265, 320, 45]
  const SPARKS_PER_BURST = 44
  const MAX_SPARKS = 240
  const RADIUS = 2
  const TAU = Math.PI * 2

  const sparks: Spark[] = []
  let dirty: Rect | null = null

  const onDown = (event: MouseEvent) => {
    const count = Math.min(
      spriteBudget(MAX_SPARKS - sparks.length),
      SPARKS_PER_BURST
    )
    for (let i = 0; i < count; i++) {
      const angle = (TAU * i) / SPARKS_PER_BURST
      const speed = 2 + Math.random() * 3.6
      sparks.push({
        x: event.clientX,
        y: event.clientY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color: i % HUES.length,
      })
    }
    trackSprite(count)
    wakeLoop()
  }
  window.addEventListener('click', onDown)

  return {
    usesCanvas: true,
    frameInterval: 1000 / 60,
    nextFrameAt: 0,
    lastFrameAt: 0,
    hasWork: () => sparks.length > 0 || dirty !== null,
    cleanup: () => {
      window.removeEventListener('click', onDown)
      trackSprite(-sparks.length)
      sparks.length = 0
      dirty = null
      clearSurface()
    },
    frame: (step) => {
      if (sparks.length === 0) {
        // 最后一个火花消失后再擦一次，清掉残影。
        if (dirty) {
          clearRect(ctx, dirty)
          dirty = null
        }
        return
      }

      let next: Rect | null = null
      const groups = new Map<
        string,
        { color: number; alpha: number; xs: number[]; ys: number[] }
      >()

      for (let i = sparks.length - 1; i >= 0; i--) {
        const spark = sparks[i]
        spark.x += spark.vx * step
        spark.y += spark.vy * step
        spark.vy += 0.05 * step
        spark.life -= 0.02 * step
        if (spark.life <= 0) {
          sparks.splice(i, 1)
          trackSprite(-1)
          continue
        }
        next = growRect(next, spark.x, spark.y, RADIUS + 1)
        // 透明度量化到 1/8，让同色火花合并成一次 fill。
        const alpha = Math.max(1, Math.round(spark.life * 8)) / 8
        const key = `${spark.color}|${alpha}`
        let group = groups.get(key)
        if (!group) {
          group = { color: spark.color, alpha, xs: [], ys: [] }
          groups.set(key, group)
        }
        group.xs.push(spark.x)
        group.ys.push(spark.y)
      }

      // 先擦「上一帧 + 本帧」的并集，再统一绘制，避免擦掉本帧已画的内容。
      const both = unionRect(dirty, next)
      if (both) clearRect(ctx, both)
      dirty = next
      if (!next) return

      for (const group of groups.values()) {
        ctx.globalAlpha = group.alpha
        ctx.fillStyle = `hsl(${HUES[group.color]} 90% 65%)`
        ctx.beginPath()
        for (let i = 0; i < group.xs.length; i++) {
          const x = group.xs[i]
          const y = group.ys[i]
          ctx.moveTo(x + RADIUS, y)
          ctx.arc(x, y, RADIUS, 0, TAU)
        }
        ctx.fill()
      }
      ctx.globalAlpha = 1
    },
  }
}

interface Heart {
  x: number
  y: number
  size: number
  life: number
  hue: number
}

/** 滑动爱心：生成节奏由帧循环按 110ms 节流，不再跟着鼠标事件频率走。 */
const makeHeartRenderer: CanvasEffectFactory = (ctx) => {
  const SPAWN_INTERVAL_MS = 110
  const MAX_HEARTS = 48
  const hearts: Heart[] = []
  let lastSpawnAt = 0
  let dirty: Rect | null = null

  return {
    usesCanvas: true,
    frameInterval: 1000 / 40,
    nextFrameAt: 0,
    lastFrameAt: 0,
    hasWork: () => hearts.length > 0 || dirty !== null,
    cleanup: () => {
      trackSprite(-hearts.length)
      hearts.length = 0
      dirty = null
      clearSurface()
    },
    frame: (step) => {
      const now = performance.now()
      if (
        pointer.inside &&
        pointer.movedAt > lastSpawnAt &&
        now - lastSpawnAt >= SPAWN_INTERVAL_MS &&
        hearts.length < MAX_HEARTS &&
        spriteBudget(1) > 0
      ) {
        lastSpawnAt = now
        hearts.push({
          x: pointer.x,
          y: pointer.y,
          size: 6 + Math.random() * 7,
          life: 1,
          hue: 330 + Math.random() * 30,
        })
        trackSprite(1)
      }

      if (hearts.length === 0) {
        if (dirty) {
          clearRect(ctx, dirty)
          dirty = null
        }
        return
      }

      let next: Rect | null = null
      const groups = new Map<
        string,
        { hue: number; alpha: number; items: Heart[] }
      >()

      for (let i = hearts.length - 1; i >= 0; i--) {
        const heart = hearts[i]
        heart.y -= 1.1 * step
        heart.life -= 0.016 * step
        if (heart.life <= 0) {
          hearts.splice(i, 1)
          trackSprite(-1)
          continue
        }
        next = growRect(
          next,
          heart.x - heart.size / 2,
          heart.y,
          heart.size / 2 + 2
        )
        const alpha = Math.max(1, Math.round(heart.life * 8)) / 8
        const hue = Math.round(heart.hue / 10) * 10
        const key = `${hue}|${alpha}`
        let group = groups.get(key)
        if (!group) {
          group = { hue, alpha, items: [] }
          groups.set(key, group)
        }
        group.items.push(heart)
      }

      const both = unionRect(dirty, next)
      if (both) clearRect(ctx, both)
      dirty = next
      if (!next) return

      for (const group of groups.values()) {
        ctx.globalAlpha = group.alpha
        ctx.fillStyle = `hsl(${group.hue} 85% 70%)`
        ctx.beginPath()
        for (const heart of group.items) {
          appendHeart(ctx, heart)
        }
        ctx.fill()
      }
      ctx.globalAlpha = 1
    },
  }
}

function appendHeart(ctx: CanvasRenderingContext2D, heart: Heart) {
  const s = heart.size
  const x = heart.x
  const y = heart.y
  ctx.moveTo(x, y + s * 0.3)
  ctx.bezierCurveTo(x, y, x - s / 2, y, x - s / 2, y + s * 0.3)
  ctx.bezierCurveTo(x - s / 2, y + s * 0.6, x, y + s * 0.8, x, y + s)
  ctx.bezierCurveTo(
    x,
    y + s * 0.8,
    x + s / 2,
    y + s * 0.6,
    x + s / 2,
    y + s * 0.3
  )
  ctx.bezierCurveTo(x + s / 2, y, x, y, x, y + s * 0.3)
}

/** 点击文字：纯 DOM + CSS 动画，不占用 canvas 与 rAF。 */
function createTextEffect(): EffectHandle {
  const words = [
    'OpenAI',
    'Claude',
    'Gemini',
    'DeepSeek',
    'GLM',
    'Moonshot',
    'MiniMax',
    'Grok',
    'Mistral',
    'Kimi',
    'Qwen',
    'Llama',
  ]
  let index = 0
  const onDown = (event: MouseEvent) => {
    const el = document.createElement('span')
    el.textContent = words[index++ % words.length]
    el.style.cssText = `position:fixed;left:${event.clientX}px;top:${event.clientY - 18}px;pointer-events:none;z-index:99999;font-size:20px;font-weight:700;color:#a5c8ff;text-shadow:0 0 12px rgba(96,165,250,.9);animation:me-text-float 0.9s ease-out forwards;`
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 900)
  }
  const style = document.createElement('style')
  style.textContent =
    '@keyframes me-text-float{to{transform:translateY(-42px);opacity:0}}'
  document.head.appendChild(style)
  window.addEventListener('click', onDown)

  return {
    usesCanvas: false,
    frameInterval: 1000,
    nextFrameAt: 0,
    lastFrameAt: 0,
    hasWork: () => false,
    cleanup: () => {
      window.removeEventListener('click', onDown)
      style.remove()
    },
    frame: () => {},
  }
}

const CANVAS_FACTORIES: Record<
  Exclude<MouseEffect, 'text'>,
  CanvasEffectFactory
> = {
  particle: makeParticleRenderer,
  firework: makeFireworkRenderer,
  heart: makeHeartRenderer,
}

// ============================================================================
// 对外接口
// ============================================================================

/** 按偏好同步效果开关状态（幂等；单选语义由调用方保证 wanted 最多 1 个 canvas 效果） */
export function syncMouseEffects(wanted: MouseEffect[]) {
  const targets = isDesktop() ? wanted : []

  for (const [name, effect] of effects) {
    if (targets.includes(name)) continue
    effect.cleanup()
    effects.delete(name)
  }

  for (const name of targets) {
    if (effects.has(name)) continue
    if (name === 'text') {
      effects.set(name, createTextEffect())
      continue
    }
    const surface = getSurface()
    if (!surface) continue
    attachPointer()
    effects.set(name, CANVAS_FACTORIES[name](surface.ctx, wake))
  }

  if (effects.size === 0) {
    stopLoop()
    if (pointerAttached && typeof window !== 'undefined') {
      pointerAttached = false
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerout', onPointerOut)
      pointer.inside = false
    }
    return
  }
  wake()
}

/** 视口变化时重建画布缓冲；幂等，多次调用无副作用。 */
export function attachGlobalResize() {
  attachResize()
}
