/* eslint-env cypress */
/* global cy */

describe('GitHub Connect Flows', () => {
  beforeEach(() => {
    cy.intercept('POST', '**/api/v1/auth/login', {
      statusCode: 200,
      body: {
        token: 'dev-token',
        user: { id: 3, name: 'Dev', email: 'dev@example.com', role: 'client', github_connected: false }
      }
    }).as('loginReq');

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
    cy.contains('Connect Your GitHub Account').should('be.visible');

    cy.intercept('GET', '**/api/v1/github/auth-url?user_id=3', {
      statusCode: 200,
      body: { authorization_url: '/mock-github-oauth' }
    }).as('getAuthUrl');

    // Stop the actual redirect
    cy.on('window:before:unload', (e) => {
      e.preventDefault();
    });

    cy.contains('button', 'Connect GitHub Now').click();
    cy.wait('@getAuthUrl');
  });

  it('handles github callback redirect and linking', () => {
    // Setup initial state as if prompt was skipped previously
    cy.contains('button', 'Skip for now').click();
    
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

    // Visit the callback URL with code
    cy.visit('/github/callback?code=mock_code&state=mock_state');

    cy.wait('@githubCallback');
    // Ensure we redirect to /github integrations view
    cy.url().should('include', '/github');
    cy.contains('Connect Repository').should('be.visible');
  });
});
