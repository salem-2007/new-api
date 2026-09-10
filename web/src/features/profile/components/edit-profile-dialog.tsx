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
import { Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import {
  getSelfBindings,
  refreshSelfAvatar,
  updateUserProfile,
  uploadSelfAvatar,
} from '../api'
import type { UserProfile } from '../types'

// ============================================================================
// Edit Profile Dialog
// ============================================================================

// Mirrors the `max=20` validation of username/display_name on the server.
const MAX_PROFILE_FIELD_LENGTH = 20

interface EditProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: UserProfile
  onProfileUpdate?: () => void | Promise<void>
}

export function EditProfileDialog({
  open,
  onOpenChange,
  profile,
  onProfileUpdate,
}: EditProfileDialogProps) {
  const queryClient = useQueryClient()

  const refreshProfile = async () => {
    await queryClient.invalidateQueries({ queryKey: ['user-self'] })
    await queryClient.invalidateQueries({ queryKey: ['self-binding-status'] })
    await onProfileUpdate?.()
  }

  const handleOpenChange = (nextOpen: boolean) => {
    // Closing the dialog refreshes the header with the latest server data.
    if (!nextOpen) void refreshProfile()
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <EditProfileForm
          profile={profile}
          onProfileUpdate={refreshProfile}
        />
      </DialogContent>
    </Dialog>
  )
}

interface EditProfileFormProps {
  profile: UserProfile
  onProfileUpdate: () => Promise<void>
}

// The form only exists while the dialog is open, so its fields can be seeded
// from the latest profile without synchronizing them through an effect.
function EditProfileForm({ profile, onProfileUpdate }: EditProfileFormProps) {
  const { t } = useTranslation()
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [username, setUsername] = useState(profile.username)
  const [displayName, setDisplayName] = useState(profile.display_name ?? '')

  // A channel-bound account can pull the latest avatar from that channel.
  const bindingsQuery = useQuery({
    queryKey: ['self-binding-status'],
    queryFn: getSelfBindings,
  })
  const canSyncAvatar = (bindingsQuery.data?.data ?? []).some(
    (binding) => binding.bound
  )

  const saveMutation = useMutation({
    mutationFn: () =>
      updateUserProfile({
        username: username.trim(),
        display_name: displayName.trim(),
      }),
    onSuccess: async (response) => {
      if (!response.success) {
        toast.error(response.message || t('Failed to update profile'))
        return
      }
      toast.success(t('Profile updated'))
      await onProfileUpdate()
    },
    onError: () => toast.error(t('Failed to update profile')),
  })

  const uploadMutation = useMutation({
    mutationFn: uploadSelfAvatar,
    onSuccess: async (response) => {
      if (!response.success) {
        toast.error(response.message || t('Failed to update avatar'))
        return
      }
      toast.success(response.message || t('Avatar updated'))
      await onProfileUpdate()
    },
    onError: () => toast.error(t('Failed to update avatar')),
  })

  const syncMutation = useMutation({
    mutationFn: refreshSelfAvatar,
    onSuccess: async (response) => {
      if (!response.success) {
        toast.error(response.message || t('Failed to sync avatar'))
        return
      }
      toast.success(response.message || t('Avatar synced'))
      await onProfileUpdate()
    },
    onError: () => toast.error(t('Failed to sync avatar')),
  })

  const usernameTooLong = username.trim().length > MAX_PROFILE_FIELD_LENGTH
  const displayNameTooLong =
    displayName.trim().length > MAX_PROFILE_FIELD_LENGTH
  const invalid = usernameTooLong || displayNameTooLong
  const dirty =
    username.trim() !== profile.username ||
    displayName.trim() !== (profile.display_name ?? '')
  const saving = saveMutation.isPending

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('Edit Profile')}</DialogTitle>
        <DialogDescription>
          {t('Update your username, display name and avatar.')}
        </DialogDescription>
      </DialogHeader>

      <div className='grid gap-4'>
        <div className='grid gap-2'>
          <Label htmlFor='edit-profile-username'>{t('Username')}</Label>
          <Input
            id='edit-profile-username'
            value={username}
            aria-invalid={usernameTooLong}
            onChange={(event) => setUsername(event.target.value)}
          />
          {usernameTooLong && (
            <p role='alert' className='text-destructive text-xs'>
              {t('Username must be 20 characters or fewer.')}
            </p>
          )}
        </div>

        <div className='grid gap-2'>
          <Label htmlFor='edit-profile-display-name'>{t('Display Name')}</Label>
          <Input
            id='edit-profile-display-name'
            value={displayName}
            aria-invalid={displayNameTooLong}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          {displayNameTooLong && (
            <p role='alert' className='text-destructive text-xs'>
              {t('Display name must be 20 characters or fewer.')}
            </p>
          )}
        </div>

        <div className='grid gap-2 border-t pt-4'>
          <Label>{t('Avatar')}</Label>
          <input
            ref={uploadInputRef}
            type='file'
            accept='.jpg,.jpeg,.png,.webp'
            className='hidden'
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) uploadMutation.mutate(file)
              event.target.value = ''
            }}
          />
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={uploadMutation.isPending}
              onClick={() => uploadInputRef.current?.click()}
            >
              {uploadMutation.isPending
                ? t('Uploading...')
                : t('Upload avatar')}
            </Button>
            {canSyncAvatar && (
              <Button
                type='button'
                variant='ghost'
                size='sm'
                disabled={syncMutation.isPending}
                onClick={() => syncMutation.mutate()}
              >
                {syncMutation.isPending
                  ? t('Syncing...')
                  : t('Sync from provider')}
              </Button>
            )}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button
          type='button'
          disabled={!dirty || invalid || saving}
          onClick={() => saveMutation.mutate()}
        >
          {saving && <Loader2 className='size-4 animate-spin' />}
          {saving ? t('Saving...') : t('Save')}
        </Button>
      </DialogFooter>
    </>
  )
}
