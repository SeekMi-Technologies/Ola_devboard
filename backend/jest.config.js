module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['<rootDir>/test/**/*.test.js'],
  // Mongoose memory-server boot is the slow part; give it enough headroom
  // even on a cold cache.
  testTimeout: 30000,
};
