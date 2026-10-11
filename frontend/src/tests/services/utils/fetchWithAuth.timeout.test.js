import { fetchWithAuth } from '../../../services/api/client';

describe('fetchWithAuth timeout + 403 navigation', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    jest.useRealTimers();
    localStorage.clear();
  });

  test('abort fires on timeout via AbortController signal', async () => {
    jest.useFakeTimers();
    let capturedSignal;
    global.fetch = jest.fn((url, options = {}) => {
      capturedSignal = options.signal;
      return new Promise((resolve, reject) => {
        capturedSignal?.addEventListener('abort', () => {
          const abortError = new Error('The operation was aborted.');
          abortError.name = 'AbortError';
          reject(abortError);
        });
      });
    });

    const pending = fetchWithAuth('/test', { timeout: 1000 });
    expect(capturedSignal).toBeInstanceOf(AbortSignal);

    // Fire the AbortController deadline (jest 27: sync advance).
    jest.advanceTimersByTime(1000);
    await expect(pending).rejects.toMatchObject({
      message: 'Request timeout',
      isTimeout: true,
    });
    expect(capturedSignal.aborted).toBe(true);
  });

  test('timer cleared on settle (no leaked setTimeout)', async () => {
    jest.useFakeTimers();
    const setSpy = jest.spyOn(global, 'setTimeout');
    const clearSpy = jest.spyOn(global, 'clearTimeout');
    global.fetch = jest.fn(() =>
      Promise.resolve({
        status: 200,
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ ok: true }),
      })
    );

    const res = await fetchWithAuth('/test', { timeout: 5000 });
    expect(res).toEqual({ ok: true });
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledWith(setSpy.mock.results[0].value);
  });

  test('403 throws typed error without window.location assignment', async () => {
    jest.useRealTimers();
    global.fetch = jest.fn(() =>
      Promise.resolve({
        status: 403,
        ok: false,
        headers: { get: () => 'application/json' },
      })
    );

    const beforeHref = window.location.href;
    await expect(fetchWithAuth('/test')).rejects.toMatchObject({
      status: 403,
      isAuthError: true,
      isForbidden: true,
      redirectTo: '/forbidden',
      message: expect.stringMatching(/Forbidden/),
    });
    expect(window.location.href).toBe(beforeHref);
  });
});
