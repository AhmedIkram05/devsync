import { fetchWithAuth } from '../../services/api/client';
import {
  FORBIDDEN_EVENT,
  FORBIDDEN_PATH,
  isForbiddenError,
  notifyForbidden,
  handleForbidden,
} from '../../utils/forbiddenHandler';

describe('forbiddenHandler central 403 catcher', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    localStorage.clear();
  });

  test('isForbiddenError detects typed 403 shapes', () => {
    expect(isForbiddenError(null)).toBe(false);
    expect(isForbiddenError({})).toBe(false);
    expect(isForbiddenError({ status: 403 })).toBe(true);
    expect(isForbiddenError({ isForbidden: true })).toBe(true);
    expect(isForbiddenError({ redirectTo: '/forbidden' })).toBe(true);
  });

  test('handleForbidden navigates when navigate is provided', () => {
    const navigate = jest.fn();
    expect(handleForbidden({ isForbidden: true, redirectTo: '/forbidden' }, navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/forbidden');
    expect(handleForbidden({ status: 404 }, navigate)).toBe(false);
  });

  test('notifyForbidden dispatches event for non-403-shaped errors it ignores', () => {
    const listener = jest.fn();
    window.addEventListener(FORBIDDEN_EVENT, listener);
    expect(notifyForbidden({ status: 500 })).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(FORBIDDEN_EVENT, listener);
  });

  test('403 surfaces navigation: dispatches event while keeping typed throw', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        status: 403,
        ok: false,
        headers: { get: () => 'application/json' },
      })
    );

    const seen = [];
    const onForbidden = (e) => seen.push(e.detail);
    window.addEventListener(FORBIDDEN_EVENT, onForbidden);
    const beforeHref = window.location.href;

    await expect(fetchWithAuth('/test')).rejects.toMatchObject({
      status: 403,
      isAuthError: true,
      isForbidden: true,
      redirectTo: FORBIDDEN_PATH,
      message: expect.stringMatching(/Forbidden/),
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ redirectTo: '/forbidden' });
    expect(window.location.href).toBe(beforeHref);

    window.removeEventListener(FORBIDDEN_EVENT, onForbidden);
  });
});
