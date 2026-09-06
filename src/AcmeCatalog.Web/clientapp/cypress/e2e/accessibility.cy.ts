// A single pass over every distinct page design (Create/Edit share the same
// ItemForm, so they're not counted twice) checking for serious/critical
// axe-core violations. Logged in for the run so /Account/Profile is
// reachable too — Login/Register render identically either way.

const ROUTES = ['/', '/Items', '/Account/Login', '/Account/Register', '/Account/Profile', '/Home/Help']

describe('Accessibility', () => {
  beforeEach(() => {
    cy.resetDb()
    cy.loginSession()
  })

  it('has no serious or critical accessibility violations on any page', { tags: '@regression' }, () => {
    ROUTES.forEach((path) => {
      cy.visit(path)
      cy.injectAxe()
      cy.checkA11y(undefined, { includedImpacts: ['serious', 'critical'] })
    })
  })
})
