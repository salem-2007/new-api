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
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { useEffect, useMemo, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { getUserProfile, uploadSelfAvatar } from '../api'
import { ProfileHeader } from '../components/profile-header'
import { useProfile } from '../hooks/use-profile'
import type { UserProfile } from '../types'

// ============================================================================
// Why these tests drive the real `api`
//
// `http-client` shares one promise between the concurrent GETs of a url, so a
// profile read that is still pending when an avatar write lands answers the
// read that the write triggers, and the page falls back to the letter avatar.
// Mocking `api.get` (as the other suites do) replaces the layer under test;
// these cases keep the real client and fake only the transport.
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

const AVATAR_URL = '/user-avatars/u1-1757558400.png'

const PROFILE_URL = '/api/user/self'
const BINDING_STATUS_URL = '/api/user/self/oauth/binding_status'
const AVATAR_UPLOAD_URL = '/api/user/self/avatar/upload'

// ============================================================================
// Image loading stand-in
// ============================================================================

/**
 * jsdom has no image loader, so Base UI's load probe (`new Image()`) would
 * never report a result and the fallback would stay mounted forever. This
 * stand-in reports success on a macrotask, which keeps the load asynchronous
 * like a browser.
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
// Fake transport (everything above axios stays real)
// ============================================================================

type Gate = { promise: Promise<void>; release: () => void }

/** The row the server holds. An avatar write moves it forward. */
let storedProfile: UserProfile = baseProfile
/** The avatar url the next upload writes, or null when no write is armed. */
let armedAvatarWrite: string | null = null
/** Holds the next profile read until it is released. */
let pendingReadGate: Gate | null = null
let profileReadCount = 0
let nativeAdapter: typeof api.defaults.adapter

/** Hold the next `/api/user/self` read in flight until the gate is released. */
function holdNextProfileRead(): Gate {
  let release: () => void = () => undefined
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  const gate = { promise, release }
  pendingReadGate = gate
  return gate
}

function respond(
  data: unknown,
  config: InternalAxiosRequestConfig
): AxiosResponse {
  return { data, status: 200, statusText: 'OK', headers: {}, config }
}

async function transport(
  config: InternalAxiosRequestConfig
): Promise<AxiosResponse> {
  const url = config.url ?? ''
  const method = (config.method ?? 'get').toLowerCase()

  if (url === PROFILE_URL && method === 'get') {
    profileReadCount += 1
    // The server answers with the row it read when the request reached it, so a
    // read issued before a write carries the pre-write row.
    const snapshot = storedProfile
    const gate = pendingReadGate
    pendingReadGate = null
    if (gate) await gate.promise
    return respond({ success: true, data: snapshot }, config)
  }

  if (url === BINDING_STATUS_URL) {
    return respond({ success: true, data: [] }, config)
  }

  if (url === AVATAR_UPLOAD_URL && method === 'post') {
    if (!armedAvatarWrite) throw new Error('no avatar write was armed')
    // The write lands when the request is sent, like the server's does.
    storedProfile = { ...storedProfile, avatar_url: armedAvatarWrite }
    armedAvatarWrite = null
    return respond(
      { success: true, message: 'Avatar updated', data: storedProfile },
      config
    )
  }

  throw new Error(`Unexpected ${method.toUpperCase()} ${url}`)
}

function imageSources(scope: HTMLElement): string[] {
  return [...scope.querySelectorAll('img')].map(
    (image) => image.getAttribute('src') ?? ''
  )
}

/** Upload a file the way the edit dialog does and return the answered row. */
async function uploadAvatar() {
  armedAvatarWrite = AVATAR_URL
  return uploadSelfAvatar(
    new File(['avatar'], 'avatar.png', { type: 'image/png' })
  )
}

// ============================================================================
// Rendering helpers
// ============================================================================

let refreshFromTest: ((snapshot?: UserProfile) => Promise<void>) | null = null

function Harness() {
  const { profile, loading, refreshProfile } = useProfile()
  useEffect(() => {
    refreshFromTest = refreshProfile
  }, [refreshProfile])
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

/** Start a profile read that will not be answered until the gate is released. */
async function startHeldRead(
  refresh: (snapshot?: UserProfile) => Promise<void>
): Promise<Gate & { read: Promise<void> }> {
  const gate = holdNextProfileRead()
  let read: Promise<void> = Promise.resolve()
  await act(async () => {
    read = refresh()
    await Promise.resolve()
  })
  await waitFor(() => expect(profileReadCount).toBeGreaterThanOrEqual(2))
  return { ...gate, read }
}

beforeEach(() => {
  storedProfile = baseProfile
  armedAvatarWrite = null
  pendingReadGate = null
  profileReadCount = 0
  refreshFromTest = null
  nativeAdapter = api.defaults.adapter
  api.defaults.adapter = transport
  vi.stubGlobal('Image', ProbedImage)
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'alice',
    display_name: 'Alice',
    role: 1,
  })
})

