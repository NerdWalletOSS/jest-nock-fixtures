const { dirname, basename, join } = require('path');
const { existsSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } = require('fs');
const { sortBy, without, before } = require('lodash');
const mkdirp = require('mkdirp'); // eslint-disable-line import/no-extraneous-dependencies
const nock = require('nock'); // eslint-disable-line import/no-extraneous-dependencies
const chalk = require("chalk");
const { MODE: MODES } = require('./mode');
const { yellow, red, blue } = chalk;

const { pendingMocks, activeMocks } = nock;

const SYMBOL_FOR_JEST_NOCK_FIXTURES_RESULT = Symbol('jest-nock-fixtures-result');

// // TODO:  there is a ./mode file now.  use that.
// const MODES = {
//   DRYRUN: 'dryrun',
//   LOCKDOWN: 'lockdown',
//   RECORD: 'record',
//   WILD: 'wild',
// };
// const { DRYRUN, LOCKDOWN, RECORD, WILD } = MODES;

// https://github.com/nock/nock#events
const NOCK_NO_MATCH_EVENT = 'no match';

// TODO, will this lint?
// TODO: expect comes from global
// TODO: reuse getJestGlobalState from jest-nock-fixtures file
// const getCurrentTestName = () => expect.getState().currentTestName;
// const getTestPath = () => expect.getState().testPath;

