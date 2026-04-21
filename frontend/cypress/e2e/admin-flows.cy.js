/* eslint-env cypress */
/* global cy */

describe('Admin Flows', () => {
  beforeEach(() => {
    // Stub admin login
    cy.intercept('POST', '**/api/v1/auth/login', {
      statusCode: 200,
      body: {
        token: 'admin-token-123',
        user: { id: 1, name: 'Admin Boss', email: 'admin@example.com', role: 'admin', github_connected: false }
      }
    }).as('loginReq');

    // Default dashboard data
    cy.intercept('GET', '**/api/v1/dashboard/admin*', {
      statusCode: 200,
      body: {
        projects: { total: 5 },
        tasks: { total: 20, completed: 15, in_progress: 3, overdue: 2 }
      }
    }).as('adminDash');

    cy.intercept('GET', '**/api/v1/dashboard/developers', {
      statusCode: 200,
      body: []
    }).as('devStats');

    cy.intercept('GET', '**/api/v1/github/status', {
      statusCode: 200,
      body: { connected: false }
    });

    cy.visit('/login');
    cy.get('input[name="email"]').type('admin@example.com');
    cy.get('input[name="password"]').type('adminpassword');
    cy.contains('button', 'Sign In').click();
    cy.wait('@loginReq');
    
    cy.get('body').then(($body) => {
      if ($body.find('button:contains("Skip for now")').length > 0) {
        cy.contains('button', 'Skip for now').click();
      }
    });
  });

  it('loads admin dashboard and switches report periods', () => {
    cy.wait(['@adminDash', '@devStats']);
    
    cy.contains('h1', 'Admin Dashboard').should('be.visible');
    cy.contains('Total Projects').parent().contains('5');
    cy.contains('Active Tasks').parent().contains('3');

    // Change filter
    cy.intercept('GET', '**/api/v1/dashboard/admin?period=quarter', {
      statusCode: 200,
      body: {
        projects: { total: 10 },
        tasks: { total: 50, completed: 30, in_progress: 10, overdue: 5 }
      }
    }).as('adminDashQuarter');

    cy.get('select').select('quarter');
    cy.wait('@adminDashQuarter');
    cy.contains('Total Projects').parent().contains('10');
  });

  it('creates a new project and manages it', () => {
    // Navigate to projects
    cy.intercept('GET', '**/api/v1/projects', {
      statusCode: 200,
      body: [{ id: 1, name: 'Alpha', description: 'desc', status: 'active', priority: 'high' }]
    }).as('getProjects');

    cy.contains('a', 'Projects').click();
    cy.wait('@getProjects');

    // Create project
    cy.intercept('POST', '**/api/v1/projects', {
      statusCode: 201,
      body: { id: 2, name: 'Beta Version', description: 'New project', status: 'planning', priority: 'medium' }
    }).as('createProject');

    cy.contains('button', 'Create Project').click();
    
    cy.get('input#name').type('Beta Version');
    cy.get('textarea#description').type('New project');
    cy.get('select#priority').select('medium');
    
    // Override GET to return the new list
    cy.intercept('GET', '**/api/v1/projects', {
      statusCode: 200,
      body: [
        { id: 1, name: 'Alpha', description: 'desc', status: 'active', priority: 'high' },
        { id: 2, name: 'Beta Version', description: 'New project', status: 'planning', priority: 'medium' }
      ]
    }).as('getProjectsAfterCreation');

    cy.contains('button', 'Create').click();
    cy.wait('@createProject');
    cy.wait('@getProjectsAfterCreation');

    cy.contains('Beta Version').should('be.visible');
  });
});
