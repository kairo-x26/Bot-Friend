import type { SessionResponse, User } from '@bot-friend/shared';
import { create } from 'zustand';
import { KEYS, storage } from './storage';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface SessionState {
  status: Status;
  token: string | null;
  user: User | null;
  expiresAt: string | null;
  guestToken: string | null;
  onboarded: boolean;
  hydrate(): Promise<void>;
  setSession(res: SessionResponse): Promise<void>;
  signOut(opts?: { forgetGuest?: boolean }): Promise<void>;
  setOnboarded(v: boolean): Promise<void>;
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  token: null,
  user: null,
  expiresAt: null,
  guestToken: null,
  onboarded: false,

  async hydrate() {
    const [raw, guestToken, onboarded] = await Promise.all([
      storage.get(KEYS.session),
      storage.get(KEYS.guestToken),
      storage.get(KEYS.onboarded),
    ]);
    let session: Pick<SessionState, 'token' | 'user' | 'expiresAt'> = {
      token: null,
      user: null,
      expiresAt: null,
    };
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { token: string; user: User; expiresAt: string };
        if (new Date(parsed.expiresAt).getTime() > Date.now()) session = parsed;
      } catch {
        // ignore corrupt session
      }
    }
    set({
      ...session,
      guestToken,
      onboarded: onboarded === '1',
      status: session.token ? 'signedIn' : 'signedOut',
    });
  },

  async setSession(res) {
    const value = { token: res.accessToken, user: res.user, expiresAt: res.expiresAt };
    await storage.set(KEYS.session, JSON.stringify(value));
    if (res.guestToken) await storage.set(KEYS.guestToken, res.guestToken);
    if (!res.user.isGuest) await storage.remove(KEYS.guestToken);
    set({
      ...value,
      guestToken: res.user.isGuest ? (res.guestToken ?? get().guestToken) : null,
      status: 'signedIn',
    });
  },

  async signOut({ forgetGuest = false } = {}) {
    await storage.remove(KEYS.session);
    if (forgetGuest) await storage.remove(KEYS.guestToken);
    set({
      token: null,
      user: null,
      expiresAt: null,
      status: 'signedOut',
      guestToken: forgetGuest ? null : get().guestToken,
    });
  },

  async setOnboarded(v) {
    if (v) await storage.set(KEYS.onboarded, '1');
    else await storage.remove(KEYS.onboarded);
    set({ onboarded: v });
  },
}));