afterEach(() => {
  api.defaults.adapter = nativeAdapter
  useAuthStore.getState().auth.reset()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('avatar write against an in-flight profile read', () => {
  it('keeps the uploaded avatar_url when the pre-upload read answers later', async () => {
    const { result } = renderHook(() => useProfile(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.profile?.avatar_url).toBeUndefined()

    // A profile read that starts before the upload and is only answered
    // afterwards still carries the pre-upload row.
    const { release, read } = await startHeldRead(result.current.refreshProfile)

    // The avatar write lands while that read is still in flight.
    const uploaded = await uploadAvatar()
    expect(uploaded.data?.avatar_url).toBe(AVATAR_URL)

    // The dialog hands the fresh snapshot to the hook, which applies it and
    // then re-reads the profile to confirm.
    let confirmRead: Promise<void> = Promise.resolve()
    await act(async () => {
      confirmRead = result.current.refreshProfile(uploaded.data)
      await Promise.resolve()
    })
    expect(result.current.profile?.avatar_url).toBe(AVATAR_URL)

    // The frozen read now answers with the row it read before the upload.
    release()
    await act(async () => {
      await read
      await confirmRead
    })

    expect(result.current.profile?.avatar_url).toBe(AVATAR_URL)
    expect(useAuthStore.getState().auth.user?.avatar_url).toBe(AVATAR_URL)
  })

  it('keeps the uploaded avatar when a read started after the write resolves', async () => {
    const { result } = renderHook(() => useProfile(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    const { release, read } = await startHeldRead(result.current.refreshProfile)

    const uploaded = await uploadAvatar()
    let confirmRead: Promise<void> = Promise.resolve()
    await act(async () => {
      confirmRead = result.current.refreshProfile(uploaded.data)
      await Promise.resolve()
    })

    // A read issued after the write but before the held one answers (the dialog
    // close, a language change) must not be served the pre-upload row either.
    let laterRead: Promise<void> = Promise.resolve()
    await act(async () => {
      laterRead = result.current.refreshProfile()
      await Promise.resolve()
    })

    release()
    await act(async () => {
      await read
      await confirmRead
      await laterRead
    })

    expect(result.current.profile?.avatar_url).toBe(AVATAR_URL)
  })

  it('keeps the uploaded avatar on screen when the pre-upload read answers later', async () => {
    render(
      <Wrapper>
        <div data-testid='profile-page'>
          <Harness />
        </div>
      </Wrapper>
    )
    const page = () => screen.getByTestId('profile-page')

    // Before the upload the header shows the generated letter, not an image.
    await screen.findByRole('button', { name: 'Edit Profile' })
    expect(within(page()).getByText('A')).toBeInTheDocument()
    expect(refreshFromTest).not.toBeNull()

    const { release, read } = await startHeldRead(
      refreshFromTest as (snapshot?: UserProfile) => Promise<void>
    )

    // Upload through the dialog, exactly like the page does.
    armedAvatarWrite = AVATAR_URL
    fireEvent.click(screen.getByRole('button', { name: 'Edit Profile' }))
    const dialog = await screen.findByRole('dialog')
    within(dialog).getByText('Edit Profile')
    const input =
      document.body.querySelector<HTMLInputElement>('input[type=file]')
    if (!input) throw new Error('avatar file input not found')
    fireEvent.change(input, {
      target: {
        files: [new File(['avatar'], 'avatar.png', { type: 'image/png' })],
      },
    })

    await waitFor(() => expect(imageSources(page())).toContain(AVATAR_URL))

    release()
    await act(async () => {
      await read
    })

    await waitFor(() => expect(imageSources(page())).toContain(AVATAR_URL))
    expect(within(page()).queryByText('A')).toBeNull()
  })

  it('still shares one request between reads that are already running', async () => {
    // The write path only drops the reads of the row it changes; concurrent
    // reads of it still share a single request.
    const gate = holdNextProfileRead()
    const first = getUserProfile()
    const second = getUserProfile()
    await waitFor(() => expect(profileReadCount).toBe(1))

    gate.release()
    const [a, b] = await Promise.all([first, second])

    expect(a.data?.username).toBe('alice')
    expect(b.data?.username).toBe('alice')
    expect(profileReadCount).toBe(1)
  })
})
