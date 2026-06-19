/* eslint-env cypress */
/* global cy */

describe('Client Task Flows', () => {
  beforeEach(() => {
    // Stub login and restore auth state
    cy.intercept('POST', '**/api/v1/auth/login', {
      statusCode: 200,
      body: {
        token: 'fake-token-123',
        user: { id: 2, name: 'Client User', email: 'client@example.com', role: 'developer', github_connected: false }
      }
    }).as('loginReq');

    // Stub the tasks list
    cy.intercept('GET', '**/api/v1/tasks', {
      statusCode: 200,
      body: [
        { id: 10, title: 'Learn Cypress', description: 'Write E2E tests', status: 'todo', priority: 'high', progress: 0, deadline: '2099-01-01T00:00:00Z' },
        { id: 11, title: 'Fix bug', description: 'Squash it', status: 'in_progress', priority: 'medium', progress: 50, deadline: null }
      ]
    }).as('getTasks');

    // Stub notification context fetch (fires after login)
    cy.intercept('GET', '**/api/v1/notifications', {
      statusCode: 200,
      body: []
    });

    // Stub dashboard client data
    cy.intercept('GET', '**/api/v1/dashboard/client', {
      statusCode: 200,
      body: { tasks: { total: 0 }, repositories: [] }
    });

    // Skip the github connection check
    cy.intercept('GET', '**/api/v1/github/status', {
      statusCode: 200,
      body: { connected: false }
    });

    cy.visit('/login');
    cy.get('input[name="email"]').type('client@example.com');
    cy.get('input[name="password"]').type('password123');
    cy.contains('button', 'Sign In').click();
    cy.wait('@loginReq');
    
    // Clear out any modals
    cy.get('body').then(($body) => {
      if ($body.find('button:contains("Skip For Now")').length > 0) {
        cy.contains('button', 'Skip For Now').click();
      }
    });
  });

  it('navigates to tasks and filters them by priority', () => {
    cy.visit('/tasks');
    cy.wait('@getTasks', { timeout: 10000 });

    cy.contains('Learn Cypress').should('be.visible');
    cy.contains('Fix bug').should('be.visible');

    // Filter by high priority
    cy.get('select#priorityFilter').select('High');
    cy.contains('Learn Cypress').should('be.visible');
    cy.contains('Fix bug').should('not.exist');
  });

  it('updates task progress and status from detail view', () => {
    // Stub task details
    cy.intercept('GET', '**/api/v1/tasks/10', {
      statusCode: 200,
      body: { id: 10, title: 'Learn Cypress', description: 'Write E2E tests', status: 'todo', priority: 'high', progress: 0, deadline: '2099-01-01T00:00:00Z', comments: [], github_links: [] }
    }).as('getTaskDetail');

    cy.intercept('GET', '**/api/v1/tasks/10/comments', {
      statusCode: 200,
      body: []
    }).as('getComments');

    cy.intercept('GET', '**/api/v1/github/repositories', {
      statusCode: 200,
      body: []
    });

    cy.intercept('PUT', '**/api/v1/tasks/10', (req) => {
      req.reply({ statusCode: 200, body: Object.assign({}, req.body, { id: 10, title: 'Learn Cypress' }) });
    }).as('updateTask');

    cy.visit('/tasks');
    cy.wait('@getTasks');

    cy.contains('td', 'Learn Cypress').click();
    cy.wait(['@getTaskDetail', '@getComments']);

    cy.contains('h1', 'Learn Cypress').should('be.visible');
    
    // Update progress slider to 30%
    cy.get('input[type="range"]').invoke('val', 30).trigger('change').trigger('mouseup');
    cy.wait('@updateTask').its('request.body').should('deep.include', { progress: 30 });
    
    // Update progress slider to 80%
    cy.get('input[type="range"]').invoke('val', 80).trigger('change').trigger('mouseup');
    cy.wait('@updateTask').its('request.body').should('deep.include', { progress: 80 });
  });
});
