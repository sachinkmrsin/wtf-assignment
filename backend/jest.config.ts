import { JestConfigWithTsJest } from 'ts-jest';

const config: JestConfigWithTsJest = {
  // ── Coverage ──────────────────────────────────────────────────────────────
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/db/migrations/**',
    '!src/db/seeds/**',
    '!src/app.ts',        // bootstrap — not unit-testable without a real DB
  ],
  coverageDirectory:  '<rootDir>/coverage',
  coverageReporters:  ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      statements: 40,
      branches:   30,
      functions:  40,
      lines:      40,
    },
  },

  // ── Projects ──────────────────────────────────────────────────────────────
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: {
            strict: true,
            esModuleInterop: true,
          },
        }],
      },
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: {
            strict: true,
            esModuleInterop: true,
          },
        }],
      },
    },
  ],
};

export default config;
