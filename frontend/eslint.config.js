const js = require('@eslint/js');
const globals = require('globals');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = [
  { ignores: ['coverage/', 'dist/', 'landing-demos/', 'node_modules/'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, ...globals.jest },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // JSX identifiers are counted as used only by eslint-plugin-react's
      // jsx-uses-vars, which has no ESLint 10-compatible release yet. Keep the
      // check advisory as the previous react-app config did.
      'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true, caughtErrors: 'none' }],
      'no-import-assign': 'off',
      'no-case-declarations': 'warn',
      'no-constant-binary-expression': 'warn',
      'preserve-caught-error': 'warn',
      'use-isnan': 'warn',
    },
  },
];
