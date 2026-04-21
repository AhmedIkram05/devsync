/* eslint-env cypress */
/* global cy */

describe('Notification Flows', () => {
  beforeEach(() => {
    cy.intercept('POST', '**/api/v1/auth/login', {
      statusCode: 200,
      body: {
        token: 'dev-token',
        user: { id: 3, name: 'Dev', email: 'dev@example.com', role: 'client', github_connected: false }
      }
    }).as('loginReq');

    cy.intercept('GET', '**/api/v1/notifications', {
      statusCode: 200,
      body: [
        { id: 101, message: 'You were assigned to Alpha Task', read: false, created_at: new Date().toISOString() },
        { id: 102, message: 'Comment on Beta Task', read: true, created_at: new Date(Date.now() - 86400000).toISOString() }
      ]
    }).as('getNotifications');

    cy.intercept('GET', '**/api/v1/dashboard/client', { statusCode: 200, body: { tasks: { total: 0 }, repositories: [] } });
    cy.intercept('GET', '**/api/v1/github/status', { statusCode: 200, body: { connected: false } });

    cy.visit('/login');
    cy.get('input[name="email"]').type('dev@example.com');
    cy.get('input[name="password"]').type('devpass');
    cy.contains('button', 'Sign In').click();
    cy.wait('@loginReq');
    cy.contains('button', 'Skip for now').click();
  });

  it('displays notification count and allows marking as read', () => {
    cy.wait('@getNotifications');

    // Assert unread count badge in navbar
    cy.get('nav').contains('1').should('be.visible');

    // Click bell icon to open dropdown
    cy.get('nav button').find('svg').parent().click();

    cy.contains('You were assigned to Alpha Task').should('be.visible');
    cy.contains('Comment on Beta Task').should('be.visible');

    // Stub mark as read
    cy.intercept('PUT', '**/api/v1/notifications/101/read', {
      statusCode: 200,
      body: { success: true }
    }).as('markRead');

    // Mark as read click via the check icon
    cy.get('button[title="Mark as read"]').first().click();
    cy.wait('@markRead');

    // Verify unread count goes to 0 (badge disappears)
    cy.get('nav').contains('1').should('not.exist');
  });

  it('allows marking all as read', () => {
    cy.wait('@getNotifications');

    cy.get('nav button').find('svg').parent().click();
    
    // Stub mark all as read
    cy.intercept('PUT', '**/api/v1/notifications/read-all', {
      statusCode: 200,
      body: { success: true }
    }).as('markAllRead');

    cy.contains('button', 'Mark all as read').click();
    cy.wait('@markAllRead');

    // The unread dot in list items should disappear
    cy.get('.bg-blue-50').should('not.exist');
  });
});
