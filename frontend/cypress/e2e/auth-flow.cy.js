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
});
