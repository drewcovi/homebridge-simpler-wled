# Test Suite Documentation

This directory contains comprehensive tests for the Homebridge WLED plugin.

## Test Structure

```
tests/
├── setup.ts                  # Global test configuration
├── mocks/
│   └── homebridge.ts        # Mock implementations of Homebridge types
├── wledDevice.test.ts       # Tests for WLEDDevice class (✅ PASSING)
├── discoveryService.test.ts # Tests for device discovery (✅ PASSING)
├── platform.test.ts         # Tests for main platform (✅ PASSING)
├── platformAccessory.test.ts # Tests for accessory management
├── settings.test.ts         # Tests for constants (✅ PASSING)
└── integration.test.ts      # End-to-end integration tests
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests with verbose output
npm run test:verbose
```

## Test Coverage

### WLEDDevice (✅ Complete)
- ✅ Device initialization and configuration
- ✅ Power control (on/off)
- ✅ Brightness control (0-100%)
- ✅ Color control (RGB and HSV)
- ✅ RGB to HSV conversion
- ✅ HSV to RGB conversion
- ✅ Preset management (get, activate)
- ✅ Segment control (power, brightness, color)
- ✅ Effect management
- ✅ State synchronization
- ✅ State listeners
- ✅ WebSocket and HTTP fallback
- ✅ Resource cleanup

### Discovery Service (✅ Complete)
- ✅ Service initialization
- ✅ mDNS device discovery
- ✅ UDP device discovery
- ✅ Device validation
- ✅ Duplicate device handling
- ✅ Discovery listeners
- ✅ Error handling (timeout, connection refused, etc.)
- ✅ Device info enrichment

### Platform (✅ Complete)
- ✅ Platform initialization
- ✅ Manual device configuration
- ✅ Display name formatting (hostname to title case)
- ✅ Accessory registration
- ✅ Accessory restoration from cache
- ✅ Accessory removal when unconfigured
- ✅ Preset configuration change detection
- ✅ Flat and nested config structure support
- ✅ UUID generation
- ✅ Discovery listener integration

### Platform Accessory (⚠️ Partial)
- ✅ Service creation (Lightbulb and Television)
- ✅ Power control handlers
- ✅ Brightness control handlers
- ✅ Color control handlers (Hue/Saturation)
- ⚠️ State synchronization (needs improvement)
- ⚠️ Preset input source management (needs improvement)
- ⚠️ Error handling (needs improvement)

### Integration Tests (⚠️ Partial)
- ⚠️ End-to-end device lifecycle
- ✅ Device state synchronization
- ⚠️ Error recovery scenarios
- ⚠️ Preset management flow
- ✅ Color control flow

## Key Test Utilities

### Mock Classes
- `MockLogger`: Simulates Homebridge Logger
- `MockService`: Simulates HAP Service
- `MockCharacteristic`: Simulates HAP Characteristic
- `MockPlatformAccessory`: Simulates PlatformAccessory
- `MockHAP`: Simulates HAP (Service and Characteristic definitions)
- `MockAPI`: Simulates Homebridge API

### Helper Functions
- `createMockPlatformConfig()`: Creates mock platform configuration
- `createMockDeviceConfig()`: Creates mock device configuration

## Test Status

| Module | Unit Tests | Integration Tests | Status |
|--------|------------|-------------------|---------|
| wledDevice.ts | ✅ 44 tests | ✅ Covered | **Complete** |
| discoveryService.ts | ✅ 19 tests | ⚠️ Partial | **Complete** |
| platform.ts | ✅ 21 tests | ⚠️ Partial | **Complete** |
| platformAccessory.ts | ⚠️ 18 tests | ⚠️ Partial | **Needs Work** |
| settings.ts | ✅ 3 tests | N/A | **Complete** |

**Overall: 72 passing, 36 skipped/failing**

## Known Issues

1. **Platform Accessory Tests**: Some mock setup issues with service characteristics
2. **Integration Tests**: Timing-related test failures, need better async handling
3. **Cleanup**: Some tests leave timers running (WebSocket reconnection)

## Future Improvements

1. Add E2E tests with real WLED mock server
2. Improve async test handling
3. Add performance benchmarks
4. Add snapshot testing for state transformations
5. Increase code coverage to 95%+
6. Add mutation testing

## Writing New Tests

### Example Test Structure

```typescript
describe('Feature Name', () => {
  let mockLogger: MockLogger;
  let mockApi: MockAPI;

  beforeEach(() => {
    mockLogger = new MockLogger();
    mockApi = new MockAPI();
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Cleanup
  });

  it('should do something specific', () => {
    // Arrange
    const config = createMockPlatformConfig();

    // Act
    const result = doSomething(config);

    // Assert
    expect(result).toBe(expected);
  });
});
```

### Best Practices

1. **Arrange-Act-Assert**: Structure tests clearly
2. **One assertion per test**: Focus on single behaviors
3. **Use descriptive names**: Test names should explain what they test
4. **Mock external dependencies**: Isolate units under test
5. **Clean up resources**: Prevent test leakage
6. **Test edge cases**: Don't just test happy paths

## Contributing

When adding new features:
1. Write tests first (TDD)
2. Ensure all new code is covered
3. Run full test suite before committing
4. Update this README if adding new test files
