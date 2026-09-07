// Bonus/stretch: cy.prompt() is Cypress's newest (beta since 15.13) feature —
// natural-language test steps translated into real Cypress commands. It
// requires a working Cypress Cloud record key and a Chromium browser, so
// this is deliberately its own file, not part of e2e:smoke/e2e:regression
// (see package.json's e2e:ai-demo script and the ci.yml step that's allowed
// to fail) — the core suite's pass/fail must never depend on Cloud
// connectivity or a beta feature's availability.

describe('AI natural-language demo', () => {
  it('logs in and finds an item using cy.prompt()', () => {
    cy.resetDb()
    cy.prompt([
      'visit /Account/Login',
      'type testuser in the username field',
      'type Test123! in the password field',
      'click the log in button',
      'visit /Items',
      'type Headphones in the search field',
      'verify an item card containing the text Headphones is visible',
    ])
  })
})
