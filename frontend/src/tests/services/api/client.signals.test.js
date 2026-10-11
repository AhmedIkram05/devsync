import { fetchWithAuth } from '../../../services/api/client';

// Covers the caller-supplied AbortSignal arms and the Retry-After default.
describe('fetchWithAuth signal + retry-after branches', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    localStorage.clear();
  });

  const okJson = () =>
    Promise.resolve({
      status: 200,
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true }),
    });

  test('aborts immediately when the caller signal is already aborted', async () => {
    let capturedSignal;
    global.fetch = jest.fn((url, options = {}) => {
      capturedSignal = options.signal;
      return okJson();
    });

    const controller = new AbortController();
    controller.abort();

    await fetchWithAuth('tasks', { signal: controller.signal });

    expect(capturedSignal.aborted).toBe(true);
  });

  test('forwards a later abort of the caller signal to the timeout controller', async () => {
    let capturedSignal;
    global.fetch = jest.fn((url, options = {}) => {
      capturedSignal = options.signal;
      return okJson();
    });

    const controller = new AbortController();
    await fetchWithAuth('tasks', { signal: controller.signal });

    expect(capturedSignal.aborted).toBe(false);
    controller.abort();
    expect(capturedSignal.aborted).toBe(true);
  });

  test('429 without a Retry-After header defaults retryAfter to 30', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        status: 429,
        ok: false,
        headers: { get: () => null },
      })
    );

    await expect(fetchWithAuth('tasks')).rejects.toMatchObject({
      status: 429,
      retryAfter: 30,
    });
  });
});
