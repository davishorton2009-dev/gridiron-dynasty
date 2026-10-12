const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    /* `try { ... } catch (e) {}` is deliberate here (localStorage can throw; that's fine) */
    rules: { 'no-unused-vars': ['error', { caughtErrors: 'none' }], 'no-empty': ['error', { allowEmptyCatch: true }], 'no-useless-assignment': 'warn' },
  },
  {
    /* the game: classic browser scripts that share globals (see index.html for load order) */
    files: ['*.js'],
    ignores: ['eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, GRID: 'readonly', GRID_LINES: 'readonly', GM: 'readonly', render: 'readonly' },
    },
  },
  {
    /* Node tooling: this config, the /sim harness, hooks */
    files: ['eslint.config.js', '.claude/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node } },
  },
];
