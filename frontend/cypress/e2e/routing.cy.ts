// All 8 top-level routes React Router owns (see App.tsx), plus the one route
// deliberately NOT part of the SPA: /Items/ImagePreview/{id}, the iframe src
// behind Quick View, served directly by catalog-service as a standalone HTML
// document rather than a React route.

const catalogServiceUrl = Cypress.env('catalogServiceUrl')

describe('Client-side routing', () => {
  beforeEach(() => {
    cy.resetDb()
  })

  it('resolves every top-level route to its React page', { tags: '@smoke' }, () => {
    cy.loginSession()

    cy.request(`${catalogServiceUrl}/api/items`).its('body.0.id').then((itemId) => {
      const routes: Array<{ path: string; check: () => void }> = [
        { path: '/', check: () => cy.getBySel('hero-section').should('be.visible') },
        { path: '/Items', check: () => cy.getBySel('items-container').should('be.visible') },
        { path: '/Items/Create', check: () => cy.getBySel('submit-btn').should('contain.text', 'Save Item') },
        { path: `/Items/Edit/${itemId}`, check: () => cy.getBySel('submit-btn').should('contain.text', 'Save Changes') },
        { path: '/Account/Login', check: () => cy.getBySel('login-form').should('be.visible') },
        { path: '/Account/Register', check: () => cy.getBySel('register-form').should('be.visible') },
        { path: '/Account/Profile', check: () => cy.getBySel('profile-card').should('be.visible') },
        { path: '/Home/Help', check: () => cy.get('#help-frame').should('be.visible') },
      ]

      routes.forEach(({ path, check }) => {
        cy.visit(path)
        check()
      })
    })
  })

  it('redirects anonymous visitors away from protected routes to the login page', { tags: '@regression' }, () => {
    const protectedRoutes = ['/Items/Create', '/Items/Edit/1', '/Account/Profile']

    protectedRoutes.forEach((path) => {
      cy.visit(path)
      cy.url().should('include', '/Account/Login')
    })
  })

  it('/Items/ImagePreview/{id} still serves real server-rendered HTML', { tags: '@smoke' }, () => {
    cy.request(`${catalogServiceUrl}/api/items`).its('body.0').then((item) => {
      cy.visit(`${catalogServiceUrl}/Items/ImagePreview/${item.id}`)

      cy.title().should('eq', `${item.name} - Image Preview`)
      cy.get('#preview-image').should('have.attr', 'alt', item.name)
    })
  })
})
