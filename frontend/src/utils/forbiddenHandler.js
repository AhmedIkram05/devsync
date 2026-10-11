export const FORBIDDEN_EVENT = 'devsync:forbidden';
export const FORBIDDEN_PATH = '/forbidden';

export const isForbiddenError = (err) => {
  if (!err) return false;
  return err.isForbidden === true || err.redirectTo === FORBIDDEN_PATH || err.status === 403;
};

export const notifyForbidden = (err) => {
  if (!isForbiddenError(err)) return false;
  try {
    const target = err.redirectTo || FORBIDDEN_PATH;
    window.dispatchEvent(
      new CustomEvent(FORBIDDEN_EVENT, { detail: { redirectTo: target, status: err.status || 403 } })
    );
  } catch {
    return false;
  }
  return true;
};

export const handleForbidden = (err, navigate) => {
  if (!isForbiddenError(err)) return false;
  const target = err.redirectTo || FORBIDDEN_PATH;
  if (typeof navigate === 'function') {
    navigate(target);
    return true;
  }
  return notifyForbidden(err);
};
