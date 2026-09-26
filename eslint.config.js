import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['node_modules/', 'dist/', 'out/', 'coverage/', 'diagnostics/']),
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: globals.node,
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['info', 'warn', 'error'] }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
    },
  },
  {
    files: ['eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Classic <script> files sharing the window scope, migrated module by module (docs/roadmap.md).
    // Legacy findings stay visible as warnings until their file is migrated.
    files: ['src/renderer/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.commonjs },
    },
    rules: {
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-redeclare': 'warn',
      'no-useless-assignment': 'warn',
      'no-prototype-builtins': 'warn',
    },
  },
);
