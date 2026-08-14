/**
 * themes.ts — Theme Definitions for Shared Context Theming
 * ==========================================================
 *
 * Each theme is a map of CSS variable names to their values.
 * When `context.theme` changes in the shared state store, the useTheme
 * hook applies these overrides to `document.documentElement.style`,
 * instantly updating the entire UI (canvas, nodes, toolbar, terminal, etc.)
 *
 * All themes should define the same set of variables for consistency.
 * Use the default (dark) theme as the baseline.
 */

/** CSS variable override map */
export type ThemeDefinition = Record<string, string>;

/**
 * The default "Midnight Pro" theme — the app's standard dark palette.
 */
const DARK: ThemeDefinition = {
  '--color-bg': '#1a1a2e',
  '--color-bg-surface': '#242438',
  '--color-bg-raised': '#2e2e44',
  '--color-bg-elevated': '#383850',
  '--color-bg-dark': '#0f0f1a',
  '--color-bg-dark-hover': '#1a1a30',
  '--color-text': '#e2e8f0',
  '--color-text-secondary': '#94a3b8',
  '--color-text-muted': '#64748b',
  '--color-text-dim': '#9099a8',
  '--color-text-inverse': '#ececf0',
  '--color-border': '#2a2a4a',
  '--color-border-strong': '#3a3a5a',
  '--color-border-hover': '#5a5a8a',
  '--color-accent': '#3b82f6',
  '--color-accent-hover': '#2563eb',
  '--color-accent-light': 'rgba(59, 130, 246, 0.18)',
  '--color-success': '#10b981',
  '--color-success-light': 'rgba(16, 185, 129, 0.18)',
  '--color-warning': '#f59e0b',
  '--color-warning-light': 'rgba(245, 158, 11, 0.18)',
  '--color-error': '#ef4444',
  '--color-error-light': 'rgba(239, 68, 68, 0.18)',
  '--color-info': '#0284c7',
  '--color-purple': '#7c3aed',
  '--color-pink': '#db2777',
};

/**
 * 🌅 Neon Sunset — warm, vibrant orange/coral accent with deep navy background.
 * Type /set theme neon-sunset or /theme neon-sunset in the terminal.
 */
const NEON_SUNSET: ThemeDefinition = {
  '--color-bg': '#0d0d1a',
  '--color-bg-surface': '#1a1a30',
  '--color-bg-raised': '#252542',
  '--color-bg-elevated': '#30305a',
  '--color-bg-dark': '#080812',
  '--color-bg-dark-hover': '#12122a',
  '--color-text': '#fce7d3',
  '--color-text-secondary': '#d4a574',
  '--color-text-muted': '#a07050',
  '--color-text-dim': '#b09070',
  '--color-text-inverse': '#1a0e08',
  '--color-border': '#3a2a1a',
  '--color-border-strong': '#5a3a2a',
  '--color-border-hover': '#8a5a3a',
  '--color-accent': '#ff6b35',
  '--color-accent-hover': '#e05520',
  '--color-accent-light': 'rgba(255, 107, 53, 0.18)',
  '--color-success': '#fbbf24',
  '--color-success-light': 'rgba(251, 191, 36, 0.18)',
  '--color-warning': '#f97316',
  '--color-warning-light': 'rgba(249, 115, 22, 0.18)',
  '--color-error': '#ef4444',
  '--color-error-light': 'rgba(239, 68, 68, 0.18)',
  '--color-info': '#fb923c',
  '--color-purple': '#c2410c',
  '--color-pink': '#f97316',
};

/**
 * 🌊 Ocean Depths — cool blue/teal with cyan accents.
 * Type /set theme ocean or /theme ocean.
 */
