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
import {
  ArrowUpRight,
  Check,
  ClipboardList,
  FileText,
  FlaskConical,
  Key,
  LayoutDashboard,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { cn } from '@/lib/utils'

import { HAIRLINE, SECTION_LABEL } from './section-label'

interface ConsoleRow {
  /** Sidebar label, so the landing page and the console name things alike. */
  label: string
  /** Route path shown as the row annotation. */
  path: string
  icon: LucideIcon
  /** Static console routes, resolved by the router when the visitor is signed in. */
  to:
    | '/dashboard'
    | '/keys'
    | '/usage-logs'
    | '/usage-logs/audit'
    | '/playground'
    | '/wallet'
}

const CONSOLE_ROWS: ConsoleRow[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, to: '/dashboard' },
  { label: 'API Keys', path: '/keys', icon: Key, to: '/keys' },
  { label: 'Usage Logs', path: '/usage-logs', icon: FileText, to: '/usage-logs' },
  {
    label: 'Audit Logs',
    path: '/usage-logs/audit',
    icon: ClipboardList,
    to: '/usage-logs/audit',
  },
  { label: 'Playground', path: '/playground', icon: FlaskConical, to: '/playground' },
  { label: 'Wallet', path: '/wallet', icon: Wallet, to: '/wallet' },
]

/**
 * What the gateway covers upstream. These are the names the console uses for the
 * same capabilities, not a marketing list.
 */
const RELAY_CAPABILITIES = [
  'Channel Management',
  'Model Pricing',
  'Model Access',
  'Load Balancing',
  'Rate Limiting',
  'Cost Tracking',
  'Guardrails',
  'Observability',
  'Budgets',
  'Pass-Through',
]

interface CapabilitySectionProps {
  isAuthenticated: boolean
}

export function CapabilitySection(props: CapabilitySectionProps) {
  const { t } = useTranslation()

  return (
    <section
      data-glass-surface='bare'
      className={cn('relative z-10 border-t px-6 py-16 md:py-20', HAIRLINE)}
    >
      <div className='mx-auto grid max-w-6xl gap-12 lg:grid-cols-12 lg:gap-10 xl:gap-16'>
        {/* Left, wider: the console itself, read as a ledger rather than a card
            grid. Signed-in visitors get links; signed-out visitors get the same
            shape without a navigation affordance they cannot use yet. */}
        <div className='lg:col-span-7'>
          <AnimateInView animation='fade-up'>
            <p className={SECTION_LABEL}>{t('Console')}</p>
            <h2 className='mt-2 text-2xl font-semibold tracking-tight md:text-[28px]'>
              {t('One console for models, keys, and usage')}
            </h2>
            <p className='text-foreground/70 mt-3 max-w-lg text-sm leading-relaxed'>
              {t(
                'A focused home for keys, balance, routing, and service health.'
              )}
            </p>
          </AnimateInView>

          <ul className={cn('mt-8 border-t', HAIRLINE)}>
            {CONSOLE_ROWS.map((row, index) => (
              <ConsoleLedgerRow
                key={row.path}
                row={row}
                index={index}
                linked={props.isAuthenticated}
              />
            ))}
          </ul>
        </div>

        {/* Right, narrower: the upstream side, as a spec sheet. No links here —
            these are capabilities, not destinations. */}
        <div className='lg:col-span-5 lg:pl-10 lg:border-l lg:border-border/40'>
          <AnimateInView animation='fade-up' delay={100}>
            <p className={SECTION_LABEL}>{t('Channels')}</p>
            <h2 className='mt-2 text-lg font-semibold tracking-tight md:text-xl'>
              {t('Configure upstream providers and routing.')}
            </h2>

            <ul className='mt-6 grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2'>
              {RELAY_CAPABILITIES.map((capability) => (
                <li
                  key={capability}
                  className='text-foreground/75 flex items-center gap-2.5 text-sm'
                >
                  <Check
                    className='text-primary/70 size-3.5 shrink-0'
                    aria-hidden
                  />
                  <span className='truncate'>{t(capability)}</span>
                </li>
              ))}
            </ul>
          </AnimateInView>
        </div>
      </div>
    </section>
  )
}

interface ConsoleLedgerRowProps {
  row: ConsoleRow
  index: number
  linked: boolean
}

function ConsoleLedgerRow(props: ConsoleLedgerRowProps) {
  const { t } = useTranslation()
  const { row, index, linked } = props
  const Icon = row.icon

  const content = (
    <>
      <span className='text-foreground/45 font-mono text-[11px] tabular-nums'>
        {String(index + 1).padStart(2, '0')}
      </span>
      <Icon className='text-muted-foreground size-4 shrink-0' aria-hidden />
      <span className='min-w-0 flex-1 truncate text-sm font-medium'>
        {t(row.label)}
      </span>
      <code className='text-foreground/45 hidden font-mono text-[11px] sm:inline'>
        {row.path}
      </code>
      {linked && (
        <ArrowUpRight
          className='text-muted-foreground/0 group-hover/row:text-muted-foreground size-3.5 shrink-0 transition-colors'
          aria-hidden
        />
      )}
    </>
  )

  const className = cn(
    'group/row flex items-center gap-3 border-b px-1 py-3.5',
    HAIRLINE,
    linked
      ? 'hover:bg-muted/20 focus-visible:bg-muted/20 transition-colors'
      : 'cursor-default'
  )

  if (!linked) {
    return (
      <li>
        <div className={className}>{content}</div>
      </li>
    )
  }

  return (
    <li>
      <Link to={row.to} className={className}>
        {content}
      </Link>
    </li>
  )
}
