'use client';

import * as React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '../components/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem
} from '../components/overlays';

/*
 * THEME.
 *
 * Three states, not two: 'system' is the default and must stay distinct from an
 * explicit 'light' — otherwise a user who prefers dark at the OS level gets a
 * light application and no way to tell why.
 *
 * HYDRATION.
 *
 * The stored preference lives in localStorage, which the server cannot read. If
 * React rendered the theme, the first paint would be light and then snap to
 * dark — the flash of wrong theme. The fix is THEME_SCRIPT below: a tiny
 * synchronous script in <head> that sets the class before first paint. React
 * then adopts whatever the DOM already says, so the server and client markup
 * never disagree.
 *
 * The DOM is the source of truth here, not React state.
 */

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'devcon8-theme';

/**
 * Inline this in <head> BEFORE any rendered content, via
 * `<script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />`.
 *
 * It is deliberately tiny and dependency-free. It runs synchronously, so the
 * browser has the final theme before it paints anything.
 */
export const THEME_SCRIPT = `(function(){try{
var s=localStorage.getItem('${STORAGE_KEY}');
var d=window.matchMedia('(prefers-color-scheme: dark)').matches;
var t=(s==='light'||s==='dark')?s:(d?'dark':'light');
var e=document.documentElement;
e.classList.toggle('dark',t==='dark');
e.setAttribute('data-theme',t);
e.style.colorScheme=t;
}catch(_){}})();`;

type ThemeContextValue = {
  /** The user's preference, including 'system'. */
  theme: Theme;
  /** What is actually being displayed right now. */
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within <ThemeProvider>');
  return context;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start from 'system' on BOTH server and client so the first render matches.
  // The real preference is read in an effect, after hydration has completed.
  const [theme, setThemeState] = React.useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = React.useState<'light' | 'dark'>('light');

  /*
   * Until the stored preference has been read, NOTHING here may write to the
   * DOM.
   *
   * The initial state says 'system' because that is the only value the server
   * could have rendered — not because the user chose it. Acting on it before
   * localStorage has been consulted makes the OS preference overwrite the
   * explicit one that THEME_SCRIPT correctly applied before first paint, and
   * the effect below then never runs again to put it back. The symptom is a
   * user who selects Light on a dark-mode machine, sees it work, reloads, and
   * gets dark — with the menu still showing Light as selected.
   */
  const [preferenceLoaded, setPreferenceLoaded] = React.useState(false);

  React.useEffect(() => {
    const stored = safeRead();
    if (stored) {
      setThemeState(stored);
      // Idempotent in the normal case, and self-healing in the abnormal one:
      // if THEME_SCRIPT was blocked (a misconfigured CSP, an old cached
      // document), this is what repairs the document instead of leaving the
      // preference and the page disagreeing.
      writeDom(stored);
      setResolvedTheme(stored);
    } else {
      setResolvedTheme(currentDomTheme());
    }
    setPreferenceLoaded(true);
  }, []);

  // Follow the OS, but only once we know the user has not chosen for themselves.
  React.useEffect(() => {
    if (!preferenceLoaded || theme !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const next = query.matches ? 'dark' : 'light';
      writeDom(next);
      setResolvedTheme(next);
    };
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [preferenceLoaded, theme]);

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing or a blocked storage partition. The theme still
      // applies for this session; it simply is not remembered.
    }
    const effective = next === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : next;
    writeDom(effective);
    setResolvedTheme(effective);
  }, []);

  const value = React.useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/*
 * Only an EXPLICIT choice is ever stored. 'system' is represented by the
 * absence of a key, so the return type deliberately excludes it: a stored
 * "system" would be indistinguishable from a stale or corrupted value, and the
 * pre-paint script has no way to interpret one.
 */
function safeRead(): 'light' | 'dark' | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function currentDomTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function writeDom(theme: 'light' | 'dark') {
  const element = document.documentElement;
  element.classList.toggle('dark', theme === 'dark');
  element.setAttribute('data-theme', theme);
  // Keeps native controls, scrollbars and form widgets in the right theme.
  element.style.colorScheme = theme;
}

export interface ThemeToggleLabels {
  toggle: string;
  light: string;
  dark: string;
  system: string;
}

export function ThemeToggle({ labels }: { labels: ThemeToggleLabels }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Before mount the real theme is unknown to React. Rendering a neutral icon
  // avoids claiming the wrong state for a frame.
  const Icon = !mounted ? Monitor : resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" label={labels.toggle}>
          <Icon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {([
          ['light', labels.light, Sun],
          ['dark', labels.dark, Moon],
          ['system', labels.system, Monitor]
        ] as const).map(([value, label, ItemIcon]) => (
          <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
            <ItemIcon className="size-4" />
            {label}
            {mounted && theme === value && <span className="ml-auto text-caption text-muted-foreground">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
