/**
 * UserProfile — Learning Layer
 * =============================
 * 
 * Stores user preferences, style tags, and feedback history
 * so the app learns and improves over time.
 * 
 * Persisted to localStorage with optional backend sync.
 */

import axios from 'axios';

// ─── Types ───────────────────────────────────────────────────────────────

export interface ProjectSummary {
  id: string;
  name: string;
  nodeCount: number;
  timestamp: string;
  styleTags: string[];
  rating?: number;
}

export interface UserProfile {
  username: string;
  preferences: {
    uiTheme: 'dark' | 'light' | 'auto';
    componentLibrary: 'tailwind' | 'bootstrap' | 'vanilla' | 'auto';
    codeStyle: 'verbose' | 'concise' | 'balanced';
    preferredLanguages: string[];
    framework: string;
    os: string;
  };
  styleTags: Record<string, number>; // tag → frequency counter
  history: {
    projects: ProjectSummary[];
    feedbackEntries: { projectId: string; rating: number; comment: string; timestamp: string }[];
  };
  emotionalHistory: {
    dominantEmotions: Record<string, number>;
    lastValence: number;
    lastArousal: number;
  };
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'vaia-user-profile';

const DEFAULT_PROFILE: UserProfile = {
  username: 'default',
  preferences: {
    uiTheme: 'dark',
    componentLibrary: 'auto',
    codeStyle: 'balanced',
    preferredLanguages: ['typescript', 'python'],
    framework: 'react',
    os: 'linux',
  },
  styleTags: {},
  history: {
    projects: [],
    feedbackEntries: [],
  },
  emotionalHistory: {
    dominantEmotions: {},
    lastValence: 0,
    lastArousal: 0,
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ─── Storage ─────────────────────────────────────────────────────────────

function loadProfile(): UserProfile {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && parsed.preferences && parsed.styleTags !== undefined) {
        return { ...DEFAULT_PROFILE, ...parsed };
      }
    }
  } catch {}
  return { ...DEFAULT_PROFILE };
}

function saveProfile(profile: UserProfile): void {
  try {
    profile.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {}
}

// ─── Proxy for automatic persistence ─────────────────────────────────────

const _profile: { current: UserProfile } = { current: loadProfile() };

function persist(): UserProfile {
  saveProfile(_profile.current);
  return _profile.current;
}

// ─── Public API ──────────────────────────────────────────────────────────

export const userProfile = {
  /** Get the full profile */
  get(): UserProfile {
    return { ..._profile.current };
  },

  /** Reset to defaults */
  reset(): UserProfile {
    _profile.current = { ...DEFAULT_PROFILE, createdAt: new Date().toISOString() };
    return persist();
  },

  /** Update preference values (partial merge) */
  updatePreferences(prefs: Partial<UserProfile['preferences']>): UserProfile {
    _profile.current.preferences = { ..._profile.current.preferences, ...prefs };
    return persist();
  },

  /** Record a style tag preference (increments counter) */
  recordStyleTag(tag: string): void {
    const tags = _profile.current.styleTags;
    tags[tag] = (tags[tag] || 0) + 1;
    persist();
  },

  /** Get top N style tags by frequency */
  getTopStyleTags(n: number = 5): string[] {
    return Object.entries(_profile.current.styleTags)
      .sort(([, a], [, b]) => b - a)
      .slice(0, n)
      .map(([tag]) => tag);
  },

  /** Record a project completion */
  recordProject(project: Omit<ProjectSummary, 'timestamp'>): void {
    _profile.current.history.projects.push({
      ...project,
      timestamp: new Date().toISOString(),
    });
    persist();
  },

  /** Record feedback on a generated project */
  recordFeedback(projectId: string, rating: number, comment: string = ''): void {
    _profile.current.history.feedbackEntries.push({
      projectId,
      rating,
      comment,
      timestamp: new Date().toISOString(),
    });
    persist();
  },

  /** Record emotional state after an interaction */
  recordEmotion(dominant: string, valence: number, arousal: number): void {
    const emotions = _profile.current.emotionalHistory.dominantEmotions;
    emotions[dominant] = (emotions[dominant] || 0) + 1;
    _profile.current.emotionalHistory.lastValence = valence;
    _profile.current.emotionalHistory.lastArousal = arousal;
    persist();
  },

  /** Get style suggestions for a new project based on past preferences */
  getStyleSuggestions(): { tags: string[]; preferredFramework: string; preferredTheme: string } {
    const p = _profile.current;
    return {
      tags: this.getTopStyleTags(5),
      preferredFramework: p.preferences.framework,
      preferredTheme: p.preferences.uiTheme,
    };
  },

  /** Check if user is frustrated based on recent emotional history */
  isFrustrated(): boolean {
    const p = _profile.current.emotionalHistory;
    return p.lastValence < -0.2 && p.lastArousal > 0.5;
  },

  /** Sync profile to backend (fire-and-forget) */
  syncToBackend(): void {
    try {
      axios.post('/api/user/profile', _profile.current).catch(() => {});
    } catch {}
  },
};
