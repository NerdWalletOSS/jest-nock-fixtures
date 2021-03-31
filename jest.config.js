const BASE_CONFIG = {
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  collectCoverage: true,
  // ignore these build, dist & library directories
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
  // An array of file extensions your modules use
  moduleFileExtensions: ['jsx', 'js', 'json', 'node'],
  modulePathIgnorePatterns: ['<rootDir>/build', 'npm-cache', '.npm'],
  setupFilesAfterEnv: ['<rootDir>/config/setupTestFrameworkScriptFile.js'],
  // ignore the folder where the fixtures are saved so they don't endlessly trigger re-runs in record mode
  watchPathIgnorePatterns: ['__nocks__'],
  // Indicates whether each individual test should be reported during the run
  // verbose: true,
  // setupFilesAfterEnv: [require.resolve('./src/SetupAfterEnv')],
  // // ignore the folder where the fixtures are saved so they don't endlessly trigger re-runs in record mode
  // watchPathIgnorePatterns: ['__nocks__'],

  verbose: false,
};

module.exports = {
  // apply the preset
  // TODO: preset is only the watch plugin.  only apply it here in example.
  preset: '<rootDir>',

  projects: [
    {
      // apply preset in each project that needs it, .... or merge it
      preset: '<rootDir>',
      ...BASE_CONFIG,
      displayName: 'web',
      // The test environment that will be used for testing
      testEnvironment: 'jsdom',
    },
    {
      preset: '<rootDir>',
      ...BASE_CONFIG,
      displayName: 'other',
      // store snapshots in `__snapshots__other__` instead of `__snapshots__`
      snapshotResolver: '<rootDir>/config/snapshotResolver-other.js',
      // The test environment that will be used for testing
      testEnvironment: 'node',
    },
  ],
};
