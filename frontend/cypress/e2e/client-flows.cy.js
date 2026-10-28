/* eslint-env cypress */
/* global cy */

describe('Client Task Flows', () => {
  beforeEach(() => {
    const clientUser = { id: 2, name: 'Client User', email: 'client@example.com', role: 'developer', github_connected: false };
    // 401 until login succeeds so /login renders the form first; afterwards
    // 200 so the permissionsLoading spinner clears on every cy.visit reload
    // (the mount-effect fallback path never clears it on a real 401).
    let authed = false;

    // Stub login and restore auth state
    cy.intercept('POST', '**/api/v1/auth/login', (req) => {
      authed = true;
      req.reply({
        statusCode: 200,
        body: {
          token: 'fake-token-123',
          user: clientUser
        }
      });
    }).as('loginReq');

    cy.intercept('GET', '**/api/v1/auth/me', (req) => {
      if (authed) {
        req.reply({ statusCode: 200, body: { user: clientUser, exp: 9999999999 } });
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
            permissions: ['can_view_tasks', 'can_update_assigned_tasks', 'can_comment_on_tasks', 'can_view_notifications', 'can_link_github_account']
          }
        });
      } else {
        req.reply({ statusCode: 401, body: { message: 'Unauthorized' } });
      }
    }).as('permissionsReq');

    // TaskList fires user + project lookups alongside the tasks fetch.
    // fetchTaskListLookups paginates them (?page=&per_page=), so both globs
    // need a trailing `*` for the query string (same idiom as the tasks stub).
    cy.intercept('GET', '**/api/v1/users*', {
      statusCode: 200,
      body: [{ id: 2, name: 'Client User', role: 'developer' }]
    });
    cy.intercept('GET', '**/api/v1/projects*', { statusCode: 200, body: [] });

    // Stub the tasks list. TaskList now requests `tasks?page=&per_page=`
    // (server pagination), so the glob needs a trailing `*` for the query
    // string; it still won't match `/tasks/<id>`.
    cy.intercept('GET', '**/api/v1/tasks*', {
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
    // Re-register the lookups TaskList fires alongside the tasks fetch so the
    // spec can wait for all three — each lookup setState re-renders the
    // filter row, which is what detaches the select mid-action.
    cy.intercept('GET', '**/api/v1/users*', {
      statusCode: 200,
      body: [{ id: 2, name: 'Client User', role: 'developer' }]
    }).as('getUsers');
    cy.intercept('GET', '**/api/v1/projects*', { statusCode: 200, body: [] }).as('getProjectsLookup');

    cy.visit('/tasks');
    cy.wait(['@getTasks', '@getUsers', '@getProjectsLookup'], { timeout: 10000 });

    // Settle: auth + page spinners gone, rows committed, and the
    // users-lookup setState re-render landed (assignee options prove it) so
    // the filter row can't detach mid-select ("element is DISABLED" flake).
    cy.contains('Loading authentication...', { timeout: 10000 }).should('not.exist');
    cy.contains('Loading tasks...', { timeout: 10000 }).should('not.exist');
    cy.contains('Learn Cypress').should('be.visible');
    cy.contains('Fix bug').should('be.visible');
    cy.get('table tbody tr', { timeout: 10000 }).should('have.length', 2);
    cy.get('select#assigneeFilter option', { timeout: 10000 }).should('have.length.gt', 1);

    // Filter by high priority (select by value; label match is case-sensitive).
    // The filter selects are enabled once loading clears, but assert it
    // explicitly with a generous timeout so a slow lookup can't flake select().
    // Selecting a priority now refetches server-side with ?priority=high
    // (filtering moved out of the client), so shadow the beforeEach stub with
    // a query-matched one returning only matching tasks, and wait for that
    // refetch before asserting.
    cy.intercept('GET', '**/api/v1/tasks*priority=high*', {
      statusCode: 200,
      body: [
        { id: 10, title: 'Learn Cypress', description: 'Write E2E tests', status: 'todo', priority: 'high', progress: 0, deadline: '2099-01-01T00:00:00Z' }
      ]
    }).as('getHighPriorityTasks');
    cy.get('select#priorityFilter', { timeout: 15000 }).should('be.visible').and('not.be.disabled').select('high');
    cy.wait('@getHighPriorityTasks');
    cy.contains('Learn Cypress').should('be.visible');
    cy.contains('Fix bug').should('not.exist');
  });

  it('updates task progress and status from detail view', () => {
    // Stub task details
    cy.intercept('GET', '**/api/v1/tasks/10', {
      statusCode: 200,
      body: { id: 10, title: 'Learn Cypress', description: 'Write E2E tests', status: 'todo', priority: 'high', progress: 0, deadline: '2099-01-01T00:00:00Z', assigned_to: 2, comments: [], github_links: [] }
    }).as('getTaskDetail');

    cy.intercept('GET', '**/api/v1/tasks/10/comments', {
      statusCode: 200,
      body: []
    }).as('getComments');

    // Trailing * is required: getUserRepos appends ?include_activity=false, and
    // a query-less glob pattern does not match a URL with a query string.
    cy.intercept('GET', '**/api/v1/github/repositories*', {
      statusCode: 200,
      body: []
    }).as('getRepos');

    // TaskDetailsUser also fetches linked GitHub items on mount; without a
    // stub this hits the real backend and its late resolution re-renders the
    // page (and delays loading=false) underneath the slider interactions.
    cy.intercept('GET', '**/api/v1/tasks/10/github', {
      statusCode: 200,
      body: []
    }).as('getGithubLinks');

    // Same lookup shadowing as the filter test: TaskList re-renders when the
    // user/project lookups resolve, which detaches the row mid-click.
    cy.intercept('GET', '**/api/v1/users*', {
      statusCode: 200,
      body: [{ id: 2, name: 'Client User', role: 'developer' }]
    }).as('getUsers');
    cy.intercept('GET', '**/api/v1/projects*', { statusCode: 200, body: [] }).as('getProjectsLookup');

    cy.intercept('PUT', '**/api/v1/tasks/10', (req) => {
      req.reply({ statusCode: 200, body: Object.assign({}, req.body, { id: 10, title: 'Learn Cypress' }) });
    }).as('updateTask');

    cy.visit('/tasks');
    cy.wait(['@getTasks', '@getUsers', '@getProjectsLookup'], { timeout: 10000 });

    // Settle before touching the row: spinners gone, row count stable, and
    // lookup-driven selects committed so no late setState detaches the row
    // mid-click ("page updated while executing" flake).
    cy.contains('Loading authentication...', { timeout: 10000 }).should('not.exist');
    cy.contains('Loading tasks...', { timeout: 10000 }).should('not.exist');
    cy.get('table', { timeout: 10000 }).should('be.visible');
    cy.get('table tbody tr', { timeout: 10000 }).should('have.length', 2);
    cy.get('select#assigneeFilter option', { timeout: 10000 }).should('have.length.gt', 1);

    // Scope the click to the settled tbody so the row can't detach mid-click.
    cy.get('table tbody', { timeout: 10000 }).contains('td', 'Learn Cypress').should('be.visible').click();
    cy.wait(['@getTaskDetail', '@getComments', '@getGithubLinks', '@getRepos']);

    cy.contains('h1', 'Learn Cypress').should('be.visible');
    
    // Update progress slider to 30%
    // Use native value setter (Cypress-recommended for React controlled inputs) +
    // wait for React to commit state (UI shows "30%") before firing mouseup
    cy.get('input[type="range"]').should('be.visible').and('not.be.disabled').trigger('mousedown');
    cy.get('input[type="range"]').then($el => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call($el[0], 30);
    }).trigger('input');
    cy.contains('span.font-bold', '30%').should('be.visible');
    cy.get('input[type="range"]').trigger('mouseup');
    cy.wait('@updateTask').its('request.body').should('deep.include', { progress: 30 });
    
    // Update progress slider to 80%
    cy.get('input[type="range"]').should('be.visible').and('not.be.disabled').trigger('mousedown');
    cy.get('input[type="range"]').then($el => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call($el[0], 80);
    }).trigger('input');
    cy.contains('span.font-bold', '80%').should('be.visible');
    cy.get('input[type="range"]').trigger('mouseup');
    cy.wait('@updateTask').its('request.body').should('deep.include', { progress: 80 });
  });
});
