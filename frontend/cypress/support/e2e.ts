import './commands'
import 'cypress-axe'
import { register as registerCypressGrep } from '@cypress/grep'
import installLogsCollector from 'cypress-terminal-report/src/installLogsCollector'

// Powers the @smoke/@regression tagging used across cypress/e2e (see
// package.json's e2e:smoke/e2e:regression scripts).
registerCypressGrep()

// Pairs with installLogsPrinter(on) in cypress.config.ts: this collects
// browser console + network activity per test, that prints it to the CI
// log on failure instead of requiring a video/screenshot download.
installLogsCollector()

// Re-armed on every page load (window:before:load fires for cy.visit() and
// every in-app navigation), since a new window replaces the old one — and
// whatever was spying on it — entirely. This is what actually lets a test
// assert "nothing silently errored," which nothing in this suite did before:
// cypress-terminal-report only prints console output after a test already
// failed some other way; it doesn't fail a test on its own.
let pageWasVisited = false

Cypress.on('window:before:load', (win) => {
  pageWasVisited = true
  cy.stub(win.console, 'error').as('consoleError')
})

// Every test that loads a real page gets this check for free. The pure API
// contract specs (cypress/e2e/api/*.cy.ts) never call cy.visit(), so
// window:before:load never fires for them and there's nothing to check —
// pageWasVisited is what tells the difference from "a page loaded and
// stayed silent." A test that deliberately provokes a console error
// (there's exactly one — the stubbed-network-failure test) opts out with
// cy.allowConsoleErrors() rather than this being watered down suite-wide.
let consoleErrorsAllowed = false

Cypress.Commands.add('allowConsoleErrors', () => {
  consoleErrorsAllowed = true
})

afterEach(() => {
  const shouldCheck = pageWasVisited && !consoleErrorsAllowed
  pageWasVisited = false
  consoleErrorsAllowed = false

  if (shouldCheck) {
    cy.get('@consoleError').should('not.have.been.called')
  }
})
