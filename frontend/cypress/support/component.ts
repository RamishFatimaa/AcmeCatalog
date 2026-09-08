import { mount } from 'cypress/react'
// Without this, components mount with zero Bootstrap styling — .modal's real
// fixed/centered positioning never applies, so any test relying on that
// layout (e.g. a backdrop-vs-dialog click position) is only passing by
// accident of unstyled document flow, not really testing the real thing.
import 'bootstrap/dist/css/bootstrap.css'
import '../../src/index.css'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      mount: typeof mount
    }
  }
}

Cypress.Commands.add('mount', mount)
