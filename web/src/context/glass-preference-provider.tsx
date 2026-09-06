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
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

import {
  applyGlassPreference,
  DEFAULT_GLASS_PREFERENCE,
  readGlassPreference,
  writeGlassPreference,
  type GlassPreference,
  type MouseEffect,
  type WallpaperOption,
} from '@/lib/glass-preference'
import { attachGlobalResize } from '@/lib/mouse-effects'

type GlassPreferenceContextType = {
  preference: GlassPreference
  setLiquidGlass: (on: boolean) => void
  setGlassPulse: (on: boolean) => void
  setWallpaper: (which: 'day' | 'night', option: WallpaperOption) => void
  setFont: (font: GlassPreference['font']) => void
  toggleMouseEffect: (effect: MouseEffect, on: boolean) => void
  resetGlass: () => void
}

const FALLBACK: GlassPreferenceContextType = {
  preference: DEFAULT_GLASS_PREFERENCE,
  setLiquidGlass: () => {},
  setGlassPulse: () => {},
  setWallpaper: () => {},
  setFont: () => {},
  toggleMouseEffect: () => {},
  resetGlass: () => {},
}

const GlassPreferenceContext =
  createContext<GlassPreferenceContextType>(FALLBACK)

export function GlassPreferenceProvider(props: {
  children: React.ReactNode
}) {
  const [preference, setPreference] = useState<GlassPreference>(() =>
    readGlassPreference()
  )

  useEffect(() => {
    applyGlassPreference(preference)
    writeGlassPreference(preference)
    attachGlobalResize()
  }, [preference])

  // 主题明暗切换时用同一偏好重新解析壁纸
  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => applyGlassPreference(preference))
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [preference])

  const value = useMemo<GlassPreferenceContextType>(
    () => ({
      preference,
      setLiquidGlass: (on) => setPreference((p) => ({ ...p, liquidGlass: on })),
      setGlassPulse: (on) => setPreference((p) => ({ ...p, glassPulse: on })),
      setWallpaper: (which, option) =>
        setPreference((p) =>
          which === 'day'
            ? { ...p, wallpaperDay: option }
            : { ...p, wallpaperNight: option }
        ),
      setFont: (font) => setPreference((p) => ({ ...p, font })),
      toggleMouseEffect: (effect, on) =>
        setPreference((p) => ({
          ...p,
          mouseEffects: on ? [effect] : [],
        })),
      resetGlass: () => setPreference(DEFAULT_GLASS_PREFERENCE),
    }),
    [preference]
  )

  return (
    <GlassPreferenceContext.Provider value={value}>
      {props.children}
    </GlassPreferenceContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export
export function useGlassPreference() {
  return useContext(GlassPreferenceContext)
}