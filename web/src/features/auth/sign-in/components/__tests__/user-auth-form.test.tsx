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
along with this program.  If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { login } from '@/features/auth/api'
import {
  hasRememberedCredentials,
  readRememberedCredentials,
  saveRememberedCredentials,
} from '@/features/auth/lib/remembered-credentials'
import { useAuthStore, type AuthBundle } from '@/stores/auth-store'

import { UserAuthForm } from '../user-auth-form'

vi.mock('@/features/auth/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/auth/api')>()
  return { ...actual, login: vi.fn() }
})

const bundle: AuthBundle = {
  access_token: 'remembered-login',
  token_type: 'Bearer',
  access_expires_at: 9999999999,
  user: { id: 7, username: 'alice', role: 1 },
  session: {
    sid: 'remembered-session',
    current: true,
    login_method: 'password',
    ip: '',
    user_agent: '',
    created_at: 1,
    last_active_at: 1,
    expires_at: 9999999999,
  },
}

const STORAGE_KEY = 'auth_remembered_credentials'

function renderForm(status: Record<string, unknown> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(['status'], {
    password_login_enabled: true,
    ...status,
  })

  const root = createRootRoute({ component: Outlet })
  const routes = [
    createRoute({
      getParentRoute: () => root,
      path: '/sign-in',
      component: UserAuthForm,
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/dashboard',
      component: () => <div>Dashboard</div>,
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/forgot-password',
      component: () => <div>Forgot password</div>,
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/otp',
      component: () => <div>Verification</div>,
    }),
  ]
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ['/sign-in'] }),
  })

  return {
    router,
    ...render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    ),
  }
}

function usernameInput() {
  return screen.getByLabelText('Username or Email')
}

function passwordInput() {
  return screen.getByPlaceholderText('Enter password')
}

beforeEach(() => {
  window.localStorage.clear()
  vi.mocked(login).mockResolvedValue({
    success: true,
    message: 'ok',
    data: bundle,
  })
})

afterEach(() => {
  useAuthStore.getState().auth.reset('idle')
  vi.clearAllMocks()
})

describe('remember password', () => {
  it('restores the stored credentials and checks the box', async () => {
    await saveRememberedCredentials({
      username: 'alice',
      password: 's3cret-pw',
    })

    renderForm()

    await waitFor(() => expect(usernameInput()).toHaveValue('alice'))
    expect(passwordInput()).toHaveValue('s3cret-pw')
    expect(
      screen.getByRole('checkbox', { name: 'Remember password' })
    ).toBeChecked()
  })

  it('stores the credentials after a successful login when checked', async () => {
    const user = userEvent.setup()
    renderForm()

    await screen.findByRole('button', { name: 'Sign in' })
    await user.type(usernameInput(), 'alice')
    await user.type(passwordInput(), 's3cret-pw')
    await user.click(
      screen.getByRole('checkbox', { name: 'Remember password' })
    )
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() =>
      expect(vi.mocked(login)).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'alice',
          password: 's3cret-pw',
        })
      )
    )
    await waitFor(async () =>
      expect(await readRememberedCredentials()).toEqual({
        username: 'alice',
        password: 's3cret-pw',
      })
    )

    const stored = window.localStorage.getItem(STORAGE_KEY) ?? ''
    expect(stored).not.toContain('s3cret-pw')
  })

  it('clears the stored credentials after a login when unchecked', async () => {
    await saveRememberedCredentials({
      username: 'alice',
      password: 's3cret-pw',
    })
    const user = userEvent.setup()
    renderForm()

    await waitFor(() => expect(usernameInput()).toHaveValue('alice'))
    const checkbox = screen.getByRole('checkbox', {
      name: 'Remember password',
    })
    expect(checkbox).toBeChecked()
    await user.click(checkbox)
    expect(checkbox).not.toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(vi.mocked(login)).toHaveBeenCalled())
    await waitFor(() => expect(hasRememberedCredentials()).toBe(false))
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('hides the option when password login is disabled', async () => {
    renderForm({ password_login_enabled: false, passkey_login: true })

    // The alternative sign-in method proves the form mounted before the
    // password-specific controls are asserted to be absent.
    expect(
      await screen.findByRole('button', { name: 'Sign in with Passkey' })
    ).toBeVisible()
    expect(screen.queryByLabelText('Username or Email')).toBeNull()
    expect(
      screen.queryByRole('checkbox', { name: 'Remember password' })
    ).toBeNull()
    await expect(readRememberedCredentials()).resolves.toBeNull()
  })
})
