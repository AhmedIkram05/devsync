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

  test('register persists user from response', async () => {
    global.fetch.mockResolvedValue(
      buildResponse({
        user: { id: 1, email: 'new@example.com', token: 'token-1' },
      })
    );

    const response = await authApi.register({
      name: 'New User',
      email: 'new@example.com',
      password: 'password123',
      role: 'client',
    });

    expect(response.user.id).toBe(1);
    expect(JSON.parse(localStorage.getItem('user')).email).toBe('new@example.com');
  });

  test('login stores merged token from top-level token field', async () => {
    global.fetch.mockResolvedValue(
      buildResponse({
        token: 'access-123',
        user: {
          id: 7,
          email: 'dev@example.com',
          role: 'developer',
          github_connected: false,
        },
      })
    );

    const response = await authApi.login({ email: 'dev@example.com', password: 'password123' });

    expect(response.user.token).toBe('access-123');
    expect(JSON.parse(localStorage.getItem('user')).token).toBe('access-123');
  });

  test('login falls back to token nested inside user', async () => {
    global.fetch.mockResolvedValue(
      buildResponse({
        user: {
          id: 7,
          email: 'dev@example.com',
          role: 'developer',
          token: 'nested-token',
          github_username: 'octocat',
        },
      })
    );

    const response = await authApi.login({ email: 'dev@example.com', password: 'password123' });

    expect(response.user.token).toBe('nested-token');
    expect(response.user.github_username).toBe('octocat');
  });

  test('logout clears user storage even when API call fails', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 1, email: 'a@example.com', token: 'token' }));
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

  test('refreshToken updates stored token and returns updated user', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 4, email: 'refresh@example.com', token: 'old' }));
    global.fetch.mockResolvedValue(buildResponse({ token: 'new-token' }));

    const user = await authApi.refreshToken();

    expect(user.token).toBe('new-token');
    expect(JSON.parse(localStorage.getItem('user')).token).toBe('new-token');
  });

  test('refreshToken clears localStorage on unauthorized failures', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 4, email: 'refresh@example.com', token: 'old' }));
    global.fetch.mockResolvedValue(buildResponse({ message: 'expired' }, 401));

    await expect(authApi.refreshToken()).rejects.toThrow('expired');
    expect(localStorage.getItem('user')).toBeNull();
  });

  test('isTokenExpired handles missing token and expiration windows', () => {
    expect(authApi.isTokenExpired()).toBe(true);

    localStorage.setItem('user', JSON.stringify({ id: 2, email: 'x@example.com', token: 'token', exp: 50 }));
    jest.spyOn(Date, 'now').mockReturnValue(60 * 1000);
    expect(authApi.isTokenExpired()).toBe(true);

    localStorage.setItem('user', JSON.stringify({ id: 2, email: 'x@example.com', token: 'token', exp: 10000 }));
    expect(authApi.isTokenExpired()).toBe(false);
  });

  test('updateGitHubStatus updates current user and handles missing user state', () => {
    localStorage.setItem('user', JSON.stringify({ id: 8, email: 'gh@example.com', token: 'token' }));

    const updated = authApi.updateGitHubStatus(true, 'octocat');
    const stored = JSON.parse(localStorage.getItem('user'));

    expect(updated.github_connected).toBe(true);
    expect(stored.github_username).toBe('octocat');

    localStorage.clear();
    expect(authApi.updateGitHubStatus(true, 'octocat')).toBeNull();
  });
});
