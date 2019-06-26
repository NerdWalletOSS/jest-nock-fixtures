const BASE_CONFIG = {
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  collectCoverage: true,
  // ignore these build, dist & library directories
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
  // An array of file extensions your modules use
  moduleFileExtensions: ['jsx', 'js', 'json', 'node'],
  modulePathIgnorePatterns: ['build', 'npm-cache', '.npm'],
  setupFilesAfterEnv: ['<rootDir>/config/setupTestFrameworkScriptFile.js'],
  // ignore the folder where the fixtures are saved so they don't endlessly trigger re-runs in record mode
  watchPathIgnorePatterns: ['__nocks__'],
  // Indicates whether each individual test should be reported during the run
  // verbose: true,
  verbose: false,
};

module.exports = {
  projects: [
    {
      ...BASE_CONFIG,
      displayName: 'web',
      // The test environment that will be used for testing
      testEnvironment: 'jsdom',
    },
    {
      ...BASE_CONFIG,
      displayName: 'other',
      // store snapshots in `__snapshots__other__` instead of `__snapshots__`
      snapshotResolver: '<rootDir>/config/snapshotResolver-other.js',
      // The test environment that will be used for testing
      testEnvironment: 'node',
    },
  ],
};
