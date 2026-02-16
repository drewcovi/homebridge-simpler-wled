module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: [
    '@typescript-eslint',
  ],
  rules: {
    // Customize rules as needed
    '@typescript-eslint/no-explicit-any': 'off', // Allow any for now, can be tightened later
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': 'off', // Logging is expected in Homebridge plugins
    'semi': ['error', 'always'],
    'quotes': ['error', 'single', { avoidEscape: true }],
  },
  ignorePatterns: [
    'dist',
    'node_modules',
    'coverage',
    '*.js',
  ],
  env: {
    node: true,
    es6: true,
  },
};
