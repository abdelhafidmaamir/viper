// @ts-check
const js = require('@eslint/js');
const globals = require('globals');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  { ignores: ['node_modules/', 'out/', 'coverage/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs' },
    rules: {
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: ['src/main/**/*.js', 'scripts/**/*.js', 'eslint.config.js', 'vitest.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
  },
  {
    // Renderer scripts are classic <script> files sharing the window scope.
    // Legacy rules are relaxed here until each file is migrated to a typed module (docs/roadmap.md).
    files: ['src/renderer/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser } },
    rules: {
      'no-var': 'off',
      'prefer-const': 'off',
      eqeqeq: 'off',
      // Tracked legacy debt: visible as warnings, fixed file by file with a regression proof.
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-redeclare': 'warn',
      'no-useless-assignment': 'warn',
      'no-prototype-builtins': 'warn',
    },
  },
];
