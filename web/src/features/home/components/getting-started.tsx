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
import { BarChart3, Settings, Zap, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { cn } from '@/lib/utils'

import { HAIRLINE, SECTION_LABEL } from './section-label'

interface SetupStep {
  title: string
  description: string
  icon: LucideIcon
}

const SETUP_STEPS: SetupStep[] = [
  {
    title: 'Configure',
    description:
      'Add your API keys, set up channels and configure access permissions',
    icon: Settings,
  },
  {
    title: 'Connect',
    description:
      'Connect through OpenAI, Claude, Gemini, and other compatible API routes',
    icon: Zap,
  },
  {
    title: 'Monitor',
    description:
      'Track usage, costs and performance with real-time analytics',
    icon: BarChart3,
  },
]

/**
 * Setup rail. A sticky heading beside a numbered list, so the three steps read
 * as one sequence instead of three interchangeable cards.
 */
export function GettingStarted() {
  const { t } = useTranslation()

  return (
    <section
      data-glass-surface='bare'
      className={cn('relative z-10 border-t px-6 py-16 md:py-20', HAIRLINE)}
    >
      <div className='mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-16'>
        <AnimateInView animation='fade-up' className='lg:sticky lg:top-28 lg:self-start'>
          <p className={SECTION_LABEL}>{t('How It Works')}</p>
          <h2 className='mt-2 text-2xl font-semibold tracking-tight md:text-[28px]'>
            {t('Three steps to get started')}
          </h2>
        </AnimateInView>

        <ol className={cn('border-t', HAIRLINE)}>
          {SETUP_STEPS.map((step, index) => {
            const Icon = step.icon
            return (
              <AnimateInView
                as='li'
                key={step.title}
                animation='fade-up'
                delay={index * 80}
                className={cn(
                  'grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2 border-b py-6 sm:gap-x-8 sm:py-7',
                  HAIRLINE
                )}
              >
                <span className='text-foreground/45 pt-0.5 font-mono text-xs tabular-nums'>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className='min-w-0'>
                  <h3 className='flex items-center gap-2 text-sm font-semibold tracking-tight'>
                    <Icon
                      className='text-muted-foreground size-4 shrink-0'
                      aria-hidden
                    />
                    {t(step.title)}
                  </h3>
                  <p className='text-foreground/70 mt-2 max-w-xl text-sm leading-relaxed'>
                    {t(step.description)}
                  </p>
                </div>
              </AnimateInView>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
