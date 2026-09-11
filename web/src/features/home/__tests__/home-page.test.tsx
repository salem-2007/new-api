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
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { CapabilitySection } from '../components/capability-section'
import { GettingStarted } from '../components/getting-started'
import { HeroTerminalDemo } from '../components/hero-terminal-demo'
import { HomeHero } from '../components/home-hero'
import { StartBand } from '../components/start-band'
import { Home } from '../index'
import type { HomePageContentResult } from '../types'

// ============================================================================
// Stand-ins
// ============================================================================

const DOCS_URL = 'https://docs.example.com'

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }))

// Only the links need a stand-in: these sections are mounted without a router.
// `render={<Link />}` hands arbitrary props to this component, so it forwards
// the ones the assertions read instead of spreading unknown attributes.
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
  Link: (props: {
    to?: unknown
    children?: ReactNode
    className?: string
    onClick?: () => void
  }) => (
    <a
      href={typeof props.to === 'string' ? props.to : '#'}
      className={props.className}
      onClick={props.onClick}
    >
      {props.children}
    </a>
  ),
}))

// The deployment status drives registration and the docs target, so the tests
// own it rather than reaching for the shared query.
let registerEnabled = true
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: { docs_link: DOCS_URL, register_enabled: registerEnabled },
    loading: false,
    error: null,
  }),
}))

// Home reads the theme for its custom-content iframe handshake.
vi.mock('@/context/theme-provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/context/theme-provider')>()),
  useTheme: () => ({
    theme: 'light',
    resolvedTheme: 'light',
    setTheme: () => undefined,
  }),
}))

vi.mock('@/components/layout', () => ({
  PublicLayout: (props: { children?: ReactNode; showMainContainer?: boolean }) => (
    <div data-testid='public-layout'>{props.children}</div>
  ),
}))

vi.mock('@/components/layout/components/footer', () => ({
  Footer: () => <footer data-testid='footer' />,
}))

let homeContent: HomePageContentResult = {
  content: '',
  isLoaded: true,
  isUrl: false,
}
vi.mock('../hooks', () => ({
  useHomePageContent: () => homeContent,
}))

function link(name: string | RegExp) {
  return screen.getByRole('link', { name })
}

/**
 * A call to action can be a router `Link` or a plain `<a>`, and Base UI marks a
 * non-button render with `role="button"` (see `isNativeButtonRender` in
 * button.tsx). Match the label across both roles and assert the href, which is
 * the contract these sections actually guarantee.
 */
function action(name: string | RegExp): HTMLElement {
  const found = [
    ...screen.queryAllByRole('link', { name }),
    ...screen.queryAllByRole('button', { name }),
  ]
  if (found.length !== 1) {
    throw new Error(
      `expected exactly one action named ${String(name)}, found ${found.length}`
    )
  }
  return found[0]
}

/**
 * jsdom has no IntersectionObserver and every section here enters through
 * `AnimateInView`. Report an immediate intersection so the reveal class is
 * applied, matching what a browser does once the section is on screen.
 */
class RevealingObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element): void {
    this.callback(
      [{ isIntersecting: true, target } as unknown as IntersectionObserverEntry],
      this as unknown as IntersectionObserver
    )
  }
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  registerEnabled = true
  homeContent = { content: '', isLoaded: true, isUrl: false }
  useAuthStore.getState().auth.reset()
  vi.stubGlobal('IntersectionObserver', RevealingObserver)
})

afterEach(() => {
  useAuthStore.getState().auth.reset()
  vi.unstubAllGlobals()
})

// ============================================================================
// Hero
// ============================================================================

describe('home hero', () => {
  it('offers registration and pricing to a signed-out visitor', () => {
    render(<HomeHero isAuthenticated={false} />)

    expect(action('Get Started')).toHaveAttribute('href', '/sign-up')
    expect(action('View Pricing')).toHaveAttribute('href', '/pricing')
    expect(action('Docs')).toHaveAttribute('href', DOCS_URL)
    expect(screen.queryByRole('link', { name: /Dashboard/ })).toBeNull()
    expect(screen.getByText('Unified API Gateway for')).toBeInTheDocument()
    expect(screen.getByText('Vast Range of AI Models')).toBeInTheDocument()
  })

  it('points a signed-in visitor at the console', () => {
    render(<HomeHero isAuthenticated />)

    expect(action('Go to Dashboard')).toHaveAttribute('href', '/dashboard')
    expect(action('Docs')).toHaveAttribute('href', DOCS_URL)
    expect(
      screen.queryByRole('button', { name: 'Get Started' })
    ).toBeNull()
  })

  it('drops the sign-up action when registration is closed', () => {
    registerEnabled = false
    render(<HomeHero isAuthenticated={false} />)

    expect(screen.queryByRole('link', { name: 'Get Started' })).toBeNull()
    expect(action('View Pricing')).toHaveAttribute('href', '/pricing')
  })

  it('marks the reading scrim so the canvas sheet cannot erase it', () => {
    // The gradient scrim is a direct child of a `data-glass-surface='bare'`
    // section, which makes it a target for the generic `section > div` sheet
    // rule. `data-glass-layer='free'` is what keeps it painted.
    const { container } = render(<HomeHero isAuthenticated={false} />)
    const scrim = container.querySelector("[data-glass-layer='free']")

    expect(scrim).not.toBeNull()
    expect(scrim?.getAttribute('aria-hidden')).toBe('true')
    expect(scrim?.className).toContain('linear-gradient')
  })
})

// ============================================================================
// Console capabilities
// ============================================================================

const CONSOLE_ROUTES = [
  '/dashboard',
  '/keys',
  '/usage-logs',
  '/usage-logs/audit',
  '/playground',
  '/wallet',
]

