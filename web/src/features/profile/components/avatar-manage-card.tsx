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
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  refreshSelfAvatar,
  unbindSelfProvider,
  getSelfBindings,
} from '../api'
import type { ApiResponse } from '../types'
import type { UserProfile } from '../types'

type AvatarManageCardProps = {
  profile: UserProfile
}

const PROVIDER_LABELS: Record<string, string> = {
  github: 'GitHub',
  discord: 'Discord',
  oidc: 'OIDC',
  wechat: '微信',
  telegram: 'Telegram',
  linuxdo: 'LinuxDO',
}

export function AvatarManageCard({ profile }: AvatarManageCardProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [username, setUsername] = useState(profile.username)
  const [displayName, setDisplayName] = useState(profile.display_name ?? '')

  useEffect(() => {
    setUsername(profile.username)
    setDisplayName(profile.display_name ?? '')
  }, [profile.username, profile.display_name])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['user-self'] })
    queryClient.invalidateQueries({ queryKey: ['self-binding-status'] })
  }

  const bindingsQuery = useQuery({
    queryKey: ['self-binding-status'],
    queryFn: getSelfBindings,
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const response = await api.post('/user/self/avatar/upload', form)
      return response.data as ApiResponse
    },
    onSuccess: (res) => {
      if (res.success) {
        toast.success(res.message || t('Avatar updated'))
        invalidate()
      } else {
        toast.error(res.message || t('Failed to update avatar'))
      }
    },
    onError: () => toast.error(t('Failed to update avatar')),
  })

  const refreshMutation = useMutation({
    mutationFn: refreshSelfAvatar,
    onSuccess: (res) => {
      if (res.success) {
        toast.success(res.message || t('Avatar synced'))
        invalidate()
      } else {
        toast.error(res.message || t('Failed to sync avatar'))
      }
    },
    onError: () => toast.error(t('Failed to sync avatar')),
  })

  const unbindMutation = useMutation({
    mutationFn: (provider: string) => unbindSelfProvider(provider),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(res.message || t('Provider unbound'))
        invalidate()
      } else {
        toast.error(res.message || t('Failed to unbind'))
      }
    },
    onError: () => toast.error(t('Failed to unbind')),
  })

  const profileMutation = useMutation({
    mutationFn: async () => {
      const response = await api.put('/user/self', {
        username: username.trim(),
        display_name: displayName.trim(),
      })
      return response.data as { success: boolean; message?: string }
    },
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t('Profile updated'))
        invalidate()
      } else {
        toast.error(res.message || t('Failed to update profile'))
      }
    },
    onError: () => toast.error(t('Failed to update profile')),
  })

  const bindings: Array<{ provider: string; bound: boolean }> | undefined =
    bindingsQuery.data?.data as Array<{ provider: string; bound: boolean }> | undefined
  const dirty =
    username.trim() !== profile.username ||
    displayName.trim() !== (profile.display_name ?? '')

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Profile & Avatar')}</CardTitle>
        <CardDescription>
          {t('Update your username, display name, avatar and linked sign-in providers.')}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-5'>
        <div className='grid gap-3 sm:grid-cols-2'>
          <div className='grid gap-2'>
            <Label htmlFor='profile-username'>{t('Username')}</Label>
            <Input
              id='profile-username'
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={20}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='profile-display-name'>{t('Display Name')}</Label>
            <Input
              id='profile-display-name'
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={20}
            />
          </div>
        </div>
        <Button
          type='button'
          size='sm'
          disabled={!dirty || profileMutation.isPending}
          onClick={() => profileMutation.mutate()}
        >
          {profileMutation.isPending ? t('Saving...') : t('Save profile')}
        </Button>

        <div className='space-y-2 border-t pt-4'>
          <Label htmlFor='avatar-upload'>{t('Avatar')}</Label>
          <div className='flex items-center gap-3'>
            <input
              ref={uploadInputRef}
              id='avatar-upload'
              type='file'
              accept='.jpg,.jpeg,.png,.webp'
              className='hidden'
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) uploadMutation.mutate(file)
                e.target.value = ''
              }}
            />
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={uploadMutation.isPending}
              onClick={() => uploadInputRef.current?.click()}
            >
              {uploadMutation.isPending ? t('Uploading...') : t('Upload avatar')}
            </Button>
            {profile.avatar_url && (
              <Button
                type='button'
                variant='ghost'
                size='sm'
                disabled={refreshMutation.isPending}
                onClick={() => refreshMutation.mutate()}
              >
                {refreshMutation.isPending
                  ? t('Syncing...')
                  : t('Sync from provider')}
              </Button>
            )}
          </div>
        </div>

        <div className='space-y-2 border-t pt-4'>
          <Label>{t('Linked sign-in providers')}</Label>
          {bindingsQuery.isLoading ? (
            <Skeleton className='h-10 w-full' />
          ) : (
            <div className='space-y-2'>
              {(bindings ?? []).map((binding) => (
                <div
                  key={binding.provider}
                  className='flex items-center justify-between gap-2 rounded-lg border px-3 py-2'
                >
                  <span className='text-sm'>
                    {PROVIDER_LABELS[binding.provider] ?? binding.provider}
                  </span>
                  {binding.bound ? (
                    <Button
                      type='button'
                      variant='destructive'
                      size='xs'
                      disabled={unbindMutation.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            t(
                              'Unbind this provider? Make sure you have a password or another provider to sign in.'
                            )
                          )
                        ) {
                          unbindMutation.mutate(binding.provider)
                        }
                      }}
                    >
                      {t('Unbind')}
                    </Button>
                  ) : (
                    <span className='text-muted-foreground text-xs'>
                      {t('Not linked')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}



