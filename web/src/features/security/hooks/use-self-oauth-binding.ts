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
import { useState } from 'react'

import { createOAuthAuthorization } from '@/features/auth/api'
import {
  openOAuthPopup,
  type OAuthPopupExchange,
} from '@/features/auth/lib/oauth-popup'
import type { AccountSecurityResult } from '@/features/profile/types'
import { useStatus } from '@/hooks/use-status'
import { api } from '@/lib/api'
import { buildOAuthAuthorizationUrl } from '@/lib/oauth'
import {
  AuthOperationError,
  authRequestOptions,
  authResult,
} from '@/lib/secure-verification'

import { useAccountSecurity } from './use-account-security'

// ============================================================================
// Login Channel Binding Hook
// ============================================================================

type PreparedOAuthBinding = AccountSecurityResult & {
  provider: string
  state: string
  url: string
}

/**
 * Binds a sign-in channel to the current account. The shared verification
 * ceremony issues the security proof, then the provider popup returns the
 * authorization code that the backend exchanges for the binding.
 */
export function useSelfOAuthBinding() {
  const { status } = useStatus()
  const security = useAccountSecurity()
  const [preparedBinding, setPreparedBinding] =
    useState<PreparedOAuthBinding | null>(null)

  const startBinding = async (provider: string) => {
    const prepared = await security.run(async (signal) => {
      const proof = await security.verify(
        { scope: 'account.binding.bind', context: { provider } },
        signal
      )
      const authorization = await createOAuthAuthorization(
        provider,
        'bind',
        undefined,
        signal,
        proof
      )
      return {
        provider,
        state: authorization.state,
        url:
          authorization.authorizationUrl ??
          buildOAuthAuthorizationUrl(
            provider,
            authorization.state,
            status ?? {}
          ),
        notification_warning: false,
      }
    })
    if (prepared) setPreparedBinding(prepared)
  }

  const cancelBinding = () => setPreparedBinding(null)

  // A separate user click opens the provider popup. Opening it right after an
  // async verification response would otherwise be blocked by some browsers.
  const confirmBinding = async (): Promise<boolean> => {
    if (!preparedBinding) return false
    const prepared = preparedBinding
    setPreparedBinding(null)
    const result = await security.run(async (signal) => {
      let exchange: OAuthPopupExchange | undefined
      try {
        exchange = await openOAuthPopup({
          provider: prepared.provider,
          intent: 'bind',
          signal,
          prepare: async () => ({ state: prepared.state, url: prepared.url }),
        })
        const callback = exchange.callback
        const outcome = await authResult<AccountSecurityResult>(
          api.get(`/api/oauth/${prepared.provider}`, {
            ...authRequestOptions,
            singleUseAuthorization: true,
            disableDuplicate: true,
            signal: exchange.signal,
            params: {
              state: callback.state,
              code: callback.code,
              error: callback.error,
              error_description: callback.errorDescription,
            },
          })
        )
        exchange.signal.throwIfAborted()
        exchange.finish({ success: true })
        return outcome
      } catch (error) {
        const failure = AuthOperationError.from(
          exchange?.signal.aborted ? exchange.signal.reason : error
        )
        exchange?.finish({ success: false, message: failure.message })
        throw failure
      }
    })
    return Boolean(result)
  }

  return {
    startBinding,
    confirmBinding,
    cancelBinding,
    preparedProvider: preparedBinding?.provider ?? null,
    pending: security.pending,
    showVerification: security.showVerification,
    verificationDialogProps: security.verificationDialogProps,
  }
}
