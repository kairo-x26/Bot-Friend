import type { SessionResponse } from '@bot-friend/shared';
import { useState, type FormEvent } from 'react';
import { AdminApiError, request } from '../api';
import { useAuth } from '../auth';

export function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [useToken, setUseToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (useToken) {
        await signIn(token.trim());
      } else {
        const session = await request<SessionResponse>('POST', '/v1/auth/session', {
          provider: 'dev',
          email: email.trim(),
          ageConfirmed: true,
        });
        await signIn(session.accessToken);
      }
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.code === 'feature_disabled'
            ? 'Email sign-in is off on this server. Use an access token instead.'
            : err.message
          : 'Sign-in failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form onSubmit={submit} aria-labelledby="login-title">
        <div className="brand">
          <span className="brand-dot" aria-hidden /> Bot-Friend
        </div>
        <h1 id="login-title">Moderation sign-in</h1>
        <p className="muted">For the safety and support team. Every report you open is logged.</p>
        {error ? (
          <div className="error" role="alert">
            {error}
          </div>
        ) : null}
        {useToken ? (
          <label>
            Access token
            <textarea value={token} onChange={(e) => setToken(e.target.value)} required autoComplete="off" />
          </label>
        ) : (
          <label>
            Work email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
        )}
        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <button type="button" className="link" onClick={() => setUseToken((v) => !v)}>
          {useToken ? 'Use email instead' : 'Use an access token'}
        </button>
      </form>
    </div>
  );
}
