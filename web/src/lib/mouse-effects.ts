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
 * 鼠标动画集：firework(点击烟花) / heart(滑动爱心) / text(点击随机文字) / particle(粒子拖尾)
 * 每个效果独立挂载/卸载；syncMouseEffects 按偏好同步开关状态。
 * 移动端（pointer: coarse）自动禁用。
 */
import type { MouseEffect } from './glass-preference'

type Cleaner = () => void
const active = new Map<MouseEffect, Cleaner>()
const isDesktop = () =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches

function makeCanvas(zIndex: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${zIndex};`
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')!
  const resize = () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }
  resize()
  window.addEventListener('resize', resize)
  return { canvas, ctx }
}

/* ---------- 粒子拖尾 ---------- */
function mountParticle(): Cleaner {
  const { canvas, ctx } = makeCanvas(9998)
  const colors = ['#aac6ff', '#c3b8ff', '#8ec5ff', '#e0c3fc']
  const parts: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = []
  let raf = 0
  const onMove = (e: MouseEvent) => {
    for (let i = 0; i < 3; i++) {
      parts.push({
        x: e.clientX, y: e.clientY,
        vx: (Math.random() - 0.5) * 1.6, vy: (Math.random() - 0.5) * 1.6,
        life: 1, color: colors[Math.floor(Math.random() * colors.length)],
      })
    }
    if (parts.length > 200) parts.splice(0, parts.length - 200)
  }
  const tick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      p.x += p.vx; p.y += p.vy; p.life -= 0.02
      if (p.life <= 0) { parts.splice(i, 1); continue }
      ctx.globalAlpha = p.life
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, 2.4 * p.life, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    raf = requestAnimationFrame(tick)
  }
  window.addEventListener('mousemove', onMove, { passive: true })
  raf = requestAnimationFrame(tick)
  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('resize', () => {})
    canvas.remove()
  }
}

/* ---------- 点击烟花 ---------- */
function mountFirework(): Cleaner {
  const { canvas, ctx } = makeCanvas(9997)
  const sparks: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = []
  let raf = 0
  const onDown = (e: MouseEvent) => {
    const hues = [210, 265, 320, 45]
    for (let i = 0; i < 60; i++) {
      const a = (Math.PI * 2 * i) / 60
      const v = 2 + Math.random() * 4
      sparks.push({
        x: e.clientX, y: e.clientY,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 1, color: `hsl(${hues[i % hues.length]} 90% 65%)`,
      })
    }
  }
  const tick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]
      p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life -= 0.018
      if (p.life <= 0) { sparks.splice(i, 1); continue }
      ctx.globalAlpha = p.life
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    raf = requestAnimationFrame(tick)
  }
  window.addEventListener('click', onDown)
  raf = requestAnimationFrame(tick)
  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('click', onDown)
    canvas.remove()
  }
}

/* ---------- 滑动爱心 ---------- */
function mountHeart(): Cleaner {
  const { canvas, ctx } = makeCanvas(9996)
  const hearts: { x: number; y: number; size: number; life: number; hue: number }[] = []
  let last = 0
  let raf = 0
  const onMove = (e: MouseEvent) => {
    const now = performance.now()
    if (now - last < 90) return
    last = now
    hearts.push({ x: e.clientX, y: e.clientY, size: 8 + Math.random() * 8, life: 1, hue: 330 + Math.random() * 30 })
  }
  const drawHeart = (x: number, y: number, s: number) => {
    ctx.beginPath()
    ctx.moveTo(x, y + s * 0.3)
    ctx.bezierCurveTo(x, y, x - s / 2, y, x - s / 2, y + s * 0.3)
    ctx.bezierCurveTo(x - s / 2, y + s * 0.6, x, y + s * 0.8, x, y + s)
    ctx.bezierCurveTo(x, y + s * 0.8, x + s / 2, y + s * 0.6, x + s / 2, y + s * 0.3)
    ctx.bezierCurveTo(x + s / 2, y, x, y, x, y + s * 0.3)
    ctx.fill()
  }
  const tick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (let i = hearts.length - 1; i >= 0; i--) {
      const h = hearts[i]
      h.y -= 1.2; h.life -= 0.016
      if (h.life <= 0) { hearts.splice(i, 1); continue }
      ctx.globalAlpha = h.life
      ctx.fillStyle = `hsl(${h.hue} 85% 70%)`
      drawHeart(h.x, h.y, h.size)
    }
    ctx.globalAlpha = 1
    raf = requestAnimationFrame(tick)
  }
  window.addEventListener('mousemove', onMove, { passive: true })
  raf = requestAnimationFrame(tick)
  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('mousemove', onMove)
    canvas.remove()
  }
}

/* ---------- 点击随机文字 ---------- */
function mountText(): Cleaner {
  const words = ['OpenAI', 'Claude', 'Gemini', 'DeepSeek', 'GLM', 'Moonshot', 'MiniMax', 'Grok', 'Mistral', 'Kimi', 'Qwen', 'Llama']
  let idx = 0
  const onDown = (e: MouseEvent) => {
    const el = document.createElement('span')
    el.textContent = words[idx++ % words.length]
    el.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY - 16}px;pointer-events:none;z-index:99999;font-size:14px;font-weight:600;color:#a5c8ff;text-shadow:0 0 8px rgba(96,165,250,.8);animation:me-text-float 1s ease-out forwards;`
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 1000)
  }
  const style = document.createElement('style')
  style.textContent = '@keyframes me-text-float{to{transform:translateY(-46px);opacity:0}}'
  document.head.appendChild(style)
  window.addEventListener('click', onDown)
  return () => {
    window.removeEventListener('click', onDown)
    style.remove()
  }
}

const MOUNTS: Record<MouseEffect, () => Cleaner> = {
  particle: mountParticle,
  firework: mountFirework,
  heart: mountHeart,
  text: mountText,
}

/** 按偏好同步效果开关状态（幂等） */
export function syncMouseEffects(wanted: MouseEffect[]) {
  if (!isDesktop()) wanted = []
  // 卸载不再需要的
  for (const [name, clean] of active) {
    if (!wanted.includes(name)) { clean(); active.delete(name) }
  }
  // 挂载新启用的
  for (const name of wanted) {
    if (!active.has(name) && MOUNTS[name]) active.set(name, MOUNTS[name]())
  }
}