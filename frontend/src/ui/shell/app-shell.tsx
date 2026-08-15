'use client';

import * as React from 'react';
import { PanelLeftClose, PanelLeftOpen, Menu } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from '../components/button';
import { Sheet, SheetContent, SheetTrigger } from '../components/overlays';
import { TooltipProvider } from '../components/primitives';
import { Navigation, type NavSection } from './navigation';

/*
 * APPSHELL.
 *
 * The visual intent is calm, dense and precise — the register of Linear or
 * Stripe rather than a template dashboard. Concretely that means:
 *
 *   - ONE elevation change (the sidebar/content boundary), expressed as a
 *     hairline border rather than a shadow. Stacked cards-on-cards is the main
 *     thing that makes enterprise UI look generated.
 *   - No gradients, no oversized radii, no decorative pills. Radii come from
 *     --radius-md; nothing here invents a shape.
 *   - Restrained type: one h1 per page, everything else steps down. Weight and
 *     spacing carry hierarchy instead of colour.
 *   - Content is width-limited so text lines stay readable on a 27" monitor
 *     rather than stretching to 200 characters.
 *
 * Structure is semantic on purpose: <header>, <nav>, <main>. Screen-reader
 * users navigate by landmark, and a shell built from <div>s removes that.
 */

export interface AppShellLabels {
  /** Accessible name for the primary navigation landmark. */
  navigation: string;
  /** "Skip to main content" — first tab stop on every page. */
  skipToContent: string;
  collapseSidebar: string;
  expandSidebar: string;
  openMenu: string;
  closeMenu: string;
  /** Accessible title for the mobile navigation drawer. */
  mobileNavTitle: string;
}

export interface AppShellProps {
  sections: NavSection[];
  currentPath: string;
  labels: AppShellLabels;

  /** Product mark. Keep it small — a wordmark, not a hero. */
  brand: React.ReactNode;
  /** Tenant switcher. Rendered under the brand in the sidebar. */
  tenantSwitcher?: React.ReactNode;
  /** Account menu. Rendered at the end of the header. */
  userMenu?: React.ReactNode;
  /** Notifications trigger, placed before the account menu. */
  notifications?: React.ReactNode;
  /** Global search or command palette trigger, in the header. */
  search?: React.ReactNode;
  /** Extra header controls, e.g. the theme toggle. */
  headerActions?: React.ReactNode;
  /** Pinned to the bottom of the sidebar, e.g. help or version. */
  sidebarFooter?: React.ReactNode;

  linkComponent?: React.ComponentType<{ href: string; className?: string; children: React.ReactNode; 'aria-current'?: 'page' }>;

  /** Uncontrolled default; the host may persist the user's choice instead. */
  defaultCollapsed?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;

  children: React.ReactNode;
}

