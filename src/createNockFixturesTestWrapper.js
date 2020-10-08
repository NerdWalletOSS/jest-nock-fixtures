const { dirname, basename, join } = require('path');
const { existsSync, writeFileSync, unlinkSync, rmdirSync } = require('fs');
const { sortBy } = require('lodash');
const mkdirp = require('mkdirp'); // eslint-disable-line import/no-extraneous-dependencies
const nock = require('nock'); // eslint-disable-line import/no-extraneous-dependencies

const MODES = {
  DRYRUN: 'dryrun',
  LOCKDOWN: 'lockdown',
  RECORD: 'record',
  WILD: 'wild',
};

// https://github.com/nock/nock#events
const NOCK_NO_MATCH_EVENT = 'no match';

function createNockFixturesTestWrapper(options = {}) {
  const {
    beforeAll,
    afterAll,
    fixtureFolderName = '__nocks__',
    // by default this is passed the `fixtureFolderName` supplied above
    getFixtureFolderName = folderName => folderName,
    mode = MODES.DRYRUN,
    logNamePrefix = 'createNockFixturesTestWrapper',
    getTestPath = () => {
      throw new Error(
        'createNockFixturesTestWrapper: options.getTestPath must be a function'
      );
    },
    unmatchedErrorMessage = (unmatchedRequests, fixtureFilepath) =>
      `unmatched requests not allowed (found ${
        unmatchedRequests.length
      }). Looking for fixtures at ${fixtureFilepath}. Record fixtures and try again.`,
  } = options;

  const fixtureDir = () =>
    join(dirname(getTestPath()), getFixtureFolderName(fixtureFolderName));
  const fixtureFilename = () => `${basename(getTestPath())}.json`;
  const fixtureFilepath = () => join(fixtureDir(), fixtureFilename());

  const isRecordingMode = () => mode === MODES.RECORD;
  const isLockdownMode = () => mode === MODES.LOCKDOWN;
  const isDryrunMode = () => mode === MODES.DRYRUN;
  const isWildMode = () => mode === MODES.WILD;

  // keeping track of unmatched requests when not recording
  // is used to provide hints that fixtures need to be recorded
  // and to fail the tests in 'lockdown' mode (most useful in CI)
  let unmatched = [];
  const handleUnmatchedRequest = req => unmatched.push(req);

  beforeAll(() => {
    if (isRecordingMode()) {
      nock.recorder.rec({
        dont_print: true,
        output_objects: true,
      });
    } else {
      if (!isWildMode() && existsSync(fixtureFilepath())) {
        // load and define mocks from previously recorded fixtures
        const recordings = nock.loadDefs(fixtureFilepath());
        nock.define(recordings);
        console.warn( // eslint-disable-line no-console,prettier/prettier
          `${logNamePrefix}: ${mode}: Defined (${
            recordings.length
          }) request mocks for definitions found in ${fixtureFilepath()}`
        );
      }

      // track requests that were not mocked
      nock.emitter.on(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);

      if (isLockdownMode()) {
        nock.disableNetConnect();
      }
    }
  });

  afterAll(() => {
    if (isRecordingMode()) {
      let recording = nock.recorder.play();
      nock.recorder.clear();
      nock.restore();

      if (recording.length > 0) {
        // ensure fixtures folder exists
        mkdirp.sync(fixtureDir());
        // sort it
        recording = sortBy(recording, ['status', 'scope', 'method', 'path', 'body']); // eslint-disable-line prettier/prettier
        // write it
        writeFileSync(fixtureFilepath(), JSON.stringify(recording, null, 4));
        // message what happened
        console.warn( // eslint-disable-line no-console,prettier/prettier
          `${logNamePrefix}: ${mode}: Recorded requests: ${recording.length}`
        );
      } else if (existsSync(fixtureFilepath())) {
        // cleanup obsolete nock fixture file and dir if they exist
        console.warn( // eslint-disable-line no-console,prettier/prettier
          `${logNamePrefix}: ${mode}: Nothing recorded, cleaning up ${fixtureFilepath()}.`
        );
        // remove the fixture file
        unlinkSync(fixtureFilepath());
        // remove the directory if not empty
        try {
          rmdirSync(fixtureDir());
          // message what happened
          console.warn( // eslint-disable-line no-console,prettier/prettier
            `${logNamePrefix}: ${mode}: Cleaned up ${fixtureDir()} because no fixtures were left.`
          );
        } catch (err) {
          if (err.code !== 'ENOTEMPTY') throw err;
        }
      }
    }

    const unmatchedLength = unmatched.length;

    // full cleanup
    nock.emitter.removeListener(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);
    unmatched = [];
    nock.cleanAll();
    nock.enableNetConnect();

    // report about unmatched requests
    if (unmatchedLength) {
      if (isLockdownMode()) {
        throw new Error(
          `${logNamePrefix}: ${mode}: ${unmatchedErrorMessage(
            unmatchedLength,
            fixtureFilepath()
          )}`
        );
      } else if (isDryrunMode()) {
        console.warn( // eslint-disable-line no-console,prettier/prettier
          `${logNamePrefix}: ${mode}: ${unmatchedLength} unmatched requests`
        );
      }
    }
  });
}

module.exports = createNockFixturesTestWrapper;
module.exports.MODES = MODES;
