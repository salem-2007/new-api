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
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
/**
 * 鼠标动画集 v2（性能优化版）：
 * - 单个共享 canvas + 单个 rAF 循环（不再每个效果一个全屏画布）
 * - 渲染分辨率 0.75x（肉眼无差，像素量 -44%）
 * - 页面不可见时自动暂停
 * - 粒子/烟花对象池上限保护
 * 效果：firework(点击烟花) / heart(滑动爱心) / text(点击文字·供应商名) / particle(轨道拖尾)
 */
import type { MouseEffect } from './glass-preference'

type Cleaner = () => void
const active = new Map<MouseEffect, Cleaner>()
const isDesktop = () =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches

// 共享渲染上下文
let sharedCanvas: HTMLCanvasElement | null = null
let sharedCtx: CanvasRenderingContext2D | null = null
let sharedRaf = 0
let running = false
const renderers = new Set<() => void>()

function getShared(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!sharedCanvas) {
    sharedCanvas = document.createElement('canvas')
    sharedCanvas.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:9985;'
    document.body.appendChild(sharedCanvas)
    sharedCtx = sharedCanvas.getContext('2d', { alpha: true })!
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 1) * 0.75
  sharedCanvas.width = Math.floor(window.innerWidth * dpr)
  sharedCanvas.height = Math.floor(window.innerHeight * dpr)
  sharedCanvas.style.width = window.innerWidth + 'px'
  sharedCanvas.style.height = window.innerHeight + 'px'
  sharedCtx!.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { canvas: sharedCanvas, ctx: sharedCtx! }
}

function ensureLoop() {
  if (running) return
  running = true
  const loop = () => {
    if (!running) return
    if (document.hidden) {
      sharedRaf = requestAnimationFrame(loop)
      return
    }
    for (const r of renderers) r()
    sharedRaf = requestAnimationFrame(loop)
  }
  sharedRaf = requestAnimationFrame(loop)
}

function stopLoopIfIdle() {
  if (renderers.size === 0 && running) {
    running = false
    cancelAnimationFrame(sharedRaf)
    sharedCtx?.clearRect(0, 0, sharedCanvas!.width, sharedCanvas!.height)
  }
}

function onResize(cb: () => void): Cleaner {
  window.addEventListener('resize', cb, { passive: true })
  return () => window.removeEventListener('resize', cb)
}

/* ---------- 轨道拖尾（particle） ---------- */
function makeParticleRenderer(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  const colors = ['#00bdff', '#4d39ce', '#088eff']
  const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  const particles: {
    x: number; y: number; radius: number; color: string
    radians: number; velocity: number; distance: number
    lastMouse: { x: number; y: number }
  }[] = []
  const W = () => window.innerWidth
  const H = () => window.innerHeight

  for (let i = 0; i < 24; i++) {
    particles.push({
      x: W() / 2, y: H() / 2,
      radius: Math.random() * 1.8 + 0.8,
      color: colors[Math.floor(Math.random() * colors.length)],
      radians: Math.random() * Math.PI * 2,
      velocity: 0.04 + Math.random() * 0.02,
      distance: 18 + Math.random() * 34,
      lastMouse: { x: W() / 2, y: H() / 2 },
    })
  }
  const onMove = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY }
  window.addEventListener('mousemove', onMove, { passive: true })
  ctx.lineCap = 'round'

  return {
    onResize: () => {},
    cleanup: () => window.removeEventListener('mousemove', onMove),
    frame: () => {
      // 拖尾：隔帧擦除（省一半填充），alpha 稍高保持连贯
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = 'rgba(0,0,0,0.16)'
      ctx.fillRect(0, 0, W(), H())
      ctx.globalCompositeOperation = 'source-over'
      for (const p of particles) {
        const last = { x: p.x, y: p.y }
        p.radians += p.velocity
        p.lastMouse.x += (mouse.x - p.lastMouse.x) * 0.06
        p.lastMouse.y += (mouse.y - p.lastMouse.y) * 0.06
        p.x = p.lastMouse.x + Math.cos(p.radians) * (p.distance + Math.sin(p.radians) * 36)
        p.y = p.lastMouse.y + Math.sin(p.radians) * (p.distance + Math.sin(p.radians) * 36)
        ctx.strokeStyle = p.color
        ctx.lineWidth = p.radius
        ctx.beginPath()
        ctx.moveTo(last.x, last.y)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
      }
    },
  }
}

/* ---------- 点击烟花（firework） ---------- */
function makeFireworkRenderer(ctx: CanvasRenderingContext2D) {
  const sparks: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = []
  const MAX = 240
  const onDown = (e: MouseEvent) => {
    const hues = [210, 265, 320, 45]
    for (let i = 0; i < 44 && sparks.length < MAX; i++) {
      const a = (Math.PI * 2 * i) / 44
      const v = 2 + Math.random() * 3.6
      sparks.push({
        x: e.clientX, y: e.clientY,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 1, color: `hsl(${hues[i % hues.length]} 90% 65%)`,
      })
    }
  }
  window.addEventListener('click', onDown)
  return {
    onResize: () => {},
    cleanup: () => window.removeEventListener('click', onDown),
    frame: () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]
        p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life -= 0.02
        if (p.life <= 0) { sparks.splice(i, 1); continue }
        ctx.globalAlpha = p.life
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    },
  }
}

