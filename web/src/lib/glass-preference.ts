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

export type WallpaperOption =
  | 'custom-url' | 'default' | 'day-shinji' | 'day-asuka' | 'night-eva' | 'night-rei'
export type MouseEffect = 'firework' | 'heart' | 'text' | 'particle'

export type GlassFontOption = 'default' | 'a-wan-sleek'

export type GlassPreference = {
  liquidGlass: boolean
  glassPulse: boolean
  font: GlassFontOption
  wallpaperDay: WallpaperOption
  wallpaperNight: WallpaperOption
  mouseEffects: MouseEffect[]
}

export const GLASS_STORAGE_KEY = 'glass_preference'

export const WALLPAPER_ASSETS: Record<string, { day?: string; night?: string }> = {
  default: {
    day: 'https://img.cdn1.vip/i/6a9cb42a5b2e7_1788654634.webp',
    night: 'https://img.cdn1.vip/i/6a9cb42a5b2e7_1788654634.webp',
  },
  'day-shinji': { day: 'https://img.cdn1.vip/i/6a9cb42a5b2e7_1788654634.webp' },
  'day-asuka': { day: 'https://img.cdn1.vip/i/6a9cb42a5b2e7_1788654634.webp' },
  'night-eva': { night: 'https://img.cdn1.vip/i/6a9cb42a5b2e7_1788654634.webp' },
  'night-rei': { night: 'https://img.cdn1.vip/i/6a9cb42a5b2e7_1788654634.webp' },
}

export const DEFAULT_GLASS_PREFERENCE: GlassPreference = {
  liquidGlass: true,
  glassPulse: true,
  font: 'default',
  wallpaperDay: 'default',
  wallpaperNight: 'default',
  mouseEffects: [],
}

export function readGlassPreference(): GlassPreference {
  if (typeof window === 'undefined') return DEFAULT_GLASS_PREFERENCE
  try {
    const raw = localStorage.getItem(GLASS_STORAGE_KEY)
    if (!raw) return DEFAULT_GLASS_PREFERENCE
    const parsed = JSON.parse(raw) as Partial<GlassPreference>
    return {
      liquidGlass: parsed.liquidGlass ?? DEFAULT_GLASS_PREFERENCE.liquidGlass,
      glassPulse: parsed.glassPulse ?? DEFAULT_GLASS_PREFERENCE.glassPulse,
      font: parsed.font ?? DEFAULT_GLASS_PREFERENCE.font,
      wallpaperDay: parsed.wallpaperDay ?? 'default',
      wallpaperNight: parsed.wallpaperNight ?? 'default',
      mouseEffects: Array.isArray(parsed.mouseEffects) ? parsed.mouseEffects : [],
    }
  } catch {
    return DEFAULT_GLASS_PREFERENCE
  }
}

export function writeGlassPreference(pref: GlassPreference) {
  try {
    localStorage.setItem(GLASS_STORAGE_KEY, JSON.stringify(pref))
  } catch {
  }
}

/** 解析当前主题下应使用的壁纸 URL */
function resolveWallpaper(pref: GlassPreference, isDark: boolean): string {
  const pick = isDark ? pref.wallpaperNight : pref.wallpaperDay
  if (typeof pick === 'string' && pick.startsWith('custom-url:')) {
    return pick.slice(11)
  }
  const asset = WALLPAPER_ASSETS[pick]
  if (asset) return (isDark ? asset.night : asset.day) ?? asset.day ?? asset.night ?? ''
  return 'https://img.cdn1.vip/i/6a9cb42a5b2e7_1788654634.webp'
}

/** 把偏好应用到 DOM：body data 属性 + 壁纸变量 + 字体 + 鼠标动画 */
/** 合并服务端下发的壁纸偏好（跨设备同步：手机/电脑以服务端保存的壁纸为准） */
export function mergeServerWallpaper(
  pref: GlassPreference,
  serverThemePreference: unknown
): GlassPreference {
  if (!serverThemePreference || typeof serverThemePreference !== 'object')
    return pref
  const srv = serverThemePreference as Partial<GlassPreference>
  const next: GlassPreference = { ...pref }
  if (typeof srv.wallpaperDay === 'string' && srv.wallpaperDay)
    next.wallpaperDay = srv.wallpaperDay as WallpaperOption
  if (typeof srv.wallpaperNight === 'string' && srv.wallpaperNight)
    next.wallpaperNight = srv.wallpaperNight as WallpaperOption
  return next
}

export function applyGlassPreference(pref: GlassPreference) {
  if (typeof document === 'undefined') return
  const body = document.body
  body.setAttribute('data-liquid-glass', pref.liquidGlass ? 'on' : 'off')
  body.setAttribute('data-glass-pulse', pref.glassPulse ? 'on' : 'off')
  const isDark = document.documentElement.classList.contains('dark')
  const url = resolveWallpaper(pref, isDark)
  body.style.setProperty('--eva-wallpaper', url ? `url("${url}")` : 'none')

  ensureFontFaces()
  import('@/lib/mouse-effects').then((m) => m.syncMouseEffects(pref.mouseEffects))
}
let fontFacesInjected = false
/** 运行时注入自定义字体 @font-face（绕开构建器对 url() 的静态解析） */
export function ensureFontFaces() {
  if (fontFacesInjected || typeof document === 'undefined') return
  fontFacesInjected = true
  const style = document.createElement('style')
  style.textContent = `
    @font-face { font-family: 'A Wan Sleek'; src: url('/fonts/a-wan-sleek.ttf') format('truetype'); font-display: swap; }
    @font-face { font-family: 'Romantic YaYuan Pro'; src: url('/fonts/romantic-yayuan-pro.ttf') format('truetype'); font-display: swap; }
  `
  document.head.appendChild(style)
}