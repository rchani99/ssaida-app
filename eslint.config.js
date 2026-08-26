const queryPlugin = require('@tanstack/eslint-plugin-query');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

module.exports = [
  ...expoConfig,
  ...queryPlugin.configs['flat/recommended'],
  prettierConfig,
  {
    ignores: ['dist/*'],
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
