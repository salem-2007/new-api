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
 * Global liquid-glass refraction filters.
 *
 * The glass surfaces in `styles/liquid-glass.css` /
 * `styles/liquid-components.css` reference these by id through
 * `backdrop-filter: url(#glass-distortion) ...`, so the definitions must exist
 * in the document before any of them paint. Both are injected once, on boot.
 *
 *   glass-distortion       the user-supplied preset: fractalNoise
 *                          (baseFrequency 0.008, 2 octaves, seed 92) -> gaussian
 *                          (stdDeviation 2) -> feDisplacementMap scale 99.
 *   glass-distortion-soft  the same displacement at scale 12, for controls the
 *                          full 99px offset would shred (switches).
 */

const NS = 'http://www.w3.org/2000/svg'

interface DistortionSpec {
  id: string
  scale: number
}

const DISTORTIONS: DistortionSpec[] = [
  { id: 'glass-distortion', scale: 99 },
  { id: 'glass-distortion-soft', scale: 12 },
]

let injected = false

function buildDistortionFilter(spec: DistortionSpec): SVGFilterElement {
  const filter = document.createElementNS(NS, 'filter')
  filter.setAttribute('id', spec.id)
  filter.setAttribute('x', '0%')
  filter.setAttribute('y', '0%')
  filter.setAttribute('width', '100%')
  filter.setAttribute('height', '100%')
  filter.setAttribute('colorInterpolationFilters', 'sRGB')

  const turbulence = document.createElementNS(NS, 'feTurbulence')
  turbulence.setAttribute('type', 'fractalNoise')
  turbulence.setAttribute('baseFrequency', '0.008 0.008')
  turbulence.setAttribute('numOctaves', '2')
  turbulence.setAttribute('seed', '92')
  turbulence.setAttribute('result', 'noise')

  const blur = document.createElementNS(NS, 'feGaussianBlur')
  blur.setAttribute('in', 'noise')
  blur.setAttribute('stdDeviation', '2')
  blur.setAttribute('result', 'blurred')

  const displacement = document.createElementNS(NS, 'feDisplacementMap')
  displacement.setAttribute('in', 'SourceGraphic')
  displacement.setAttribute('in2', 'blurred')
  displacement.setAttribute('scale', String(spec.scale))
  displacement.setAttribute('xChannelSelector', 'R')
  displacement.setAttribute('yChannelSelector', 'G')

  filter.append(turbulence, blur, displacement)
  return filter
}

export function injectLiquidGlassFilter(): void {
  if (injected || typeof document === 'undefined') return
  injected = true

  const missing = DISTORTIONS.filter(
    (spec) => !document.getElementById(spec.id)
  )
  if (missing.length === 0) return

  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;'

  const defs = document.createElementNS(NS, 'defs')
  for (const spec of missing) {
    defs.appendChild(buildDistortionFilter(spec))
  }
  svg.appendChild(defs)
  document.body.appendChild(svg)
}
