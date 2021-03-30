module.exports = {
  // ! Required for recorder to run across all tests
  // setupFiles: [require.resolve("./dist")],

  // ! Required to prevent `rerecord` from triggering builds
  // ? Commenting this out, since it doesn't seem to be a problem
  // watchPathIgnorePatterns: [recorder.fixturesPath],

  // ! Required for `r` shortcut
  watchPlugins: [require.resolve('./src/JestWatchPlugin')],

  // setupFilesAfterEnv: [require.resolve('./src/SetupAfterEnv')],
  // // ignore the folder where the fixtures are saved so they don't endlessly trigger re-runs in record mode
  // watchPathIgnorePatterns: ['__nocks__'],

  // reporters: [
  //   "default",
  //   require.resolve('./src/Reporter'),
  //   // ["<rootDir>/my-custom-reporter.js", {"banana": "yes", "pineapple": "no"}]
  // ]
};
