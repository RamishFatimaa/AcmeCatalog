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