const OCEAN: ThemeDefinition = {
  '--color-bg': '#0a1628',
  '--color-bg-surface': '#0f1f3a',
  '--color-bg-raised': '#14284a',
  '--color-bg-elevated': '#1a325a',
  '--color-bg-dark': '#060e1a',
  '--color-bg-dark-hover': '#0c1830',
  '--color-text': '#d4f0f0',
  '--color-text-secondary': '#7fc4c4',
  '--color-text-muted': '#509090',
  '--color-text-dim': '#70a8a8',
  '--color-text-inverse': '#061a1a',
  '--color-border': '#1a3a4a',
  '--color-border-strong': '#2a5a6a',
  '--color-border-hover': '#3a8a9a',
  '--color-accent': '#14b8a6',
  '--color-accent-hover': '#0d9488',
  '--color-accent-light': 'rgba(20, 184, 166, 0.18)',
  '--color-success': '#06b6d4',
  '--color-success-light': 'rgba(6, 182, 212, 0.18)',
  '--color-warning': '#0891b2',
  '--color-warning-light': 'rgba(8, 145, 178, 0.18)',
  '--color-error': '#ef4444',
  '--color-error-light': 'rgba(239, 68, 68, 0.18)',
  '--color-info': '#22d3ee',
  '--color-purple': '#0891b2',
  '--color-pink': '#14b8a6',
};

/**
 * 🌲 Forest Canopy — earthy greens with amber accents.
 * Type /set theme forest or /theme forest.
 */
const FOREST: ThemeDefinition = {
  '--color-bg': '#0a1a0e',
  '--color-bg-surface': '#0f2415',
  '--color-bg-raised': '#152e1c',
  '--color-bg-elevated': '#1a3823',
  '--color-bg-dark': '#050f08',
  '--color-bg-dark-hover': '#0a1a10',
  '--color-text': '#d4e8d4',
  '--color-text-secondary': '#90b890',
  '--color-text-muted': '#608060',
  '--color-text-dim': '#80a080',
  '--color-text-inverse': '#081a08',
  '--color-border': '#1a3a1a',
  '--color-border-strong': '#2a5a2a',
  '--color-border-hover': '#3a8a3a',
  '--color-accent': '#4ade80',
  '--color-accent-hover': '#22c55e',
  '--color-accent-light': 'rgba(74, 222, 128, 0.18)',
  '--color-success': '#a3e635',
  '--color-success-light': 'rgba(163, 230, 53, 0.18)',
  '--color-warning': '#fbbf24',
  '--color-warning-light': 'rgba(251, 191, 36, 0.18)',
  '--color-error': '#ef4444',
  '--color-error-light': 'rgba(239, 68, 68, 0.18)',
  '--color-info': '#84cc16',
  '--color-purple': '#4ade80',
  '--color-pink': '#a3e635',
};

/**
 * 🌸 Sakura Bloom — soft pink/rose with warm neutrals.
 * Type /set theme sakura or /theme sakura.
 */
const SAKURA: ThemeDefinition = {
  '--color-bg': '#1a1418',
  '--color-bg-surface': '#2a1e24',
  '--color-bg-raised': '#382830',
  '--color-bg-elevated': '#46303c',
  '--color-bg-dark': '#0f0a0c',
  '--color-bg-dark-hover': '#1a1018',
  '--color-text': '#f0dce4',
  '--color-text-secondary': '#c490a0',
  '--color-text-muted': '#906070',
  '--color-text-dim': '#b08090',
  '--color-text-inverse': '#1a0810',
  '--color-border': '#3a1a28',
  '--color-border-strong': '#5a2a3a',
  '--color-border-hover': '#8a3a5a',
  '--color-accent': '#f472b6',
  '--color-accent-hover': '#ec4899',
  '--color-accent-light': 'rgba(244, 114, 182, 0.18)',
  '--color-success': '#fbbf24',
  '--color-success-light': 'rgba(251, 191, 36, 0.18)',
  '--color-warning': '#fb923c',
  '--color-warning-light': 'rgba(249, 115, 22, 0.18)',
  '--color-error': '#ef4444',
  '--color-error-light': 'rgba(239, 68, 68, 0.18)',
  '--color-info': '#f472b6',
  '--color-purple': '#d946ef',
  '--color-pink': '#f472b6',
};

/**
 * 🪐 Midnight Nebula — deep purple/indigo with cyan stars.
 * Type /set theme nebula or /theme nebula.
 */
