import type * as React from 'react';

/*
 * NAVIGATION MODEL — the data half of the navigation, deliberately free of
 * React, Radix and the DOM.
 *
 * These two functions carry the only decisions in the navigation that can be
 * WRONG rather than merely ugly: which links an actor is allowed to see, and
 * which one is the current page. Keeping them in a module that renders nothing
 * means they can be tested directly, as data in and data out, instead of only
 * through a browser — and it keeps an authorization decision out of a file
 * whose job is markup.
 *
 * The type-only React import is erased at build time; nothing here loads React.
 */

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Rendered at the end of the row, e.g. a count. Keep it short. */
  badge?: React.ReactNode;
  children?: NavItem[];
  /** Permission required. Filtering happens before render, never by hiding with CSS. */
  permission?: string;
}

export interface NavSection {
  key: string;
  /** Omit for the primary, unlabelled group at the top. */
  label?: string;
  items: NavItem[];
}

/**
 * Remove everything the actor may not use, at every depth.
 *
 * Hidden-but-present links leak structure: a navigation tree is routinely
 * serialised into the page, so an item that is merely not rendered is still
 * readable in the payload. It tells an unauthorised user which modules exist,
 * what they are called and where they live — which is exactly the map an
 * attacker would otherwise have to guess at.
 *
 * The recursion is the point. Filtering only the first two levels is the easy
 * mistake, and it is invisible while the shell happens to render two levels:
 * the leak appears the day a product adds a third, or serialises this result
 * to a client, and nothing fails to warn anyone.
 *
 * Input is never mutated — callers routinely pass a shared, module-level
 * navigation constant, and filtering it in place would permanently strip it for
 * every subsequent actor in the process.
 */
export function filterNavigation(sections: NavSection[], permissions: string[]): NavSection[] {
  const granted = new Set(permissions);
  const allowed = (item: NavItem): boolean => !item.permission || granted.has(item.permission);

  function keep(items: NavItem[]): NavItem[] {
    const result: NavItem[] = [];
    for (const item of items) {
      if (!allowed(item)) continue;
      if (!item.children) {
        result.push({ ...item });
        continue;
      }
      const children = keep(item.children);
      /*
       * A branch whose children are now all denied is only worth keeping if it
       * is a real destination in its own right. A pure grouping row that leads
       * nowhere would otherwise survive as an empty, unclickable heading.
       */
      if (children.length === 0 && !item.href) continue;
      result.push({ ...item, children });
    }
    return result;
  }

  return sections
    .map((section) => ({ ...section, items: keep(section.items) }))
    .filter((section) => section.items.length > 0);
}

/**
 * True when the item, or any descendant, matches the current path.
 *
 * The `href + '/'` test is what stops "/projects" claiming to be the active
 * item while the user is on "/projects-archive" — a plain startsWith() marks
 * the wrong row as the current page, and `aria-current` then lies to a screen
 * reader rather than merely looking odd.
 */
export function isActive(item: NavItem, currentPath: string): boolean {
  if (item.href === currentPath) return true;
  if (item.href && item.href !== '/' && currentPath.startsWith(item.href + '/')) return true;
  return Boolean(item.children?.some((child) => isActive(child, currentPath)));
}
