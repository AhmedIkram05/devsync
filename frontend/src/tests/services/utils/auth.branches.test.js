import * as authApi from '../../../services/utils/auth';

describe('auth.js utility functions', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('fetchWrapper branch coverage', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    test('fetchWrapper handles successful JSON response', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: 'test' })
        })
      );

      // Test via register which uses fetchWrapper
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { id: 1, email: 'test@test.com', token: 'abc' } })
        })
      );

      const result = await authApi.authApi.register({ email: 'test@test.com', password: 'pass' });
      expect(result.user).toBeDefined();
      expect(localStorage.getItem('user')).toBeTruthy();
    });

    test('fetchWrapper handles JSON parse failure by returning empty object', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.reject(new Error('JSON parse failed'))
        })
      );

      const result = await authApi.authApi.register({ email: 'test@test.com', password: 'pass' });
      // When JSON parse fails but response is ok, it returns empty object
      expect(result).toEqual({});
      expect(localStorage.getItem('user')).toBeNull();
    });

    test('fetchWrapper throws error on non-ok response with message', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ message: 'Invalid credentials' })
        })
      );

      await expect(
        authApi.authApi.login({ email: 'test@test.com', password: 'wrong' })
      ).rejects.toThrow('Invalid credentials');
    });

    test('fetchWrapper throws error on non-ok response without message', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({})
        })
      );

      await expect(
        authApi.authApi.login({ email: 'test@test.com', password: 'wrong' })
      ).rejects.toThrow('API request failed');
    });

    test('fetchWrapper attaches error data and status', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ message: 'Bad request', field: 'email' })
        })
      );

      try {
        await authApi.authApi.login({ email: 'invalid', password: 'pass' });
      } catch (error) {
        expect(error.status).toBe(400);
        expect(error.data.field).toBe('email');
      }
    });
  });

  describe('register branch coverage', () => {
    test('register stores user on success', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { id: 1, email: 'new@test.com', token: 'abc' } })
        })
      );

      const result = await authApi.authApi.register({ email: 'new@test.com', password: 'pass123' });
      expect(result.user.id).toBe(1);
      expect(JSON.parse(localStorage.getItem('user')).email).toBe('new@test.com');
    });

    test('register throws on error and logs', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ message: 'Email already exists' })
        })
      );

      await expect(
        authApi.authApi.register({ email: 'existing@test.com', password: 'pass' })
      ).rejects.toThrow('Email already exists');
    });

    test('register handles response without user object', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        })
      );

      const result = await authApi.authApi.register({ email: 'test@test.com', password: 'pass' });
      expect(result.success).toBe(true);
      expect(localStorage.getItem('user')).toBeNull();
    });
  });

  describe('login branch coverage', () => {
    test('login stores user with token from data.token', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            user: { id: 1, email: 'user@test.com' },
            token: 'token-abc'
          })
        })
      );

      const result = await authApi.authApi.login({ email: 'user@test.com', password: 'pass' });
      const stored = JSON.parse(localStorage.getItem('user'));
      expect(stored.token).toBe('token-abc');
      expect(stored.github_connected).toBe(false);
    });

    test('login stores user with token from data.user.token', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            user: { id: 1, email: 'user@test.com', token: 'nested-token' }
          })
        })
      );

      const result = await authApi.authApi.login({ email: 'user@test.com', password: 'pass' });
      const stored = JSON.parse(localStorage.getItem('user'));
      expect(stored.token).toBe('nested-token');
    });

    test('login includes github_connected and github_username in stored user', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            user: {
              id: 1,
              email: 'user@test.com',
              token: 'abc',
              github_connected: true,
              github_username: 'johndoe'
            }
          })
        })
      );

      await authApi.authApi.login({ email: 'user@test.com', password: 'pass' });
      const stored = JSON.parse(localStorage.getItem('user'));
      expect(stored.github_connected).toBe(true);
      expect(stored.github_username).toBe('johndoe');
    });

    test('login handles missing user object in response', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        })
      );

      const result = await authApi.authApi.login({ email: 'user@test.com', password: 'pass' });
      expect(result.success).toBe(true);
      expect(localStorage.getItem('user')).toBeNull();
    });

    test('login throws on fetch error', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ message: 'Invalid credentials' })
        })
      );

      await expect(
        authApi.authApi.login({ email: 'user@test.com', password: 'wrong' })
      ).rejects.toThrow();
    });
  });

  describe('logout branch coverage', () => {
    test('logout clears localStorage on success', async () => {
      localStorage.setItem('user', JSON.stringify({ id: 1, email: 'test@test.com' }));

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        })
      );

      const result = await authApi.authApi.logout();
      expect(result.success).toBe(true);
      expect(localStorage.getItem('user')).toBeNull();
    });

    test('logout clears localStorage even on fetch error', async () => {
      localStorage.setItem('user', JSON.stringify({ id: 1, email: 'test@test.com' }));

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ message: 'Logout failed' })
        })
      );

      await expect(authApi.authApi.logout()).rejects.toThrow();
      expect(localStorage.getItem('user')).toBeNull();
    });
  });

  describe('getCurrentUser branch coverage', () => {
    test('getCurrentUser returns null when no user in localStorage', () => {
      const user = authApi.authApi.getCurrentUser();
      expect(user).toBeNull();
    });

    test('getCurrentUser returns parsed user object', () => {
      const userData = { id: 1, email: 'test@test.com', name: 'Test User' };
      localStorage.setItem('user', JSON.stringify(userData));

      const user = authApi.authApi.getCurrentUser();
      expect(user.id).toBe(1);
      expect(user.email).toBe('test@test.com');
    });

    test('getCurrentUser returns null for incomplete user (missing id)', () => {
      localStorage.setItem('user', JSON.stringify({ email: 'test@test.com' }));
      const user = authApi.authApi.getCurrentUser();
      expect(user).toBeNull();
    });

    test('getCurrentUser returns null for incomplete user (missing email)', () => {
      localStorage.setItem('user', JSON.stringify({ id: 1 }));
      const user = authApi.authApi.getCurrentUser();
      expect(user).toBeNull();
    });

    test('getCurrentUser handles corrupted JSON', () => {
      localStorage.setItem('user', 'not valid json');
      const user = authApi.authApi.getCurrentUser();
      expect(user).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
    });

    test('getCurrentUser returns null for null user object', () => {
      localStorage.setItem('user', JSON.stringify(null));
      const user = authApi.authApi.getCurrentUser();
      expect(user).toBeNull();
    });
  });

  describe('refreshToken branch coverage', () => {
    test('refreshToken updates user token on success', async () => {
      const currentUser = { id: 1, email: 'test@test.com', token: 'old-token' };
      localStorage.setItem('user', JSON.stringify(currentUser));

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token: 'new-token' })
        })
      );

      const result = await authApi.authApi.refreshToken();
      expect(result.token).toBe('new-token');
      expect(JSON.parse(localStorage.getItem('user')).token).toBe('new-token');
    });

    test('refreshToken uses access_token if token not present', async () => {
      const currentUser = { id: 1, email: 'test@test.com', token: 'old-token' };
      localStorage.setItem('user', JSON.stringify(currentUser));

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ access_token: 'new-access-token' })
        })
      );

      const result = await authApi.authApi.refreshToken();
      expect(result.token).toBe('new-access-token');
    });

    test('refreshToken throws when no current user', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token: 'new-token' })
        })
      );

      await expect(authApi.authApi.refreshToken()).rejects.toThrow(
        'Failed to refresh token - no authenticated user'
      );
    });

    test('refreshToken throws when no token in response', async () => {
      const currentUser = { id: 1, email: 'test@test.com', token: 'old' };
      localStorage.setItem('user', JSON.stringify(currentUser));

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({})
        })
      );

      await expect(authApi.authApi.refreshToken()).rejects.toThrow(
        'Failed to refresh token - no token in response'
      );
      expect(localStorage.getItem('user')).toBeNull();
    });

    test('refreshToken clears user on 401 error', async () => {
      const currentUser = { id: 1, email: 'test@test.com', token: 'old' };
      localStorage.setItem('user', JSON.stringify(currentUser));

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ message: 'Unauthorized' })
        })
      );

      await expect(authApi.authApi.refreshToken()).rejects.toThrow();
      expect(localStorage.getItem('user')).toBeNull();
    });

    test('refreshToken does not clear user on non-401 error', async () => {
      const currentUser = { id: 1, email: 'test@test.com', token: 'old' };
      localStorage.setItem('user', JSON.stringify(currentUser));

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ message: 'Server error' })
        })
      );

      await expect(authApi.authApi.refreshToken()).rejects.toThrow();
      expect(localStorage.getItem('user')).toBeTruthy();
    });
  });

  describe('isTokenExpired branch coverage', () => {
    test('isTokenExpired returns true when no user', () => {
      const isExpired = authApi.authApi.isTokenExpired();
      expect(isExpired).toBe(true);
    });

    test('isTokenExpired returns true when no token', () => {
      localStorage.setItem('user', JSON.stringify({ id: 1, email: 'test@test.com' }));
      const isExpired = authApi.authApi.isTokenExpired();
      expect(isExpired).toBe(true);
    });

    test('isTokenExpired returns false when token not expired', () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      localStorage.setItem('user', JSON.stringify({
        id: 1,
        email: 'test@test.com',
        token: 'abc',
        exp: futureTime
      }));

      const isExpired = authApi.authApi.isTokenExpired();
      expect(isExpired).toBe(false);
    });

    test('isTokenExpired returns true when token expired', () => {
      const pastTime = Math.floor(Date.now() / 1000) - 600; // 10 min ago
      localStorage.setItem('user', JSON.stringify({
        id: 1,
        email: 'test@test.com',
        token: 'abc',
        exp: pastTime
      }));

      const isExpired = authApi.authApi.isTokenExpired();
      expect(isExpired).toBe(true);
    });

    test('isTokenExpired returns true when token expires in < 5 min', () => {
      const soonExpireTime = Math.floor(Date.now() / 1000) + 200; // 3.3 min
      localStorage.setItem('user', JSON.stringify({
        id: 1,
        email: 'test@test.com',
        token: 'abc',
        exp: soonExpireTime
      }));

      const isExpired = authApi.authApi.isTokenExpired();
      expect(isExpired).toBe(true);
    });

    test('isTokenExpired returns false when no exp field', () => {
      localStorage.setItem('user', JSON.stringify({
        id: 1,
        email: 'test@test.com',
        token: 'abc'
      }));

      const isExpired = authApi.authApi.isTokenExpired();
      expect(isExpired).toBe(false);
    });

    test('isTokenExpired handles parse error gracefully', () => {
      localStorage.setItem('user', 'invalid json');
      const isExpired = authApi.authApi.isTokenExpired();
      expect(isExpired).toBe(true);
    });
  });

  describe('updateGitHubStatus branch coverage', () => {
    test('updateGitHubStatus updates existing user', () => {
      const user = { id: 1, email: 'test@test.com', token: 'abc' };
      localStorage.setItem('user', JSON.stringify(user));

      const updated = authApi.authApi.updateGitHubStatus(true, 'johndoe');
      expect(updated.github_connected).toBe(true);
      expect(updated.github_username).toBe('johndoe');
      expect(JSON.parse(localStorage.getItem('user')).github_connected).toBe(true);
    });

    test('updateGitHubStatus disconnects GitHub', () => {
      const user = { id: 1, email: 'test@test.com', github_connected: true, github_username: 'old' };
      localStorage.setItem('user', JSON.stringify(user));

      const updated = authApi.authApi.updateGitHubStatus(false);
      expect(updated.github_connected).toBe(false);
    });

    test('updateGitHubStatus preserves existing username when not provided', () => {
      const user = { id: 1, email: 'test@test.com', github_username: 'existing' };
      localStorage.setItem('user', JSON.stringify(user));

      const updated = authApi.authApi.updateGitHubStatus(true);
      expect(updated.github_username).toBe('existing');
    });

    test('updateGitHubStatus returns null when no user', () => {
      const result = authApi.authApi.updateGitHubStatus(true, 'user');
      expect(result).toBeNull();
    });

    test('updateGitHubStatus sets empty string for username default', () => {
      const user = { id: 1, email: 'test@test.com' };
      localStorage.setItem('user', JSON.stringify(user));

      const updated = authApi.authApi.updateGitHubStatus(true, '');
      expect(updated.github_username).toBe('');
    });
  });
});
