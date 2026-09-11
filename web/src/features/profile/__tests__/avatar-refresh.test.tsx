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
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { useMemo, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MobileDrawer } from '@/components/layout/components/mobile-drawer'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { api } from '@/lib/api'
import { useAuthStore, type AuthUser } from '@/stores/auth-store'

import { ProfileHeader } from '../components/profile-header'
import { useProfile } from '../hooks/use-profile'
import type { UserProfile } from '../types'

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }))

// The account menu is mounted outside of a router in these tests; only its
// links need a stand-in.
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
  Link: (props: {
    to?: unknown
    children?: ReactNode
    className?: string
    onClick?: () => void
  }) => (
    <a
      href={typeof props.to === 'string' ? props.to : '#'}
      className={props.className}
      onClick={props.onClick}
    >
      {props.children}
    </a>
  ),
}))

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

const PREVIOUS_AVATAR_URL = '/user-avatars/u1-1757558000.png'
const AVATAR_URL = '/user-avatars/u1-1757558400.png'

// ============================================================================
// Image loading stand-in
// ============================================================================

const failingImages = new Set<string>()
const probedImageSources: string[] = []

/**
 * jsdom has no image loader, so Base UI's load probe (`new Image()`) would never
 * report a result and the fallback would stay mounted forever. This stand-in
 * reports the outcome on a macrotask, which keeps the load asynchronous like a
 * browser and lets a test mark specific urls as unreachable.
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
    probedImageSources.push(value)
    const fails = failingImages.has(value)
    setTimeout(() => {
      this.complete = true
      this.naturalWidth = fails ? 0 : 64
      this.naturalHeight = fails ? 0 : 64
      if (fails) this.onerror?.()
      else this.onload?.()
    }, 0)
  }
}

// ============================================================================
// Profile API stand-in
// ============================================================================

// The row the server would answer with. An avatar mutation moves it forward, so
// a read issued before the mutation answers with the pre-upload value.
let storedProfile: UserProfile = baseProfile
let nextReadGate: { promise: Promise<void>; release: () => void } | null = null

/** Hold the next `/api/user/self` read until the returned gate is released. */
function holdNextProfileRead() {
  let release: () => void = () => undefined
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  const gate = { promise, release }
  nextReadGate = gate
  return gate
}

async function respondToGet(url: string) {
  if (url === '/api/user/self') {
    const snapshot = storedProfile
    const gate = nextReadGate
    nextReadGate = null
    if (gate) await gate.promise
    return { data: { success: true, data: snapshot } }
  }
  if (url === '/api/user/self/oauth/binding_status') {
    return { data: { success: true, data: [] } }
  }
  throw new Error(`Unexpected GET ${url}`)
}

/**
 * Answer the next avatar upload with `avatarUrl` as the new avatar. The write
 * lands when the request is sent, like the server's does.
 */
function mockAvatarUpload(avatarUrl: string) {
  vi.spyOn(api, 'post').mockImplementation(async () => {
    storedProfile = { ...baseProfile, avatar_url: avatarUrl }
    return {
      data: { success: true, message: '头像已更新', data: storedProfile },
    }
  })
}

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

function createClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function Wrapper({ children }: { children: ReactNode }) {
  // One client per tree: a fresh client on every render would drop the cache
  // between commits.
  const client = useMemo(() => createClient(), [])
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

/** Header plus the top-right account menu, the two surfaces that show a user avatar. */
function renderSurfaces() {
  return render(
    <Wrapper>
      <div data-testid='account-menu'>
        <ProfileDropdown />
      </div>
      <div data-testid='profile-page'>
        <Harness />
      </div>
    </Wrapper>
  )
}

function renderMobileDrawer(user: AuthUser) {
  return render(
    <Wrapper>
      <MobileDrawer
        isOpen
        onClose={() => undefined}
        homeUrl='/'
        displayLogo={null}
        displaySiteName='New API'
        loading={false}
        logoLoaded
        mobileLinksList={[]}
        showAuthButtons
        user={user}
      />
    </Wrapper>
  )
}

const page = () => screen.getByTestId('profile-page')
const accountMenu = () => screen.getByTestId('account-menu')

function imageSources(scope: HTMLElement): string[] {
  return [...scope.querySelectorAll('img')].map(
    (image) => image.getAttribute('src') ?? ''
  )
}

async function openEditDialog() {
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Profile' }))
  // The trigger carries the same label as the dialog title, so scope the check
  // to the dialog instead of a document-wide text query.
  const dialog = await screen.findByRole('dialog')
  within(dialog).getByText('Edit Profile')
  return dialog
}

// The dialog is portalled beside the render container, so its input is only
// reachable from the document rather than from the page container.
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

/**
 * Commit the pending avatar draft.
 *
 * Picking a file only previews it; the upload is issued by the dialog's save
 * button, so a case that expects a write has to save as well.
 */
function saveAvatarDraft() {
  const save = [...document.body.querySelectorAll('button')].find(
    (button) => button.textContent === 'Save'
  )
  if (!save) throw new Error('save button not found')
  fireEvent.click(save)
}

beforeEach(() => {
  storedProfile = baseProfile
  nextReadGate = null
  failingImages.clear()
  probedImageSources.length = 0
  vi.stubGlobal('Image', ProbedImage)
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'alice',
    display_name: 'Alice',
    role: 1,
  })
  vi.spyOn(api, 'get').mockImplementation(respondToGet)
})

