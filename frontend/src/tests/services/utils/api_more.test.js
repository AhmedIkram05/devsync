import { fetchWithAuth } from '../../../services/utils/api';

describe('fetchWithAuth additional branches', () => {
  const originalFetch = global.fetch;
  const originalLocation = window.location;

  beforeEach(() => {
    delete window.location;
    window.location = { href: '' };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.location = originalLocation;
    jest.clearAllMocks();
    localStorage.clear();
  });

  test('handles 400 GitHub endpoint with JSON error', async () => {
    const body = { message: 'bad request' };
    global.fetch = jest.fn(() => Promise.resolve({
      status: 400,
      headers: { get: () => 'application/json' },
      ok: false,
      json: () => Promise.resolve(body)
    }));

    await expect(fetchWithAuth('/github/callback')).rejects.toMatchObject({ isGitHubError: true });
  });

  test('403 throws typed error without assigning window.location', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ status: 403, headers: { get: () => 'application/json' }, ok: false }));
    const beforeHref = window.location.href;
    await expect(fetchWithAuth('/some-endpoint')).rejects.toMatchObject({
      status: 403,
      isForbidden: true,
      redirectTo: '/forbidden',
    });
    // Navigation is the caller's job (ProtectedRoute useNavigate), not fetch's.
    expect(window.location.href).toBe(beforeHref);
  });

  test('non-json error response returns graceful non-critical object', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ status: 500, headers: { get: () => null }, ok: false, text: () => Promise.resolve('err') }));
    await expect(fetchWithAuth('/notifications')).resolves.toMatchObject({ error: expect.any(String) });
  });
});
