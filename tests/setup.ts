// Global test setup
// This file runs before each test suite

// Set test environment variables
process.env.NODE_ENV = 'test';

// Increase timeout for slower tests
jest.setTimeout(10000);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // Uncomment these to suppress logs during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};
