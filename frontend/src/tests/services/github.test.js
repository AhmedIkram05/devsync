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
});
