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
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Avatar } from '@/components/ui/avatar'
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
import { UserAvatarContent } from '@/components/user-avatar'
import { getUserAvatarUrl } from '@/lib/avatar'

import {
  getSelfBindings,
  refreshSelfAvatar,
  updateUserProfile,
  uploadSelfAvatar,
} from '../api'
import { appendAvatarChange } from '../lib/avatar-commit-log'
import type { UserProfile } from '../types'

// ============================================================================
// Edit Profile Dialog
// ============================================================================

// Mirrors the `max=20` validation of username/display_name on the server.
const MAX_PROFILE_FIELD_LENGTH = 20

/**
 * Mirrors `selfAvatarMaxBytes` in `controller/self_avatar.go`, so an oversized
 * image is refused locally instead of being uploaded and rejected.
 */
const MAX_AVATAR_BYTES = 4 << 20

const ACCEPTED_AVATAR_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

/** Extension of `name`, lowercased and including the dot ('' when absent). */
function avatarExtensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

/**
 * Whether the picked file passes the local checks the server also enforces.
 * Returns the reason it is refused, or null when it is acceptable.
 */
function validateAvatarFile(
  file: File,
  maxBytes: number = MAX_AVATAR_BYTES
): 'unsupported-type' | 'too-large' | null {
  if (
    !ACCEPTED_AVATAR_EXTENSIONS.has(avatarExtensionOf(file.name)) ||
    (file.type !== '' && !file.type.startsWith('image/'))
  ) {
    return 'unsupported-type'
  }
  if (file.size > maxBytes) return 'too-large'
  return null
}

/**
 * State of the avatar change while the dialog is open. The avatar is only
 * written on save, so a picked image waits here as a draft until then.
 */
export type AvatarFlowState = 'idle' | 'ready' | 'saving' | 'saved'

/**
 * A pending avatar change: a locally previewed upload, or a provider sync whose
 * image can only be fetched when the save commits.
 */
export type AvatarDraft =
  | { kind: 'upload'; file: File; previewUrl: string }
  | { kind: 'sync' }

interface EditProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: UserProfile
  /** Receives the fresh server snapshot returned by avatar mutations. */
  onProfileUpdate?: (snapshot?: UserProfile) => void | Promise<void>
}

