// ESLint flat config for the whole monorepo (`pnpm lint`).
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**',
    '**/generated/**',
    '**/coverage/**',
    '**/*.d.ts',
    'apps/api/.local-pg/**',
    'apps/api/storage/**',
    'apps/web/playwright-report/**',
    'apps/web/test-results/**',
    'brand guide hedax/**',
    'docs/**',
    'design-system/**',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', destructuredArrayIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // Production code logs through the structured logger, never console.
      'no-console': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, nextPlugin.configs['core-web-vitals']],
    languageOptions: { globals: { ...globals.browser } },
    settings: { next: { rootDir: 'apps/web/' } },
    rules: {
      // React Compiler-oriented rule. The React Compiler is not enabled here, and the flagged
      // effects deliberately synchronize with external systems (URL, localStorage, REST, WebSocket);
      // they are covered by the Playwright suite.
      'react-hooks/set-state-in-effect': 'off',
      // The package root of @hedax/contracts carries the zod schemas (~400 KB of JavaScript on every
      // page that imports a value from it); browser and server code here take runtime values from
      // the zod-free subpath. Types may come from the root.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { paths: [{ name: '@hedax/contracts', allowTypeImports: true, message: "Import runtime values from '@hedax/contracts/constants' (zod-free); only types from '@hedax/contracts'." }] },
      ],
    },
  },
  {
    // Tests, e2e checks and developer scripts may print to the console.
    files: ['**/test/**', '**/e2e/**', '**/*.test.ts', '**/scripts/**', '**/*.config.{ts,mjs}'],
    rules: { 'no-console': 'off' },
  },
]);
