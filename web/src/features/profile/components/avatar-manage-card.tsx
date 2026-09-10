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
import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  refreshSelfAvatar,
  unbindSelfGitHub,
  updateSelfAvatar,
} from '../api'
import type { UserProfile } from '../types'

type AvatarManageCardProps = {
  profile: UserProfile
}

export function AvatarManageCard({ profile }: AvatarManageCardProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [avatarUrlInput, setAvatarUrlInput] = useState('')

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['user-self'] })
  }

  const updateUrlMutation = useMutation({
    mutationFn: () => updateSelfAvatar(avatarUrlInput.trim()),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t('Avatar updated'))
        setAvatarUrlInput('')
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
        toast.success(res.message || t('Avatar synced from GitHub'))
        invalidate()
      } else {
        toast.error(res.message || t('Failed to sync avatar'))
      }
    },
    onError: () => toast.error(t('Failed to sync avatar')),
  })

  const unbindMutation = useMutation({
    mutationFn: unbindSelfGitHub,
    onSuccess: (res) => {
      if (res.success) {
        toast.success(res.message || t('GitHub unbound'))
        invalidate()
      } else {
        toast.error(res.message || t('Failed to unbind GitHub'))
      }
    },
    onError: () => toast.error(t('Failed to unbind GitHub')),
  })

  const hasGithub = Boolean(profile.github_id)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Avatar')}</CardTitle>
        <CardDescription>
          {t('Manage your profile picture and GitHub binding.')}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid gap-2'>
          <Label htmlFor='avatar-url'>{t('Custom avatar URL')}</Label>
          <div className='flex gap-2'>
            <Input
              id='avatar-url'
              value={avatarUrlInput}
              onChange={(e) => setAvatarUrlInput(e.target.value)}
              placeholder='https://...'
            />
            <Button
              type='button'
              size='sm'
              disabled={
                updateUrlMutation.isPending ||
                avatarUrlInput.trim().length === 0
              }
              onClick={() => updateUrlMutation.mutate()}
            >
              {updateUrlMutation.isPending ? t('Saving...') : t('Save')}
            </Button>
          </div>
        </div>

        <div className='flex flex-wrap items-center gap-2'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={!hasGithub || refreshMutation.isPending}
            onClick={() => refreshMutation.mutate()}
          >
            {refreshMutation.isPending
              ? t('Syncing...')
              : t('Sync from GitHub')}
          </Button>
          {hasGithub && (
            <Button
              type='button'
              variant='destructive'
              size='sm'
              disabled={unbindMutation.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    t(
                      'Unlink GitHub? You will need a password to sign in afterwards.'
                    )
                  )
                ) {
                  unbindMutation.mutate()
                }
              }}
            >
              {unbindMutation.isPending ? t('Unbinding...') : t('Unbind GitHub')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
