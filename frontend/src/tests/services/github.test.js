import { githubService } from '../../services/github';
import { authApi } from '../../services/utils/auth';

jest.mock('../../services/utils/auth', () => ({
  authApi: {
    getCurrentUser: jest.fn(),
    isTokenExpired: jest.fn(),
    refreshToken: jest.fn(),
    updateGitHubStatus: jest.fn(),
  },
}));

const jsonResponse = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: jest.fn().mockResolvedValue(payload),
});

describe('githubService', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    localStorage.clear();
    global.fetch = jest.fn();

    authApi.getCurrentUser.mockReset();
    authApi.isTokenExpired.mockReset();
    authApi.refreshToken.mockReset();
    authApi.updateGitHubStatus.mockReset();

    authApi.getCurrentUser.mockReturnValue({ id: 7, email: 'dev@example.com', token: 'token-1' });
    authApi.isTokenExpired.mockReturnValue(false);
    authApi.refreshToken.mockResolvedValue({ id: 7, email: 'dev@example.com', token: 'token-2' });
    authApi.updateGitHubStatus.mockImplementation((connected, username) => ({
      connected,
      username,
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  test('createStateParam encodes user id and timestamp', () => {
    const encodedState = githubService.createStateParam(123);
    const decodedState = JSON.parse(atob(encodedState));

    expect(decodedState.userId).toBe(123);
    expect(typeof decodedState.timestamp).toBe('number');
  });

  test('checkConnectionStatus returns payload on success', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ connected: true }));

    const result = await githubService.checkConnectionStatus();

    expect(result).toEqual({ connected: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/v1/github/status');
    expect(options.headers.Authorization).toBe('Bearer token-1');
    expect(options.credentials).toBe('include');
  });

  test('checkConnectionStatus maps request failures to disconnected state', async () => {
    global.fetch.mockRejectedValue(new Error('network down'));

    const result = await githubService.checkConnectionStatus();

    expect(result.connected).toBe(false);
    expect(result.error).toContain('network down');
  });

  test('initiateOAuthFlow rejects when current user id is missing', async () => {
    authApi.getCurrentUser.mockReturnValue({});

    await expect(githubService.initiateOAuthFlow()).rejects.toThrow(
      'User ID is required for GitHub connection. Please log in again.'
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('initiateOAuthFlow stores oauth state and returns authorization URL', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({
        authorization_url: 'https://github.com/login/oauth/authorize?state=state-abc',
        state: 'state-abc',
      })
    );

    const authorizationUrl = await githubService.initiateOAuthFlow();

    expect(authorizationUrl).toBe('https://github.com/login/oauth/authorize?state=state-abc');
    expect(localStorage.getItem('github_oauth_state')).toBe('state-abc');
  });

  test('completeOAuthFlow rejects on state mismatch before API call', async () => {
    localStorage.setItem('github_oauth_state', 'expected-state');

    await expect(githubService.completeOAuthFlow('oauth-code', 'different-state')).rejects.toThrow(
      'Security validation failed. Please try connecting to GitHub again.'
    );

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('completeOAuthFlow updates github status and clears stored state', async () => {
    localStorage.setItem('github_oauth_state', 'state-123');
    global.fetch.mockResolvedValue(
      jsonResponse({
        success: true,
        github_username: 'octocat',
      })
    );

    const result = await githubService.completeOAuthFlow('oauth-code', 'state-123');

    expect(result.success).toBe(true);
    expect(authApi.updateGitHubStatus).toHaveBeenCalledWith(true, 'octocat');
    expect(localStorage.getItem('github_oauth_state')).toBeNull();
  });

  test('fetchWithAuth retries once after 401 with refreshed token', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ message: 'unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({ connected: true }, 200));

    const result = await githubService.checkConnectionStatus();

    expect(result.connected).toBe(true);
    expect(authApi.refreshToken).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    const secondCall = global.fetch.mock.calls[1];
    expect(secondCall[1].__tokenRefreshAttempted).toBe(true);
  });

  test('addRepository surfaces rate-limit responses as thrown errors', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({ message: 'GitHub API rate limit exceeded' }, 403)
    );

    await expect(
      githubService.addRepository({ owner: 'org', repo: 'name' })
    ).rejects.toMatchObject({
      status: 403,
      message: 'GitHub API rate limit exceeded',
    });
  });

  test('addRepository wraps internal server errors with normalized message', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({ message: 'backend unavailable' }, 500)
    );

    await expect(
      githubService.addRepository({ owner: 'org', repo: 'name' })
    ).rejects.toMatchObject({
      status: 500,
      isServerError: true,
      message: 'Server Error: backend unavailable',
    });
  });

  test('getUserRepositories returns repository list with query params', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ repositories: [{ id: 9, full_name: 'org/repo' }] }));

    const repos = await githubService.getUserRepositories(2, 15);

    expect(repos).toEqual([{ id: 9, full_name: 'org/repo' }]);
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/v1/github/repositories?page=2&per_page=15');
  });

  test('getRepositoryIssues returns an empty list when request fails', async () => {
    global.fetch.mockRejectedValue(new Error('issues unavailable'));

    const issues = await githubService.getRepositoryIssues(55);

    expect(issues).toEqual([]);
  });

  test('unlinkTaskFromGithub enforces link id argument', async () => {
    await expect(githubService.unlinkTaskFromGithub(11)).rejects.toThrow(
      'Task ID and link ID are required to unlink GitHub issue'
    );
  });

  test('handleRateLimitError and handleServerError normalize expected shapes', () => {
    const rateLimitInfo = githubService.handleRateLimitError({
      status: 403,
      data: {
        message: 'GitHub API rate limit exceeded',
        documentation_url: 'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting',
      },
    });

    const tooManyRequestsInfo = githubService.handleRateLimitError({
      status: 429,
      retryAfter: 45,
    });

    const serverInfo = githubService.handleServerError({
      status: 500,
      message: 'Internal Error',
      data: { traceId: 'abc123' },
    });

    expect(rateLimitInfo.title).toBe('GitHub API Rate Limit Exceeded');
    expect(rateLimitInfo.documentationUrl).toContain('docs.github.com');
    expect(tooManyRequestsInfo.retryAfter).toBe(45);
    expect(serverInfo.title).toBe('GitHub Integration Server Error');
    expect(githubService.handleServerError({ status: 404 })).toBeNull();
  });

  test('fetchWithAuth refreshes token proactively when isTokenExpired is true', async () => {
    authApi.isTokenExpired.mockReturnValue(true);
    authApi.refreshToken.mockResolvedValue({ id: 7, token: 'refreshed-token' });
    global.fetch.mockResolvedValue(jsonResponse({ connected: true }));

    const result = await githubService.checkConnectionStatus();

    expect(authApi.refreshToken).toHaveBeenCalled();
    expect(result).toEqual({ connected: true });
    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer refreshed-token');
  });

  test('fetchWithAuth logs warning when user has no token', async () => {
    authApi.getCurrentUser.mockReturnValue({ id: 7 }); // no token
    global.fetch.mockResolvedValue(jsonResponse({ connected: false }));

    await githubService.checkConnectionStatus();

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('No authentication token available')
    );
  });

  test('fetchWithAuth handles 401 when token refresh also fails and method re-throws', async () => {
    // addRepository propagates errors (unlike checkConnectionStatus which catches them)
    authApi.refreshToken.mockRejectedValue(new Error('refresh down'));
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ message: 'unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({ message: 'still unauthorized' }, 401));

    await expect(githubService.addRepository({ owner: 'x', repo: 'y' })).rejects.toMatchObject({
      status: 401,
      isAuthError: true,
    });
  });

  test('fetchWithAuth skips second refresh when __tokenRefreshAttempted already set', async () => {
    // First call: 401 → triggers refresh → second call also 401 → throws authError (no further refresh)
    authApi.refreshToken.mockResolvedValue({ id: 7, token: 'tok-2' });
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ message: 'unauthorized' }, 401)) // original request
      .mockResolvedValueOnce(jsonResponse({ message: 'still unauthorized' }, 401)); // retry

    await expect(githubService.addRepository({ owner: 'x', repo: 'y' })).rejects.toMatchObject({
      status: 401,
      isAuthError: true,
    });
    // refreshToken called exactly once (not again on the retry)
    expect(authApi.refreshToken).toHaveBeenCalledTimes(1);
  });

  test('fetchWithAuth handles 403 rate-limit — method that propagates (linkTaskWithGitHub)', async () => {
    // linkTaskWithGitHub re-throws, unlike getRepositoryIssues which catches
    global.fetch.mockResolvedValue(
      jsonResponse({ message: 'GitHub API rate limit exceeded for org' }, 403)
    );

    await expect(
      githubService.linkTaskWithGitHub(1, { issue_id: 5 })
    ).rejects.toMatchObject({
      status: 403,
    });
  });

  test('fetchWithAuth handles 403 non-rate-limit as generic error', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({ message: 'forbidden access' }, 403)
    );

    // 403 with non-rate-limit message falls through to generic !ok handler
    await expect(githubService.addRepository({ owner: 'o', repo: 'r' })).rejects.toMatchObject({
      status: 403,
    });
  });

  test('fetchWithAuth returns empty object for 204 No Content response', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 204,
      json: jest.fn(),
    });

    const result = await githubService.disconnectAccount();
    expect(result).toEqual({});
  });

  test('completeOAuthFlow rejects without user in localStorage', async () => {
    authApi.getCurrentUser.mockReturnValue(null);

    await expect(githubService.completeOAuthFlow('code', 'state')).rejects.toThrow(
      'Authentication required. Please log in again before connecting GitHub.'
    );
  });

  test('completeOAuthFlow rejects when no state is available at all', async () => {
    localStorage.removeItem('github_oauth_state');

    await expect(githubService.completeOAuthFlow('code', '')).rejects.toThrow(
      'Security validation failed. Please try connecting to GitHub again.'
    );
  });

  test('completeOAuthFlow handles success=false (no updateGitHubStatus call)', async () => {
    localStorage.setItem('github_oauth_state', 'state-xyz');
    global.fetch.mockResolvedValue(jsonResponse({ success: false, error: 'denied' }));

    const result = await githubService.completeOAuthFlow('code', 'state-xyz');

    expect(result.success).toBe(false);
    expect(authApi.updateGitHubStatus).not.toHaveBeenCalled();
    expect(localStorage.getItem('github_oauth_state')).toBeNull();
  });

  test('getTaskGitHubLinks returns links array from response', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ links: [{ id: 1, issue_id: 5 }] }));

    const links = await githubService.getTaskGitHubLinks(77);
    expect(links).toEqual([{ id: 1, issue_id: 5 }]);
  });

  test('getTaskGitHubLinks returns empty array on error', async () => {
    global.fetch.mockRejectedValue(new Error('links down'));

    const links = await githubService.getTaskGitHubLinks(77);
    expect(links).toEqual([]);
  });

  test('deleteTaskGitHubLink returns result from response', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ success: true }));

    const result = await githubService.deleteTaskGitHubLink(10, 3);
    expect(result).toEqual({ success: true });
  });

  test('getRepositoryPulls returns pull_requests array from response', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({ pull_requests: [{ id: 9, number: 55 }] })
    );

    const prs = await githubService.getRepositoryPulls(42, { state: 'closed', page: 2, perPage: 5 });
    expect(prs).toEqual([{ id: 9, number: 55 }]);
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('state=closed');
    expect(url).toContain('page=2');
  });

  test('handleRateLimitError uses data.retryAfter as fallback for 429', () => {
    const info = githubService.handleRateLimitError({
      status: 429,
      data: { retryAfter: 120 },
    });
    expect(info.retryAfter).toBe(120);
  });

  test('handleRateLimitError returns null for non-rate-limit error', () => {
    expect(githubService.handleRateLimitError({ status: 500 })).toBeNull();
    expect(githubService.handleRateLimitError(null)).toBeNull();
  });

  test('initiateOAuthFlow throws when server returns no authorization_url', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ state: 'abc' })); // no authorization_url

    await expect(githubService.initiateOAuthFlow()).rejects.toThrow(
      'No authorization URL received from server'
    );
  });

  test('initiateOAuthFlow stores state from authorization_url query param when response.state is absent', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({
        authorization_url: 'https://github.com/login/oauth/authorize?state=url-state',
        // no top-level state key
      })
    );

    await githubService.initiateOAuthFlow();
    expect(localStorage.getItem('github_oauth_state')).toBe('url-state');
  });

  test('getIssues acts as an alias for getRepositoryIssues', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ issues: [{ id: 10 }] }));
    const issues = await githubService.getIssues(101, { page: 3 });
    expect(issues).toEqual([{ id: 10 }]);
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('page=3');
  });

  test('getPullRequests acts as an alias for getRepositoryPulls', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ pull_requests: [{ id: 20 }] }));
    const prs = await githubService.getPullRequests(102, { state: 'closed' });
    expect(prs).toEqual([{ id: 20 }]);
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('state=closed');
  });

  test('linkTaskToGithub acts as an alias for linkTaskWithGitHub', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ success: true }));
    const res = await githubService.linkTaskToGithub(99, { linkData: true });
    expect(res).toEqual({ success: true });
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(opts.body).toContain('linkData');
  });

  test('getRepositoryPulls returns empty array on error catch', async () => {
    global.fetch.mockRejectedValue(new Error('error pulling'));
    const prs = await githubService.getRepositoryPulls(102);
    expect(prs).toEqual([]);
  });

  test('unlinkTaskFromGithub throws when linkId is undefined', async () => {
    await expect(githubService.unlinkTaskFromGithub(99, undefined)).rejects.toThrow(
      'Task ID and link ID are required to unlink GitHub issue'
    );
  });

  test('disconnectAccount returns error if fetch fails', async () => {
    global.fetch.mockRejectedValue(new Error('disconnect failed'));
    await expect(githubService.disconnectAccount()).rejects.toThrow('disconnect failed');
  });
});
