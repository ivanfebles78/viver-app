'use client';

import * as React from 'react';
import {
  CircleDashed, Send, Clock, Eye, CheckCircle2, XCircle, PauseCircle,
  CircleDot, CircleSlash, CheckCheck, Ban, Archive, Loader
} from 'lucide-react';
import { cn } from '../lib/cn';
import { Status, StatusTone, STATUS_TONES } from './status-model';

/*
 * DevCon8 status system — presentation.
 *
 * The tone mapping itself lives in ./status-model, which imports nothing and is
 * unit-tested. What this file adds is the markup, and two Design System rules
 * it enforces structurally:
 *
 *   1. Colour NEVER carries meaning alone. Every status renders a label, and
 *      an icon. There is no prop to turn the label off — a colour-only status
 *      chip fails WCAG 2.2 SC 1.4.1 and is exactly what this component exists
 *      to prevent.
 *   2. Workflow status uses the --status-* family, never borrowed semantic
 *      action colours. Green here means "succeeded", and can never leak into a
 *      button, because no green button token exists.
 */

export { Status, StatusTone, STATUS_TONES, statusLabelKey } from './status-model';

const STATUS_ICONS: Record<Status, React.ComponentType<{ className?: string }>> = {
  [Status.DRAFT]: CircleDashed,
  [Status.SUBMITTED]: Send,
  [Status.PENDING]: Clock,
  [Status.UNDER_REVIEW]: Eye,
  [Status.IN_PROGRESS]: Loader,
  [Status.APPROVED]: CheckCircle2,
  [Status.REJECTED]: XCircle,
  [Status.ON_HOLD]: PauseCircle,
  [Status.ACTIVE]: CircleDot,
  [Status.INACTIVE]: CircleSlash,
  [Status.COMPLETED]: CheckCheck,
  [Status.CANCELLED]: Ban,
  [Status.ARCHIVED]: Archive
};

type Definition = { tone: StatusTone; Icon: React.ComponentType<{ className?: string }> };

/** Tone (the rule) joined to icon (the presentation), for convenience. */
export const STATUS_DEFINITIONS: Record<Status, Definition> = Object.fromEntries(
  (Object.keys(STATUS_TONES) as Status[]).map((status) => [
    status,
    { tone: STATUS_TONES[status], Icon: STATUS_ICONS[status] }
  ])
) as Record<Status, Definition>;

/* Static class strings so Tailwind can see them; tone -> --status-<tone>-* . */
const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)] border-[var(--status-neutral-border)]',
  info: 'bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border-[var(--status-info-border)]',
  pending: 'bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)] border-[var(--status-pending-border)]',
  review: 'bg-[var(--status-review-bg)] text-[var(--status-review-fg)] border-[var(--status-review-border)]',
  progress: 'bg-[var(--status-progress-bg)] text-[var(--status-progress-fg)] border-[var(--status-progress-border)]',
  success: 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]',
  danger: 'bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)] border-[var(--status-danger-border)]',
  hold: 'bg-[var(--status-hold-bg)] text-[var(--status-hold-fg)] border-[var(--status-hold-border)]'
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: Status;
  /** Translated label. The caller owns i18n; this component never hard-codes text. */
  label: string;
  /** Icons reinforce the label; they never replace it. */
  showIcon?: boolean;
}

export function StatusBadge({ status, label, showIcon = true, className, ...props }: StatusBadgeProps) {
  const def = STATUS_DEFINITIONS[status] ?? STATUS_DEFINITIONS[Status.DRAFT];
  const { Icon } = def;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 border align-middle',
        'h-[var(--badge-height)] px-[var(--badge-padding-x)] rounded-[var(--badge-radius)]',
        'text-[length:var(--badge-font-size)] font-[var(--font-weight-medium)] whitespace-nowrap',
        TONE_CLASSES[def.tone],
        className
      )}
      // The visible label is the accessible name; the icon is decorative.
      {...props}
    >
      {showIcon && <Icon aria-hidden="true" className="size-3.5 shrink-0" />}
      {label}
    </span>
  );
}

/** Neutral, non-workflow badge (counts, tags, metadata). */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
}
export function Badge({ tone = StatusTone.NEUTRAL, className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center border align-middle',
        'h-[var(--badge-height)] px-[var(--badge-padding-x)] rounded-[var(--badge-radius)]',
        'text-[length:var(--badge-font-size)] font-[var(--font-weight-medium)] whitespace-nowrap',
        TONE_CLASSES[tone],
        className
      )}
      {...props}
    />
  );
}