export function AppShell({
  sections, currentPath, labels, brand, tenantSwitcher, userMenu, notifications,
  search, headerActions, sidebarFooter, linkComponent,
  defaultCollapsed = false, collapsed: controlledCollapsed, onCollapsedChange, children
}: AppShellProps) {
  const [internalCollapsed, setInternalCollapsed] = React.useState(defaultCollapsed);
  const collapsed = controlledCollapsed ?? internalCollapsed;
  const [mobileOpen, setMobileOpen] = React.useState(false);

  function toggleCollapsed() {
    const next = !collapsed;
    if (controlledCollapsed === undefined) setInternalCollapsed(next);
    onCollapsedChange?.(next);
  }

  const nav = (
    <Navigation
      sections={sections}
      currentPath={currentPath}
      collapsed={collapsed}
      linkComponent={linkComponent}
      label={labels.navigation}
    />
  );

  return (
    <TooltipProvider delayDuration={300}>
      {/* Skip link: the first thing a keyboard user meets on every page. */}
      <a
        href="#main-content"
        className={cn(
          'sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[var(--z-toast)]',
          'focus:rounded-[var(--radius-md)] focus:border focus:border-border',
          'focus:bg-popover focus:px-4 focus:py-2 focus:text-body-sm focus:shadow-[var(--shadow-md)]'
        )}
      >
        {labels.skipToContent}
      </a>

      <div className="min-h-dvh bg-background text-foreground">
        {/* ── Desktop sidebar ───────────────────────────────────────── */}
        <aside
          data-collapsed={collapsed || undefined}
          style={{ width: collapsed ? 'var(--sidebar-width-collapsed)' : 'var(--sidebar-width)' }}
          className={cn(
            'fixed inset-y-0 left-0 z-[var(--z-sidebar)] hidden lg:flex flex-col',
            'border-r border-[var(--sidebar-border)] bg-[var(--sidebar)]',
            'transition-[width] duration-[var(--duration-base)] ease-[var(--ease-standard)]',
            'motion-reduce:transition-none'
          )}
        >
          <div className={cn('flex h-14 items-center border-b border-[var(--sidebar-border)] px-3', collapsed && 'justify-center px-0')}>
            {brand}
          </div>

          {tenantSwitcher && !collapsed && (
            <div className="border-b border-[var(--sidebar-border)] p-[var(--sidebar-padding)]">{tenantSwitcher}</div>
          )}

          <div className="flex-1 overflow-y-auto p-[var(--sidebar-padding)]">{nav}</div>

          <div className={cn('border-t border-[var(--sidebar-border)] p-[var(--sidebar-padding)]', collapsed && 'px-1')}>
            <div className={cn('flex items-center gap-2', collapsed && 'flex-col')}>
              {!collapsed && sidebarFooter}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleCollapsed}
                label={collapsed ? labels.expandSidebar : labels.collapseSidebar}
                // aria-expanded tells assistive technology the state, which the
                // icon alone does not.
                aria-expanded={!collapsed}
                className={cn(!collapsed && 'ml-auto')}
              >
                {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
              </Button>
            </div>
          </div>
        </aside>

        {/* ── Main column ───────────────────────────────────────────── */}
        <div
          style={{ ['--shell-offset' as string]: collapsed ? 'var(--sidebar-width-collapsed)' : 'var(--sidebar-width)' }}
          className={cn(
            'flex min-h-dvh flex-col lg:pl-[var(--shell-offset)]',
            'transition-[padding] duration-[var(--duration-base)] ease-[var(--ease-standard)]',
            'motion-reduce:transition-none'
          )}
        >
          <header
            className={cn(
              'sticky top-0 z-[var(--z-header)] flex h-14 shrink-0 items-center gap-2',
              'border-b border-border bg-background/95 px-4 backdrop-blur',
              'supports-[backdrop-filter]:bg-background/80'
            )}
          >
            {/* Mobile: the sidebar becomes a drawer rather than shrinking. */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon-sm" label={labels.openMenu} className="lg:hidden">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" title={labels.mobileNavTitle} closeLabel={labels.closeMenu} hideHeader>
                <div className="flex h-14 items-center border-b border-[var(--sidebar-border)] px-4">{brand}</div>
                {tenantSwitcher && <div className="border-b border-[var(--sidebar-border)] p-3">{tenantSwitcher}</div>}
                <div className="p-3">
                  <Navigation
                    sections={sections}
                    currentPath={currentPath}
                    linkComponent={linkComponent}
                    label={labels.navigation}
                    onNavigate={() => setMobileOpen(false)}
                  />
                </div>
              </SheetContent>
            </Sheet>

            {/* The brand may truncate; the action cluster may not. Without
                min-w-0 a flex child refuses to shrink below its content, and at
                320px the header pushes the page into horizontal scroll. */}
            <div className="lg:hidden min-w-0 shrink truncate">{brand}</div>

            {search && <div className="hidden md:block min-w-0 flex-1 max-w-md">{search}</div>}

            <div className="ml-auto flex shrink-0 items-center gap-1">
              {headerActions}
              {notifications}
              {userMenu}
            </div>
          </header>

          <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
            {/* Padding steps up with viewport; content is width-limited so long
                lines stay readable on wide displays. */}
            <div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-6 lg:px-8 lg:py-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
