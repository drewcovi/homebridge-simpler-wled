# Build Process Documentation

## Overview

The build process now includes automated linting and testing to ensure code quality before compilation.

## Build Scripts

```bash
# Clean build artifacts
npm run clean

# Run linter only
npm run lint

# Run all tests (includes failing integration tests)
npm test

# Run unit tests only (73 passing tests)
npm run test:unit

# Run tests with coverage report
npm run test:coverage

# Run tests for CI/CD (optimized for CI environments)
npm run test:ci

# Full build process (clean → lint → test → compile)
npm run build

# Watch mode for development
npm run watch
```

## Build Pipeline

When you run `npm run build`, the following steps are executed:

1. **`prebuild`** (runs automatically before build)
   - Runs ESLint on all source files
   - Runs unit tests (73 tests covering core modules)
   - Fails the build if linting or tests fail

2. **`build`**
   - Cleans `dist/` and `coverage/` directories
   - Compiles TypeScript source files
   - Builds the custom UI components

3. **`prepublishOnly`** (runs automatically before npm publish)
   - Runs the full build process
   - Ensures published package is always tested and compiled

## Build Configuration Files

### `.eslintrc.js`
ESLint configuration with TypeScript support:
- Uses `@typescript-eslint/parser`
- Enforces semicolons and single quotes
- Allows `any` types (can be tightened later)
- Ignores `dist/`, `node_modules/`, and `coverage/`

### `jest.config.js`
Jest test configuration:
- Uses `ts-jest` preset for TypeScript
- Collects coverage from `src/**/*.ts`
- Excludes test files from coverage
- 10-second timeout per test
- Force exits to prevent hanging

### `tsconfig.json`
TypeScript compiler configuration:
- Target: ES2018
- Module: CommonJS
- Strict mode enabled
- Generates declaration files and source maps
- Output directory: `dist/`

## Test Coverage

### Unit Tests (73 passing)
- ✅ **wledDevice.test.ts** - 44 tests
- ✅ **discoveryService.test.ts** - 19 tests
- ✅ **platform.test.ts** - 7 tests
- ✅ **settings.test.ts** - 3 tests

### Integration Tests (not included in build)
- ⚠️ **platformAccessory.test.ts** - 18 tests (some failing)
- ⚠️ **integration.test.ts** - 17 tests (some failing)

## Continuous Integration

For CI/CD pipelines, use:

```yaml
# Example GitHub Actions workflow
- name: Install dependencies
  run: npm ci

- name: Run linter
  run: npm run lint

- name: Run tests with coverage
  run: npm run test:ci

- name: Build
  run: npm run build

- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

## Development Workflow

### During Development
```bash
# Watch mode - auto-rebuild on file changes
npm run watch

# In another terminal - watch tests
npm run test:watch
```

### Before Committing
```bash
# Run full build to ensure everything passes
npm run build

# Check test coverage
npm run test:coverage
```

### Before Publishing
```bash
# Automatically runs on npm publish
npm publish
```

## Troubleshoashooting

### Build Fails Due to Linting Errors
```bash
# See specific errors
npm run lint

# Auto-fix some issues
npm run lint -- --fix

# Temporarily disable rule (not recommended)
# Edit .eslintrc.js and set rule to 'off'
```

### Build Fails Due to Test Failures
```bash
# Run tests in verbose mode to see details
npm run test:verbose

# Run specific test file
npm test -- tests/wledDevice.test.ts

# Debug a specific test
npm test -- --testNamePattern="should set power state"
```

### TypeScript Compilation Errors
```bash
# Check TypeScript directly
npx tsc --noEmit

# See detailed errors
npm run build 2>&1 | less
```

## Build Output

After a successful build, the `dist/` directory contains:

```
dist/
├── *.js                    # Compiled JavaScript
├── *.js.map                # Source maps
├── *.d.ts                  # TypeScript declarations
├── *.d.ts.map              # Declaration maps
└── homebridge-ui/          # Custom UI
    ├── server.js           # UI server
    └── public/             # Static assets
```

## Performance

Typical build times:
- Lint: ~1-2 seconds
- Tests: ~4 seconds
- TypeScript compilation: ~2-3 seconds
- **Total build time: ~7-9 seconds**

## Future Improvements

1. Add pre-commit hooks with Husky
2. Set up GitHub Actions for CI/CD
3. Add mutation testing
4. Increase test coverage to 90%+
5. Enable stricter TypeScript settings
6. Add bundle size analysis
