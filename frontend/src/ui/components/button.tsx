'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '../lib/cn';

/*
 * DevCon8 button system.
 *
 * The variants map ONE-TO-ONE onto the --btn-* tokens. That is deliberate: a
 * developer cannot produce a button colour the Design System has not sanctioned,
 * because no variant exists that reaches outside those tokens.
 *
 * Two rules from the Design System are enforced structurally rather than by
 * documentation:
 *
 *   1. The primary action is ALWAYS blue. There is no success/green variant and
 *      no --btn-success-* token to build one from. Green is a STATE (see
 *      StatusBadge), never an action colour — "Save" and "Approve" are primary.
 *   2. Red is destruction only. `destructive` exists for Delete/Revoke, not for
 *      "important" actions.
 *
 * Heights come from --control-height-*, so both density modes are automatic.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-[var(--btn-font-weight)] text-[length:var(--btn-font-size)]',
    'rounded-[var(--btn-radius)] border border-transparent',
    'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
    // Focus is never removed; the ring is the Design System's, at 2px + 2px.
    'outline-none focus-visible:outline-[length:var(--focus-ring-width)]',
    'focus-visible:outline-solid focus-visible:outline-ring',
    'focus-visible:outline-offset-[var(--focus-ring-offset)]',
    // A disabled control must still be perceivable; it is dimmed by token, not opacity guesswork.
    'disabled:bg-[var(--btn-disabled-bg)] disabled:text-[var(--btn-disabled-fg)]',
    'disabled:border-[var(--btn-disabled-border)] disabled:cursor-not-allowed',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0'
  ].join(' '),
  {
    variants: {
      variant: {
        primary: [
          'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)]',
          'border-[var(--btn-primary-border)]',
          'hover:bg-[var(--btn-primary-hover-bg)] active:bg-[var(--btn-primary-active-bg)]'
        ].join(' '),
        secondary: [
          'bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-fg)]',
          'border-[var(--btn-secondary-border)]',
          'hover:bg-[var(--btn-secondary-hover-bg)] active:bg-[var(--btn-secondary-active-bg)]'
        ].join(' '),
        outline: [
          'bg-[var(--btn-outline-bg)] text-[var(--btn-outline-fg)]',
          'border-[var(--btn-outline-border)]',
          'hover:bg-[var(--btn-outline-hover-bg)] active:bg-[var(--btn-outline-active-bg)]'
        ].join(' '),
        ghost: [
          'bg-[var(--btn-ghost-bg)] text-[var(--btn-ghost-fg)]',
          'hover:bg-[var(--btn-ghost-hover-bg)] active:bg-[var(--btn-ghost-active-bg)]'
        ].join(' '),
        destructive: [
          'bg-[var(--btn-destructive-bg)] text-[var(--btn-destructive-fg)]',
          'hover:bg-[var(--btn-destructive-hover-bg)] active:bg-[var(--btn-destructive-active-bg)]'
        ].join(' ')
      },
      size: {
        sm: 'h-[var(--control-height-sm)] px-[var(--control-padding-x-sm)]',
        md: 'h-[var(--control-height-md)] px-[var(--control-padding-x-md)]',
        lg: 'h-[var(--control-height-lg)] px-[var(--control-padding-x-lg)]',
        // Icon-only buttons are square at the same control height, so they never
        // fall below the 24px minimum target size (WCAG 2.2 SC 2.5.8).
        //
        // `shrink-0` is what makes that true. The width above is the button's
        // BASE size, not a floor: as a flex item beside growing content — a
        // dialog header with a long title is the common case — the default
        // `flex-shrink: 1` squashes it horizontally while the height stays put.
        // Measured before this fix, a 28px close button rendered 18px wide at a
        // 320px viewport, on the control that is hardest to hit anyway: the one
        // in the corner, against the screen edge.
        'icon-sm': 'h-[var(--control-height-sm)] w-[var(--control-height-sm)] shrink-0 p-0',
        icon: 'h-[var(--control-height-md)] w-[var(--control-height-md)] shrink-0 p-0',
        'icon-lg': 'h-[var(--control-height-lg)] w-[var(--control-height-lg)] shrink-0 p-0'
      },
      fullWidth: { true: 'w-full', false: '' }
    },
    defaultVariants: { variant: 'secondary', size: 'md', fullWidth: false }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows a spinner and disables interaction. */
  loading?: boolean;
  /**
   * Accessible name for icon-only buttons. REQUIRED whenever there is no
   * visible text — an icon alone is not a name to a screen reader.
   */
  label?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, fullWidth, asChild = false, loading = false, label,
    children, disabled, type, ...props },
  ref
) {
  const Comp = asChild ? Slot : 'button';
  const isIconOnly = typeof size === 'string' && size.startsWith('icon');

  if (process.env.NODE_ENV !== 'production' && isIconOnly && !label && !props['aria-label']) {
    // Loud in development, silent in production: a missing accessible name is a
    // defect, but it must never take down a running application.
    console.warn('[devcon8/ui] An icon-only Button needs a `label` for assistive technology.');
  }

  return (
    <Comp
      ref={ref}
      // Buttons inside a form default to submit in HTML; that surprises people
      // and causes accidental submissions. Be explicit unless told otherwise.
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={label ?? props['aria-label']}
      {...props}
    >
      {loading && <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />}
      {children}
    </Comp>
  );
});

export { buttonVariants };
