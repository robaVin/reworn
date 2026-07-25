import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      /* ---------------------------------------------------------------
       * Security rules — these are not style preferences.
       * ------------------------------------------------------------- */

      // SQL injection: Prisma's *Unsafe helpers interpolate raw strings.
      // Parameterised queries only. If a raw query is ever genuinely
      // required, it must be reviewed and disabled inline with a reason.
      'no-restricted-properties': [
        'error',
        {
          object: 'prisma',
          property: '$queryRawUnsafe',
          message:
            'SQL injection risk. Use parameterised $queryRaw`...` instead.',
        },
        {
          object: 'prisma',
          property: '$executeRawUnsafe',
          message:
            'SQL injection risk. Use parameterised $executeRaw`...` instead.',
        },
      ],

      // XSS: never render unsanitised user content as HTML.
      'react/no-danger': 'error',

      // Prevent accidental leakage of the service-role key to the browser.
      // Defence in depth — the primary guard is the `server-only` package,
      // which turns such an import into a build error.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/supabase/admin', '@/lib/db'],
              importNamePattern: '^.*$',
              message:
                'Server-only module. It must not be imported from client code. ' +
                'Access it from a Server Component, route handler or service.',
            },
          ],
        },
      ],

      /* ---------------------------------------------------------------
       * Correctness
       * ------------------------------------------------------------- */
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Server-side modules are allowed to import the server-only clients.
    files: [
      'src/lib/**',
      'src/modules/**',
      'src/app/**/route.ts',
      'prisma/**',
      'tests/**',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // The structured logger is the one place console access is legitimate.
    files: ['src/lib/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Operational/CLI scripts: stdout IS the interface, so console is allowed.
    files: ['scripts/**/*.ts', 'scripts/**/*.mjs'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'design/**',
      'docs/**',
      'next-env.d.ts',
    ],
  },
];

export default config;
