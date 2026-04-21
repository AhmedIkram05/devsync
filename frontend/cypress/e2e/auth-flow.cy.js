/* eslint-env cypress */
/* global cy */

describe('Auth flow pages', () => {
  it('shows client-side validation on login without credentials', () => {
    cy.visit('/login');

    cy.contains('button', 'Sign In').click();

    cy.contains('Please enter both email and password').should('be.visible');
  });

  it('shows client-side validation on register with missing fields', () => {
    cy.visit('/register');

    cy.contains('button', 'Register').click();

    cy.contains('Please fill all required fields').should('be.visible');
  });

  it('submits register payload and shows success message', () => {
    cy.intercept('POST', '**/api/v1/auth/register', (req) => {
      expect(req.body).to.deep.include({
        name: 'Cypress User',
        email: 'cypress@example.com',
        role: 'client',
      });
      expect(req.body.password).to.equal('password123');

      req.reply({
        statusCode: 201,
        body: {
          user: {
            id: 200,
            email: 'cypress@example.com',
            role: 'client',
          },
        },
      });
    }).as('registerRequest');

    cy.visit('/register');

    cy.get('input[name="name"]').type('Cypress User');
    cy.get('input[name="email"]').type('cypress@example.com');
    cy.get('input[name="password"]').type('password123');
    cy.get('input[name="confirmPassword"]').type('password123');

    cy.contains('button', 'Register').click();

    cy.wait('@registerRequest');
    cy.contains('Registration successful! Redirecting to login...').should('be.visible');
  });

  it('completes the full login cycle, validates token persistence, and logs out', () => {
    // 1. Setup mock for login success
    cy.intercept('POST', '**/api/v1/auth/login', {
      statusCode: 200,
      body: {
        token: 'fake-jwt-token-777',
        user: { id: 7, name: 'Login User', email: 'login@example.com', role: 'client', github_connected: false }
      }
    }).as('loginReq');

    // Mocks for dashboard entry
    cy.intercept('GET', '**/api/v1/dashboard/client', { statusCode: 200, body: { tasks: { total: 0 }, repositories: [] } });
    cy.intercept('GET', '**/api/v1/github/status', { statusCode: 200, body: { connected: false } });

    // 2. Perform Login
    cy.visit('/login');
    cy.get('input[name="email"]').type('login@example.com');
    cy.get('input[name="password"]').type('password123');
    cy.contains('button', 'Sign In').click();

    // 3. Wait for API and routing
    cy.wait('@loginReq');
    cy.url().should('include', 'dashboard');

    // 4. Verify LocalStorage Token Persistence
    cy.window().then((win) => {
      const user = JSON.parse(win.localStorage.getItem('user'));
      expect(user).to.have.property('token', 'fake-jwt-token-777');
    });

    // Handle initial github prompt modal if it appears
    cy.get('body').then(($body) => {
      if ($body.find('button:contains("Skip for now")').length > 0) {
        cy.contains('button', 'Skip for now').click();
      }
    });

    // 5. Perform Logout
    cy.intercept('POST', '**/api/v1/auth/logout', { statusCode: 200, body: { message: 'Logged out' } }).as('logoutReq');
    cy.contains('Logout').click();

    // 6. Verify clear and redirect
    cy.wait('@logoutReq');
    cy.url().should('include', '/login');
    cy.window().then((win) => {
      expect(win.localStorage.getItem('user')).to.be.null;
    });
  });
});
