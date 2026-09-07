import { defineConfig } from 'cypress'
import installLogsPrinter from 'cypress-terminal-report/src/installLogsPrinter'
import { plugin as cypressGrepPlugin } from '@cypress/grep/plugin'

// One Cypress project, two testing types: `component` mounts React
// components in isolation (needs this directory's own Vite/React tooling);
// `e2e` drives a real browser against the ASP.NET backend one level up
// (needs nothing from Vite/React at all, just a running server at baseUrl).
export default defineConfig({
  projectId: '5n1iur',
  reporter: 'mocha-junit-reporter',
  reporterOptions: {
    mochaFile: 'cypress/results/results-[hash].xml',
    toConsole: true,
  },
  // openMode stays at 0 retries so a failure surfaces immediately while
  // writing a test; runMode gets one retry to absorb the odd CI-only flake
  // (a slow container, a cold JIT) without masking a real regression.
  retries: {
    runMode: 1,
    openMode: 0,
  },
  e2e: {
    baseUrl: 'http://localhost:5274',
    setupNodeEvents(on, config) {
      installLogsPrinter(on)
      // @cypress/grep reads --expose grepTags=@smoke (see package.json's
      // e2e:smoke/e2e:regression scripts) to filter which tests run, and
      // this half additionally skips loading specs with zero matching tests.
      cypressGrepPlugin(config)
      return config
    },
  },
  component: {
    devServer: {
      framework: 'react',
      bundler: 'vite',
    },
  },
})