const NEBULA: ThemeDefinition = {
  '--color-bg': '#0d0a1a',
  '--color-bg-surface': '#181430',
  '--color-bg-raised': '#221e42',
  '--color-bg-elevated': '#2c2854',
  '--color-bg-dark': '#08060e',
  '--color-bg-dark-hover': '#0f0a20',
  '--color-text': '#dcd4f0',
  '--color-text-secondary': '#a090c4',
  '--color-text-muted': '#706090',
  '--color-text-dim': '#9080b0',
  '--color-text-inverse': '#0e081a',
  '--color-border': '#2a1a4a',
  '--color-border-strong': '#3a2a6a',
  '--color-border-hover': '#5a3a9a',
  '--color-accent': '#818cf8',
  '--color-accent-hover': '#6366f1',
  '--color-accent-light': 'rgba(129, 140, 248, 0.18)',
  '--color-success': '#34d399',
  '--color-success-light': 'rgba(52, 211, 153, 0.18)',
  '--color-warning': '#a78bfa',
  '--color-warning-light': 'rgba(167, 139, 250, 0.18)',
  '--color-error': '#ef4444',
  '--color-error-light': 'rgba(239, 68, 68, 0.18)',
  '--color-info': '#67e8f9',
  '--color-purple': '#a78bfa',
  '--color-pink': '#818cf8',
};

/**
 * 🖥️ Monochrome Matrix — high-contrast green-on-black terminal aesthetic.
 * Type /set theme matrix or /theme matrix.
 */
const MATRIX: ThemeDefinition = {
  '--color-bg': '#000000',
  '--color-bg-surface': '#0a0a0a',
  '--color-bg-raised': '#141414',
  '--color-bg-elevated': '#1e1e1e',
  '--color-bg-dark': '#000000',
  '--color-bg-dark-hover': '#0a0a0a',
  '--color-text': '#00ff41',
  '--color-text-secondary': '#00cc33',
  '--color-text-muted': '#009922',
  '--color-text-dim': '#006611',
  '--color-text-inverse': '#003300',
  '--color-border': '#0a2a0a',
  '--color-border-strong': '#0d3d0d',
  '--color-border-hover': '#1a5a1a',
  '--color-accent': '#00ff41',
  '--color-accent-hover': '#00cc33',
  '--color-accent-light': 'rgba(0, 255, 65, 0.12)',
  '--color-success': '#00ff41',
  '--color-success-light': 'rgba(0, 255, 65, 0.12)',
  '--color-warning': '#ffd700',
  '--color-warning-light': 'rgba(255, 215, 0, 0.12)',
  '--color-error': '#ff0033',
  '--color-error-light': 'rgba(255, 0, 51, 0.12)',
  '--color-info': '#00ff41',
  '--color-purple': '#00ff41',
  '--color-pink': '#00ff41',
};

/** All available themes mapped by name (lowercase, hyphenated) */
export const THEMES: Record<string, ThemeDefinition> = {
  // Primary entries
  dark: DARK,
  'neon-sunset': NEON_SUNSET,
  ocean: OCEAN,
  forest: FOREST,
  sakura: SAKURA,
  nebula: NEBULA,
  matrix: MATRIX,
  // Aliases
  sunset: NEON_SUNSET,
  'ocean-depths': OCEAN,
  'forest-canopy': FOREST,
  bloom: SAKURA,
  'midnight-nebula': NEBULA,
  monochrome: MATRIX,
};

/** List of valid theme names for the terminal /theme command */
export const VALID_THEMES = Object.keys(THEMES).sort();

/**
 * Get the theme definition for a given theme name.
 * Falls back to the dark theme if the name is not recognized.
 */
export function getTheme(name: string): ThemeDefinition {
  const key = name.toLowerCase().replace(/\s+/g, '-');
  return THEMES[key] || DARK;
}

/**
 * Get a friendly help string showing available themes.
 */
export const THEME_HELP = [
  'Available themes (type /theme <name> or /set theme <name>):',
  '  dark             — Midnight Pro (default dark palette)',
  '  neon-sunset      — 🌅 Warm orange/coral on deep navy',
  '  ocean            — 🌊 Cool blue/teal with cyan accents',
  '  forest           — 🌲 Earthy greens with amber accents',
  '  sakura           — 🌸 Soft pink/rose with warm neutrals',
  '  nebula           — 🪐 Deep purple/indigo with cyan highlights',
  '  matrix           — 🖥️ High-contrast green-on-black terminal',
].join('\n');
