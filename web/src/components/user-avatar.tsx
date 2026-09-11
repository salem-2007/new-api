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
import type { ReactNode } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  getUserAvatarFallback,
  getUserAvatarStyle,
  getUserAvatarUrl,
} from '@/lib/avatar'
import { cn } from '@/lib/utils'

interface UserAvatarContentProps {
  /** Avatar url of the account, or the local preview of a pending upload. */
  url: string | null
  /** Name the letter fallback is derived from. */
  name: string
  imageClassName?: string
  fallbackClassName?: string
  /** Overrides the fallback text (the mobile drawer shows two initials). */
  fallback?: ReactNode
}

/**
 * The image and letter parts of a user avatar.
 *
 * Shared by every surface that shows the signed-in account (profile header,
 * account menu, mobile drawer) so they cannot drift apart: the letter fallback
 * renders *only* when there is no url, and the image is keyed by its url so a
 * new avatar gets a fresh load probe instead of the previous element's settled
 * result.
 *
 * A url that is present but has not finished loading therefore leaves a gap on
 * the first paint instead of the letter. That is deliberate — the letter
 * belongs to an account without an avatar, and showing it while an avatar
 * exists is what made an upload look like it had been overwritten by the
 * initials.
 */
export function UserAvatarContent({
  url,
  name,
  imageClassName,
  fallbackClassName,
  fallback,
}: UserAvatarContentProps) {
  if (!url) {
    return (
      <AvatarFallback
        className={cn('font-semibold text-white', fallbackClassName)}
        style={getUserAvatarStyle(name)}
      >
        {fallback ?? getUserAvatarFallback(name)}
      </AvatarFallback>
    )
  }

  return (
    <AvatarImage
      key={url}
      src={url}
      alt={name}
      className={cn('rounded-[inherit]', imageClassName)}
    />
  )
}

type UserAvatarProps = Omit<UserAvatarContentProps, 'url' | 'name'> & {
  /** Profile or session user the avatar is rendered for. */
  user?: { avatar_url?: string; username?: string } | null
  /** Display name to fall back to when the user has no username. */
  name?: string
  className?: string
}

/** Avatar of a user, rendering the stored image whenever one exists. */
export function UserAvatar({
  user,
  name,
  className,
  ...content
}: UserAvatarProps) {
  return (
    <Avatar className={className}>
      <UserAvatarContent
        url={getUserAvatarUrl(user)}
        name={user?.username || name || ''}
        {...content}
      />
    </Avatar>
  )
}
