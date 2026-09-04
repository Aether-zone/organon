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
  // The package is ESM under `nodenext`, so ts-jest would emit ESM while jest
  // runs CommonJS. Jest 30.0 tolerated that; 30.5 refuses with "Must use import
  // to load ES Module". Overriding the module target for tests only keeps the
  // published build ESM and the tests loadable.
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          // `resolvePackageJsonExports` is only legal alongside a node16 or
          // bundler resolution, so it has to come off with the module target.
          moduleResolution: 'node10',
          resolvePackageJsonExports: false,
        },
      },
    ],
  },
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
