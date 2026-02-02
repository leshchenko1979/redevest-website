module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'build-markdown.js',
    'tests/**/*.js',
    '!**/node_modules/**'
  ],
  verbose: true
};