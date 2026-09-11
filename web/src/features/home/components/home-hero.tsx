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
import { CherryStudio } from '@lobehub/icons'
import { Link } from '@tanstack/react-router'
import { ArrowRight, BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'

import { HeroTerminalDemo } from './hero-terminal-demo'
import { SECTION_LABEL } from './section-label'

interface HomeHeroProps {
  isAuthenticated: boolean
}

/**
 * Geometry shared by the application pills. `min-w-0` allows the pill to shrink
 * below its content width on narrow viewports, which is what lets the label
 * truncate instead of pushing the row out of the glass card.
 */
const APP_PILL_BASE =
  'group flex max-w-full min-w-0 items-center gap-3 rounded-full border border-border/40 bg-muted/15 px-4 py-2.5 text-sm font-medium backdrop-blur-xs transition-colors duration-300 sm:px-5'

// Stylized three-dots indicator representing "More"
const MoreIcon = () => (
  <svg
    className='text-muted-foreground/60 group-hover:text-foreground size-6 shrink-0 transition-colors'
    viewBox='0 0 24 24'
    fill='none'
    xmlns='http://www.w3.org/2000/svg'
    aria-hidden
  >
    <circle cx='6' cy='12' r='2' fill='currentColor' />
    <circle cx='12' cy='12' r='2' fill='currentColor' />
    <circle cx='18' cy='12' r='2' fill='currentColor' />
  </svg>
)

/**
 * Landing hero. The statement and its proof share one row: the headline, the
 * calls to action and the supported clients take the narrower left column,
 * the terminal demo takes the wider right one. They stack on narrow viewports.
 */
export function HomeHero(props: HomeHeroProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const docsUrl =
    (status?.docs_link as string | undefined) || 'https://docs.newapi.pro'
  const registrationOpen = status?.register_enabled !== false

  const docsButton = () => {
    const isExternal = docsUrl.startsWith('http')
    return (
      <Button
        variant='outline'
        className='group border-border/50 hover:border-border hover:bg-muted/50 inline-flex h-11 items-center gap-1.5 rounded-lg px-5 text-sm font-medium'
        render={
          isExternal ? (
            <a href={docsUrl} target='_blank' rel='noopener noreferrer' />
          ) : (
            <Link to={docsUrl} />
          )
        }
      >
        <BookOpen className='text-muted-foreground/80 group-hover:text-foreground size-4 transition-colors duration-200' />
        <span>{t('Docs')}</span>
      </Button>
    )
  }

  return (
    <section
      // This section brings its own glass (the card and the code panel), so it
      // opts out of the generic `section > div` canvas sheet.
      data-glass-surface='bare'
      className='relative z-10 px-6 pt-24 pb-12 md:pt-28 md:pb-16 lg:pt-32'
    >
      {/* Ink scrim: the wallpaper is user-selectable, so the statement keeps its
          own reading surface instead of depending on a dark image.
          `data-glass-layer='free'` tells the canvas-sheet rules in
          liquid-components.css to leave this decorative layer alone — without
          it the `section > div` sheet erases the gradient. */}
      <div
        aria-hidden
        data-glass-layer='free'
        className='pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_88%,transparent)_0%,color-mix(in_srgb,var(--background)_58%,transparent)_52%,transparent_100%)]'
      />
      <div className='mx-auto max-w-6xl'>
        <div className='mt-10 grid items-start gap-10 lg:grid-cols-12 lg:gap-10 xl:gap-14'>
          <div className='lg:col-span-5'>
            <AnimateInView animation='fade-up'>
          <div className='border-border/50 bg-muted/15 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium tracking-[0.06em] uppercase'>
            <span className='relative flex size-1.5'>
              <span className='bg-primary/60 absolute inline-flex h-full w-full animate-ping rounded-full' />
              <span className='bg-primary relative inline-flex size-1.5 rounded-full' />
            </span>
            <span className='text-foreground/70'>
              {t('AI Application Infrastructure Foundation')}
            </span>
          </div>

          {/* Two lines, one statement. The second line steps back in tone
              instead of colour, so the headline keeps a single voice. */}
          <h1 className='mt-6 text-[clamp(1.9rem,3.5vw,2.9rem)] leading-[1.2] font-semibold tracking-[-0.01em] text-balance'>
            <span className='text-foreground block'>
              {t('Unified API Gateway for')}
            </span>
            <span className='text-foreground/60 block'>
              {t('Vast Range of AI Models')}
            </span>
          </h1>

          <p className='text-foreground/70 mt-5 max-w-2xl text-[15px] leading-relaxed'>
            {t(
              'Access a vast selection of models via a standard, unified API protocol. Power AI applications, manage digital assets, and connect the Future.'
            )}
          </p>
        </AnimateInView>

            <AnimateInView animation='fade-up' delay={60} className='mt-8'>
              <div className='flex flex-wrap items-center gap-3'>
                {props.isAuthenticated ? (
                  <>
                    <Button
                      className='group h-11 rounded-lg px-5 text-sm font-medium'
                      render={<Link to='/dashboard' />}
                    >
                      {t('Go to Dashboard')}
                      <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
                    </Button>
                    {docsButton()}
                  </>
                ) : (
                  <>
                    {registrationOpen && (
                      <Button
                        className='group h-11 rounded-lg px-5 text-sm font-medium'
                        render={<Link to='/sign-up' />}
                      >
                        {t('Get Started')}
                        <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
                      </Button>
                    )}
                    <Button
                      variant='outline'
                      className='border-border/50 hover:border-border hover:bg-muted/50 h-11 rounded-lg px-5 text-sm font-medium'
                      render={<Link to='/pricing' />}
                    >
                      {t('View Pricing')}
                    </Button>
                    {docsButton()}
                  </>
                )}
              </div>
            </AnimateInView>

            {/* Supported applications — the clients that already speak this
                protocol. Real integrations, not decoration. */}
            <AnimateInView animation='fade-up' delay={140} className='mt-8'>
              <Card data-card-hover='false' className='gap-0 py-0'>
                <CardContent className='p-5'>
                  <p className={SECTION_LABEL}>{t('Supported Applications')}</p>
                  <p className='text-foreground/60 mt-2 text-xs leading-relaxed'>
                    {t(
                      'Supports one-click configuration and perfectly adapts to NewAPI multi-protocol configuration.'
                    )}
                  </p>
                  <div className='mt-4 flex min-w-0 flex-wrap items-center gap-2.5 sm:gap-3'>
                    <a
                      href='https://cherry-ai.com'
                      target='_blank'
                      rel='noopener noreferrer'
                      className={cn(
                        APP_PILL_BASE,
                        'text-foreground/80 hover:border-border hover:bg-muted/30 hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none'
                      )}
                    >
                      <CherryStudio.Color size={24} className='shrink-0' />
                      <span className='truncate'>Cherry Studio</span>
                    </a>

                    <a
                      href='https://ccswitch.io'
                      target='_blank'
                      rel='noopener noreferrer'
                      className={cn(
                        APP_PILL_BASE,
                        'text-foreground/80 hover:border-border hover:bg-muted/30 hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none'
                      )}
                    >
                      <img
                        src='https://ccswitch.io/favicon.png'
                        alt=''
                        className='size-6 shrink-0 rounded-md object-contain'
                        onError={(event) => {
                          // Fall back to a text mark when the remote favicon is
                          // unavailable (offline or sandboxed environments).
                          event.currentTarget.style.display = 'none'
                          const fallback =
                            event.currentTarget
                              .nextElementSibling as HTMLElement | null
                          if (fallback) fallback.style.display = 'flex'
                        }}
                      />
                      <span
                        aria-hidden
                        style={{ display: 'none' }}
                        className='bg-primary/10 text-primary size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold'
                      >
                        CC
                      </span>
                      <span className='truncate'>CC Switch</span>
                    </a>

                    <div
                      className={cn(
                        APP_PILL_BASE,
                        'text-foreground/55 cursor-default'
                      )}
                    >
                      <MoreIcon />
                      <span className='truncate'>{t('More Apps')}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </AnimateInView>
          </div>

          <AnimateInView
            animation='fade-up'
            delay={100}
            className='w-full lg:col-span-7'
          >
            <HeroTerminalDemo />
          </AnimateInView>
        </div>
      </div>
    </section>
  )
}