const UPSTREAM_CAPABILITIES = [
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

describe('capability section', () => {
  it('lists the real console routes', () => {
    render(<CapabilitySection isAuthenticated={false} />)

    for (const route of CONSOLE_ROUTES) {
      expect(screen.getByText(route)).toBeInTheDocument()
    }
    for (const capability of UPSTREAM_CAPABILITIES) {
      expect(screen.getAllByText(capability).length).toBeGreaterThan(0)
    }
    expect(screen.getByText('Channels')).toBeInTheDocument()
  })

  it('does not link a signed-out visitor into the console', () => {
    render(<CapabilitySection isAuthenticated={false} />)

    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Audit Logs')).toBeInTheDocument()
  })

  it('links every row to its route once signed in', () => {
    render(<CapabilitySection isAuthenticated />)

    expect(link(/Dashboard/)).toHaveAttribute('href', '/dashboard')
    expect(link(/API Keys/)).toHaveAttribute('href', '/keys')
    expect(link(/Usage Logs/)).toHaveAttribute('href', '/usage-logs')
    expect(link(/Audit Logs/)).toHaveAttribute('href', '/usage-logs/audit')
    expect(link(/Playground/)).toHaveAttribute('href', '/playground')
    expect(link(/Wallet/)).toHaveAttribute('href', '/wallet')
    expect(screen.getAllByRole('link')).toHaveLength(CONSOLE_ROUTES.length)
  })
})

// ============================================================================
// Setup rail
// ============================================================================

describe('getting started', () => {
  it('walks through the three real setup steps', () => {
    render(<GettingStarted />)

    expect(screen.getByText('Three steps to get started')).toBeInTheDocument()
    for (const step of ['Configure', 'Connect', 'Monitor']) {
      expect(screen.getByText(step)).toBeInTheDocument()
    }
    expect(
      screen.getByText(
        'Connect through OpenAI, Claude, Gemini, and other compatible API routes'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Track usage, costs and performance with real-time analytics'
      )
    ).toBeInTheDocument()
  })
})

// ============================================================================
// Base URL band
// ============================================================================

describe('start band', () => {
  it('shows the base URL and the sign-up action to a visitor', () => {
    render(<StartBand isAuthenticated={false} />)

    expect(
      screen.getByText(`${window.location.origin}/v1`)
    ).toBeInTheDocument()
    expect(action('Get Started')).toHaveAttribute('href', '/sign-up')
    expect(action('View Pricing')).toHaveAttribute('href', '/pricing')
  })

  it('sends a signed-in visitor to the key list', () => {
    render(<StartBand isAuthenticated />)

    expect(action('API Keys')).toHaveAttribute('href', '/keys')
    expect(action('Docs')).toHaveAttribute('href', DOCS_URL)
  })
})

// ============================================================================
// Terminal demo
// ============================================================================

describe('terminal demo', () => {
  it('labels the response figures as an example', () => {
    render(<HeroTerminalDemo />)

    expect(screen.getByText('Example')).toBeInTheDocument()
  })

  it('switches protocol tabs and keeps the pressed state on the active one', async () => {
    render(<HeroTerminalDemo />)

    const chat = screen.getByRole('button', { name: 'Chat' })
    const claude = screen.getByRole('button', { name: 'Claude' })

    expect(chat).toHaveAttribute('aria-pressed', 'true')
    expect(claude).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('/v1/chat/completions')).toBeInTheDocument()

    fireEvent.click(claude)

    // The panel fades out for a beat before the next protocol is mounted, so the
    // endpoint arrives a tick after the click.
    expect(await screen.findByText('/v1/messages')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Claude' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Chat' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })
})

// ============================================================================
// Page composition
// ============================================================================

describe('home page', () => {
  it('renders the four sections over the footer when no custom page is set', () => {
    render(<Home />)

    const page = screen.getByTestId('public-layout')
    expect(within(page).getByText('Unified API Gateway for')).toBeInTheDocument()
    expect(within(page).getByText('Console')).toBeInTheDocument()
    expect(within(page).getByText('How It Works')).toBeInTheDocument()
    expect(within(page).getByText('Base URL')).toBeInTheDocument()
    expect(screen.getByTestId('footer')).toBeInTheDocument()
  })

  it('derives the signed-in state from the auth store', () => {
    useAuthStore.getState().auth.setUser({
      id: 1,
      username: 'alice',
      display_name: 'Alice',
      role: 1,
    })
    render(<Home />)

    expect(action('Go to Dashboard')).toHaveAttribute('href', '/dashboard')
    expect(screen.queryByRole('link', { name: 'Get Started' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Get Started' })).toBeNull()
  })

  it('waits before painting the landing page', () => {
    homeContent = { content: '', isLoaded: false, isUrl: false }
    render(<Home />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByText('Unified API Gateway for')).toBeNull()
  })

  it('frames an admin-configured page url', () => {
    homeContent = {
      content: 'https://status.example.com',
      isLoaded: true,
      isUrl: true,
    }
    render(<Home />)

    const frame = screen.getByTitle('Custom Home Page')
    expect(frame.tagName).toBe('IFRAME')
    expect(frame).toHaveAttribute('src', 'https://status.example.com')
    expect(frame.getAttribute('sandbox')).toContain('allow-scripts')
    expect(screen.queryByText('Unified API Gateway for')).toBeNull()
  })

  it('renders admin markdown in place of the landing page', () => {
    homeContent = { content: '# Welcome', isLoaded: true, isUrl: false }
    render(<Home />)

    expect(screen.getByText('Welcome')).toBeInTheDocument()
    expect(screen.queryByText('Unified API Gateway for')).toBeNull()
  })
})
