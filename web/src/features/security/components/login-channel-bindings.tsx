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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Shield, Unlink } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  IconDiscord,
  IconGithub,
  IconLinuxDo,
  IconTelegram,
  IconWeChat,
} from '@/assets/brand-icons'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SecureVerificationDialog } from '@/features/auth/secure-verification'
import { getSelfBindings, unbindSelfProvider } from '@/features/profile/api'

import { useSelfOAuthBinding } from '../hooks/use-self-oauth-binding'

// ============================================================================
// Login Channel Bindings Component
// ============================================================================

type LoginChannel = {
  provider: string
  label: string
  icon: ReactNode
  // Channels without an inline flow are bound from the sign-in page instead.
  supportsInlineBinding: boolean
}

const LOGIN_CHANNELS: LoginChannel[] = [
  {
    provider: 'github',
    label: 'GitHub',
    icon: <IconGithub className='h-4 w-4' />,
    supportsInlineBinding: true,
  },
  {
    provider: 'discord',
    label: 'Discord',
    icon: <IconDiscord className='h-4 w-4' />,
    supportsInlineBinding: true,
  },
  {
    provider: 'oidc',
    label: 'OIDC',
    icon: <Shield className='h-4 w-4' />,
    supportsInlineBinding: true,
  },
  {
    provider: 'wechat',
    label: 'WeChat',
    icon: <IconWeChat className='h-4 w-4' />,
    supportsInlineBinding: false,
  },
  {
    provider: 'telegram',
    label: 'Telegram',
    icon: <IconTelegram className='h-4 w-4' />,
    supportsInlineBinding: true,
  },
  {
    provider: 'linuxdo',
    label: 'LinuxDO',
    icon: <IconLinuxDo className='h-4 w-4' />,
    supportsInlineBinding: true,
  },
]

const GRID_CLASSNAME = 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'

interface LoginChannelBindingsProps {
  onUpdate?: () => void
}

export function LoginChannelBindings({
  onUpdate,
}: LoginChannelBindingsProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const oauthBinding = useSelfOAuthBinding()

  const bindingsQuery = useQuery({
    queryKey: ['self-binding-status'],
    queryFn: getSelfBindings,
  })

  const boundByProvider = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const item of bindingsQuery.data?.data ?? []) {
      map.set(item.provider, item.bound)
    }
    return map
  }, [bindingsQuery.data])

  const refreshBindings = async () => {
    await queryClient.invalidateQueries({ queryKey: ['self-binding-status'] })
    onUpdate?.()
  }

  const unbindMutation = useMutation({
    mutationFn: (provider: string) => unbindSelfProvider(provider),
    onSuccess: async (response) => {
      if (!response.success) {
        toast.error(response.message || t('Failed to unbind'))
        return
      }
      toast.success(response.message || t('Provider unbound'))
      await refreshBindings()
    },
    onError: () => toast.error(t('Failed to unbind')),
  })

  const handleUnbind = (provider: string) => {
    const confirmed = window.confirm(
      t(
        'Unbind this provider? Make sure you have a password or another provider to sign in.'
      )
    )
    if (confirmed) unbindMutation.mutate(provider)
  }

  const handleBind = (channel: LoginChannel) => {
    if (!channel.supportsInlineBinding) {
      window.location.assign('/sign-in')
      return
    }
    void oauthBinding.startBinding(channel.provider)
  }

  const confirmBinding = async () => {
    const bound = await oauthBinding.confirmBinding()
    if (bound) {
      toast.success(t('Binding successful!'))
      await refreshBindings()
    }
  }

  const busy = unbindMutation.isPending || oauthBinding.pending

  let content: ReactNode
  if (bindingsQuery.isLoading) {
    content = (
      <div className={GRID_CLASSNAME}>
        {LOGIN_CHANNELS.map((channel) => (
          <Skeleton key={channel.provider} className='h-[54px] w-full' />
        ))}
      </div>
    )
  } else if (bindingsQuery.isError) {
    content = (
      <div className='flex items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2'>
        <p className='text-muted-foreground text-xs'>
          {t('Failed to load login channels')}
        </p>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='h-7 shrink-0 px-2.5 text-xs'
          onClick={() => void bindingsQuery.refetch()}
        >
          {t('Retry')}
        </Button>
      </div>
    )
  } else {
    content = (
      <ul aria-label={t('Linked sign-in providers')} className={GRID_CLASSNAME}>
        {LOGIN_CHANNELS.map((channel) => {
          const bound = boundByProvider.get(channel.provider) ?? false
          return (
            <li
              key={channel.provider}
              className='flex min-w-0 items-center justify-between gap-2 rounded-lg border px-2.5 py-2'
            >
              <div className='flex min-w-0 items-center gap-2'>
                <div className='bg-muted shrink-0 rounded-md p-1.5'>
                  {channel.icon}
                </div>
                <div className='min-w-0'>
                  <div className='flex items-center gap-1.5'>
                    <p
                      className='truncate text-sm font-medium'
                      title={t(channel.label)}
                    >
                      {t(channel.label)}
                    </p>
                    {bound && (
                      <StatusBadge
                        label={t('Bound')}
                        variant='success'
                        copyable={false}
                      />
                    )}
                  </div>
                  <p className='text-muted-foreground truncate text-xs'>
                    {bound ? t('Bound') : t('Not bound')}
                  </p>
                </div>
              </div>
              {bound ? (
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='text-destructive h-7 shrink-0 px-2.5 text-xs'
                  disabled={busy}
                  onClick={() => handleUnbind(channel.provider)}
                >
                  <Unlink className='mr-1 h-3 w-3' />
                  {t('Unbind')}
                </Button>
              ) : (
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='h-7 shrink-0 px-2.5 text-xs'
                  disabled={busy}
                  onClick={() => handleBind(channel)}
                >
                  {t('Bind')}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <>
      {content}
      {oauthBinding.showVerification && (
        <SecureVerificationDialog {...oauthBinding.verificationDialogProps} />
      )}
      <ConfirmDialog
        open={oauthBinding.preparedProvider !== null}
        onOpenChange={(open) => {
          if (!open) oauthBinding.cancelBinding()
        }}
        title={t('Continue account binding')}
        desc={t(
          'Your identity has been verified. Continue to the provider to finish linking your account.'
        )}
        handleConfirm={() => void confirmBinding()}
        confirmText={t('Continue')}
      />
    </>
  )
}
