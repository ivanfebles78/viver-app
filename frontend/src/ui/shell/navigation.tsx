'use client';

import * as React from 'react';
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/cn';
import { Tooltip } from '../components/primitives';
import { isActive, type NavItem, type NavSection } from './navigation-model';

/*
 * NAVIGATION PRIMITIVES.
 *
 * Configuration is DATA, never JSX. The shell receives a tree and renders it,
 * which is what lets a generated product define its own navigation without
 * touching the shell, and lets navigation be permission-filtered before render.
 *
 * Active state is resolved by the host (it owns routing), passed in as
 * `currentPath`. The shell never imports a router — that is what keeps this
 * package usable outside Next.js.
 *
 * The permission filter and the active-path test live in ./navigation-model,
 * which imports nothing at runtime and is unit-tested directly.
 */

export { filterNavigation, isActive } from './navigation-model';
export type { NavItem, NavSection } from './navigation-model';

const rowBase = [
  'group relative flex items-center gap-2.5 w-full',
  'rounded-[var(--radius-md)] px-2.5 h-9',
  'text-body-sm text-[var(--sidebar-foreground)]',
  'transition-colors duration-[var(--duration-fast)]',
  'outline-none focus-visible:outline-[length:var(--focus-ring-width)]',
  'focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-[-2px]'
].join(' ');

export interface NavigationProps {
  sections: NavSection[];
  currentPath: string;
  collapsed?: boolean;
  /** Renders an anchor by default; hosts pass their router's Link. */
  linkComponent?: React.ComponentType<{ href: string; className?: string; children: React.ReactNode; 'aria-current'?: 'page' }>;
  onNavigate?: () => void;
  label: string;
}

export function Navigation({
  sections, currentPath, collapsed = false, linkComponent, onNavigate, label
}: NavigationProps) {
  const Link = linkComponent ?? DefaultLink;
  return (
    <nav aria-label={label} className="flex flex-col gap-[var(--sidebar-section-gap)]">
      {sections.map((section) => (
        <div key={section.key} className="flex flex-col gap-0.5">
          {section.label && (
            <h2
              className={cn(
                'px-2.5 pb-1 text-overline uppercase text-muted-foreground',
                'tracking-[var(--tracking-overline)] font-[var(--font-weight-semibold)]',
                // When collapsed the heading would be an unreadable stub, so it
                // is hidden visually but kept for screen readers.
                collapsed && 'sr-only'
              )}
            >
              {section.label}
            </h2>
          )}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <li key={item.key}>
                {item.children && item.children.length > 0 ? (
                  <NavBranch
                    item={item}
                    currentPath={currentPath}
                    collapsed={collapsed}
                    Link={Link}
                    onNavigate={onNavigate}
                  />
                ) : (
                  <NavLeaf
                    item={item}
                    currentPath={currentPath}
                    collapsed={collapsed}
                    Link={Link}
                    onNavigate={onNavigate}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function DefaultLink({ href, className, children, ...rest }: {
  href: string; className?: string; children: React.ReactNode; 'aria-current'?: 'page';
}) {
  return <a href={href} className={className} {...rest}>{children}</a>;
}

function NavLeaf({ item, currentPath, collapsed, Link, onNavigate, nested = false }: {
  item: NavItem; currentPath: string; collapsed: boolean;
  Link: NonNullable<NavigationProps['linkComponent']>; onNavigate?: () => void; nested?: boolean;
}) {
  const active = isActive(item, currentPath);
  const Icon = item.icon;

  const row = (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        rowBase,
        nested && !collapsed && 'pl-9',
        active
          ? [
              'bg-[var(--sidebar-accent)] text-[var(--sidebar-accent-foreground)]',
              'font-[var(--font-weight-medium)]'
            ].join(' ')
          : 'hover:bg-[var(--sidebar-accent)]',
        collapsed && 'justify-center px-0'
      )}
    >
      {/* A 2px rail marks the active item so state is not colour alone. */}
      {active && !collapsed && (
        <span aria-hidden="true" className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" />
      )}
      {Icon && <Icon className="size-4 shrink-0" />}
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && item.badge && <span className="ml-auto shrink-0">{item.badge}</span>}
    </Link>
  );

  const content = onNavigate ? <span onClick={onNavigate}>{row}</span> : row;
  // Collapsed rows have no visible text, so the tooltip carries the label.
  return collapsed ? <Tooltip content={item.label}>{content}</Tooltip> : content;
}

function NavBranch({ item, currentPath, collapsed, Link, onNavigate }: {
  item: NavItem; currentPath: string; collapsed: boolean;
  Link: NonNullable<NavigationProps['linkComponent']>; onNavigate?: () => void;
}) {
  const active = isActive(item, currentPath);
  // A branch containing the current page starts open; otherwise navigating
  // would hide the very item the user is looking at.
  const [open, setOpen] = React.useState(active);
  React.useEffect(() => { if (active) setOpen(true); }, [active]);

  const Icon = item.icon;

  if (collapsed) {
    // Collapsed, a disclosure has nowhere to expand into; the parent row links
    // through and the children remain reachable from the expanded sidebar.
    return <NavLeaf item={item} currentPath={currentPath} collapsed Link={Link} onNavigate={onNavigate} />;
  }

  return (
    <CollapsiblePrimitive.Root open={open} onOpenChange={setOpen}>
      <CollapsiblePrimitive.Trigger
        className={cn(rowBase, active && 'font-[var(--font-weight-medium)]', 'hover:bg-[var(--sidebar-accent)]')}
      >
        {Icon && <Icon className="size-4 shrink-0" />}
        <span className="truncate">{item.label}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'ml-auto size-4 shrink-0 transition-transform duration-[var(--duration-fast)]',
            'motion-reduce:transition-none',
            open && 'rotate-180'
          )}
        />
      </CollapsiblePrimitive.Trigger>
      <CollapsiblePrimitive.Content className="overflow-hidden">
        <ul className="flex flex-col gap-0.5 pt-0.5">
          {item.children!.map((child) => (
            <li key={child.key}>
              <NavLeaf item={child} currentPath={currentPath} collapsed={false} Link={Link} onNavigate={onNavigate} nested />
            </li>
          ))}
        </ul>
      </CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  );
}
