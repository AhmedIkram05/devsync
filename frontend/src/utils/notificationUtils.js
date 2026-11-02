// Pure notification helpers for NotificationContext. Extracted verbatim so the
// provider file holds only state/socket orchestration; the context's public
// value shape is unchanged.

export const isNotificationRead = (notification) => Boolean(notification?.is_read || notification?.read);

export const MAX_NOTIFICATIONS = 100;

export const dedupById = (list) => {
  const seen = new Set();
  return list.filter((n) => {
    const id = n?.id;
    if (id === undefined || id === null) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, MAX_NOTIFICATIONS);
};
