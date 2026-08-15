const { defineConfig } = require('cypress')

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5274',
    setupNodeEvents(on, config) {},
  },
})