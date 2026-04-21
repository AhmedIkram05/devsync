import { githubApi } from '../../services/api/githubApi';
import { authApi } from '../../services/utils/auth';

jest.mock('../../services/utils/auth', () => ({
  authApi: {
    getCurrentUser: jest.fn(),
  },
}));

const buildResponse = (payload, status = 200, contentType = 'application/json') => ({
  ok: status >= 200 && status < 300,
  status,
  json: jest.fn().mockResolvedValue(payload),
  headers: {
    get: (name) => {
      if (String(name || '').toLowerCase() === 'content-type') {
        return contentType;
      }
      return null;
    },
  },
});

describe('githubApi service', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    authApi.getCurrentUser.mockReset();
    authApi.getCurrentUser.mockReturnValue({
      id: 10,
      token: 'token-10',
    });

    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('initiates auth flow with authorization header', async () => {
    global.fetch.mockResolvedValue(buildResponse({ authorization_url: 'https://github.com/oauth' }));

    const response = await githubApi.initiateAuth();

    expect(response).toEqual({ authorization_url: 'https://github.com/oauth' });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/v1/github/auth');
    expect(options.headers.Authorization).toBe('Bearer token-10');
    expect(options.credentials).toBe('include');
  });

  test('fetches repositories and repository issues', async () => {
    global.fetch
      .mockResolvedValueOnce(buildResponse({ repositories: [{ id: 1, name: 'repo-1' }] }))
      .mockResolvedValueOnce(buildResponse({ issues: [{ id: 5, title: 'Issue #5' }] }));

    const repositories = await githubApi.getRepositories();
    const issues = await githubApi.getRepositoryIssues(99);

    expect(repositories).toEqual({ repositories: [{ id: 1, name: 'repo-1' }] });
    expect(issues).toEqual({ issues: [{ id: 5, title: 'Issue #5' }] });

    expect(global.fetch.mock.calls[0][0]).toContain('/api/v1/github/repositories');
    expect(global.fetch.mock.calls[1][0]).toContain('/api/v1/github/repositories/99/issues');
  });

  test('links tasks to github issue and fetches task github links', async () => {
    global.fetch
      .mockResolvedValueOnce(buildResponse({ success: true, link_id: 88 }))
      .mockResolvedValueOnce(buildResponse({ links: [{ id: 88, issue_number: 42 }] }));

    const linkPayload = {
      repo_id: 9,
      issue_id: 42,
      issue_title: 'Fix callback flow',
    };

    const linkResponse = await githubApi.linkTaskWithGithub(3, linkPayload);
    const linksResponse = await githubApi.getTaskGithubLinks(3);

    expect(linkResponse).toEqual({ success: true, link_id: 88 });
    expect(linksResponse).toEqual({ links: [{ id: 88, issue_number: 42 }] });

    const [linkUrl, linkOptions] = global.fetch.mock.calls[0];
    expect(linkUrl).toContain('/api/v1/github/tasks/3/github');
    expect(linkOptions.method).toBe('POST');
    expect(JSON.parse(linkOptions.body)).toEqual(linkPayload);

    expect(global.fetch.mock.calls[1][0]).toContain('/api/v1/github/tasks/3/github');
  });

  test('returns empty object for 204 response', async () => {
    global.fetch.mockResolvedValue(buildResponse({}, 204, null));

    const response = await githubApi.getTaskGithubLinks(12);

    expect(response).toEqual({});
  });

  test('throws structured error when API returns non-ok response', async () => {
    global.fetch.mockResolvedValue(buildResponse({ message: 'Forbidden' }, 403));

    await expect(githubApi.getRepositories()).rejects.toMatchObject({
      status: 403,
      message: 'Forbidden',
    });
  });

  test('omits authorization header when no user token exists', async () => {
    authApi.getCurrentUser.mockReturnValue(null);
    global.fetch.mockResolvedValue(buildResponse({ repositories: [] }));

    await githubApi.getRepositories();

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });
});
