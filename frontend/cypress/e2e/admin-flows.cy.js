/* eslint-env cypress */
/* global cy */

describe('Admin Flows', () => {
  beforeEach(() => {
    const adminUser = { id: 1, name: 'Admin Boss', email: 'admin@example.com', role: 'admin', github_connected: false };
    // 401 until login succeeds so /login renders the form first; afterwards
    // 200 so ProtectedRoute/AppRoutes clear the loading || permissionsLoading
    // spinner instead of hitting the real backend (which 401s without cookies).
    let authed = false;

    // Stub admin login
    cy.intercept('POST', '**/api/v1/auth/login', (req) => {
      authed = true;
      req.reply({
        statusCode: 200,
        body: {
          token: 'admin-token-123',
          user: adminUser
        }
      });
    }).as('loginReq');

    cy.intercept('GET', '**/api/v1/auth/me', (req) => {
      if (authed) {
        req.reply({ statusCode: 200, body: { user: adminUser, exp: 9999999999 } });
      } else {
        req.reply({ statusCode: 401, body: { message: 'Unauthorized' } });
      }
    }).as('meReq');

    // /admin/* routes are role-only (TEAM_LEAD_OR_ADMIN) but the guards still
    // wait for the permissions fetch — it must resolve for content to render.
    cy.intercept('GET', '**/api/v1/auth/permissions', (req) => {
      if (authed) {
        req.reply({
          statusCode: 200,
          body: {
            role: 'admin',
            permissions: ['can_view_tasks', 'can_manage_projects', 'can_view_all_users', 'can_manage_users', 'can_view_system_stats', 'can_generate_reports']
          }
        });
      } else {
        req.reply({ statusCode: 401, body: { message: 'Unauthorized' } });
      }
    }).as('permissionsReq');

    // Default dashboard data
    cy.intercept('GET', '**/api/v1/dashboard/admin*', {
      statusCode: 200,
      body: {
        projects: { total: 5 },
        tasks: { total: 20, completed: 15, in_progress: 3, overdue: 2 }
      }
    }).as('adminDash');

    // Mock additional API calls the AdminDashboard makes
    cy.intercept('GET', '**/api/v1/users', { statusCode: 200, body: [{ id: 1, name: 'Admin', role: 'admin' }] });
    cy.intercept('GET', '**/api/v1/audit-logs*', { statusCode: 200, body: { logs: [] } });
    // Return 5 active projects so _activeProjectsCount = 5 (AdminDashboard computes KPIs from all projects)
    // AdminProjects now requests `projects?page=&per_page=` (server pagination),
    // so the glob needs a trailing `*` to match the query string. `*` does not
    // cross `/`, so `/projects/<id>/…` still stays unmatched.
    cy.intercept('GET', '**/api/v1/projects*', {
      statusCode: 200,
      body: Array.from({ length: 5 }, (_, i) => ({
        id: i + 1, name: `Project ${i + 1}`, status: 'active', team_members: [1], created_by: 1
      }))
    });
    cy.intercept('GET', '**/api/v1/tasks', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/api/v1/reports*', { statusCode: 200, body: { reports: [] } });

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
      if ($body.find('button:contains("Skip For Now")').length > 0) {
        cy.contains('button', 'Skip For Now').click();
      }
    });
  });

  it('loads admin dashboard with correct data', () => {
    cy.wait('@adminDash');
    
    cy.contains('h1', 'Admin Dashboard').should('be.visible');
    cy.contains('Active Projects').parent().contains('5');
    cy.contains('Overdue Tasks').parent().contains('2');
  });

  it('creates a new project and manages it', () => {
    // Navigate to projects
    cy.intercept('GET', '**/api/v1/projects*', {
      statusCode: 200,
      body: [{ id: 1, name: 'Alpha', description: 'desc', status: 'active', priority: 'high' }]
    }).as('getProjects');

    cy.visit('/admin/projects');
    cy.wait('@getProjects', { timeout: 10000 });

    // Wait for the list to commit before touching the header link — clicking
    // while the post-fetch re-render is still settling detaches the element
    // ("page updated while executing"). The spinner + stable row count prove
    // loading=false committed and no skeleton is left on screen.
    cy.contains('Loading authentication...', { timeout: 10000 }).should('not.exist');
    cy.contains('Loading projects...', { timeout: 10000 }).should('not.exist');
    cy.contains('h1', 'Projects').should('be.visible');
    cy.get('table', { timeout: 10000 }).should('be.visible');
    cy.get('table tbody tr', { timeout: 10000 }).should('have.length.gt', 0);
    cy.contains('Alpha').should('be.visible');

    // Create project
    cy.intercept('POST', '**/api/v1/projects', {
      statusCode: 201,
      body: { id: 2, name: 'Beta Version', description: 'New project', status: 'planning', priority: 'medium' }
    }).as('createProject');

    // Stub the users lookup the create form fires on mount so the form's
    // loading -> ready transition is deterministic under test.
    cy.intercept('GET', '**/api/v1/users', {
      statusCode: 200,
      body: [{ id: 1, name: 'Admin', role: 'admin' }]
    }).as('getCreateUsers');

    // Creation is page-based now: /admin/projects links to
    // /admin/projects/new (ProjectForm), the old inline modal is gone.
    // The list above already proved settled, so this click can't race it.
    cy.contains('a', 'Create Project', { timeout: 15000 }).should('be.visible').and('not.be.disabled').click();
    cy.url().should('include', '/admin/projects/new');

    cy.wait('@getCreateUsers', { timeout: 10000 });
    cy.get('#project-name').should('be.visible').type('Beta Version');
    cy.get('#project-description').should('be.visible').type('New project');
    cy.get('#project-status').should('be.visible').and('not.be.disabled').select('active');

    // Override GET to return the new list once the form redirects back
    // (no project wrapper in the POST body, so it lands on /admin/projects)
    cy.intercept('GET', '**/api/v1/projects*', {
      statusCode: 200,
      body: [
        { id: 1, name: 'Alpha', description: 'desc', status: 'active', priority: 'high' },
        { id: 2, name: 'Beta Version', description: 'New project', status: 'planning', priority: 'medium' }
      ]
    }).as('getProjectsAfterCreation');

    cy.contains('button', 'Create Project').should('be.visible').and('not.be.disabled').click();
    cy.wait('@createProject');
    cy.wait('@getProjectsAfterCreation');

    cy.contains('Beta Version').should('be.visible');
  });
});
