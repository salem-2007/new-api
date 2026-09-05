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
} from '@/lib/glass-preference'

type GlassPreferenceContextType = {
  preference: GlassPreference
  setLiquidGlass: (on: boolean) => void
  setGlassPulse: (on: boolean) => void
  resetGlass: () => void
}

const FALLBACK: GlassPreferenceContextType = {
  preference: DEFAULT_GLASS_PREFERENCE,
  setLiquidGlass: () => {},
  setGlassPulse: () => {},
  resetGlass: () => {},
}

const GlassPreferenceContext =
  createContext<GlassPreferenceContextType>(FALLBACK)

export function GlassPreferenceProvider(props: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<GlassPreference>(() =>
    readGlassPreference()
  )

  useEffect(() => {
    applyGlassPreference(preference)
    writeGlassPreference(preference)
  }, [preference])

  const value = useMemo<GlassPreferenceContextType>(
    () => ({
      preference,
      setLiquidGlass: (on) => setPreference((p) => ({ ...p, liquidGlass: on })),
      setGlassPulse: (on) => setPreference((p) => ({ ...p, glassPulse: on })),
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