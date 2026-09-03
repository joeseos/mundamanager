import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'public/**',
    ],
  },
  ...nextCoreWebVitals,
  {
    files: ['app/actions/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        patterns: [{
          group: ['@/app/lib/shared/gang-data', '**/app/lib/shared/gang-data'],
          message:
            'Server actions must not read the gang-data accessors: they are unstable_cache entries, so a read after a write but before the tag is invalidated returns the pre-write value. Query Supabase directly instead.',
          allowTypeImports: true,
        }],
      }],
    },
  },
]

export default eslintConfig
