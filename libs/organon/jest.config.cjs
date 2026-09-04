/**
 * The library owns its own Jest config now that the workspace root is not a
 * package with sources of its own. `@aether-zone/organon` maps back to `src`
 * so a spec imports the library the way a consumer would, without needing a
 * build first.
 */
module.exports = {
  rootDir: '.',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    // The library is ESM under `nodenext`, so its relative imports carry a
    // `.js` extension pointing at a file only TypeScript can see. Strip it so
    // Jest resolves the `.ts` source.
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@aether-zone/organon(|/.*)$': '<rootDir>/src/$1',
  },
};
