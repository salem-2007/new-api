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

/**
 * Ledger of avatar commits.
 *
 * The edit dialog only writes an avatar on save, so a user who uploads and then
 * cancels leaves no server-side trace. Recording every accepted or rejected
 * commit here keeps the two outcomes distinguishable after the fact (which url
 * the account moved from and to, and when), without adding a backend endpoint.
 *
 * Storage is best effort: the dashboard renders in SSR/privacy modes where
 * `localStorage` is absent or throws on write, and a full quota must never fail
 * a save that the server already accepted.
 */

export const AVATAR_CHANGE_LOG_KEY = 'new-api:avatar-change-log'

/** Entries kept in the ledger; older ones are dropped on append. */
export const AVATAR_CHANGE_LOG_MAX_ENTRIES = 20

export interface AvatarChangeEntry {
  /** ISO timestamp of the attempt. */
  at: string
  action: 'upload' | 'sync'
  result: 'success' | 'failure'
  /** Avatar url before the commit (null when the account had none). */
  from: string | null
  /** Avatar url the server answered with (null when the commit failed). */
  to: string | null
}

function isAvatarChangeEntry(value: unknown): value is AvatarChangeEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.at === 'string' &&
    (entry.action === 'upload' || entry.action === 'sync') &&
    (entry.result === 'success' || entry.result === 'failure') &&
    (entry.from === null || typeof entry.from === 'string') &&
    (entry.to === null || typeof entry.to === 'string')
  )
}

function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/**
 * Read the ledger, newest entry first. Unreadable or malformed storage answers
 * with an empty list so callers always get an array.
 */
export function readAvatarChanges(): AvatarChangeEntry[] {
  try {
    const raw = getStorage()?.getItem(AVATAR_CHANGE_LOG_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isAvatarChangeEntry)
  } catch {
    return []
  }
}

/** Append one commit to the ledger, keeping at most the last 20 entries. */
export function appendAvatarChange(entry: AvatarChangeEntry): void {
  try {
    const next = [entry, ...readAvatarChanges()].slice(
      0,
      AVATAR_CHANGE_LOG_MAX_ENTRIES
    )
    getStorage()?.setItem(AVATAR_CHANGE_LOG_KEY, JSON.stringify(next))
  } catch {
    // Private mode, quota exceeded or a serialization failure: the ledger is
    // diagnostics, so losing an entry must not surface to the caller.
  }
}
