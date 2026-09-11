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
import { Link } from '@tanstack/react-router'
import { ArrowRight, BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useStatus } from '@/hooks/use-status'

import { SECTION_LABEL } from './section-label'

interface StartBandProps {
  isAuthenticated: boolean
}

/**
 * Closing band. It states the one fact a caller needs before writing any code —
 * the base URL — and pairs it with the single next action for each state.
 */
export function StartBand(props: StartBandProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const docsUrl =
    (status?.docs_link as string | undefined) || 'https://docs.newapi.pro'
  const registrationOpen = status?.register_enabled !== false
  const serverOrigin =
    typeof window === 'undefined' ? '' : window.location.origin

  return (
    <section
      data-glass-surface='bare'
      className='relative z-10 px-6 pt-4 pb-16 md:pb-20'
    >
      <AnimateInView animation='fade-up' className='mx-auto max-w-6xl'>
        <Card data-card-hover='false' className='gap-0 overflow-hidden py-0'>
          <CardContent className='grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-center lg:gap-12'>
            <div>
              <p className={SECTION_LABEL}>{t('Base URL')}</p>
              <h2 className='mt-2 text-2xl font-semibold tracking-tight md:text-[28px]'>
                {t('Point your client at one base URL')}
              </h2>
              <p className='text-foreground/70 mt-3 max-w-lg text-sm leading-relaxed'>
                {t(
                  'OpenAI, Claude, Gemini and other compatible routes answer on the same host.'
                )}
              </p>
            </div>

            <div className='lg:justify-self-end lg:text-right'>
              <code className='border-border/50 bg-muted/20 inline-block max-w-full truncate rounded-lg border px-3.5 py-2 font-mono text-[12.5px]'>
                {serverOrigin}/v1
              </code>
              <div className='mt-4 flex flex-wrap items-center gap-3 lg:justify-end'>
                {props.isAuthenticated ? (
                  <>
                    <Button
                      className='group h-10 rounded-lg px-4 text-sm font-medium'
                      render={<Link to='/keys' />}
                    >
                      {t('API Keys')}
                      <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
                    </Button>
                    <Button
                      variant='outline'
                      className='border-border/50 hover:border-border hover:bg-muted/50 h-10 rounded-lg px-4 text-sm font-medium'
                      render={
                        <a
                          href={docsUrl}
                          target='_blank'
                          rel='noopener noreferrer'
                        />
                      }
                    >
                      <BookOpen className='text-muted-foreground/80 size-4' />
                      <span className='ml-1.5'>{t('Docs')}</span>
                    </Button>
                  </>
                ) : (
                  <>
                    {registrationOpen && (
                      <Button
                        className='group h-10 rounded-lg px-4 text-sm font-medium'
                        render={<Link to='/sign-up' />}
                      >
                        {t('Get Started')}
                        <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
                      </Button>
                    )}
                    <Button
                      variant='outline'
                      className='border-border/50 hover:border-border hover:bg-muted/50 h-10 rounded-lg px-4 text-sm font-medium'
                      render={<Link to='/pricing' />}
                    >
                      {t('View Pricing')}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </AnimateInView>
    </section>
  )
}
