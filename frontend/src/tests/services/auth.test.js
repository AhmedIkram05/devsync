import { authApi } from '../../services/utils/auth';

const buildResponse = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: jest.fn().mockResolvedValue(payload),
});

describe('authApi', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.clear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  test('register persists sanitized profile without tokens', async () => {
    global.fetch.mockResolvedValue(
      buildResponse({
        user: { id: 1, email: 'new@example.com', role: 'developer', token: 'should-be-stripped' },
      })
    );

    const response = await authApi.register({
      name: 'New User',
      email: 'new@example.com',
      password: 'password123',
      role: 'developer',
    });

    expect(response.user.id).toBe(1);
    const stored = JSON.parse(localStorage.getItem('user'));
    expect(stored.email).toBe('new@example.com');
    expect(stored.token).toBeUndefined();
    expect(stored.access_token).toBeUndefined();
  });

  test('login stores profile only and strips tokens from response', async () => {
    global.fetch.mockResolvedValue(
      buildResponse({
        user: {
          id: 7,
          email: 'dev@example.com',
          role: 'developer',
          github_connected: false,
          token: 'leaked-access',
          refresh_token: 'leaked-refresh',
        },
      })
    );

    const response = await authApi.login({ email: 'dev@example.com', password: 'password123' });

    expect(response.user.id).toBe(7);
    expect(response.user.token).toBeUndefined();
    const stored = JSON.parse(localStorage.getItem('user'));
    expect(stored.token).toBeUndefined();
    expect(stored.refresh_token).toBeUndefined();
    expect(stored.github_connected).toBe(false);
  });

  test('logout clears user storage even when API call fails', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 1, email: 'a@example.com' }));
    global.fetch.mockResolvedValue(buildResponse({ message: 'boom' }, 500));

    await expect(authApi.logout()).rejects.toThrow('boom');
    expect(localStorage.getItem('user')).toBeNull();
  });

  test('getCurrentUser returns null and clears corrupted localStorage payloads', () => {
    localStorage.setItem('user', '{invalid-json');

    const user = authApi.getCurrentUser();

    expect(user).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  test('getCurrentUser rejects incomplete user payloads', () => {
    localStorage.setItem('user', JSON.stringify({ id: 1 }));

    const user = authApi.getCurrentUser();

    expect(user).toBeNull();
  });

  test('getCurrentUser strips legacy tokens on read', () => {
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 2, email: 'legacy@example.com', role: 'developer', token: 'old-jwt' })
    );

    const user = authApi.getCurrentUser();

    expect(user.token).toBeUndefined();
    expect(JSON.parse(localStorage.getItem('user')).token).toBeUndefined();
  });

  test('verifySession persists server profile and returns user plus exp', async () => {
    global.fetch.mockResolvedValue(
      buildResponse({
        user: { id: 4, email: 'me@example.com', role: 'developer', github_connected: true },
        exp: 9999999999,
      })
    );

    const session = await authApi.verifySession();

    expect(session.user.id).toBe(4);
    expect(session.exp).toBe(9999999999);
    const stored = JSON.parse(localStorage.getItem('user'));
    expect(stored.id).toBe(4);
    expect(stored.exp).toBe(9999999999);
    expect(global.fetch.mock.calls[0][0]).toContain('/auth/me');
    expect(global.fetch.mock.calls[0][1].credentials).toBe('include');
  });

  test('refreshToken rotates cookies then reloads profile via /me', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 4, email: 'refresh@example.com' }));
    global.fetch
      .mockResolvedValueOnce(buildResponse({ message: 'Token refreshed successfully' }))
      .mockResolvedValueOnce(
        buildResponse({
          user: { id: 4, email: 'refresh@example.com', role: 'developer' },
          exp: 9999999999,
        })
      );

    const user = await authApi.refreshToken();

    expect(user.id).toBe(4);
    expect(user.token).toBeUndefined();
    expect(global.fetch.mock.calls[0][0]).toContain('/auth/refresh');
    expect(global.fetch.mock.calls[1][0]).toContain('/auth/me');
  });

  test('refreshToken clears localStorage on unauthorized failures', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 4, email: 'refresh@example.com' }));
    global.fetch.mockResolvedValue(buildResponse({ message: 'expired' }, 401));

    await expect(authApi.refreshToken()).rejects.toThrow('expired');
    expect(localStorage.getItem('user')).toBeNull();
  });

  test('isTokenExpired uses profile exp when present, false otherwise', () => {
    expect(authApi.isTokenExpired()).toBe(true);

    localStorage.setItem('user', JSON.stringify({ id: 2, email: 'x@example.com', exp: 50 }));
    jest.spyOn(Date, 'now').mockReturnValue(60 * 1000);
    expect(authApi.isTokenExpired()).toBe(true);

    localStorage.setItem('user', JSON.stringify({ id: 2, email: 'x@example.com', exp: 10000 }));
    expect(authApi.isTokenExpired()).toBe(false);

    localStorage.setItem('user', JSON.stringify({ id: 2, email: 'x@example.com' }));
    expect(authApi.isTokenExpired()).toBe(false);
  });

  test('updateGitHubStatus updates current user and handles missing user state', () => {
    localStorage.setItem('user', JSON.stringify({ id: 8, email: 'gh@example.com' }));

    const updated = authApi.updateGitHubStatus(true, 'octocat');
    const stored = JSON.parse(localStorage.getItem('user'));

    expect(updated.github_connected).toBe(true);
    expect(stored.github_username).toBe('octocat');

    localStorage.clear();
    expect(authApi.updateGitHubStatus(true, 'octocat')).toBeNull();
  });
});
