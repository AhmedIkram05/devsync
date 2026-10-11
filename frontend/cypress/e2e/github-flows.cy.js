/* eslint-env cypress */
/* global cy */

describe('GitHub Connect Flows', () => {
  beforeEach(() => {
    const devUser = { id: 3, name: 'Dev', email: 'dev@example.com', role: 'developer', github_connected: false };
    // 401 until login succeeds so /login renders the form first; afterwards
    // 200 so AppRoutes clears the permissionsLoading spinner on reloads.
    let authed = false;

    cy.intercept('POST', '**/api/v1/auth/login', (req) => {
      authed = true;
      req.reply({
        statusCode: 200,
        body: {
          token: 'dev-token',
          user: devUser
        }
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
            permissions: ['can_view_tasks', 'can_link_github_account', 'can_view_notifications']
          }
        });
      } else {
        req.reply({ statusCode: 401, body: { message: 'Unauthorized' } });
      }
    }).as('permissionsReq');

    cy.intercept('GET', '**/api/v1/github/status', {
      statusCode: 200,
      body: { connected: false }
    });

    cy.visit('/login');
    cy.get('input[name="email"]').type('dev@example.com');
    cy.get('input[name="password"]').type('devpass');
    cy.contains('button', 'Sign In').click();
    cy.wait('@loginReq');
  });

  it('triggers GitHub connect prompt and redirect', () => {
    // Dashboard loads, prompt should appear
    cy.contains('Connect GitHub Account').should('be.visible');

    cy.intercept('POST', '**/api/v1/github/connect', {
      statusCode: 200,
      body: { authorization_url: '/mock-github-oauth' }
    }).as('getAuthUrl');

    // Stop the actual redirect
    cy.on('window:before:unload', (e) => {
      e.preventDefault();
    });

    cy.contains('button', 'Connect Now').click();
    cy.wait('@getAuthUrl');
  });

  it('handles github callback redirect and linking', () => {
    // Setup initial state as if prompt was skipped previously
    cy.contains('button', 'Skip For Now').click();
    
    // Mock the callback exchange
    cy.intercept('POST', '**/api/v1/github/callback', {
      statusCode: 200,
      body: { success: true, github_username: 'octocat' }
    }).as('githubCallback');

    // Mock github status after config
    cy.intercept('GET', '**/api/v1/github/status', {
      statusCode: 200,
      body: { connected: true, github_username: 'octocat' }
    }).as('githubStatusTrue');

    cy.intercept('GET', '**/api/v1/dashboard/client', { statusCode: 200, body: { tasks: { total: 0 }, repositories: [] } });

    // Strict OAuth state: seed the exact sessionStorage entries the app
    // validates (exact match + 10min TTL, single-use) before visiting —
    // without them completeOAuthFlow throws before any network call.
    cy.visit('/github/callback?code=mock_code&state=mock_state', {
      onBeforeLoad(win) {
        win.sessionStorage.setItem('github_oauth_state', 'mock_state');
        win.sessionStorage.setItem('github_oauth_state_ts', String(Date.now()));
      },
    });

    cy.wait('@githubCallback');
    // Ensure we redirect to /github integrations view
    cy.url().should('include', '/github');
    cy.contains('GitHub Account Connected').should('be.visible');
  });
});
