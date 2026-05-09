import * as api from '../../../services/utils/api';

describe('date helpers', () => {
  test('getDateRangeStart returns recent dates for week and month', () => {
    const week = api.getDateRangeStart('week');
    const month = api.getDateRangeStart('month');
    expect(week instanceof Date).toBe(true);
    expect(month instanceof Date).toBe(true);
    expect(month.getTime()).toBeLessThan(new Date().getTime());
  });

  test('getActivityWindowDays maps ranges', () => {
    expect(api.getActivityWindowDays('week')).toBe(7);
    expect(api.getActivityWindowDays('month')).toBe(30);
    expect(api.getActivityWindowDays('year')).toBe(365);
  });

  test('isWithinDateRange handles invalid dates', () => {
    expect(api.isWithinDateRange(null, new Date())).toBe(true);
    expect(api.isWithinDateRange('invalid-date', new Date())).toBe(true);
  });
});

describe('fetchWithAuth branches', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.clear();
    jest.clearAllMocks();
  });

  test('returns empty object on 204', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ status: 204, headers: new Map(), ok: true }));
    const res = await api.fetchWithAuth('/test');
    expect(res).toEqual({});
  });

  test('non-critical 401 returns graceful object', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ status: 401, headers: { get: () => 'application/json' }, ok: false }));
    const res = await api.fetchWithAuth('/notifications');
    expect(res).toHaveProperty('isAuthError', true);
  });

  test('429 throws rate limit error with retryAfter', async () => {
    const headers = { get: () => '10' };
    global.fetch = jest.fn(() => Promise.resolve({ status: 429, headers, ok: false }));
    await expect(api.fetchWithAuth('/test')).rejects.toMatchObject({ status: 429 });
  });
});
