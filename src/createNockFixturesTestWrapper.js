const { dirname, basename, join } = require('path');
const { existsSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } = require('fs');
const { sortBy, without, before } = require('lodash');
const mkdirp = require('mkdirp'); // eslint-disable-line import/no-extraneous-dependencies
const nock = require('nock'); // eslint-disable-line import/no-extraneous-dependencies
const chalk = require("chalk");
const { MODE: { DRYRUN, LOCKDOWN, RECORD, WILD } } = require('./mode');
const { yellow, red, blue } = chalk;

const { pendingMocks, activeMocks } = nock;

const SYMBOL_FOR_JEST_NOCK_FIXTURES_RESULT = Symbol('jest-nock-fixtures-result');

// TODO:  there is a ./mode file now.  use that.
const MODES = {
  DRYRUN: 'dryrun',
  LOCKDOWN: 'lockdown',
  RECORD: 'record',
  WILD: 'wild',
};

// https://github.com/nock/nock#events
const NOCK_NO_MATCH_EVENT = 'no match';

// TODO, will this lint?
// TODO: expect comes from global
// TODO: reuse getJestGlobalState from jest-nock-fixtures file
const getCurrentTestName = () => expect.getState().currentTestName;
const getTestPath = () => expect.getState().testPath;

function createNockFixturesTestWrapper(options = {}) {
  const {
    jasmine,
    fixtureFolderName = '__nocks__',
    // by default this is passed the `fixtureFolderName` supplied above
    getFixtureFolderName = folderName => folderName,
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

  const isRecordingMode = () => mode === MODES.RECORD;
  const isLockdownMode = () => mode === MODES.LOCKDOWN;
  const isDryrunMode = () => mode === MODES.DRYRUN;
  const isWildMode = () => mode === MODES.WILD;

  // keeping track of unmatched requests when not recording
  // is used to provide hints that fixtures need to be recorded
  // and to fail the tests in 'lockdown' mode (most useful in CI)
  let unmatched = [];
  const handleUnmatchedRequest = req => {
    print(yellow.bold('HANDLE UNMATCHED'));
    unmatched.push(req);
  }

  // let fixture;

  // // https://github.com/nock/nock/issues/2057#issuecomment-666494539
  // beforeEach(() => nock.cleanAll()) // Removes mocks between unit tests so they run in isolation

  // afterAll(() => { // Run every time all the tests of a file have finished running
  //     nock.restore(); // Avoids memory-leaks
  // });
  
  // beforeAll(() => {
  //   if (!nock.isActive()) {
  //     nock.activate();
  //     // nock.enableNetConnect();
  //   }
  //     // nock.activate();
  //     // nock.enableNetConnect();
  // });

  // const originalConsoleLog = console.log;
  // console.log = console.warn = console.error = () => {};
  // console.log('getEnv', jasmine.getEnv());

  // let uniqueTestName;
  // TODO: better comment

  // a map to store counter for duplicated test names
  const uniqueTestNameCounters = new Map();
  const captured = {};
  const fixture = {};

  let currentResult;

  const fixtureDir = () =>
    join(dirname(getTestPath()), getFixtureFolderName(fixtureFolderName));
  const fixtureFilename = () => `${basename(getTestPath())}.json`;
  const fixtureFilepath = () => join(fixtureDir(), fixtureFilename());

  // TODO: maybe just store this globally
  const uniqueTestName = () => currentResult?.[SYMBOL_FOR_JEST_NOCK_FIXTURES_RESULT].uniqueTestName;

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

  const allTests = [];

  addReporter({
    jasmineStarted: (...args) => {
      // load pre-recorded fixture file if it exists
      if (existsSync(fixtureFilepath())) {
        const fixtureData = JSON.parse(readFileSync(fixtureFilepath()));
        Object.assign(fixture, fixtureData);
        print(yellow(`loaded nock fixture file: ${fixtureFilepath()}`));        
      }
    },
    specStarted: result => {
      // console.log('specStarted', result)
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

      // track requests that were not mocked
      unmatched = [];
      // nock.emitter.removeListener(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);
      // nock.emitter.on(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);

      // TODO: namespace this
    },
    specDone: result => {
      // console.log('specDone', result);

    },
    jasmineDone: (...args) => {
      // console.log('JASMINE DONE', ...args);

      currentResult = null;
      lifecycles[mode].cleanup();

      // if (!isRecordingMode()) {
      //   return;
      // }

      // // when tests are *deleted*, remove the associated fixture
      // // TODO: do this in after all
      // without(
      //   Object.keys(fixture),
      //   ...allTests.map(
      //     (result) => result[SYMBOL_FOR_JEST_NOCK_FIXTURES_RESULT].uniqueTestName,
      //   )
      // ).forEach(name => {
      //   delete fixture[name];
      //   print(yellow(`Removed obsolete fixture entry for ${name}`));
      // });

      // if (Object.keys(captured).length) {
      //   // console.log(yellow('WRITING'));
      //   // ensure fixtures folder exists
      //   mkdirp.sync(fixtureDir());
      //   // sort it
      //   // recording = sortBy(recording, ['status', 'scope', 'method', 'path', 'body']); // eslint-disable-line prettier/prettier
      //   // const fixture = existsSync(fixtureFilepath()) ? require(fixtureFilepath()) : {};
      //   // write it
      //   // writeFileSync(fixtureFilepath(), JSON.stringify(recording, null, 4));
      //   // merge keys in place
      //   Object.keys(captured).forEach(
      //     (name) => { fixture[name] = captured[name]; },
      //   );
      //   // sort the fixture entries by the order in which they were encountered
      //   const sortedFixture = allTests.reduce(
      //     (memo, { [SYMBOL_FOR_JEST_NOCK_FIXTURES_RESULT]: { uniqueTestName }}) => {
      //       if (fixture[uniqueTestName]) {
      //         memo[uniqueTestName] = fixture[uniqueTestName];
      //       }
      //       return memo;
      //     },
      //     {}
      //   );
      //   // const fixture = Object.assign({}, existingFixture, captured);
      //   writeFileSync(fixtureFilepath(), JSON.stringify(sortedFixture, null, 2));
      //   // message what happened
      //   print( // eslint-disable-line no-console,prettier/prettier
      //     yellow(
      //       // `${logNamePrefix}: ${mode}: Recorded requests: ${recording.length}`
      //       `TODO: MESSAGE ABOUT FILE WRITTEN`
      //     )
      //   );
      // // } else if (fixture.hasOwnProperty(uniqueTestName)) {
      // //   console.error('TODO: fixtures.hasOwnProperty(uniqueTestName)', uniqueTestName);
      // //   if (isRecordingMode()) {
      // //     delete fixture[uniqueTestName];
      // //   }
      // // }
      // } else if (existsSync(fixtureFilepath())) {
      //   // cleanup obsolete nock fixture file and dir if they exist
      //   print(yellow(`Nothing recorded, cleaning up ${fixtureFilepath()}.`));
      //   console.log(red('TODO: CLEANUP', uniqueTestName));
      //   // remove the fixture file
      //   unlinkSync(fixtureFilepath());
      //   // remove the directory if not empty
      //   try {
      //     rmdirSync(fixtureDir());
      //     // message what happened
      //     print(yellow(`Cleaned up ${fixtureDir()} because no fixtures were left.`));
      //     // console.warn( // eslint-disable-line no-console,prettier/prettier
      //     //   `${logNamePrefix}: ${mode}: Cleaned up ${fixtureDir()} because no fixtures were left.`
      //     // );
      //   } catch (err) {
      //     if (err.code !== 'ENOTEMPTY') throw err;
      //   }
      // }
  
    }
  });

  const lifecycles = {
    [DRYRUN]: {
      apply() {
        nock.restore();

        if (!nock.isActive()) {
          nock.activate();
        }

        // explicitly enableNetConnect for dry-run
        nock.enableNetConnect();

        // define mocks from previously recorded fixture
        const recordings = fixture[uniqueTestName()] || [];
        console.log('dryrun recordings', uniqueTestName(), recordings.length);
        nock.define(recordings);
        print(yellow(`Defined (${recordings.length}) request mocks for '${uniqueTestName()}'`));  
        // track requests that were not mocked
        nock.emitter.removeListener(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);
        nock.emitter.on(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);
        nock.enableNetConnect();

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
    [LOCKDOWN]: {
      apply() {
        nock.restore();

        if (!nock.isActive()) {
          nock.activate();
        }

        nock.disableNetConnect();

        // define mocks from previously recorded fixture
        const recordings = fixture[uniqueTestName()] || [];
        nock.define(recordings);
        print(yellow(`Defined (${recordings.length}) request mocks for '${uniqueTestName()}'`));
        // track requests that were not mocked
        nock.emitter.removeListener(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);
        nock.emitter.on(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);
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
    [RECORD]: {
      apply() {
        // explicitly enableNetConnect for dry-run
        // TODO: is this necessary for record mode?
        nock.enableNetConnect();

        nock.recorder.rec({
          dont_print: true,
          output_objects: true,
        });
      },
      finish() {
        // TODO: nock operations should be in jasmine before/after(each/all) functions
        let recordings = nock.recorder.play();
        console.log(yellow('recordings.length', recordings.length));
        // console.log('recordings', recordings);
        nock.recorder.clear();
        // // nock.restore();

        if (recordings.length > 0) {
          captured[uniqueTestName()] = recordings;
          // message what happened
          print(yellow(`Recorded requests: ${recordings.length}`));
        } else if (fixture.hasOwnProperty(uniqueTestName())) {
          // console.log(red('TODO: cleanup fixtures.hasOwnProperty(uniqueTestName)', uniqueTestName));
          delete fixture[uniqueTestName()];
        }
      },
      cleanup() {
        // when tests are *deleted*, remove the associated fixture
        // TODO: do this in after all
        without(
          Object.keys(fixture),
          ...allTests.map(
            (result) => result[SYMBOL_FOR_JEST_NOCK_FIXTURES_RESULT].uniqueTestName,
          )
        ).forEach(name => {
          delete fixture[name];
          print(yellow(`Removed obsolete fixture entry for ${name}`));
        });

        if (Object.keys(captured).length) {
          // console.log(yellow('WRITING'));
          // ensure fixtures folder exists
          mkdirp.sync(fixtureDir());
          // sort it
          // recording = sortBy(recording, ['status', 'scope', 'method', 'path', 'body']); // eslint-disable-line prettier/prettier
          // const fixture = existsSync(fixtureFilepath()) ? require(fixtureFilepath()) : {};
          // write it
          // writeFileSync(fixtureFilepath(), JSON.stringify(recording, null, 4));
          // merge keys in place
          Object.keys(captured).forEach(
            (name) => { fixture[name] = captured[name]; },
          );
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
          // const fixture = Object.assign({}, existingFixture, captured);
          writeFileSync(fixtureFilepath(), JSON.stringify(sortedFixture, null, 2));
          // message what happened
          print( // eslint-disable-line no-console,prettier/prettier
            yellow(
              // `${logNamePrefix}: ${mode}: Recorded requests: ${recording.length}`
              `TODO: MESSAGE ABOUT FILE WRITTEN`
            )
          );
        // } else if (fixture.hasOwnProperty(uniqueTestName)) {
        //   console.error('TODO: fixtures.hasOwnProperty(uniqueTestName)', uniqueTestName);
        //   if (isRecordingMode()) {
        //     delete fixture[uniqueTestName];
        //   }
        // }
        } else if (existsSync(fixtureFilepath())) {
          // cleanup obsolete nock fixture file and dir if they exist
          print(yellow(`Nothing recorded, cleaning up ${fixtureFilepath()}.`));
          console.log(red('TODO: CLEANUP', uniqueTestName));
          // remove the fixture file
          unlinkSync(fixtureFilepath());
          // remove the directory if not empty
          try {
            rmdirSync(fixtureDir());
            // message what happened
            print(yellow(`Cleaned up ${fixtureDir()} because no fixtures were left.`));
            // console.warn( // eslint-disable-line no-console,prettier/prettier
            //   `${logNamePrefix}: ${mode}: Cleaned up ${fixtureDir()} because no fixtures were left.`
            // );
          } catch (err) {
            if (err.code !== 'ENOTEMPTY') throw err;
          }
        }
      },
    },
    [WILD]: {
      apply() {},
      finish() {},
      cleanup() {},
    },
  };

  beforeAll(() => {
    if (!nock.isActive()) {
      nock.activate();
      // nock.enableNetConnect();
    }

    // // track requests that were not mocked
    // nock.emitter.on(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);

  });

  beforeEach(() => {
    // console.log('CURRENT RESULT BE', currentResult);
    const { uniqueTestName } = currentResult[SYMBOL_FOR_JEST_NOCK_FIXTURES_RESULT];

    // unmatched = [];

    nock.cleanAll();
    nock.restore();

    if (!nock.isActive()) {
      nock.activate();
      // nock.enableNetConnect();
    }

    lifecycles[mode].apply();
    // // explicitly enableNetConnect for dry-run
    // nock.enableNetConnect();

    // if (isRecordingMode()) {
    //   nock.recorder.rec({
    //     dont_print: true,
    //     output_objects: true,
    //   });  
    // } else {
    //   console.log('fixtureFilepath()', fixtureFilepath())
    //   if (!isWildMode() && existsSync(fixtureFilepath())) {
    //     // define mocks from previously recorded fixture
    //     const recordings = fixture[uniqueTestName] || [];
    //     // console.log('LOADED RECORDINGS', recordings);
    //     // console.log('recordings', recordings && recordings.length);
    //     nock.define(recordings);
    //     print(
    //       yellow(`Defined (${
    //         recordings.length
    //       }) request mocks for '${uniqueTestName}'`)
    //     );
    //   // } else {
    //   //   console.log(red('CONDITION DID NOT PASS'), 
    //   //     !isWildMode(), existsSync(fixtureFilepath()),
    //   //     fixtureFilepath()
    //   //   )
    //   }

    //   // track requests that were not mocked
    //   nock.emitter.removeListener(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);
    //   nock.emitter.on(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);

    //   if (isLockdownMode()) {
    //     // console.log(yellow("LOCKDOWN MODE"));
    //     nock.disableNetConnect();
    //   } else {
    //     // nock.enableNetConnect();
    //     // console.log(yellow('NOT LOCKDOWN MODE'))
    //   }
    // }
  });

  // TODO: cleanup this block
  afterEach(() => {
    lifecycles[mode].finish();

    // if (isRecordingMode()) {
    //   // TODO: nock operations should be in jasmine before/after(each/all) functions
    //   let recordings = nock.recorder.play();
    //   console.log(yellow('recordings.length', recordings.length));
    //   // console.log('recordings', recordings);
    //   nock.recorder.clear();
    //   // // nock.restore();

    //   if (recordings.length > 0) {
    //     captured[uniqueTestName()] = recordings;
    //     // message what happened
    //     print(
    //       yellow(
    //         `${mode}: Recorded requests: ${recordings.length}`
    //       )
    //     );
    //   } else if (fixture.hasOwnProperty(uniqueTestName())) {
    //     // console.log(red('TODO: cleanup fixtures.hasOwnProperty(uniqueTestName)', uniqueTestName));
    //     delete fixture[uniqueTestName()];
    //   }
    // }

    // const cachedUnmatched = unmatched;
    // // console.log('cachedUnmatched', cachedUnmatched);
    // // report about unmatched requests
    // if (cachedUnmatched.length) {
    //   if (isLockdownMode()) {
    //     throw new Error(
    //       message(
    //         chalk.red(`${unmatchedErrorMessage(cachedUnmatched, {
    //           fixtureFilepath: fixtureFilepath(),
    //         })}`)
    //       )
    //     )
    //   } else if (isDryrunMode()) {
    //     print(
    //       yellow(
    //         `${cachedUnmatched.length} unmatched requests`
    //       )
    //     );
    //   }
    // }
  });

  afterAll(() => {
    const { uniqueTestName } = currentResult[SYMBOL_FOR_JEST_NOCK_FIXTURES_RESULT];
    const cachedUnmatched = unmatched;

    // TODO: added this
    // Avoid memory-leaks: https://github.com/nock/nock/issues/2057#issuecomment-666494539
    nock.restore();
    // full cleanup
    nock.emitter.removeListener(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);
    // unmatched = [];
    nock.cleanAll();
    nock.enableNetConnect();

    // console.log('after all', {
    //   captured
    // });

    // console.log('jasming', jasmine.getEnv())
  });
}

module.exports = createNockFixturesTestWrapper;
module.exports.MODES = MODES;
