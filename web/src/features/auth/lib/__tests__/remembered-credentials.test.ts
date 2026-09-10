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
import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearRememberedCredentials,
  hasRememberedCredentials,
  readRememberedCredentials,
  saveRememberedCredentials,
} from '../remembered-credentials'

const STORAGE_KEY = 'auth_remembered_credentials'

beforeEach(() => {
  window.localStorage.clear()
})

describe('remembered credentials', () => {
  it('round-trips the username and password', async () => {
    await expect(
      saveRememberedCredentials({ username: 'alice', password: 's3cret-pw' })
    ).resolves.toBe(true)
    expect(hasRememberedCredentials()).toBe(true)

    await expect(readRememberedCredentials()).resolves.toEqual({
      username: 'alice',
      password: 's3cret-pw',
    })
  })

  it('never writes the password in plain text', async () => {
    await saveRememberedCredentials({
      username: 'alice',
      password: 's3cret-pw',
    })

    const stored = window.localStorage.getItem(STORAGE_KEY) ?? ''
    expect(stored).not.toContain('s3cret-pw')
    expect(stored).not.toContain('alice')
    expect(JSON.parse(stored)).toMatchObject({ v: 1 })
  })

  it('produces different ciphertext for the same credentials', async () => {
    await saveRememberedCredentials({ username: 'alice', password: 'pw' })
    const first = window.localStorage.getItem(STORAGE_KEY)
    await saveRememberedCredentials({ username: 'alice', password: 'pw' })
    const second = window.localStorage.getItem(STORAGE_KEY)
    expect(second).not.toBe(first)
  })

  it('drops a tampered envelope instead of returning garbage', async () => {
    await saveRememberedCredentials({ username: 'alice', password: 'pw' })
    const envelope = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? '{}'
    ) as { data: string }
    envelope.data = `${envelope.data.slice(0, -4)}AAAA`
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope))

    await expect(readRememberedCredentials()).resolves.toBeNull()
    expect(hasRememberedCredentials()).toBe(false)
  })

  it('returns null when nothing was saved', async () => {
    expect(hasRememberedCredentials()).toBe(false)
    await expect(readRememberedCredentials()).resolves.toBeNull()
  })

  it('refuses to store an empty password', async () => {
    await expect(
      saveRememberedCredentials({ username: 'alice', password: '' })
    ).resolves.toBe(false)
    expect(hasRememberedCredentials()).toBe(false)
  })

  it('clears the stored credentials', async () => {
    await saveRememberedCredentials({ username: 'alice', password: 'pw' })
    clearRememberedCredentials()
    expect(hasRememberedCredentials()).toBe(false)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
