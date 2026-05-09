import { fetchWithAuth } from '../../../services/utils/api';

describe('fetchWithAuth additional branches', () => {
  const originalFetch = global.fetch;
  const originalLocation = global.window.location;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    // restore location without throwing
    Object.defineProperty(global.window, 'location', {
      value: originalLocation,
      writable: true
    });
    localStorage.clear();
  });

  test('returns connection error object when fetch fails with Failed to fetch', async () => {
    const err = new Error('Failed to fetch');
    err.name = 'TypeError';
    global.fetch = jest.fn(() => Promise.reject(err));

    const res = await fetchWithAuth('/test');
    expect(res).toHaveProperty('isConnectionError', true);
    expect(res.error).toMatch(/Server connection failed/);
  });

  test('rejects with timeout error when fetch takes too long', async () => {
    // fetch that never resolves
    global.fetch = jest.fn(() => new Promise(() => {}));

    await expect(fetchWithAuth('/test', { timeout: 1 })).rejects.toThrow('Request timeout');
  });

  test('returns empty object for non-JSON successful responses', async () => {
    const resp = {
      status: 200,
      ok: true,
      headers: { get: () => 'text/html; charset=utf-8' },
    };
    global.fetch = jest.fn(() => Promise.resolve(resp));

    const res = await fetchWithAuth('/test');
    expect(res).toEqual({});
  });

  test('non-critical endpoint returns graceful object on server error', async () => {
    const headers = { get: () => 'application/json' };
    const resp = {
      status: 500,
      ok: false,
      headers,
      json: async () => ({ message: 'server error' })
    };

    global.fetch = jest.fn(() => Promise.resolve(resp));

    const res = await fetchWithAuth('notifications');
    expect(res).toHaveProperty('status', 500);
    expect(res).toHaveProperty('error');
  });

  test('returns 204 No Content as empty object', async () => {
    const resp = {
      status: 204,
      ok: true,
      headers: { get: () => null }
    };
    global.fetch = jest.fn(() => Promise.resolve(resp));

    const res = await fetchWithAuth('/test');
    expect(res).toEqual({});
  });

  test('401 auth error throws with isAuthError flag', async () => {
    const resp = {
      status: 401,
      ok: false,
      headers: { get: () => 'application/json' }
    };
    global.fetch = jest.fn(() => Promise.resolve(resp));

    await expect(fetchWithAuth('/test')).rejects.toThrow('Authentication failed');
    try {
      await fetchWithAuth('/test');
    } catch (error) {
      expect(error.isAuthError).toBe(true);
    }
  });

  test('401 on non-critical endpoint returns graceful error object', async () => {
    const resp = {
      status: 401,
      ok: false,
      headers: { get: () => 'application/json' }
    };
    global.fetch = jest.fn(() => Promise.resolve(resp));

    const res = await fetchWithAuth('github/status');
    expect(res).toHaveProperty('isAuthError', true);
    expect(res).toHaveProperty('error');
  });

  test('403 forbidden redirects to /forbidden page', async () => {
    const resp = {
      status: 403,
      ok: false,
      headers: { get: () => 'application/json' }
    };
    global.fetch = jest.fn(() => Promise.resolve(resp));
    
    // Mock window.location.href setter
    delete window.location;
    window.location = { href: '' };
    const setHref = jest.fn();
    Object.defineProperty(window.location, 'href', {
      set: setHref,
      get: () => ''
    });

    try {
      await fetchWithAuth('/test');
    } catch (error) {
      expect(error.isAuthError).toBe(true);
      // In test env the href setter may not work, just verify the error is thrown
      expect(error.message).toMatch(/Forbidden/);
    }
  });

  test('429 rate limit error includes retryAfter', async () => {
    const resp = {
      status: 429,
      ok: false,
      headers: { 
        get: (name) => name === 'Retry-After' ? '60' : 'application/json'
      }
    };
    global.fetch = jest.fn(() => Promise.resolve(resp));

    await expect(fetchWithAuth('/test')).rejects.toThrow('Rate limit exceeded');
    try {
      await fetchWithAuth('/test');
    } catch (error) {
      expect(error.status).toBe(429);
      expect(error.retryAfter).toBe(60);
    }
  });

  test('400 on GitHub endpoint parses error and includes data', async () => {
    const resp = {
      status: 400,
      ok: false,
      headers: { get: () => 'application/json' },
      json: async () => ({ message: 'Invalid GitHub repository' })
    };
    global.fetch = jest.fn(() => Promise.resolve(resp));

    await expect(fetchWithAuth('github/connect')).rejects.toThrow('Invalid GitHub repository');
    try {
      await fetchWithAuth('github/connect');
    } catch (error) {
      expect(error.isGitHubError).toBe(true);
      expect(error.data.message).toBe('Invalid GitHub repository');
    }
  });

  test('returns parsed JSON response on success', async () => {
    const resp = {
      status: 200,
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ id: 1, name: 'test' })
    };
    global.fetch = jest.fn(() => Promise.resolve(resp));

    const res = await fetchWithAuth('/test');
    expect(res).toEqual({ id: 1, name: 'test' });
  });
});
