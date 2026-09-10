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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { ProfileHeader } from '../components/profile-header'
import { useProfile } from '../hooks/use-profile'
import type { UserProfile } from '../types'

const baseProfile: UserProfile = {
  id: 1,
  username: 'alice',
  display_name: 'Alice',
  role: 1,
  group: 'default',
  quota: 1000000,
  used_quota: 0,
  request_count: 0,
  status: 1,
  aff_count: 0,
  aff_quota: 0,
  aff_history_quota: 0,
  created_time: 0,
}

const AVATAR_URL = '/user-avatars/u1-1757558400.png'

// jsdom never loads images, so Base UI's load probe would keep the fallback
// mounted and hide the <img>. The probe only reads `complete`/`naturalWidth`.
class LoadedImage {
  complete = true
  naturalWidth = 64
  naturalHeight = 64
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  crossOrigin: string | null = null
  referrerPolicy = ''
  sizes = ''
  srcset = ''
  private _src = ''
  get src() {
    return this._src
  }
  set src(value: string) {
    this._src = value
  }
}

function Harness() {
  const { profile, loading, refreshProfile } = useProfile()
  return (
    <ProfileHeader
      profile={profile}
      loading={loading}
      onProfileUpdate={refreshProfile}
    />
  )
}

function renderHeader() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>
  )
}

// The dialog is portalled beside the render container, so its input is only
// reachable from the document rather than from the header container.
function uploadAvatar() {
  const input =
    document.body.querySelector<HTMLInputElement>('input[type=file]')
  if (!input) throw new Error('avatar file input not found')
  fireEvent.change(input, {
    target: {
      files: [new File(['avatar'], 'avatar.png', { type: 'image/png' })],
    },
  })
}

beforeEach(() => {
  vi.stubGlobal('Image', LoadedImage)
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'alice',
    display_name: 'Alice',
    role: 1,
  })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/user/self') {
      return { data: { success: true, data: baseProfile } }
    }
    if (url === '/api/user/self/oauth/binding_status') {
      return { data: { success: true, data: [] } }
    }
    throw new Error(`Unexpected GET ${url}`)
  })
})

afterEach(() => {
  useAuthStore.getState().auth.reset()
  vi.restoreAllMocks()
})

describe('avatar updates', () => {
  it('shows the uploaded avatar and mirrors it into the auth store', async () => {
    const updated: UserProfile = { ...baseProfile, avatar_url: AVATAR_URL }
    vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, message: '头像已更新', data: updated },
    })
    // The follow-up read also returns the new avatar.
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/api/user/self') {
        return { data: { success: true, data: updated } }
      }
      if (url === '/api/user/self/oauth/binding_status') {
        return { data: { success: true, data: [] } }
      }
      throw new Error(`Unexpected GET ${url}`)
    })

    const { container } = renderHeader()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Profile' }))
    // The trigger carries the same label as the dialog title, so scope the
    // check to the dialog instead of a document-wide text query.
    const dialog = await screen.findByRole('dialog')
    within(dialog).getByText('Edit Profile')
    uploadAvatar()

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/user/self/avatar/upload',
        expect.any(FormData),
        expect.objectContaining({ headers: { 'Content-Type': null } })
      )
    )
    await waitFor(() =>
      expect(useAuthStore.getState().auth.user?.avatar_url).toBe(AVATAR_URL)
    )
    expect(container.querySelector(`img[src="${AVATAR_URL}"]`)).not.toBeNull()
  })

  it('keeps a relative avatar path rooted at the site origin', async () => {
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/api/user/self') {
        return {
          data: {
            success: true,
            data: { ...baseProfile, avatar_url: 'user-avatars/u1-1.png' },
          },
        }
      }
      throw new Error(`Unexpected GET ${url}`)
    })

    const { container } = renderHeader()
    await waitFor(() =>
      expect(
        container.querySelector('img[src="/user-avatars/u1-1.png"]')
      ).not.toBeNull()
    )
    expect(useAuthStore.getState().auth.user?.avatar_url).toBe(
      'user-avatars/u1-1.png'
    )
  })
})