export function EditProfileDialog({
  open,
  onOpenChange,
  profile,
  onProfileUpdate,
}: EditProfileDialogProps) {
  const queryClient = useQueryClient()

  const invalidateAfterClose = async () => {
    await queryClient.invalidateQueries({ queryKey: ['user-self'] })
    await queryClient.invalidateQueries({ queryKey: ['self-binding-status'] })
  }

  const handleOpenChange = (nextOpen: boolean) => {
    // The form unmounts with the dialog content, which drops a pending draft and
    // releases its preview url. No avatar write is issued for it, and the read
    // that follows only refreshes the row the server already holds.
    if (!nextOpen) void invalidateAfterClose()
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <EditProfileForm
          profile={profile}
          onClose={() => handleOpenChange(false)}
          onProfileUpdate={async (snapshot) => {
            await onProfileUpdate?.(snapshot)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

interface EditProfileFormProps {
  profile: UserProfile
  /** Closes the dialog without committing the draft. */
  onClose: () => void
  onProfileUpdate: (snapshot?: UserProfile) => Promise<void>
}

// The form only exists while the dialog is open, so its fields can be seeded
// from the latest profile without synchronizing them through an effect.
function EditProfileForm({
  profile,
  onClose,
  onProfileUpdate,
}: EditProfileFormProps) {
  const { t } = useTranslation()
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [username, setUsername] = useState(profile.username)
  const [displayName, setDisplayName] = useState(profile.display_name ?? '')
  const [avatarDraft, setAvatarDraft] = useState<AvatarDraft | null>(null)
  const [avatarFlow, setAvatarFlow] = useState<AvatarFlowState>('idle')

  // A channel-bound account can pull the latest avatar from that channel.
  const bindingsQuery = useQuery({
    queryKey: ['self-binding-status'],
    queryFn: getSelfBindings,
  })
  const bindingRows = bindingsQuery.data?.data
  const canSyncAvatar =
    Array.isArray(bindingRows) && bindingRows.some((binding) => binding.bound)

  // A draft preview is an object url: the one being replaced is released when a
  // new file is picked, and the last one when the dialog unmounts.
  useEffect(() => {
    if (avatarDraft?.kind !== 'upload') return
    const { previewUrl } = avatarDraft
    return () => URL.revokeObjectURL(previewUrl)
  }, [avatarDraft])

  const savedAvatarUrl = getUserAvatarUrl(profile)
  const savedAvatarName = profile.username || profile.display_name || ''
  const draftPreviewUrl =
    avatarDraft?.kind === 'upload' ? avatarDraft.previewUrl : null
  const previewUrl = draftPreviewUrl ?? savedAvatarUrl
  const avatarName = username.trim() || savedAvatarName

  const selectAvatarFile = (file: File) => {
    const problem = validateAvatarFile(file)
    if (problem) {
      // Rejected locally: nothing changes, the avatar keeps its saved value.
      toast.error(
        t(
          problem === 'too-large'
            ? 'The image must be 4MB or smaller.'
            : 'Only jpg, jpeg, png and webp images are supported.'
        )
      )
      return
    }
    // Local preview only; the file itself is uploaded when the save commits.
    setAvatarDraft({
      kind: 'upload',
      file,
      previewUrl: URL.createObjectURL(file),
    })
    setAvatarFlow('ready')
  }

  const selectAvatarSync = () => {
    setAvatarDraft({ kind: 'sync' })
    setAvatarFlow('ready')
  }

  /**
   * Commit the pending avatar change, if there is one.
   *
   * The success toast is raised before the new snapshot reaches
   * `onProfileUpdate`, so the user is told the avatar changed before the
   * header, the account menu and the drawer start showing it.
   */
  const commitAvatarDraft = async (draft: AvatarDraft | null) => {
    if (!draft) return true
    const action = draft.kind
    const before = getUserAvatarUrl(profile)
    let response
    try {
      response =
        draft.kind === 'upload'
          ? await uploadSelfAvatar(draft.file)
          : await refreshSelfAvatar()
    } catch {
      response = null
    }

    if (!response?.success || !response.data) {
      toast.error(
        response?.message ||
          t(
            action === 'upload'
              ? 'Failed to update avatar'
              : 'Failed to sync avatar'
          )
      )
      appendAvatarChange({
        at: new Date().toISOString(),
        action,
        result: 'failure',
        from: before,
        to: null,
      })
      // The avatar keeps its saved value and the draft stays so the save can be
      // retried as it stands.
      setAvatarFlow('ready')
      return false
    }

    toast.success(
      response.message ||
        t(action === 'upload' ? 'Avatar updated' : 'Avatar synced')
    )
    // Only a confirmed commit reaches the surfaces that render the account.
    await onProfileUpdate(response.data)
    appendAvatarChange({
      at: new Date().toISOString(),
      action,
      result: 'success',
      from: before,
      to: getUserAvatarUrl(response.data),
    })
    setAvatarDraft(null)
    return true
  }

  // One submit action for the whole form: the avatar draft is committed first,
  // then the text fields, so a rejected avatar does not leave a partial save.
  const saveMutation = useMutation({
    mutationFn: async (draft: AvatarDraft | null) => {
      setAvatarFlow('saving')
      const committed = await commitAvatarDraft(draft)
      if (!committed) return false

      const nextUsername = username.trim()
      const nextDisplayName = displayName.trim()
      const profileChanged =
        nextUsername !== profile.username ||
        nextDisplayName !== (profile.display_name ?? '')
      if (!profileChanged) return true

      const response = await updateUserProfile({
        username: nextUsername,
        display_name: nextDisplayName,
      })
      if (!response.success) {
        toast.error(response.message || t('Failed to update profile'))
        return false
      }
      await onProfileUpdate()
      return true
    },
    onSuccess: (saved) => {
      if (saved) setAvatarFlow('saved')
    },
  })

  const usernameTooLong = username.trim().length > MAX_PROFILE_FIELD_LENGTH
  const displayNameTooLong =
    displayName.trim().length > MAX_PROFILE_FIELD_LENGTH
  const invalid = usernameTooLong || displayNameTooLong
  const nameDirty =
    username.trim() !== profile.username ||
    displayName.trim() !== (profile.display_name ?? '')
  const hasChanges = nameDirty || avatarDraft !== null
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
              if (file) selectAvatarFile(file)
              event.target.value = ''
            }}
          />
          <div className='flex items-center gap-3'>
            <Avatar className='h-12 w-12 rounded-xl text-sm'>
              <UserAvatarContent
                url={previewUrl}
                name={avatarName}
                fallbackClassName='rounded-xl'
              />
            </Avatar>
            <div className='flex min-w-0 flex-col gap-1.5'>
              <div className='flex flex-wrap items-center gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={saving}
                  onClick={() => uploadInputRef.current?.click()}
                >
                  {t('Upload avatar')}
                </Button>
                {canSyncAvatar && (
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    disabled={saving}
                    onClick={selectAvatarSync}
                  >
                    {t('Sync from provider')}
                  </Button>
                )}
              </div>
              {avatarFlow === 'ready' && avatarDraft !== null && (
                <p role='status' className='text-muted-foreground text-xs'>
                  {t('Pending save, the new avatar is not applied yet')}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button
          type='button'
          variant='outline'
          disabled={saving}
          onClick={onClose}
        >
          {t('Cancel')}
        </Button>
        <Button
          type='button'
          disabled={!hasChanges || invalid || saving}
          onClick={() => saveMutation.mutate(avatarDraft)}
        >
          {saving && <Loader2 className='size-4 animate-spin' />}
          {saving ? t('Saving...') : t('Save')}
        </Button>
      </DialogFooter>
    </>
  )
}
