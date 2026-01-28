module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'build-markdown.js',
    '!**/node_modules/**'
  ],
  verbose: true
};