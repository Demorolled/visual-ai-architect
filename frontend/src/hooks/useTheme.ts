/**
 * useTheme — Real-time Theme Engine
 * ==================================
 *
 * Watches the `theme` key in the shared context and applies CSS variable
 * overrides to `document.documentElement.style` instantly.
 *
 * When the user types `/set theme neon-sunset` in the terminal:
 *   1. Shared context updates (context.theme = "neon-sunset")
 *   2. This hook detects the change
 *   3. Applies ~25 CSS variable overrides to :root
 *   4. The ENTIRE UI updates in real-time — canvas, nodes, toolbar, terminal
 *
 * No individual component changes needed — everything uses CSS variables.
 *
 * Usage in App.tsx:
 *   function App() {
 *     useTheme(); // Just call it — it auto-applies
 *     ...
 *   }
 */

import { useEffect, useRef } from 'react';
import { useSharedContext } from './useSharedContext';
import { getTheme, ThemeDefinition } from '../themes';

/** Apply a theme definition to the document root */
function applyTheme(theme: ThemeDefinition, prevTheme?: ThemeDefinition) {
  const root = document.documentElement;

  for (const [key, value] of Object.entries(theme)) {
    root.style.setProperty(key, value);
  }

  // If there was a previous theme, remove any variables that no longer apply
  if (prevTheme) {
    for (const key of Object.keys(prevTheme)) {
      if (!(key in theme)) {
        root.style.removeProperty(key);
      }
    }
  }
}

/** Reset all theme variables back to the :root defaults (from index.css) */
function resetTheme() {
  const root = document.documentElement;
  const dark = getTheme('dark');
  for (const key of Object.keys(dark)) {
    root.style.removeProperty(key);
  }
}

/**
 * Hook: Watches context.theme and applies CSS variable overrides.
 *
 * @param options.animate — Whether to add a brief transition on accent color changes (default: true)
 */
export function useTheme(options?: { animate?: boolean }) {
  const { context } = useSharedContext();
  const prevThemeNameRef = useRef<string>('');
  const animate = options?.animate !== false;

  useEffect(() => {
    const themeName = context.theme;
    if (!themeName || themeName === 'dark' || themeName === 'default') {
      // Reset to defaults
      if (prevThemeNameRef.current) {
        resetTheme();
        prevThemeNameRef.current = '';
      }
      return;
    }

    const theme = getTheme(String(themeName));
    const prevTheme = prevThemeNameRef.current
      ? getTheme(prevThemeNameRef.current)
      : undefined;

    // Add a smooth transition class while theme is changing
    if (animate) {
      const root = document.documentElement;
      root.style.setProperty(
        '--theme-transition',
        'color 0.3s ease, background-color 0.3s ease, border-color 0.3s ease'
      );
      // Remove after animation completes
      setTimeout(() => {
        root.style.removeProperty('--theme-transition');
      }, 400);
    }

    applyTheme(theme, prevTheme);
    prevThemeNameRef.current = String(themeName);
  }, [context.theme, animate]);

  return context.theme as string | undefined;
}
