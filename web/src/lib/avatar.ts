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
import type { CSSProperties } from 'react'

export type UserAvatarStyle = Pick<CSSProperties, 'backgroundColor' | 'color'>

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

export function getUserAvatarStyle(name: string): UserAvatarStyle {
  const hash = hashString(name)
  const hue = hash % 360
  const saturation = 54 + (hash % 8)
  const lightness = 52 + ((hash >> 4) % 8)

  return {
    backgroundColor: `hsl(${hue} ${saturation}% ${lightness}%)`,
    color: 'white',
  }
}

export function getUserAvatarFallback(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

/**
 * Default avatar URL — used when the user has no avatar.
 * Points to the embedded WebP in web/public.
 */
export const DEFAULT_AVATAR_URL = '/default-avatar.webp'

/**
 * Get the avatar URL for a user.
 * Returns null if no avatar is available (user avatar > channel avatar > empty).
 * Unlike before, there's no default letter fallback when no URL exists.
 */
export function getUserAvatarUrl(
  user?: { avatar_url?: string; username?: string } | null
): string | null {
  const url = user?.avatar_url?.trim()
  if (!url) return null
  // Hosted avatars (uploads, provider syncs) are served from the site root. A
  // relative value such as `user-avatars/u1-1.png` would otherwise resolve
  // against the current route and 404, leaving the letter fallback on screen.
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(url)) return url
  return `/${url}`
}

/**
 * Get the avatar URL from channel or user.
 * Priority: user avatar_url > channel avatar_url > null (no fallback)
 */
export function getChannelOrUserAvatarUrl(
  user?: { avatar_url?: string; username?: string } | null,
  channelAvatarUrl?: string | null
): string | null {
  // First, try user's own avatar
  const url = user?.avatar_url?.trim()
  if (url) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(url)) return url
    return `/${url}`
  }
  // Fall back to channel's avatar
  const channelUrl = channelAvatarUrl?.trim()
  if (channelUrl) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(channelUrl)) return channelUrl
    return `/${channelUrl}`
  }
  // No avatar available - return null to show no avatar image
  return null
}