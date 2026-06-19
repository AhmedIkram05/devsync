/* eslint-env cypress */
/* global cy */

describe('Notification Flows', () => {
  beforeEach(() => {
    // Pre-seed localStorage so AuthContext loads user immediately, skipping login.
    // This avoids a timing race where the notification fetch fails to fire after login.
    const user = {
      id: 3,
      name: 'Dev',
      email: 'dev@example.com',
      role: 'developer',
      github_connected: true,
      token: 'dev-token',
      permissions: ['view_tasks', 'view_projects']
    };
    localStorage.setItem('user', JSON.stringify(user));

    cy.intercept('GET', '**/api/v1/notifications', {
      statusCode: 200,
      body: [
        { id: 101, message: 'You were assigned to Alpha Task', read: false, created_at: new Date().toISOString() },
        { id: 102, message: 'Comment on Beta Task', read: true, created_at: new Date(Date.now() - 86400000).toISOString() }
      ]
    }).as('getNotifications');

    cy.intercept('GET', '**/api/v1/dashboard/client', { statusCode: 200, body: { tasks: { total: 0 }, repositories: [] } });
    cy.intercept('GET', '**/api/v1/github/status', { statusCode: 200, body: { connected: true } });

    cy.visit('/BasicDashboard');
    cy.wait('@getNotifications', { timeout: 10000 });
  });

  it('displays notification count and allows marking as read', () => {
    // Assert unread count badge on notification bell
    cy.get('[aria-label="Notifications"]').should('contain', '1');

    // Click bell icon to open dropdown
    cy.get('[aria-label="Notifications"]').click();

    cy.contains('You were assigned to Alpha Task').should('be.visible');
    cy.contains('Comment on Beta Task').should('be.visible');

    // Stub mark as read
    cy.intercept('PUT', '**/api/v1/notifications/101/read', {
      statusCode: 200,
      body: { success: true }
    }).as('markRead');

    // Click the notification itself to mark it as read (no separate Mark as read button)
    cy.contains('You were assigned to Alpha Task').click();
    cy.wait('@markRead');

    // Verify unread count goes to 0 (badge disappears)
    cy.get('[aria-label="Notifications"]').contains('1').should('not.exist');
  });

  it('allows marking all as read', () => {
    cy.get('[aria-label="Notifications"]').click();
    
    // Stub mark all as read
    cy.intercept('PUT', '**/api/v1/notifications/read-all', {
      statusCode: 200,
      body: { success: true }
    }).as('markAllRead');

    cy.contains('button', 'Mark all as read').click();
    cy.wait('@markAllRead');

    // Verify badge disappears (unread count goes to 0)
    cy.get('[aria-label="Notifications"]').contains('1').should('not.exist');
  });
});
