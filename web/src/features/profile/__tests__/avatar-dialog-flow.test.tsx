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
import { useMemo, type ReactNode } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { ProfileHeader } from '../components/profile-header'
import { useProfile } from '../hooks/use-profile'
import {
  AVATAR_CHANGE_LOG_KEY,
  readAvatarChanges,
} from '../lib/avatar-commit-log'
import type { UserProfile } from '../types'

// ============================================================================
// The contract under test
//
// The avatar of a picked image is a *draft*: it is previewed inside the dialog,
// it never reaches the header, the account menu or the auth store, and no write
// request is sent until the user saves. Saving raises the success toast first
// and swaps the displayed avatar second. Cancelling drops the draft, releases
// its object url and leaves the last saved avatar on screen.
// ============================================================================

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

const SAVED_AVATAR_URL = '/user-avatars/u1-1757558000.png'
const UPLOADED_AVATAR_URL = '/user-avatars/u1-1757558400.png'
const SYNCED_AVATAR_URL = '/user-avatars/u1-provider-1757559000.png'
const DRAFT_PREVIEW_URL = 'blob:avatar-draft-preview'

const PROFILE_URL = '/api/user/self'
const BINDING_STATUS_URL = '/api/user/self/oauth/binding_status'
const AVATAR_UPLOAD_URL = '/api/user/self/avatar/upload'
const AVATAR_SYNC_URL = '/api/user/self/avatar/refresh'

// ============================================================================
// Image loading stand-in
// ============================================================================

/**
 * jsdom has no image loader, so Base UI's load probe (`new Image()`) would never
 * report a result and the `<img>` of an avatar would never mount. This stand-in
 * reports success on a macrotask, which keeps the load asynchronous like a
 * browser does.
 */
class ProbedImage {
  complete = false
  naturalWidth = 0
  naturalHeight = 0
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  crossOrigin: string | null = null
  referrerPolicy = ''
  sizes = ''
  srcset = ''
  private currentSrc = ''
  get src() {
    return this.currentSrc
  }
  set src(value: string) {
    this.currentSrc = value
    setTimeout(() => {
      this.complete = true
      this.naturalWidth = 64
      this.naturalHeight = 64
      this.onload?.()
    }, 0)
  }
}

// ============================================================================
// Transport stand-in
// ============================================================================

/** The row the server holds. An avatar write moves it forward. */
let storedProfile: UserProfile = baseProfile
/** Whether the account has a bound sign-in channel to sync an avatar from. */
let channelBound = false
/** Avatar url the next upload writes. */
let uploadAnswersUrl = UPLOADED_AVATAR_URL
/** Rejects the next upload the way a server error does. */
let uploadFails = false

async function respondToGet(url: string) {
  if (url === PROFILE_URL) {
    return { data: { success: true, data: storedProfile } }
  }
  if (url === BINDING_STATUS_URL) {
    return {
      data: {
        success: true,
        data: [{ provider: 'github', bound: channelBound }],
      },
    }
  }
  throw new Error(`Unexpected GET ${url}`)
}

async function respondToPost(url: string) {
  if (url === AVATAR_UPLOAD_URL) {
    if (uploadFails) throw new Error('upload rejected')
    // The write lands when the request is sent, like the server's does.
    storedProfile = { ...storedProfile, avatar_url: uploadAnswersUrl }
    return {
      data: { success: true, message: 'Avatar updated', data: storedProfile },
    }
  }
  if (url === AVATAR_SYNC_URL) {
    storedProfile = { ...storedProfile, avatar_url: SYNCED_AVATAR_URL }
    return {
      data: { success: true, message: 'Avatar synced', data: storedProfile },
    }
  }
  throw new Error(`Unexpected POST ${url}`)
}

/** Every avatar url a successful toast could already see on screen. */
let avatarUrlWhenNotified: string | null = null

// ============================================================================
// Rendering helpers
// ============================================================================

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

