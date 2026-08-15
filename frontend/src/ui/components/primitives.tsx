'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '../lib/cn';

/* ── Card ───────────────────────────────────────────────────────────────
 * Surfaces use --card-* tokens. The 1px border is NOT optional in dark mode:
 * without it, elevation is invisible because shadows do not read on dark
 * surfaces, and every panel collapses into one flat plane.
 */
export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function Card({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'bg-card text-card-foreground',
          'rounded-[var(--card-radius)] border border-[var(--card-border)]',
          'shadow-[var(--card-shadow)]',
          className
        )}
        {...props}
      />
    );
  }
);

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 p-[var(--card-padding)] pb-0', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-h5 font-[var(--font-weight-semibold)]', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-body-sm text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-[var(--card-padding)]', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center gap-3 p-[var(--card-padding)] pt-0', className)}
      {...props}
    />
  );
}

/* ── Tooltip ────────────────────────────────────────────────────────────
 * A tooltip is never the ONLY place information lives: it is not reachable by
 * touch and is easily missed. Use it to amplify a visible label, not replace it.
 */
export const TooltipProvider = TooltipPrimitive.Provider;
export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className, sideOffset = 6, ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-[var(--z-tooltip)] max-w-[280px]',
          'rounded-[var(--radius-md)] border border-border',
          'bg-popover text-popover-foreground shadow-[var(--shadow-md)]',
          'px-3 py-1.5 text-body-sm',
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

/** Convenience wrapper for the common case. */
export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  if (!content) return <>{children}</>;
  return (
    <TooltipRoot>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{content}</TooltipContent>
    </TooltipRoot>
  );
}

/* ── Tabs ───────────────────────────────────────────────────────────── */
export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('inline-flex items-center gap-1 border-b border-border w-full', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex items-center gap-2 px-3 h-[var(--control-height-md)]',
        'text-body-sm font-[var(--font-weight-medium)] text-muted-foreground',
        'border-b-2 border-transparent -mb-px',
        'transition-colors duration-[var(--duration-fast)]',
        'hover:text-foreground',
        // The active tab is marked by weight and an underline as well as colour.
        'data-[state=active]:text-foreground data-[state=active]:border-primary',
        'outline-none focus-visible:outline-[length:var(--focus-ring-width)]',
        'focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-[-2px]',
        'disabled:text-[var(--btn-disabled-fg)] disabled:cursor-not-allowed',
        className
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('pt-4 outline-none', className)} {...props} />;
}

/* ── Avatar ─────────────────────────────────────────────────────────── */
export function Avatar({
  name, src, size = 'md', className
}: { name: string; src?: string | null; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const dimension = { sm: 'size-6', md: 'size-8', lg: 'size-10' }[size];
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  return (
    <AvatarPrimitive.Root
      className={cn('relative flex shrink-0 overflow-hidden rounded-full bg-muted', dimension, className)}
    >
      {src && <AvatarPrimitive.Image src={src} alt="" className="size-full object-cover" />}
      {/* The name is provided by the surrounding control, so initials are decorative. */}
      <AvatarPrimitive.Fallback
        aria-hidden="true"
        className="flex size-full items-center justify-center text-caption font-[var(--font-weight-semibold)] text-muted-foreground"
      >
        {initials}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

/* ── Skeleton / Spinner / Progress ──────────────────────────────────── */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      // Presentational only: a screen reader should hear the region's own
      // aria-busy state, not a stream of meaningless placeholder nodes.
      aria-hidden="true"
      className={cn(
        'animate-pulse motion-reduce:animate-none rounded-[var(--radius-sm)] bg-muted',
        className
      )}
      {...props}
    />
  );
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-live="polite" className={cn('inline-flex items-center gap-2', className)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-4 animate-spin motion-reduce:animate-none text-muted-foreground"
      >
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M22 12a10 10 0 0 0-10-10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label && <span className="text-body-sm text-muted-foreground">{label}</span>}
    </span>
  );
}

export function Progress({
  value, label, className
}: { value: number; label: string; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <ProgressPrimitive.Root
      value={clamped}
      aria-label={label}
      className={cn('relative h-2 w-full overflow-hidden rounded-[var(--radius-full)] bg-muted', className)}
    >
      <ProgressPrimitive.Indicator
        className="h-full bg-primary transition-transform duration-[var(--duration-moderate)] ease-[var(--ease-out)]"
        style={{ transform: 'translateX(-' + (100 - clamped) + '%)' }}
      />
    </ProgressPrimitive.Root>
  );
}
