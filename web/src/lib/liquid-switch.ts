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
 * Liquid Glass Switch — shuding/liquid-glass 移植
 * 原理：canvas 生成圆角矩形 SDF 位移贴图 → SVG feDisplacementMap →
 *       backdrop-filter: url(#filter) 让开关背后的内容在边缘产生真实折射。
 * 一个共享 filter 实例服务全页所有开关（贴图只生成一次）。
 */

const SWITCH_FILTER_ID = 'liquid-switch-filter'

function smoothStep(a: number, b: number, t: number) {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}

function length(x: number, y: number) {
  return Math.sqrt(x * x + y * y)
}

/** 圆角矩形有向距离场 */
function roundedRectSDF(x: number, y: number, width: number, height: number, radius: number) {
  const qx = Math.abs(x) - width + radius
  const qy = Math.abs(y) - height + radius
  return Math.min(Math.max(qx, qy), 0) + length(Math.max(qx, 0), Math.max(qy, 0)) - radius
}

let injected = false

/** 全局注入一次：SVG filter + 位移贴图 canvas */
export function injectLiquidSwitchFilter() {
  if (injected || typeof document === 'undefined') return
  injected = true

  // 尊重用户偏好与低能力设备
  if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return

  const SIZE = 64 // 贴图分辨率（开关很小，64 足够平滑）

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;'

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
  const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter')
  filter.setAttribute('id', SWITCH_FILTER_ID)
  filter.setAttribute('filterUnits', 'objectBoundingBox')
  filter.setAttribute('x', '0')
  filter.setAttribute('y', '0')
  filter.setAttribute('width', '1')
  filter.setAttribute('height', '1')
  filter.setAttribute('colorInterpolationFilters', 'sRGB')

  const feImage = document.createElementNS('http://www.w3.org/2000/svg', 'feImage')
  feImage.setAttribute('id', `${SWITCH_FILTER_ID}-map`)
  feImage.setAttribute('width', '1')
  feImage.setAttribute('height', '1')

  const feDisplacementMap = document.createElementNS('http://www.w3.org/2000/svg', 'feDisplacementMap')
  feDisplacementMap.setAttribute('in', 'SourceGraphic')
  feDisplacementMap.setAttribute('in2', `${SWITCH_FILTER_ID}-map`)
  feDisplacementMap.setAttribute('xChannelSelector', 'R')
  feDisplacementMap.setAttribute('yChannelSelector', 'G')
  feDisplacementMap.setAttribute('scale', '6')

  filter.appendChild(feImage)
  filter.appendChild(feDisplacementMap)
  defs.appendChild(filter)
  svg.appendChild(defs)
  document.body.appendChild(svg)

  // 生成位移贴图：胶囊形 SDF，边缘向内折射（凸透镜）
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(SIZE, SIZE)

  for (let i = 0; i < imageData.data.length; i += 4) {
    const x = ((i / 4) % SIZE) / SIZE - 0.5
    const y = Math.floor(i / 4 / SIZE) / SIZE - 0.5
    // 胶囊 SDF（开关形状 32:18.4 ≈ 宽半径 0.36 高 0.21）
    const d = roundedRectSDF(x, y, 0.36, 0.20, 0.19)
    // 边缘 0.14 带宽内折射，越靠边越强
    const displacement = smoothStep(0.6, 0, d - 0.08)
    const scaled = smoothStep(0, 1, displacement)
    // 位移向量：指向中心收缩（凸透镜折射）
    const dx = x * scaled
    const dy = y * scaled
    imageData.data[i] = (dx * 2 + 0.5) * 255
    imageData.data[i + 1] = (dy * 2 + 0.5) * 255
    imageData.data[i + 2] = 0
    imageData.data[i + 3] = 255
  }
  ctx.putImageData(imageData, 0, 0)

  feImage.setAttribute('href', canvas.toDataURL())
}
