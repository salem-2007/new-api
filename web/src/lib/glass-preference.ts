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

export type GlassPreference = {
  liquidGlass: boolean
  glassPulse: boolean
}

export const GLASS_STORAGE_KEY = 'glass_preference'

export const DEFAULT_GLASS_PREFERENCE: GlassPreference = {
  liquidGlass: true,
  glassPulse: true,
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

/** 把偏好应用到 body data 属性，CSS 据此开关效果 */
export function applyGlassPreference(pref: GlassPreference) {
  if (typeof document === 'undefined') return
  const body = document.body
  body.setAttribute('data-liquid-glass', pref.liquidGlass ? 'on' : 'off')
  body.setAttribute('data-glass-pulse', pref.glassPulse ? 'on' : 'off')
}