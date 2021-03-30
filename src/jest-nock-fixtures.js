const { dirname, basename, join } = require('path');
const createNockFixturesTestWrapper = require('./createNockFixturesTestWrapper');
const { getMode } = require('./mode');

// // in CI:
// //   - LOCKDOWN
// //   - disallow all http calls that haven't been mocked (throws errors)
// //   - will fail tests if any `unmatched` (read: unmocked) requests are initiated
// if (process.env.CI) {
//   process.env.JEST_NOCK_FIXTURES_MODE = 'lockdown';
// }

// // NOT in CI:
// //   - use `npm run test:<mode>` to add matching JEST_NOCK_FIXTURES_MODE
// //   - remember to run `npm run test:record` when http calls change

// // `JEST_NOCK_FIXTURES_MODE=dryrun` is default mode.
// //   explicitly/redundantly set it here and add this comment
// //   to help expose this to anyone reading this
// if (!process.env.JEST_NOCK_FIXTURES_MODE) {
//   process.env.JEST_NOCK_FIXTURES_MODE = 'dryrun';
// }

function getJestGlobalState() {
  if (Symbol && typeof Symbol.for === 'function') {
    const globalStateKey = Symbol.for('$$jest-matchers-object');
    if (globalStateKey) {
      return global[globalStateKey];
    }
    throw new Error(`jest global state at global[${globalStateKey}] not found`);
  }
  throw new Error(
    'jest-nock-fixtures requires Symbol type in language environment'
  );
}

function getJestGlobalTestPath() {
  const jestGlobalState = getJestGlobalState();
  const { state } = jestGlobalState;
  return state.testPath;
}

function getJestNockFixtureFolderName(fixtureFolderName) {
  const jestGlobalState = getJestGlobalState();
  const { state } = jestGlobalState;
  const snapshotFolderName = basename(
    dirname(state.snapshotState._snapshotPath) // eslint-disable-line no-underscore-dangle
  );
  return join(snapshotFolderName, fixtureFolderName);
}

module.exports = function createJestNockFixturesTestWrapper(options) {
  const {
    // mode = process.env.JEST_NOCK_FIXTURES_MODE,
    mode = getMode(),
    fixtureFolderName = '__nocks__',
    getFixtureFolderName = getJestNockFixtureFolderName,
    getTestPath = getJestGlobalTestPath,
    logNamePrefix = 'jest-nock-fixtures',
    unmatchedErrorMessage = (reqs, { fixtureFilepath }) =>
      `unmatched requests not allowed (found ${
        reqs.length
      }). Looking for fixtures at ${fixtureFilepath}\n\nRun with env variable \`JEST_NOCK_FIXTURES_MODE=record\` to update fixtures.`,
    // TODO: added, organize and comment this
    jasmine = global.jasmine,
  } = options;

  console.log('createJestNockFixturesTestWrapper', {
    mode,
    getMode: getMode(),
    env: process.env.JEST_NOCK_FIXTURES_MODE
  })

  return createNockFixturesTestWrapper({
    mode,
    fixtureFolderName,
    unmatchedErrorMessage,
    getFixtureFolderName,
    getTestPath,
    logNamePrefix,
    jasmine,
  });
};

module.exports.getJestNockFixtureFolderName = getJestNockFixtureFolderName;
