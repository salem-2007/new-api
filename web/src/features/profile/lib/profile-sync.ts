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
import { useAuthStore, type AuthUser } from '@/stores/auth-store'

import type { UserProfile } from '../types'

/**
 * Merge a freshly read profile into the cached auth user.
 *
 * The top-right account menu renders `useAuthStore().auth.user`, which is only
 * written on sign-in/bootstrap. Without this mirror an avatar upload or a
 * provider sync stays invisible there until the next full page load.
 *
 * Only the fields the header renders are copied, so permissions, settings and
 * sidebar modules keep the values the session bundle installed. The profile
 * response is the authoritative copy of these fields (`buildSelfUserData`
 * always returns all of them).
 */
export function mergeAuthUserFromProfile(
  user: AuthUser | null,
  profile: UserProfile
): AuthUser | null {
  if (!user || user.id !== profile.id) return user
  const merged: AuthUser = {
    ...user,
    username: profile.username,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
    email: profile.email,
    group: profile.group,
    has_password: profile.has_password,
    quota: profile.quota,
    used_quota: profile.used_quota,
    request_count: profile.request_count,
  }
  const changed = (Object.keys(merged) as (keyof AuthUser)[]).some(
    (key) => merged[key] !== user[key]
  )
  return changed ? merged : user
}

/** Apply {@link mergeAuthUserFromProfile} to the live auth store. */
export function syncAuthUserFromProfile(profile: UserProfile | null): void {
  if (!profile) return
  const { auth } = useAuthStore.getState()
  const merged = mergeAuthUserFromProfile(auth.user, profile)
  if (merged && merged !== auth.user) auth.setUser(merged)
}
