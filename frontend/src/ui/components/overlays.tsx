'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from './button';

/*
 * Overlays are built on Radix because focus trapping, focus restoration,
 * scroll locking, Escape handling and the aria wiring are genuinely hard to get
 * right, and getting them wrong locks a keyboard user out of the page.
 *
 * Every overlay here REQUIRES a title. Radix warns about a missing
 * Dialog.Title; making it a required prop turns that runtime warning into a
 * compile error instead.
 */

const overlayClasses = [
  'fixed inset-0 z-[var(--z-backdrop)] bg-[var(--modal-backdrop)]',
  'data-[state=open]:animate-in data-[state=closed]:animate-out',
  'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
  'motion-reduce:animate-none'
].join(' ');

/**
 * Records what was focused at the instant the dialog opened.
 *
 * Rendered inside the portal, so it mounts exactly when the dialog does, and it
 * uses a LAYOUT effect on purpose: Radix's focus scope moves focus into the
 * dialog from a passive effect, and every layout effect in a commit runs before
 * every passive one. A passive effect here would read `document.activeElement`
 * after focus had already been taken, and record the dialog itself.
 *
 * It deliberately does not clear the ref on unmount: the focus scope fires its
 * close handler from a `setTimeout`, by which point this cleanup has long run.
 */
function CaptureFocusOrigin({ target }: { target: React.MutableRefObject<HTMLElement | null> }) {
  React.useLayoutEffect(() => {
    const active = document.activeElement;
    target.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, [target]);
  return null;
}

/**
 * Returns focus to the control that opened the dialog.
 *
 * Radix's focus scope already restores focus correctly on its own, but Radix's
 * Dialog overrides it: it cancels that restore and instead focuses the ref of
 * its `DialogTrigger`. A dialog whose `open` is driven by application state —
 * opened from a row action, a menu item, a toolbar button — has no trigger and
 * no ref, so nothing is focused and the user lands on `<body>`: dropped at the
 * top of the document, having to traverse the page to get back to the control
 * they just used. That is WCAG 2.4.3.
 *
 * Restoring from our own capture covers both cases with one path: when there IS
 * a trigger, the captured element is that trigger, because clicking it is what
 * focused it.
 *
 * A consumer-supplied `onCloseAutoFocus` still wins: it runs first, and if it
 * calls `preventDefault()` this handler stands down.
 */
function useRestoreFocusOnClose(
  origin: React.MutableRefObject<HTMLElement | null>,
  onCloseAutoFocus?: (event: Event) => void
): (event: Event) => void {
  return React.useCallback(
    (event: Event) => {
      onCloseAutoFocus?.(event);
      if (event.defaultPrevented) return;
      const target = origin.current;
      // Nothing was focused, or it left the document while the dialog was open:
      // leave Radix's behaviour alone rather than focusing a detached node.
      if (!target || !target.isConnected) return;
      event.preventDefault();
      target.focus();
    },
    [origin, onCloseAutoFocus]
  );
}

/* ── Dialog ─────────────────────────────────────────────────────────── */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  title: string;
  description?: string;
  /** Footer actions. Primary action goes last, matching platform convention. */
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  closeLabel?: string;
}

