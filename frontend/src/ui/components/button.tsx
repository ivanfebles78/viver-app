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
    // A BUSY control is dimmed the same way, but it is not natively disabled —
    // see the note on `loading` below — so the `disabled:` variant above, which
    // keys off the native attribute, would never reach it.
    'aria-disabled:bg-[var(--btn-disabled-bg)] aria-disabled:text-[var(--btn-disabled-fg)]',
    'aria-disabled:border-[var(--btn-disabled-border)]',
    // Waiting, not forbidden: the pointer says "in a moment", not "never".
    'aria-disabled:cursor-not-allowed data-[loading=true]:cursor-wait',
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
  /**
   * The action this button started is in flight.
   *
   * NOT the same thing as `disabled`, and deliberately implemented differently.
   * See the note above the component for why.
   */
  loading?: boolean;
  /**
   * Accessible name for icon-only buttons. REQUIRED whenever there is no
   * visible text — an icon alone is not a name to a screen reader.
   */
  label?: string;
}

/*
 * BUSY IS NOT DISABLED.
 *
 * `disabled` means "this control is not available to you". Leaving the tab order
 * is correct: there is nothing to do with it, and stopping on it would be a stop
 * that leads nowhere.
 *
 * `loading` means "the thing you just asked for is happening". The user is
 * mid-interaction with THIS control, and three things follow from that:
 *
 *   1. It must stay focusable. A native `disabled` button cannot hold focus, so
 *      a dialog closing has nowhere to give focus back to and the user is
 *      dropped at the top of the document — right after acting, which is the
 *      worst possible moment. That is WCAG 2.4.3.
 *   2. It must stay announced. `aria-busy` on an element that can never hold
 *      focus is a message with no one to read it.
 *   3. It must still refuse to run twice.
 *
 * Points 1 and 3 pull against each other, and that tension is the whole design.
 * `aria-disabled` buys back focusability, but it buys back every activation path
 * with it: pointer, Enter, Space, and implicit form submission all become live
 * again. So the guard lives HERE, in the component, and not in a rule that every
 * consumer has to remember. A design system that hands that problem downstream
 * has not solved it — it has spread it out.
 *
 * The paths blocked below are the ones a button actually has:
 *
 *   - `click`   — pointer, Enter and Space all arrive here, and so does implicit
 *                 form submission through a `type="submit"` button.
 *   - `keydown` — stops Space from scrolling the page, and stops a consumer that
 *                 binds keydown directly.
 *   - `pointerdown` / `mousedown` — some triggers open on press rather than on
 *                 click; a Radix menu trigger is the common case.
 *
 * `preventDefault` is used on click and keydown but NOT on the press events: on
 * mousedown it would also cancel the browser's own focus handling, and a busy
 * button that cannot be focused by clicking it would defeat point 1.
 */

/** Returns a handler that swallows the event while busy, and defers otherwise. */
function bloquearSiOcupado<E extends React.SyntheticEvent>(
  ocupado: boolean,
  original: ((event: E) => void) | undefined,
  { conPreventDefault }: { conPreventDefault: boolean }
) {
  return (event: E) => {
    if (ocupado) {
      if (conPreventDefault) event.preventDefault();
      event.stopPropagation();
      return;
    }
    original?.(event);
  };
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, fullWidth, asChild = false, loading = false, label,
    children, disabled, type, onClick, onKeyDown, onPointerDown, onMouseDown,
    // Se sacan del resto para que el `{...props}` de abajo no pueda pisarlos: un
    // `aria-disabled={false}` del consumidor no puede desarmar el guardarraíl.
    'aria-disabled': ariaDisabled, 'aria-label': ariaLabel, ...props },
  ref
) {
  const Comp = asChild ? Slot : 'button';
  const isIconOnly = typeof size === 'string' && size.startsWith('icon');

  // Genuinely unavailable wins: there is nothing to be busy about.
  const ocupado = loading && !disabled;

  /*
   * Sólo Enter y Espacio se interceptan. Las demás teclas tienen que seguir
   * llegando: Escape cierra el diálogo que hay encima, y Tab tiene que poder
   * sacar el foco de un botón ocupado o el usuario se quedaría encerrado en él.
   */
  const alPulsarTecla = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (ocupado && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onKeyDown?.(event);
  };

  if (process.env.NODE_ENV !== 'production' && isIconOnly && !label && !ariaLabel) {
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
      disabled={disabled}
      aria-disabled={ocupado || ariaDisabled}
      aria-busy={ocupado || undefined}
      data-loading={ocupado || undefined}
      aria-label={label ?? ariaLabel}
      onClick={bloquearSiOcupado(ocupado, onClick, { conPreventDefault: true })}
      onKeyDown={alPulsarTecla}
      onPointerDown={bloquearSiOcupado(ocupado, onPointerDown, { conPreventDefault: false })}
      onMouseDown={bloquearSiOcupado(ocupado, onMouseDown, { conPreventDefault: false })}
      {...props}
    >
      {loading && <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />}
      {children}
    </Comp>
  );
});

export { buttonVariants };