function createNockFixturesTestWrapper(options = {}) {
  const {
    jasmine,
    fixtureFolderName = '__nocks__',
    // by default this is passed the `fixtureFolderName` supplied above
    getFixtureFolderName = folderName => folderName,
    getTestPath = () => {
      throw new Error(
        'createNockFixturesTestWrapper: options.getTestPath must be a function'
      );
    },
    mode = MODES.DRYRUN,
    logNamePrefix = 'createNockFixturesTestWrapper',
    unmatchedErrorMessage = (unmatchedRequests, { fixtureFilepath }) =>
      `unmatched requests not allowed (found ${
        unmatchedRequests.length
      }). Looking for fixtures at ${fixtureFilepath}. Record fixtures and try again.`,
  } = options;

  const {
    beforeEach,
    afterEach,
    beforeAll,
    afterAll,
    addReporter,
  } = jasmine.getEnv();


  // let uniqueTestName;
  // TODO: better comment

  // a map to store counter for duplicated test names
  const uniqueTestNameCounters = new Map();
  // holds recorded data from/for the fixture file on disk
  let fixture;

  let currentResult;

  const fixtureDir = () =>
    join(dirname(getTestPath()), getFixtureFolderName(fixtureFolderName));
  const fixtureFilename = () => `${basename(getTestPath())}.json`;
  const fixtureFilepath = () => join(fixtureDir(), fixtureFilename());

  // TODO: maybe just store this globally
  const uniqueTestName = () => currentResult?.[SYMBOL_FOR_JEST_NOCK_FIXTURES_RESULT].uniqueTestName;

  const allTests = [];

  // keeping track of unmatched requests when not recording
  // is used to provide hints that fixtures need to be recorded
  // and to fail the tests in 'lockdown' mode (most useful in CI)
  let unmatched = [];
  const handleUnmatchedRequest = req => {
    print(yellow.bold('HANDLE UNMATCHED'));
    unmatched.push(req);
  }

  // utility for creating user messages
  const message = (str) => 
    // `${chalk.cyan(`${logNamePrefix}`)}: ${chalk.yellow(`${mode}`)}: ${str}`;
    ([
      [
        chalk.cyan(`${logNamePrefix}`),
        chalk.yellow(`${mode}`),
        uniqueTestName() && chalk.grey(`${uniqueTestName()}`),
      ].filter(Boolean).join(': ') + ': ',
      str
    ]).join(' ');
  // utility for logging user messages
  const print = (str) => console.log(message(str));

  if (mode === MODES.WILD) {
    print('Not intercepting any requests in \'wild\' mode');
    return;
  }

  addReporter({
    specStarted: result => {
      allTests.push(result);
      // TODO: comment about the setting of a uniqueTestName (names can be duplicated)
      const testName = result.fullName;
      const ct = (uniqueTestNameCounters.get(testName) || 0) + 1;
      uniqueTestNameCounters.set(testName, ct);  
      // store the uniqueTestName on the jasmine result object
      result[SYMBOL_FOR_JEST_NOCK_FIXTURES_RESULT] = {
        uniqueTestName: `${testName} ${ct}`,
      };

      currentResult = result;
    },
    specDone: result => {
      currentResult = null;
    },
  });


  (function (lifecycles) {
    if (!lifecycles[mode]) {
      throw new Error(message(`unrecognized mode: ${JSON.stringify(mode)}. Mode must be one of the following: ${Object.values(MODES).join(', ')}`))
    }

    beforeAll(() => {
      // load pre-recorded fixture file if it exists
      try {
        fixture = JSON.parse(readFileSync(fixtureFilepath()));
        print(yellow(`loaded nock fixture file: ${fixtureFilepath()}`));
      } catch(err) {
        fixture = {};
        if (err.code !== 'ENOENT') {
          print(red(`Error parsing fixture file:\nFile:\n\t${fixtureFilepath()}\nError message:\n\t${err.message}`));
        }
      }
    });

    beforeEach(() => {
      print('beforeEach start');
      // Remove mocks between unit tests so they run in isolation
      // https://github.com/nock/nock/issues/2057#issuecomment-666494539
      nock.cleanAll();
      // Prevent memory leaks and
      // ensure that previous recorder session is cleared when in 'record' mode
      nock.restore();

      if (!nock.isActive()) {
        nock.activate();
      }

      // track requests that were not mocked
      unmatched = [];
      nock.emitter.removeListener(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);
      nock.emitter.on(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);

      print('beforeEach apply');
      lifecycles[mode].apply();
    });

    afterEach(() => {
      lifecycles[mode].finish();
    });

    afterAll(() => {
      // TODO: added this
      // Avoid memory-leaks: https://github.com/nock/nock/issues/2057#issuecomment-666494539
      nock.restore();
      // full cleanup
      nock.emitter.removeListener(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);
      nock.cleanAll();
      nock.enableNetConnect();

      lifecycles[mode].cleanup();
    });

  })({
    [MODES.DRYRUN]: {
      apply() {
        // explicitly enableNetConnect for dry-run
        nock.enableNetConnect();
        // define mocks from previously recorded fixture
        const recordings = fixture[uniqueTestName()] || [];
        print('recordings', recordings.length);
        nock.define(recordings);
        print(yellow(`Defined (${recordings.length}) request mocks for '${uniqueTestName()}'`));  
      },
      finish() {
        // report about unmatched requests
        if (unmatched.length) {
          print(
            yellow(
              `${unmatched.length} unmatched requests`
            )
          );
        }
      },
      cleanup() {},
    },
    [MODES.LOCKDOWN]: {
      apply() {
        // http requests are NOT ALLOWED in 'lockdown' mode
        nock.disableNetConnect();

        // define mocks from previously recorded fixture
        const recordings = fixture[uniqueTestName()] || [];
        nock.define(recordings);
        print(yellow(`Defined (${recordings.length}) request mocks for '${uniqueTestName()}'`));
      },
      finish() {
        // error on unmatched requests
        if (unmatched.length) {
          throw new Error(
            message(
              `${unmatchedErrorMessage(unmatched, {
                fixtureFilepath: fixtureFilepath(),
              })}`
            )
          )
        }
      },
      cleanup() {},
    },
    [MODES.RECORD]: {
      apply() {
        nock.recorder.rec({
          dont_print: true,
          output_objects: true,
        });
      },
      finish() {
        let recordings = nock.recorder.play();
        print(yellow('recordings.length', recordings.length));
        nock.recorder.clear();

        if (recordings.length > 0) {
          fixture[uniqueTestName()] = recordings;
          // message what happened
          print(yellow(`Recorded requests: ${recordings.length}`));
        } else if (fixture.hasOwnProperty(uniqueTestName())) {
          delete fixture[uniqueTestName()];
        }
      },
      cleanup() {
        // when tests are *deleted*, remove the associated fixture
        without(
          Object.keys(fixture),
          ...allTests.map(
            (result) => result[SYMBOL_FOR_JEST_NOCK_FIXTURES_RESULT].uniqueTestName,
          )
        ).forEach(name => {
          delete fixture[name];
          print(yellow(`Removed obsolete fixture entry for ${name}`));
        });

        if (Object.keys(fixture).length) {
          // ensure fixtures folder exists
          mkdirp.sync(fixtureDir());
          // sort the fixture entries by the order in which they were encountered
          const sortedFixture = allTests.reduce(
            (memo, { [SYMBOL_FOR_JEST_NOCK_FIXTURES_RESULT]: { uniqueTestName }}) => {
              if (fixture[uniqueTestName]) {
                memo[uniqueTestName] = fixture[uniqueTestName];
              }
              return memo;
            },
            {}
          );
          // write the fixture file
          writeFileSync(fixtureFilepath(), JSON.stringify(sortedFixture, null, 2));
          // message what happened
          print(yellow(`Wrote recordings to fixture file: ${fixtureFilepath()}`));
        } else if (existsSync(fixtureFilepath())) {
          // cleanup obsolete nock fixture file and dir if they exist
          print(yellow(`Nothing recorded, removing ${fixtureFilepath()}`));
          // remove the fixture file
          unlinkSync(fixtureFilepath());
          // remove the directory if not empty
          try {
            rmdirSync(fixtureDir());
            // message what happened
            print(yellow(`Removed ${fixtureDir()} directory because no fixtures were left.`));
          } catch (err) {
            if (err.code !== 'ENOTEMPTY') {
              throw err;
            }
          }
        }
      },
    },
  });
}

module.exports = createNockFixturesTestWrapper;
module.exports.MODES = MODES;