export function DialogContent({
  title, description, footer, size = 'md', closeLabel = 'Close', className, children, onCloseAutoFocus, ...props
}: DialogContentProps) {
  const width = { sm: 'max-w-[420px]', md: 'max-w-[560px]', lg: 'max-w-[760px]' }[size];
  const focusOrigin = React.useRef<HTMLElement | null>(null);
  const restoreFocus = useRestoreFocusOnClose(focusOrigin, onCloseAutoFocus);
  return (
    <DialogPrimitive.Portal>
      <CaptureFocusOrigin target={focusOrigin} />
      <DialogPrimitive.Overlay className={overlayClasses} />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-[var(--z-modal)] -translate-x-1/2 -translate-y-1/2',
          // Never taller than the viewport, and scrollable at 200% zoom / 320px.
          'w-[calc(100vw-var(--space-8))] max-h-[calc(100dvh-var(--space-8))] overflow-y-auto',
          width,
          'bg-popover text-popover-foreground',
          'rounded-[var(--radius-lg)] border border-border shadow-[var(--shadow-lg)]',
          'p-6 flex flex-col gap-4',
          // No scale on the way in: this panel is centred with a transform, and
          // an animation that writes transform would drag it in from the corner.
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 motion-reduce:animate-none',
          'outline-none',
          className
        )}
        onCloseAutoFocus={restoreFocus}
        {...props}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <DialogPrimitive.Title className="text-h5 font-[var(--font-weight-semibold)]">
              {title}
            </DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="text-body-sm text-muted-foreground">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon-sm" label={closeLabel}>
              <X aria-hidden="true" className="size-4" />
            </Button>
          </DialogPrimitive.Close>
        </div>

        {children}

        {footer && <div className="flex flex-wrap items-center justify-end gap-3 pt-2">{footer}</div>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/* ── AlertDialog ────────────────────────────────────────────────────────
 * For decisions with consequences. Unlike Dialog it cannot be dismissed by
 * clicking outside — a destructive confirmation must be answered deliberately.
 */
export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

export interface AlertDialogContentProps {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Destructive confirmations render the red action. Everything else is primary. */
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}

export function AlertDialogContent({
  title, description, confirmLabel, cancelLabel, destructive = false, loading = false, onConfirm, children
}: AlertDialogContentProps) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className={overlayClasses} />
      <AlertDialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-[var(--z-modal)] -translate-x-1/2 -translate-y-1/2',
          'w-[calc(100vw-var(--space-8))] max-w-[460px] max-h-[calc(100dvh-var(--space-8))] overflow-y-auto',
          'bg-popover text-popover-foreground',
          'rounded-[var(--radius-lg)] border border-border shadow-[var(--shadow-lg)]',
          'p-6 flex flex-col gap-4 outline-none'
        )}
      >
        <AlertDialogPrimitive.Title className="text-h5 font-[var(--font-weight-semibold)]">
          {title}
        </AlertDialogPrimitive.Title>
        <AlertDialogPrimitive.Description className="text-body-sm text-muted-foreground">
          {description}
        </AlertDialogPrimitive.Description>
        {children}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          {/* Cancel is neutral — never coloured. */}
          <AlertDialogPrimitive.Cancel asChild>
            <Button variant="secondary">{cancelLabel}</Button>
          </AlertDialogPrimitive.Cancel>
          <AlertDialogPrimitive.Action asChild>
            <Button variant={destructive ? 'destructive' : 'primary'} loading={loading} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </AlertDialogPrimitive.Action>
        </div>
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  );
}

/* ── Sheet / Drawer ─────────────────────────────────────────────────── */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export interface SheetContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  title: string;
  description?: string;
  side?: 'left' | 'right';
  closeLabel?: string;
  /** Hide the visual header while keeping the accessible title (e.g. mobile nav). */
  hideHeader?: boolean;
}

export function SheetContent({
  title, description, side = 'right', closeLabel = 'Close', hideHeader = false, className, children, ...props
}: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClasses} />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-y-0 z-[var(--z-drawer)] flex flex-col',
          'w-[min(var(--sidebar-width-mobile),calc(100vw-var(--space-12)))]',
          'bg-popover text-popover-foreground shadow-[var(--shadow-lg)]',
          side === 'left' ? 'left-0 border-r border-border' : 'right-0 border-l border-border',
          'data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:animate-none',
          side === 'left'
            ? 'data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left'
            : 'data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
          'outline-none',
          className
        )}
        {...props}
      >
        <div className={cn('flex items-start justify-between gap-4 p-4', hideHeader && 'sr-only')}>
          <div className="flex flex-col gap-1">
            <DialogPrimitive.Title className="text-h5 font-[var(--font-weight-semibold)]">
              {title}
            </DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="text-body-sm text-muted-foreground">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
        </div>
        {/* The close control stays visible even when the header is hidden. */}
        <DialogPrimitive.Close asChild>
          <Button variant="ghost" size="icon-sm" label={closeLabel} className="absolute right-3 top-3">
            <X aria-hidden="true" className="size-4" />
          </Button>
        </DialogPrimitive.Close>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/* ── Dropdown menu ──────────────────────────────────────────────────── */
export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;
export const DropdownMenuGroup = DropdownPrimitive.Group;

export function DropdownMenuContent({
  className, sideOffset = 6, align = 'end', ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-[var(--z-dropdown)] min-w-[200px] overflow-hidden p-1',
          'rounded-[var(--radius-md)] border border-border',
          'bg-popover text-popover-foreground shadow-[var(--shadow-md)]',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none',
          className
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className, destructive = false, ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { destructive?: boolean }) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-[var(--radius-sm)]',
        'px-2 py-1.5 text-body-sm outline-none',
        // Radix drives highlight via data-highlighted for BOTH mouse and keyboard,
        // so hover and arrow-key navigation look identical.
        'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
        'data-[disabled]:pointer-events-none data-[disabled]:text-[var(--btn-disabled-fg)]',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        destructive && 'text-[var(--destructive)] data-[highlighted]:bg-[var(--destructive-subtle)] data-[highlighted]:text-[var(--destructive-subtle-foreground)]',
        className
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>) {
  return (
    <DropdownPrimitive.Label
      className={cn('px-2 py-1.5 text-caption font-[var(--font-weight-semibold)] text-muted-foreground', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Separator>) {
  return <DropdownPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
}
