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
 * Liquid Glass 用户偏好：持久化到 localStorage，body data 属性驱动 CSS。
 * - liquidGlass: 玻璃效果总开关（关闭 = 所有面板回退实色）
 * - glassPulse: 卡片 hover 脉冲发光开关
 */

export type WallpaperOption = 'default' | 'day-shinji' | 'day-asuka' | 'night-eva' | 'night-rei' | 'custom'
export type MouseEffect = 'firework' | 'heart' | 'text' | 'particle'

export type GlassPreference = {
  liquidGlass: boolean
  glassPulse: boolean
  wallpaperDay: WallpaperOption
  wallpaperNight: WallpaperOption
  customWallpaperUrl: string
  font: 'default' | 'awan' | 'yayuan'
  mouseEffects: MouseEffect[]
}

export const GLASS_STORAGE_KEY = 'glass_preference'

export const WALLPAPER_ASSETS: Record<string, { day?: string; night?: string }> = {
  default: { day: '/wallpapers/day-shinji.jpg', night: '/wallpapers/night-eva.jpg' },
  'day-shinji': { day: '/wallpapers/day-shinji.jpg' },
  'day-asuka': { day: '/wallpapers/day-asuka.jpg' },
  'night-eva': { night: '/wallpapers/night-eva.jpg' },
  'night-rei': { night: '/wallpapers/night-rei.jpg' },
}

export const DEFAULT_GLASS_PREFERENCE: GlassPreference = {
  liquidGlass: true,
  glassPulse: true,
  wallpaperDay: 'default',
  wallpaperNight: 'default',
  customWallpaperUrl: '',
  font: 'default',
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
      wallpaperDay: parsed.wallpaperDay ?? 'default',
      wallpaperNight: parsed.wallpaperNight ?? 'default',
      customWallpaperUrl: parsed.customWallpaperUrl ?? '',
      font: parsed.font ?? 'default',
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
    // 隐私模式等写入失败时静默降级（会话内仍生效）
  }
}

/** 解析当前主题下应使用的壁纸 URL */
function resolveWallpaper(pref: GlassPreference, isDark: boolean): string {
  const pick = isDark ? pref.wallpaperNight : pref.wallpaperDay
  if (pick === 'custom' && pref.customWallpaperUrl) return pref.customWallpaperUrl
  const asset = WALLPAPER_ASSETS[pick]
  if (asset) return (isDark ? asset.night : asset.day) ?? asset.day ?? asset.night ?? ''
  return isDark ? '/wallpapers/night-eva.jpg' : '/wallpapers/day-shinji.jpg'
}

/** 把偏好应用到 DOM：body data 属性 + 壁纸变量 + 字体 + 鼠标动画 */
export function applyGlassPreference(pref: GlassPreference) {
  if (typeof document === 'undefined') return
  const body = document.body
  body.setAttribute('data-liquid-glass', pref.liquidGlass ? 'on' : 'off')
  body.setAttribute('data-glass-pulse', pref.glassPulse ? 'on' : 'off')

  // 壁纸：跟随当前主题取对应图
  const isDark = document.documentElement.classList.contains('dark')
  const url = resolveWallpaper(pref, isDark)
  body.style.setProperty('--eva-wallpaper', url ? `url("${url}")` : 'none')

  // 字体
  if (pref.font === 'awan') {
    body.style.setProperty('--font-body', "'A Wan Sleek', sans-serif")
  } else if (pref.font === 'yayuan') {
    body.style.setProperty('--font-body', "'Romantic YaYuan Pro', sans-serif")
  } else {
    body.style.removeProperty('--font-body')
  }
  ensureFontFaces()

  // 鼠标动画（单例挂载）
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