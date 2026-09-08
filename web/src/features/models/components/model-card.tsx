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
import type { Row } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

import type { Model } from '../types'
import { getModelStatusConfig } from '../constants'

interface ModelCardProps {
  row: Row<Model>
  isSelected: boolean
}

/**
 * 模型广场卡片视图 —— 与渠道卡片同容器（data-table-card 液态玻璃，
 * 由 liquid-components.css §② 统一着色），卡片内部只做信息排布。
 */
export function ModelCard({ row, isSelected }: ModelCardProps) {
  const { t } = useTranslation()
  const model = row.original

  const statusConfig = getModelStatusConfig(t)[
    model.status as keyof ReturnType<typeof getModelStatusConfig>
  ]
  const tags = (model.tags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 4)

  return (
    <div
      data-state={isSelected ? 'selected' : undefined}
      className='flex flex-col gap-3'
    >
      {/* Row 1: selection + name, status badge */}
      <div className='flex items-center justify-between gap-2'>
        <div className='flex min-w-0 flex-1 items-center gap-2'>
          {row.getCanMultiSelect() && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => row.toggleSelected()}
              aria-label={t('Select row')}
            />
          )}
          <span
            className='truncate font-mono text-sm font-semibold'
            title={model.model_name}
          >
            {model.model_name}
          </span>
        </div>
        {statusConfig && (
          <Badge
            variant='outline'
            className={cn(
              'shrink-0 text-[10px]',
              model.status === 1
                ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                : 'border-amber-500/40 text-amber-600 dark:text-amber-400'
            )}
          >
            {statusConfig.label}
          </Badge>
        )}
      </div>

      {/* Row 2: description */}
      {model.description && (
        <p
          className='text-muted-foreground/80 line-clamp-2 text-xs leading-relaxed'
          title={model.description}
        >
          {model.description}
        </p>
      )}

      {/* Row 3: tags */}
      {tags.length > 0 && (
        <div className='flex flex-wrap items-center gap-1.5'>
          {tags.map((tag) => (
            <Badge
              key={tag}
              variant='secondary'
              className='text-muted-foreground/70 px-1.5 py-0 text-[10px] font-normal'
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Row 4: meta line */}
      <div className='text-muted-foreground/50 flex items-center gap-2 text-[10px] tabular-nums'>
        <span>ID {model.id}</span>
        <span className='bg-foreground/15 size-1 rounded-full' />
        <span>{model.sync_official === 1 ? t('Official Sync') : t('Metadata')}</span>
      </div>
    </div>
  )
}
