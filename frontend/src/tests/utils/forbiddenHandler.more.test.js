import {
  FORBIDDEN_EVENT,
  FORBIDDEN_PATH,
  notifyForbidden,
  handleForbidden,
} from '../../utils/forbiddenHandler';

// Covers the default-argument arms of the forbidden helpers: a typed 403 with
// no explicit redirectTo/status must fall back to FORBIDDEN_PATH/403, and
// handleForbidden must dispatch an event when no navigate function is supplied.
describe('forbiddenHandler default-target branches', () => {
  test('notifyForbidden falls back to FORBIDDEN_PATH and status 403', () => {
    const seen = [];
    const listener = (event) => seen.push(event.detail);
    window.addEventListener(FORBIDDEN_EVENT, listener);

    expect(notifyForbidden({ isForbidden: true })).toBe(true);

    window.removeEventListener(FORBIDDEN_EVENT, listener);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ redirectTo: FORBIDDEN_PATH, status: 403 });
  });

  test('handleForbidden without navigate dispatches the forbidden event', () => {
    const seen = [];
    const listener = (event) => seen.push(event.detail);
    window.addEventListener(FORBIDDEN_EVENT, listener);

    expect(handleForbidden({ status: 403 })).toBe(true);

    window.removeEventListener(FORBIDDEN_EVENT, listener);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ redirectTo: FORBIDDEN_PATH, status: 403 });
  });
});
