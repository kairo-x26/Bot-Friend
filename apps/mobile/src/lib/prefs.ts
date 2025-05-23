import type { Preferences } from '@bot-friend/shared';
import { create } from 'zustand';
import { KEYS, storage } from './storage';

export const DEFAULT_PREFS: Preferences = {
  comedyStyle: 'wholesome',
  energy: 'medium',
  humorBoundaries: [],
  roastOptIn: false,
  theme: 'system',
  reducedMotion: false,
  largeText: false,
  hapticsEnabled: true,
  mascotColor: 'violet',
  mascotAccessory: 'none',
  locale: 'en-US',
  memoryEnabled: false,
  remindersEnabled: false,
  reminderHour: null,
};

interface PrefsState {
  prefs: Preferences;
  /** Replace with the server copy (after sign-in or a refetch). */
  hydrate(prefs: Preferences): void;
  /** Local optimistic update; callers persist to the server separately. */
  patch(patch: Partial<Preferences>): void;
  loadLocal(): Promise<void>;
}

/**
 * Preferences are needed before sign-in (theme, motion, the personality picked
 * during onboarding), so a copy lives locally and is pushed to the API later.
 */
export const usePrefs = create<PrefsState>((set, get) => ({
  prefs: DEFAULT_PREFS,
  hydrate(prefs) {
    set({ prefs });
    void storage.set(KEYS.localPrefs, JSON.stringify(prefs));
  },
  patch(patch) {
    const prefs = { ...get().prefs, ...patch };
    set({ prefs });
    void storage.set(KEYS.localPrefs, JSON.stringify(prefs));
  },
  async loadLocal() {
    const raw = await storage.get(KEYS.localPrefs);
    if (!raw) return;
    try {
      set({ prefs: { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Preferences>) } });
    } catch {
      // corrupted local copy; defaults are fine
    }
  },
}));
