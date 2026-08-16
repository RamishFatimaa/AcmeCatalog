const { defineConfig } = require('cypress')

module.exports = defineConfig({
  projectId: '5n1iur',
  reporter: 'mocha-junit-reporter',
  reporterOptions: {
    mochaFile: 'cypress/results/results-[hash].xml',
    toConsole: true,
  },
  e2e: {
    baseUrl: 'http://localhost:5274',
    setupNodeEvents(on, config) {},
  },
})