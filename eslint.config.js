const queryPlugin = require('@tanstack/eslint-plugin-query');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

module.exports = [
  { ignores: ['dist/**', '.expo/**'] },
  ...expoConfig,
  ...queryPlugin.configs['flat/recommended'],
  prettierConfig,
  {
    files: ['supabase/functions/**/*.ts'],
    rules: {
      // Node's resolver cannot resolve Deno npm: specifiers; deno check validates these.
      'import/no-unresolved': ['error', { ignore: ['^npm:'] }],
    },
  },
  {
    rules: {
      'import/order': [
        'error',
        {
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'type'],
        },
      ],
    },
  },
];