function Wrapper({ children }: { children: ReactNode }) {
  // One client per tree: a fresh client on every render would drop the cache.
  const client = useMemo(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    []
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const page = () => screen.getByTestId('profile-page')

function imageSources(scope: HTMLElement): string[] {
  return [...scope.querySelectorAll('img')].map(
    (image) => image.getAttribute('src') ?? ''
  )
}

function dialog() {
  return screen.getByRole('dialog')
}

function dialogImageSources(): string[] {
  return imageSources(dialog())
}

function avatarFileInput(): HTMLInputElement {
  const input =
    document.body.querySelector<HTMLInputElement>('input[type=file]')
  if (!input) throw new Error('avatar file input not found')
  return input
}

/** Pick a file the way the browser does through the dialog's file input. */
function pickAvatarFile(
  file = new File(['avatar'], 'avatar.png', { type: 'image/png' })
) {
  fireEvent.change(avatarFileInput(), { target: { files: [file] } })
}

async function openEditDialog() {
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Profile' }))
  const opened = await screen.findByRole('dialog')
  within(opened).getByText('Edit Profile')
  return opened
}

function saveButton(): HTMLButtonElement {
  return within(dialog()).getByRole('button', { name: 'Save' })
}

function clickSave() {
  fireEvent.click(saveButton())
}

// ============================================================================
// Lifecycle
// ============================================================================

let createObjectURL: ReturnType<typeof vi.fn<(file: Blob) => string>>
let revokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

beforeEach(() => {
  storedProfile = { ...baseProfile, avatar_url: SAVED_AVATAR_URL }
  channelBound = false
  uploadAnswersUrl = UPLOADED_AVATAR_URL
  uploadFails = false
  avatarUrlWhenNotified = null
  window.localStorage.clear()

  createObjectURL = vi.fn(() => DRAFT_PREVIEW_URL)
  revokeObjectURL = vi.fn()
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = revokeObjectURL

  vi.stubGlobal('Image', ProbedImage)
  vi.spyOn(api, 'get').mockImplementation(respondToGet)
  vi.spyOn(api, 'post').mockImplementation(respondToPost)
  vi.spyOn(api, 'put').mockResolvedValue({
    data: { success: true, message: 'Profile updated' },
  })

  // Record what the surfaces show at the moment the success toast fires.
  vi.spyOn(toast, 'success').mockImplementation(() => {
    const pageNode = document.querySelector<HTMLElement>(
      '[data-testid="profile-page"]'
    )
    avatarUrlWhenNotified = pageNode
      ? (imageSources(pageNode)[0] ?? null)
      : null
    return 'toast-id'
  })
  vi.spyOn(toast, 'error').mockReturnValue('toast-id')

  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'alice',
    display_name: 'Alice',
    avatar_url: SAVED_AVATAR_URL,
    role: 1,
  })

  render(
    <Wrapper>
      <div data-testid='profile-page'>
        <Harness />
      </div>
    </Wrapper>
  )
})

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL
  URL.revokeObjectURL = originalRevokeObjectURL
  useAuthStore.getState().auth.reset()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ============================================================================
// Cases
// ============================================================================

