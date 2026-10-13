/* eslint-env cypress */
/* global cy */

describe('Hygiene mocked states', () => {
  const devUser = { id: 3, name: 'Dev', email: 'dev@example.com', role: 'developer', github_connected: false };

  const setupAuth = () => {
    let authed = false;

    cy.intercept('POST', '**/api/v1/auth/login', (req) => {
      authed = true;
      req.reply({
        statusCode: 200,
        body: { token: 'dev-token', user: devUser },
      });
    }).as('loginReq');

    cy.intercept('GET', '**/api/v1/auth/me', (req) => {
      if (authed) {
        req.reply({ statusCode: 200, body: { user: devUser, exp: 9999999999 } });
      } else {
        req.reply({ statusCode: 401, body: { message: 'Unauthorized' } });
      }
    }).as('meReq');

    cy.intercept('GET', '**/api/v1/auth/permissions', (req) => {
      if (authed) {
        req.reply({
          statusCode: 200,
          body: {
            role: 'developer',
            permissions: ['can_view_tasks', 'can_link_github_account', 'can_view_notifications'],
          },
        });
      } else {
        req.reply({ statusCode: 401, body: { message: 'Unauthorized' } });
      }
    }).as('permissionsReq');

    cy.intercept('GET', '**/api/v1/notifications', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/api/v1/dashboard/client', {
      statusCode: 200,
      body: { tasks: { total: 0 }, repositories: [] },
    });
  };

  const login = () => {
    cy.visit('/login');
    cy.get('input[name="email"]').type('dev@example.com');
    cy.get('input[name="password"]').type('devpass');
    cy.contains('button', 'Sign In').click();
    cy.wait('@loginReq');
    cy.get('body').then(($body) => {
      if ($body.find('button:contains("Skip For Now")').length > 0) {
        cy.contains('button', 'Skip For Now').click();
      }
    });
  };

  it('(a) github connect -> connected -> disconnect -> disconnected chain', () => {
    setupAuth();
    let githubConnected = false;

    cy.intercept('GET', '**/api/v1/github/status', (req) => {
      req.reply({
        statusCode: 200,
        body: githubConnected
          ? { connected: true, username: 'octocat' }
          : { connected: false },
      });
    }).as('githubStatus');

    cy.intercept('POST', '**/api/v1/github/connect', (req) => {
      githubConnected = true;
      req.reply({
        statusCode: 200,
        body: { authorization_url: '/mock-github-oauth?state=mock' },
      });
    }).as('githubConnect');

    cy.intercept('POST', '**/api/v1/github/disconnect', (req) => {
      githubConnected = false;
      req.reply({ statusCode: 200, body: { success: true } });
    }).as('githubDisconnect');

    cy.intercept('GET', '**/api/v1/github/repositories*', {
      statusCode: 200,
      body: [],
    }).as('getRepos');

    login();
    cy.visit('/github');
    cy.wait('@githubStatus');
    cy.contains('Connect Your GitHub Account').should('be.visible');

    // Simulate user completing the OAuth link step via the connect endpoint,
    // then re-checking status like GitHubCallback does after the exchange.
    cy.window().then((win) => win.fetch('/api/v1/github/connect', { method: 'POST' }));
    cy.wait('@githubConnect');
    cy.visit('/github');
    cy.wait('@githubStatus');
    cy.contains('GitHub Account Connected').should('be.visible');

    // Revoke via the disconnect endpoint, then status flips back.
    cy.window().then((win) => {
      win.confirm = () => true;
    });
    cy.contains('button', 'Disconnect').click();
    cy.wait('@githubDisconnect');
    cy.visit('/github');
    cy.wait('@githubStatus');
    cy.contains('Connect Your GitHub Account').should('be.visible');
  });

  it('(b) shows a loading spinner while repos resolve', () => {
    setupAuth();
    cy.intercept('GET', '**/api/v1/github/status', {
      statusCode: 200,
      body: { connected: true, username: 'octocat' },
    }).as('githubStatus');

    cy.intercept('GET', '**/api/v1/github/repositories*', (req) => {
      req.reply({
        statusCode: 200,
        body: [],
        delay: 900,
      });
    }).as('getReposDelayed');

    login();
    cy.visit('/github');
    cy.wait('@githubStatus');
    cy.contains('Loading...').should('be.visible');
    cy.wait('@getReposDelayed');
    cy.contains('No repositories found.').should('be.visible');
  });

  it('(c) shows an empty state when repos list is empty', () => {
    setupAuth();
    cy.intercept('GET', '**/api/v1/github/status', {
      statusCode: 200,
      body: { connected: true, username: 'octocat' },
    }).as('githubStatus');
    cy.intercept('GET', '**/api/v1/github/repositories*', {
      statusCode: 200,
      body: [],
    }).as('getReposEmpty');

    login();
    cy.visit('/github');
    cy.wait(['@githubStatus', '@getReposEmpty']);
    cy.contains('No repositories found.').should('be.visible');
  });

  it('(d) shows rate-limit UI on 429', () => {
    setupAuth();
    cy.intercept('GET', '**/api/v1/github/status', {
      statusCode: 200,
      body: { connected: true, username: 'octocat' },
    }).as('githubStatus');
    cy.intercept('GET', '**/api/v1/github/repositories*', {
      statusCode: 429,
      body: { message: 'API rate limit exceeded' },
    }).as('getRepos429');

    login();
    cy.visit('/github');
    cy.wait(['@githubStatus', '@getRepos429']);
    cy.contains('GitHub API Rate Limit Exceeded').should('be.visible');
    cy.contains('Learn more about GitHub API rate limits').should('be.visible');
  });

  it('(e) shows an offline error with retry on network failure', () => {
    setupAuth();
    cy.intercept('GET', '**/api/v1/github/status', {
      statusCode: 200,
      body: { connected: true, username: 'octocat' },
    }).as('githubStatus');
    cy.intercept('GET', '**/api/v1/github/repositories*', {
      forceNetworkError: true,
    }).as('getReposOffline');

    login();
    cy.visit('/github');
    cy.wait(['@githubStatus', '@getReposOffline']);
    cy.contains('Failed to fetch repositories. Please try again later.').should('be.visible');
    cy.contains('button', 'Refresh').should('be.visible').click();
    cy.wait('@getReposOffline');
  });
});
