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
/**
 * Local "remember password" storage for the sign-in form.
 *
 * The password is never written to disk in plain text: the payload is sealed
 * with AES-GCM through WebCrypto, using the same primitive the login transport
 * uses in `password-encryption.ts`. The key is derived from a random per-record
 * salt mixed with an application pepper, so a `localStorage` dump does not
 * expose readable credentials.
 *
 * Threat model: the pepper ships inside the bundle and the salt travels with
 * the ciphertext, so this is storage obfuscation — it stops casual inspection
 * of `localStorage`, not an attacker who can already execute script on this
 * origin. No password-stretching KDF is applied on purpose: there is no unknown
 * secret to brute-force, so iterations would only delay the legitimate user.
 * A user who wants stronger guarantees should keep the option unchecked.
 */

const STORAGE_KEY = 'auth_remembered_credentials'
const ENVELOPE_VERSION = 1
const KEY_SALT_BYTES = 16
const IV_BYTES = 12
const LOCAL_KEY_PEPPER = 'newapi:remembered-credentials:v1'

export interface RememberedCredentials {
  username: string
  password: string
}

interface StoredEnvelope {
  v: number
  salt: string
  iv: string
  data: string
}

/** Cached per-salt key, so a page load derives the key once at most. */
const keyCache = new Map<string, CryptoKey>()

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    // Safari in private mode and hardened cookie policies can throw on access.
    return null
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(value)
    const bytes = new Uint8Array(new ArrayBuffer(binary.length))
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  } catch {
    return null
  }
}

async function deriveLocalKey(
  subtle: SubtleCrypto,
  salt: Uint8Array
): Promise<CryptoKey> {
  const material = new TextEncoder().encode(
    `${LOCAL_KEY_PEPPER}:${toBase64(salt)}`
  )
  const digest = await subtle.digest('SHA-256', material)
  return subtle.importKey('raw', digest, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

async function getLocalKey(
  subtle: SubtleCrypto,
  salt: Uint8Array
): Promise<CryptoKey> {
  const cacheKey = toBase64(salt)
  const cached = keyCache.get(cacheKey)
  if (cached) return cached
  const key = await deriveLocalKey(subtle, salt)
  keyCache.set(cacheKey, key)
  return key
}

function readEnvelope(storage: Storage): StoredEnvelope | null {
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredEnvelope>
    if (
      parsed.v !== ENVELOPE_VERSION ||
      typeof parsed.salt !== 'string' ||
      typeof parsed.iv !== 'string' ||
      typeof parsed.data !== 'string'
    ) {
      return null
    }
    return {
      v: parsed.v,
      salt: parsed.salt,
      iv: parsed.iv,
      data: parsed.data,
    }
  } catch {
    return null
  }
}

/**
 * Whether a stored credential exists, without decrypting it. Used to decide if
 * the sign-in form should even attempt a restore.
 */
export function hasRememberedCredentials(): boolean {
  const storage = getStorage()
  return storage ? readEnvelope(storage) !== null : false
}

/** Decrypt the stored credentials; returns null when absent or unreadable. */
export async function readRememberedCredentials(): Promise<RememberedCredentials | null> {
  const storage = getStorage()
  const subtle = globalThis.crypto?.subtle
  if (!storage || !subtle) return null

  const envelope = readEnvelope(storage)
  if (!envelope) return null

  const salt = fromBase64(envelope.salt)
  const iv = fromBase64(envelope.iv)
  const data = fromBase64(envelope.data)
  if (!salt || !iv || !data) return null

  try {
    const key = await getLocalKey(subtle, salt)
    const plaintext = await subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
    const parsed = JSON.parse(
      new TextDecoder().decode(plaintext)
    ) as Partial<RememberedCredentials>
    if (
      typeof parsed.username !== 'string' ||
      typeof parsed.password !== 'string'
    ) {
      return null
    }
    return { username: parsed.username, password: parsed.password }
  } catch {
    // Tampered, truncated, or sealed with a different key: drop it silently.
    clearRememberedCredentials()
    return null
  }
}

/**
 * Persist the credentials locally. Resolves to false when the value could not
 * be stored (no WebCrypto, storage disabled, quota) — the caller keeps the
 * login flow working either way.
 */
export async function saveRememberedCredentials(
  credentials: RememberedCredentials
): Promise<boolean> {
  const storage = getStorage()
  const subtle = globalThis.crypto?.subtle
  if (!storage || !subtle || !credentials.password) return false

  try {
    const salt = globalThis.crypto.getRandomValues(
      new Uint8Array(KEY_SALT_BYTES)
    )
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES))
    const key = await getLocalKey(subtle, salt)
    const sealed = await subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(JSON.stringify(credentials))
    )
    const envelope: StoredEnvelope = {
      v: ENVELOPE_VERSION,
      salt: toBase64(salt),
      iv: toBase64(iv),
      data: toBase64(new Uint8Array(sealed)),
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(envelope))
    return true
  } catch {
    return false
  }
}

/** Remove the stored credentials, e.g. when the user unchecks the option. */
export function clearRememberedCredentials(): void {
  keyCache.clear()
  getStorage()?.removeItem(STORAGE_KEY)
}