afterEach(() => {
  useAuthStore.getState().auth.reset()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('avatar updates', () => {
  it('swaps the header letter fallback for the uploaded avatar', async () => {
    mockAvatarUpload(AVATAR_URL)
    renderSurfaces()

    // Before the upload the header shows the generated letter, not an image.
    expect(
      await screen.findByRole('button', { name: 'Edit Profile' })
    ).toBeInTheDocument()
    expect(imageSources(page())).toEqual([])
    expect(within(page()).getByText('A')).toBeInTheDocument()

    await openEditDialog()
    uploadAvatar()
    saveAvatarDraft()

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/user/self/avatar/upload',
        expect.any(FormData),
        expect.objectContaining({ headers: { 'Content-Type': null } })
      )
    )
    // The image is re-fetched from the url the server answered with, and the
    // letter is replaced once that load reports back.
    await waitFor(() => expect(imageSources(page())).toContain(AVATAR_URL))
    expect(probedImageSources).toContain(AVATAR_URL)
    expect(within(page()).queryByText('A')).toBeNull()
    // The account menu renders from the auth store, which the upload snapshot
    // has to reach as well.
    expect(useAuthStore.getState().auth.user?.avatar_url).toBe(AVATAR_URL)
  })

  it('updates the account menu at the same time as the header', async () => {
    mockAvatarUpload(AVATAR_URL)
    renderSurfaces()
    await screen.findByRole('button', { name: 'Edit Profile' })

    await openEditDialog()
    uploadAvatar()
    saveAvatarDraft()

    await waitFor(() => {
      expect(imageSources(page())).toContain(AVATAR_URL)
      expect(imageSources(accountMenu())).toContain(AVATAR_URL)
    })
  })

  it('keeps the uploaded avatar after the dialog closes', async () => {
    mockAvatarUpload(AVATAR_URL)
    renderSurfaces()
    await openEditDialog()
    uploadAvatar()
    saveAvatarDraft()
    await waitFor(() => expect(imageSources(page())).toContain(AVATAR_URL))

    // Closing the dialog re-reads the profile; that read must not roll the
    // page back to the letter fallback.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(imageSources(page())).toContain(AVATAR_URL))
    expect(useAuthStore.getState().auth.user?.avatar_url).toBe(AVATAR_URL)
  })

  it('keeps the uploaded avatar when an older profile read lands later', async () => {
    const updated: UserProfile = { ...baseProfile, avatar_url: AVATAR_URL }
    const { result } = renderHook(() => useProfile(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    // A read that starts before the upload and is only answered afterwards
    // still carries the pre-upload row.
    const gate = holdNextProfileRead()
    let slowRead: Promise<void> = Promise.resolve()
    act(() => {
      slowRead = result.current.refreshProfile()
    })
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))

    storedProfile = updated
    await act(async () => {
      await result.current.refreshProfile(updated)
    })
    expect(result.current.profile?.avatar_url).toBe(AVATAR_URL)

    gate.release()
    await act(async () => {
      await slowRead
    })
    expect(result.current.profile?.avatar_url).toBe(AVATAR_URL)
  })

  it('shows the uploaded avatar in the mobile drawer menu', async () => {
    const user: AuthUser = {
      id: 1,
      username: 'alice',
      display_name: 'Alice',
      avatar_url: AVATAR_URL,
      role: 1,
      group: 'default',
    }
    const { container } = renderMobileDrawer(user)

    await waitFor(() => expect(imageSources(container)).toContain(AVATAR_URL))
    expect(container.querySelector('img[src="/avatars/01.png"]')).toBeNull()
    expect(container.textContent).toContain('Alice')
  })

  it('never falls back to the letter once the account has an avatar url', async () => {
    // The letter belongs to an account without an avatar. An image request that
    // fails must not put the initials back on top of a url the account holds,
    // which is what made an upload look like it had been overwritten.
    failingImages.add(AVATAR_URL)
    storedProfile = { ...baseProfile, avatar_url: AVATAR_URL }
    renderSurfaces()
    await screen.findByRole('button', { name: 'Edit Profile' })

    // The load probe still runs for the stored url...
    await waitFor(() => expect(probedImageSources).toContain(AVATAR_URL))
    // ...but the letter stays out of the avatar frame.
    expect(within(page()).queryByText('A')).toBeNull()
    expect(imageSources(page())).toEqual([])
  })

  it('keeps a relative avatar path rooted at the site origin', async () => {
    storedProfile = { ...baseProfile, avatar_url: 'user-avatars/u1-1.png' }
    renderSurfaces()

    await waitFor(() =>
      expect(imageSources(page())).toContain('/user-avatars/u1-1.png')
    )
    expect(useAuthStore.getState().auth.user?.avatar_url).toBe(
      'user-avatars/u1-1.png'
    )
  })

  it('reloads the avatar image when the uploaded url changes', async () => {
    storedProfile = { ...baseProfile, avatar_url: PREVIOUS_AVATAR_URL }
    renderSurfaces()
    await waitFor(() =>
      expect(imageSources(page())).toContain(PREVIOUS_AVATAR_URL)
    )

    const nextUrl = '/user-avatars/u1-1757562000.png'
    mockAvatarUpload(nextUrl)
    await openEditDialog()
    uploadAvatar()
    saveAvatarDraft()

    await waitFor(() => expect(imageSources(page())).toContain(nextUrl))
    expect(imageSources(page())).not.toContain(PREVIOUS_AVATAR_URL)
    expect(probedImageSources).toContain(nextUrl)
  })
})