describe('edit profile avatar flow', () => {
  it('cancelling an image pick writes nothing, keeps the avatar and releases the preview url', async () => {
    await openEditDialog()
    pickAvatarFile()

    // The pick only builds a local preview.
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(within(dialog()).getByRole('status')).toHaveTextContent(
      'Pending save, the new avatar is not applied yet'
    )
    expect(api.post).not.toHaveBeenCalled()
    expect(api.put).not.toHaveBeenCalled()
    expect(useAuthStore.getState().auth.user?.avatar_url).toBe(SAVED_AVATAR_URL)

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // Cancelling is lossless: no write, no auth change, draft url released.
    expect(api.post).not.toHaveBeenCalled()
    expect(api.put).not.toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith(DRAFT_PREVIEW_URL)
    expect(useAuthStore.getState().auth.user?.avatar_url).toBe(SAVED_AVATAR_URL)
    await waitFor(() =>
      expect(imageSources(page())).toContain(SAVED_AVATAR_URL)
    )
  })

  it('shows the picked file as the dialog preview without touching the page avatar', async () => {
    await openEditDialog()
    pickAvatarFile()

    await waitFor(() =>
      expect(dialogImageSources()).toContain(DRAFT_PREVIEW_URL)
    )
    // The preview is scoped to the dialog: the header is untouched.
    expect(imageSources(page())).not.toContain(DRAFT_PREVIEW_URL)
    expect(imageSources(page())).toContain(SAVED_AVATAR_URL)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('uploads once on save and raises the success toast before the avatar is swapped', async () => {
    await openEditDialog()
    pickAvatarFile()
    clickSave()

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post).toHaveBeenCalledWith(
      AVATAR_UPLOAD_URL,
      expect.any(FormData),
      expect.objectContaining({ headers: { 'Content-Type': null } })
    )
    await waitFor(() =>
      expect(imageSources(page())).toContain(UPLOADED_AVATAR_URL)
    )
    expect(toast.success).toHaveBeenCalledWith('Avatar updated')
    // The toast was shown while the page still displayed the previous avatar,
    // so it cannot have been raised after the swap.
    expect(avatarUrlWhenNotified).not.toBe(UPLOADED_AVATAR_URL)
    expect(avatarUrlWhenNotified).toBe(SAVED_AVATAR_URL)
    // A saved draft cannot be uploaded twice.
    expect(saveButton()).toBeDisabled()
  })

  it('refuses an unsupported file type without a request and without changing the avatar', async () => {
    await openEditDialog()
    pickAvatarFile(new File(['notes'], 'notes.txt', { type: 'text/plain' }))

    expect(toast.error).toHaveBeenCalledWith(
      'Only jpg, jpeg, png and webp images are supported.'
    )
    // No preview was built, so there is no draft and nothing to save either.
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(saveButton()).toBeDisabled()
    clickSave()
    expect(api.post).not.toHaveBeenCalled()
    expect(imageSources(page())).toContain(SAVED_AVATAR_URL)
    expect(useAuthStore.getState().auth.user?.avatar_url).toBe(SAVED_AVATAR_URL)
  })

  it('refuses an image above 4MB without a request and without changing the avatar', async () => {
    await openEditDialog()
    pickAvatarFile(
      new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'huge.png', {
        type: 'image/png',
      })
    )

    expect(toast.error).toHaveBeenCalledWith(
      'The image must be 4MB or smaller.'
    )
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(saveButton()).toBeDisabled()
    clickSave()
    expect(api.post).not.toHaveBeenCalled()
    expect(imageSources(page())).toContain(SAVED_AVATAR_URL)
  })

  it('syncs from the provider on save and raises the toast before the swap', async () => {
    channelBound = true
    await openEditDialog()
    // The sync button only exists once the binding status says a channel is
    // bound, which is a separate query from the profile read.
    const syncButton = await within(dialog()).findByRole('button', {
      name: 'Sync from provider',
    })
    fireEvent.click(syncButton)
    clickSave()

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post).toHaveBeenCalledWith(AVATAR_SYNC_URL)
    await waitFor(() =>
      expect(imageSources(page())).toContain(SYNCED_AVATAR_URL)
    )
    expect(toast.success).toHaveBeenCalledWith('Avatar synced')
    expect(avatarUrlWhenNotified).toBe(SAVED_AVATAR_URL)
  })

  it('keeps the draft for a retry when the upload fails', async () => {
    uploadFails = true
    await openEditDialog()
    pickAvatarFile()
    clickSave()

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to update avatar')
    )
    // The avatar keeps its saved value, the draft is still pending and the save
    // button is available again.
    expect(imageSources(page())).toContain(SAVED_AVATAR_URL)
    expect(useAuthStore.getState().auth.user?.avatar_url).toBe(SAVED_AVATAR_URL)
    await waitFor(() =>
      expect(dialogImageSources()).toContain(DRAFT_PREVIEW_URL)
    )
    await waitFor(() =>
      expect(within(dialog()).getByRole('status')).toHaveTextContent(
        'Pending save'
      )
    )
    expect(saveButton()).toBeEnabled()

    // The retry commits the same draft.
    uploadFails = false
    clickSave()
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(imageSources(page())).toContain(UPLOADED_AVATAR_URL)
    )
  })

  it('records the commit in the avatar change log', async () => {
    await openEditDialog()
    pickAvatarFile()
    clickSave()

    await waitFor(() => expect(readAvatarChanges()).toHaveLength(1))
    const [entry] = readAvatarChanges()
    expect(entry.action).toBe('upload')
    expect(entry.result).toBe('success')
    expect(entry.from).toBe(SAVED_AVATAR_URL)
    expect(entry.to).toBe(UPLOADED_AVATAR_URL)
    expect(Number.isNaN(Date.parse(entry.at))).toBe(false)
    // The ledger lives in the documented storage slot.
    expect(window.localStorage.getItem(AVATAR_CHANGE_LOG_KEY)).toContain(
      UPLOADED_AVATAR_URL
    )
  })
})
