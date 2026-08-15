/*
 * STATUS MODEL — the semantic half of the DevCon8 status system.
 *
 * What lives here is the RULE: which workflow status carries which tone. That
 * mapping is a Design System decision with real consequences (green means
 * "succeeded" and may never leak into an action colour), so it is kept in a
 * module that renders nothing, imports nothing, and can be asserted on
 * directly — including "every status has a translated label in every locale".
 *
 * The icons and the markup live in status-badge.tsx. Adding a status is a
 * mapping decision here, never a colour decision there.
 */

export const StatusTone = {
  NEUTRAL: 'neutral',
  INFO: 'info',
  PENDING: 'pending',
  REVIEW: 'review',
  PROGRESS: 'progress',
  SUCCESS: 'success',
  DANGER: 'danger',
  HOLD: 'hold'
} as const;
export type StatusTone = (typeof StatusTone)[keyof typeof StatusTone];

export const Status = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  PENDING: 'pending',
  UNDER_REVIEW: 'under_review',
  IN_PROGRESS: 'in_progress',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  ON_HOLD: 'on_hold',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  ARCHIVED: 'archived'
} as const;
export type Status = (typeof Status)[keyof typeof Status];

/**
 * The single mapping table. Statuses map onto one of eight token families
 * rather than getting colours of their own, so a product extends the system by
 * composing, never by re-colouring.
 */
export const STATUS_TONES: Record<Status, StatusTone> = {
  [Status.DRAFT]: StatusTone.NEUTRAL,
  [Status.SUBMITTED]: StatusTone.INFO,
  [Status.PENDING]: StatusTone.PENDING,
  [Status.UNDER_REVIEW]: StatusTone.REVIEW,
  [Status.IN_PROGRESS]: StatusTone.PROGRESS,
  [Status.APPROVED]: StatusTone.SUCCESS,
  [Status.REJECTED]: StatusTone.DANGER,
  [Status.ON_HOLD]: StatusTone.HOLD,
  [Status.ACTIVE]: StatusTone.SUCCESS,
  [Status.INACTIVE]: StatusTone.NEUTRAL,
  [Status.COMPLETED]: StatusTone.SUCCESS,
  [Status.CANCELLED]: StatusTone.DANGER,
  [Status.ARCHIVED]: StatusTone.NEUTRAL
};

/** The translation key a product must provide for a status label. */
export function statusLabelKey(status: Status): string {
  return `status.${status}`;
}
