import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth';
import { moderatorMe } from '../test/fixtures';
import { mockFetch } from '../test/mockFetch';
import { Login } from './Login';

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('Login', () => {
  it('signs in with dev email and stores the token for this tab only', async () => {
    const calls = mockFetch({
      'POST /v1/auth/session': () => ({
        json: { accessToken: 'tok-1', expiresAt: '2030-01-01T00:00:00Z', user: moderatorMe.user },
      }),
      'GET /v1/me': () => ({ json: moderatorMe }),
    });
    render(
      <AuthProvider>
        <Login />
      </AuthProvider>,
    );
    await userEvent.type(screen.getByLabelText('Work email'), 'mod@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await vi.waitFor(() => expect(sessionStorage.getItem('bf.admin.token')).toBe('tok-1'));
    expect(calls.find((c) => c.path === '/v1/me')?.auth).toBe('Bearer tok-1');
  });

  it('rejects accounts without a moderator role', async () => {
    mockFetch({
      'POST /v1/auth/session': () => ({
        json: {
          accessToken: 'tok-2',
          expiresAt: '2030-01-01T00:00:00Z',
          user: { ...moderatorMe.user, role: 'user' },
        },
      }),
      'GET /v1/me': () => ({
        json: { ...moderatorMe, user: { ...moderatorMe.user, role: 'user' } },
      }),
    });
    render(
      <AuthProvider>
        <Login />
      </AuthProvider>,
    );
    await userEvent.type(screen.getByLabelText('Work email'), 'user@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('doesn’t have moderator access');
    expect(sessionStorage.getItem('bf.admin.token')).toBeNull();
  });

  it('explains when email sign-in is disabled', async () => {
    mockFetch({
      'POST /v1/auth/session': () => ({
        status: 404,
        json: { error: { code: 'feature_disabled', message: 'Dev login is disabled' } },
      }),
    });
    render(
      <AuthProvider>
        <Login />
      </AuthProvider>,
    );
    await userEvent.type(screen.getByLabelText('Work email'), 'a@b.co');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Use an access token instead');
  });
});