/* ---------- 滑动爱心（heart） ---------- */
function makeHeartRenderer(ctx: CanvasRenderingContext2D) {
  const hearts: { x: number; y: number; size: number; life: number; hue: number }[] = []
  let last = 0
  const onMove = (e: MouseEvent) => {
    const now = performance.now()
    if (now - last < 110) return
    last = now
    hearts.push({ x: e.clientX, y: e.clientY, size: 6 + Math.random() * 7, life: 1, hue: 330 + Math.random() * 30 })
    if (hearts.length > 60) hearts.shift()
  }
  window.addEventListener('mousemove', onMove, { passive: true })
  return {
    onResize: () => {},
    cleanup: () => window.removeEventListener('mousemove', onMove),
    frame: () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      for (let i = hearts.length - 1; i >= 0; i--) {
        const h = hearts[i]
        h.y -= 1.1; h.life -= 0.016
        if (h.life <= 0) { hearts.splice(i, 1); continue }
        ctx.globalAlpha = h.life
        ctx.fillStyle = `hsl(${h.hue} 85% 70%)`
        const s = h.size, x = h.x, y = h.y
        ctx.beginPath()
        ctx.moveTo(x, y + s * 0.3)
        ctx.bezierCurveTo(x, y, x - s / 2, y, x - s / 2, y + s * 0.3)
        ctx.bezierCurveTo(x - s / 2, y + s * 0.6, x, y + s * 0.8, x, y + s)
        ctx.bezierCurveTo(x, y + s * 0.8, x + s / 2, y + s * 0.6, x + s / 2, y + s * 0.3)
        ctx.bezierCurveTo(x + s / 2, y, x, y, x, y + s * 0.3)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    },
  }
}

/* ---------- 点击文字（text）— 供应商名 ---------- */
function makeTextRenderer() {
  const words = ['OpenAI', 'Claude', 'Gemini', 'DeepSeek', 'GLM', 'Moonshot', 'MiniMax', 'Grok', 'Mistral', 'Kimi', 'Qwen', 'Llama']
  let idx = 0
  const onDown = (e: MouseEvent) => {
    const el = document.createElement('span')
    el.textContent = words[idx++ % words.length]
    el.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY - 18}px;pointer-events:none;z-index:99999;font-size:20px;font-weight:700;color:#a5c8ff;text-shadow:0 0 12px rgba(96,165,250,.9);animation:me-text-float 0.9s ease-out forwards;`
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 900)
  }
  const style = document.createElement('style')
  style.textContent = '@keyframes me-text-float{to{transform:translateY(-42px);opacity:0}}'
  document.head.appendChild(style)
  window.addEventListener('click', onDown)
  return {
    onResize: () => {},
    cleanup: () => { window.removeEventListener('click', onDown); style.remove() },
    frame: () => {},
  }
}

const FACTORIES: Record<MouseEffect, (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => { frame: () => void; cleanup: () => void; onResize: () => void }> = {
  particle: makeParticleRenderer,
  firework: makeFireworkRenderer,
  heart: makeHeartRenderer,
  text: () => makeTextRenderer(),
}

/** 按偏好同步效果开关状态（幂等；单选语义由调用方保证 wanted 最多 1 个 canvas 效果） */
export function syncMouseEffects(wanted: MouseEffect[]) {
  if (!isDesktop()) wanted = []
  // 卸载不再需要的
  for (const [name, clean] of active) {
    if (!wanted.includes(name)) { clean(); active.delete(name) }
  }
  // 挂载新启用的
  const canvasNeeded = wanted.filter((w) => w !== 'text')
  if (canvasNeeded.length > 0 && !sharedCanvas) {
    const { canvas, ctx } = getShared()
    void canvas; void ctx
  }
  for (const name of wanted) {
    if (active.has(name)) continue
    if (name === 'text') {
      const r = FACTORIES.text()
      active.set(name, r.cleanup); renderers.add(r.frame)
    } else {
      if (!sharedCanvas || !sharedCtx) continue
      const r = FACTORIES[name](sharedCtx, sharedCanvas)
      active.set(name, () => { r.cleanup(); renderers.delete(r.frame); stopLoopIfIdle() })
      renderers.add(r.frame)
    }
  }
  if (active.size > 0) ensureLoop()
  else stopLoopIfIdle()
}

// 窗口尺寸变化：重设共享画布
let resizeCleaner: Cleaner | null = null
export function attachGlobalResize() {
  if (resizeCleaner || typeof window === 'undefined') return
  resizeCleaner = onResize(() => {
    if (sharedCanvas) {
      const dpr = 0.75
      sharedCanvas.width = Math.floor(window.innerWidth * dpr)
      sharedCanvas.height = Math.floor(window.innerHeight * dpr)
      sharedCtx?.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
  })
}
