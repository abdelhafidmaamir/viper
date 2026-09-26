const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    // Each file boots the game in its own global scope.
    pool: 'forks',
    isolate: true,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
