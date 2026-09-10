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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { AccountBindings } from '../account-bindings'

import type { UserProfile } from '@/features/profile/types'

const profile: UserProfile = {
  id: 1,
  username: 'alice',
  display_name: 'Alice',
  role: 1,
  group: 'default',
  quota: 1000000,
  used_quota: 0,
  request_count: 0,
  status: 1,
  email: 'alice@example.com',
  github_id: '4242',
  aff_count: 0,
  aff_quota: 0,
  aff_history_quota: 0,
  created_time: 0,
}

const status = {
  wechat_login: true,
  github_oauth: true,
  discord_oauth: true,
  oidc_enabled: true,
  telegram_oauth: true,
  linuxdo_oauth: true,
}

function renderBindings(onUpdate = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(['status'], status)
  render(
    <QueryClientProvider client={client}>
      <AccountBindings profile={profile} onUpdate={onUpdate} />
    </QueryClientProvider>
  )
  return { onUpdate }
}

beforeEach(() => {
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'alice',
    role: 1,
  })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/user/self/oauth/binding_status') {
      return {
        data: {
          success: true,
          data: [
            { provider: 'github', bound: true },
            { provider: 'discord', bound: false },
            { provider: 'oidc', bound: false },
            { provider: 'wechat', bound: false },
            { provider: 'telegram', bound: false },
            { provider: 'linuxdo', bound: false },
          ],
        },
      }
    }
    if (url === '/api/user/oauth/bindings') {
      return { data: { success: true, data: [] } }
    }
    throw new Error(`Unexpected GET ${url}`)
  })
})

afterEach(() => {
  useAuthStore.getState().auth.reset()
  vi.restoreAllMocks()
})

describe('account bindings', () => {
  it('merges the bound sign-in channels into the account bindings grid', async () => {
    renderBindings()

    const list = await screen.findByRole('list', { name: 'Account Bindings' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(7)
    expect(within(list).getByText('GitHub', { selector: 'p' })).toBeVisible()
    expect(within(list).getByText('Discord', { selector: 'p' })).toBeVisible()
  })

  it('unbinds a built-in channel after confirmation and refreshes the profile', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const remove = vi.spyOn(api, 'delete').mockResolvedValue({
      data: { success: true, message: '已解绑 github' },
    })
    const { onUpdate } = renderBindings()

    const list = await screen.findByRole('list', { name: 'Account Bindings' })
    const githubRow = within(list)
      .getByText('GitHub', { selector: 'p' })
      .closest('li')
    expect(githubRow).not.toBeNull()

    await user.click(within(githubRow!).getByRole('button', { name: 'Unbind' }))

    expect(confirm).toHaveBeenCalledWith(
      'Unbind this provider? Make sure you have a password or another provider to sign in.'
    )
    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith('/api/user/self/oauth/github')
    )
    await waitFor(() => expect(onUpdate).toHaveBeenCalled())
  })

  it('keeps the binding when the confirmation is dismissed', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const remove = vi.spyOn(api, 'delete')
    renderBindings()

    const list = await screen.findByRole('list', { name: 'Account Bindings' })
    const githubRow = within(list)
      .getByText('GitHub', { selector: 'p' })
      .closest('li')
    await user.click(within(githubRow!).getByRole('button', { name: 'Unbind' }))
    expect(remove).not.toHaveBeenCalled()
  })

  it('shows a bind action for channels that are not linked yet', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderBindings()

    const list = await screen.findByRole('list', { name: 'Account Bindings' })
    const discordRow = within(list)
      .getByText('Discord', { selector: 'p' })
      .closest('li')
    expect(
      within(discordRow!).getByRole('button', { name: 'Bind' })
    ).toBeVisible()
  })
})
