// Pure session/profile helpers for AuthContext. Extracted verbatim so the
// provider file holds orchestration only; the context's public value shape is
// unchanged (it is consumed by ~48 modules).

export const VALID_ROLES = new Set(["developer", "team_lead", "admin"]);
export const DEFAULT_ROLE = "developer";
export const REPORT_WARMUP_ROLES = new Set(["team_lead", "admin"]);
export const GITHUB_REPORT_DATE_RANGES = ['week', 'month', 'quarter', 'year'];

export const hasValidRole = (user) => user?.role && VALID_ROLES.has(user.role);

export const sanitizeProfile = (user) => {
  if (!user || typeof user !== 'object') return user;
  const { token, access_token, accessToken, refresh_token, refreshToken, ...clean } = user;
  return clean;
};

// The GitHub connect prompt is shown at most once per browser session. Without
// this, every /auth/me revalidation on a full page reload re-opened the modal
// over the app for users who had already dismissed it (or are simply
// navigating), which blocked the page behind a full-screen overlay.
const GITHUB_PROMPT_SEEN_KEY = 'devsync_github_prompt_seen';

export const githubPromptSeen = () => {
  try { return sessionStorage.getItem(GITHUB_PROMPT_SEEN_KEY) === '1'; } catch { return false; }
};

export const markGithubPromptSeen = () => {
  try { sessionStorage.setItem(GITHUB_PROMPT_SEEN_KEY, '1'); } catch { /* storage unavailable */ }
};

export const clearGithubPromptSeen = () => {
  try { sessionStorage.removeItem(GITHUB_PROMPT_SEEN_KEY); } catch { /* storage unavailable */ }
};
