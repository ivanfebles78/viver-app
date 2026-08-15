import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names, letting a later class win over an earlier conflicting one.
 * Without this, a caller's `className` cannot reliably override a component
 * default and people resort to `!important` or inline styles — both of which
 * escape the token system.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
