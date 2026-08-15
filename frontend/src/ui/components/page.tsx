'use client';

import * as React from 'react';
import { ChevronRight, Inbox, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from './button';

/* ── Breadcrumb ─────────────────────────────────────────────────────── */
export interface Crumb { label: string; href?: string }

export function Breadcrumb({ items, label, className }: { items: Crumb[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn('min-w-0', className)}>
      <ol className="flex items-center gap-1 text-caption text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={item.label + index} className="flex items-center gap-1 min-w-0">
              {index > 0 && <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 opacity-60" />}
              {isLast || !item.href ? (
                // The current page is marked, not linked — a link to the page
                // you are already on is noise for keyboard and screen readers.
                <span aria-current={isLast ? 'page' : undefined} className={cn('truncate', isLast && 'text-foreground')}>
                  {item.label}
                </span>
              ) : (
                <a
                  href={item.href}
                  className={cn(
                    // Vertical padding brings the target to the 24px minimum;
                    // the flex parent blockifies the anchor, so it does not
                    // qualify for the inline exception to SC 2.5.8.
                    'flex min-h-6 items-center py-1',
                    'truncate rounded-[var(--radius-xs)] hover:text-foreground',
                    'transition-colors duration-[var(--duration-fast)]',
                    'outline-none focus-visible:outline-[length:var(--focus-ring-width)]',
                    'focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2'
                  )}
                >
                  {item.label}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ── PageHeader ─────────────────────────────────────────────────────────
 * One h1 per page lives here. Actions sit at the end and wrap below the title
 * on narrow viewports rather than shrinking the title.
 */
export interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumb?: React.ReactNode;
  actions?: React.ReactNode;
  /** Rendered under the header, e.g. tabs. */
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, breadcrumb, actions, children, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-4', className)}>
      {breadcrumb}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex flex-col gap-1 min-w-0">
          <h1 className="text-h2 font-[var(--font-weight-semibold)] text-foreground truncate">{title}</h1>
          {description && <p className="text-body-sm text-muted-foreground max-w-[70ch]">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/* ── EmptyState ─────────────────────────────────────────────────────────
 * An empty state explains WHY it is empty and what to do next. "No data" alone
 * leaves the user unable to tell a working feature from a broken one.
 */
export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}

export function EmptyState({ title, description, action, icon: Icon = Inbox, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-10 text-center', className)}>
      <span className="flex size-10 items-center justify-center rounded-full bg-muted">
        <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-body font-[var(--font-weight-medium)]">{title}</p>
        {description && <p className="text-body-sm text-muted-foreground max-w-[46ch]">{description}</p>}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

/* ── ErrorState ─────────────────────────────────────────────────────────
 * Shows a correlation id when one is available so support can find the log —
 * and never the raw error, which may carry internal detail.
 */
export interface ErrorStateProps {
  title: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
  correlationId?: string | null;
  correlationLabel?: string;
  className?: string;
}

export function ErrorState({
  title, description, retryLabel, onRetry, correlationId, correlationLabel, className
}: ErrorStateProps) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-3 py-10 text-center', className)}>
      <span className="flex size-10 items-center justify-center rounded-full bg-[var(--destructive-subtle)]">
        <AlertTriangle aria-hidden="true" className="size-5 text-[var(--destructive-subtle-foreground)]" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-body font-[var(--font-weight-medium)]">{title}</p>
        {description && <p className="text-body-sm text-muted-foreground max-w-[46ch]">{description}</p>}
      </div>
      {onRetry && retryLabel && (
        <Button variant="secondary" size="sm" onClick={onRetry}>{retryLabel}</Button>
      )}
      {correlationId && (
        <p className="text-caption text-muted-foreground">
          {correlationLabel} <code className="mono">{correlationId}</code>
        </p>
      )}
    </div>
  );
}

/* ── KPI ────────────────────────────────────────────────────────────────
 * Deliberately restrained: a number, a label, and an optional delta. No
 * gradient, no oversized rounded tile, no decorative sparkline by default —
 * those are what make a dashboard look generated rather than designed.
 */
export interface KpiProps {
  label: string;
  value: string;
  /** Pre-formatted, locale-aware delta string, e.g. "+12,4 %". */
  delta?: string;
  /** Direction is stated explicitly: up is not universally "good". */
  trend?: 'up' | 'down' | 'flat';
  /** How to read the trend. Without this, colour would carry the meaning. */
  trendLabel?: string;
  className?: string;
}

export function Kpi({ label, value, delta, trend = 'flat', trendLabel, className }: KpiProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-caption font-[var(--font-weight-medium)] text-muted-foreground uppercase tracking-[var(--tracking-overline)]">
        {label}
      </span>
      <span className="text-h2 font-[var(--font-weight-semibold)] tabular">{value}</span>
      {delta && (
        <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
          <TrendIcon aria-hidden="true" className="size-3.5" />
          <span className="tabular">{delta}</span>
          {trendLabel && <span className="sr-only">{trendLabel}</span>}
        </span>
      )}
    </div>
  );
}
