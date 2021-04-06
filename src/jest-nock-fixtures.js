const { dirname, basename, join } = require('path');
const createNockFixturesTestWrapper = require('./createNockFixturesTestWrapper');
const { getMode } = require('./mode');

function getJestGlobalTestPath() {
  return global.expect.getState().testPath;
}

function getJestNockFixtureFolderName(fixtureFolderName) {
  const snapshotFolderName = basename(
    dirname(global.expect.getState().snapshotState._snapshotPath) // eslint-disable-line no-underscore-dangle
  );
  return join(snapshotFolderName, fixtureFolderName);
}

module.exports = function createJestNockFixturesTestWrapper(options = {}) {
  const {
    fixtureFolderName = '__nocks__',
    getFixtureFolderName = getJestNockFixtureFolderName,
    getTestPath = getJestGlobalTestPath,
    logNamePrefix = 'jest-nock-fixtures',
    mode = getMode(),
    unmatchedErrorMessage = (reqs, { fixtureFilepath }) =>
      `unmatched requests not allowed (found ${
        reqs.length
      }). Looking for fixtures at ${fixtureFilepath}\n\nRun with env variable \`JEST_NOCK_FIXTURES_MODE=record\` to update fixtures.`,
  } = options;

  return createNockFixturesTestWrapper({
    fixtureFolderName,
    unmatchedErrorMessage,
    getFixtureFolderName,
    getTestPath,
    jasmine: global.jasmine,
    logNamePrefix,
    mode,
  });
};

module.exports.getJestNockFixtureFolderName = getJestNockFixtureFolderName;
