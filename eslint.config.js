import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier/flat';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores([
    'node_modules/',
    'sessions/',
    'session/',
    'data/',
    'logs/',
    '.omo/',
    '.agents/',
  ]),

  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-unused-private-class-members': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-return-await': 'error',
      // Off: banyak method async sengaja me-return promise langsung
      // (sql`...`, sql.begin(...), delegasi) dan method lifecycle
      // extension (init/destroy/processMessage) wajib async by contract.
      'require-await': 'off',
      'no-throw-literal': 'error',
      'no-console': 'warn',
    },
  },

  // Prettier owns all formatting decisions, so disable stylistic rules.
  prettier,
]);
