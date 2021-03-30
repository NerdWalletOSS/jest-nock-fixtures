const { dirname, basename, join } = require('path');
const { existsSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } = require('fs');
const { sortBy } = require('lodash');
const mkdirp = require('mkdirp'); // eslint-disable-line import/no-extraneous-dependencies
const nock = require('nock'); // eslint-disable-line import/no-extraneous-dependencies
const stableHash = require('./stableHash');
const chalk = require("chalk");

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
    beforeAll,
    afterAll,
    // // TODO: added
    beforeEach,
    afterEach,
    // // end TODO: added
    fixtureFolderName = '__nocks__',
    // by default this is passed the `fixtureFolderName` supplied above
    getFixtureFolderName = folderName => folderName,
    mode = MODES.DRYRUN,
    logNamePrefix = 'createNockFixturesTestWrapper',
    // getTestPath = () => {
    //   throw new Error(
    //     'createNockFixturesTestWrapper: options.getTestPath must be a function'
    //   );
    // },
    unmatchedErrorMessage = (unmatchedRequests, { fixtureFilepath }) =>
      `unmatched requests not allowed (found ${
        unmatchedRequests.length
      }). Looking for fixtures at ${fixtureFilepath}. Record fixtures and try again.`,
  } = options;

  const isRecordingMode = () => mode === MODES.RECORD;
  const isLockdownMode = () => mode === MODES.LOCKDOWN;
  const isDryrunMode = () => mode === MODES.DRYRUN;
  const isWildMode = () => mode === MODES.WILD;

  // keeping track of unmatched requests when not recording
  // is used to provide hints that fixtures need to be recorded
  // and to fail the tests in 'lockdown' mode (most useful in CI)
  let unmatched = [];
  const handleUnmatchedRequest = req => {
    console.log(yellow.bold('HANDLE UNMATCHED'));
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

  const uniqueTestName = () => currentResult?.[SYMBOL_FOR_JEST_NOCK_FIXTURES_RESULT].uniqueTestName;
  // `${logNamePrefix}: ${mode}: '${uniqueTestName}': 
  const message = (str) => ([
    [
      chalk.cyan(`${logNamePrefix}`),
      chalk.yellow(`${mode}`),
      uniqueTestName() && chalk.grey(`${uniqueTestName()}`),
    ].filter(Boolean).join(': ') + ': ',
    str
  ]).join(' ');
  const print = (str) => console.log(message(str));


  global.jasmine.getEnv().addReporter({
    jasmineStarted: (...args) => {
      // load pre-recorded fixture file if it exists
      if (existsSync(fixtureFilepath())) {
        const fixtureData = JSON.parse(readFileSync(fixtureFilepath()));
        Object.assign(fixture, fixtureData);
        print(yellow(`loaded nock fixture file: ${fixtureFilepath()}`));        
      }
    },
    // specStarted: result => {
    specStarted: result => {
      console.log('specStarted', result)

      // TODO: comment about the setting of a uniqueTestName (names can be duplicated)
      const testName = result.fullName;
      const ct = (uniqueTestNameCounters.get(testName) || 0) + 1;
      uniqueTestNameCounters.set(testName, ct);  
      // store the uniqueTestName on the jasmine result object
      result[SYMBOL_FOR_JEST_NOCK_FIXTURES_RESULT] = {
        uniqueTestName: `${testName} ${ct}`,
      };

      currentResult = result;
      // TODO: namespace this
    },
    specDone: result => {
      console.log('specDone', result);
      // Determine if test should be cleaned up
    },
    jasmineDone: (...args) => {
      console.log('JASMINE DONE', ...args);

      if (Object.keys(captured).length) {
        console.log(yellow('WRITING'));
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
        // const fixture = Object.assign({}, existingFixture, captured);
        writeFileSync(fixtureFilepath(), JSON.stringify(fixture, null, 2));
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
        console.log( // eslint-disable-line no-console,prettier/prettier
          yellow(
            `${logNamePrefix}: ${mode}: Nothing recorded, cleaning up ${fixtureFilepath()}.`
          )
        );
        console.log(red('TODO: CLEANUP', uniqueTestName));
        // // remove the fixture file
        // unlinkSync(fixtureFilepath());
        // // remove the directory if not empty
        // try {
        //   rmdirSync(fixtureDir());
        //   // message what happened
        //   console.warn( // eslint-disable-line no-console,prettier/prettier
        //     `${logNamePrefix}: ${mode}: Cleaned up ${fixtureDir()} because no fixtures were left.`
        //   );
        // } catch (err) {
        //   if (err.code !== 'ENOTEMPTY') throw err;
        // }
      }
  
    }
  });

  beforeAll(() => {
    if (!nock.isActive()) {
      nock.activate();
      // nock.enableNetConnect();
    }

    // // track requests that were not mocked
    // nock.emitter.on(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);

  });

  beforeEach(() => {
    console.log('CURRENT RESULT BE', currentResult);
    const { uniqueTestName } = currentResult[SYMBOL_FOR_JEST_NOCK_FIXTURES_RESULT];

    unmatched = [];

    nock.restore();

    if (!nock.isActive()) {
      nock.activate();
      // nock.enableNetConnect();
    }

    // explicitly enableNetConnect for dry-run
    nock.enableNetConnect();

    if (isRecordingMode()) {
      nock.recorder.rec({
        dont_print: true,
        output_objects: true,
      });  
    } else {
      console.log('fixtureFilepath()', fixtureFilepath())
      if (!isWildMode() && existsSync(fixtureFilepath())) {
        // define mocks from previously recorded fixture
        const recordings = fixture[uniqueTestName] || [];
        // console.log('LOADED RECORDINGS', recordings);
        // console.log('recordings', recordings && recordings.length);
        nock.define(recordings);
        print(
          yellow(`Defined (${
            recordings.length
          }) request mocks for '${uniqueTestName}'`)
        );
      // } else {
      //   console.log(red('CONDITION DID NOT PASS'), 
      //     !isWildMode(), existsSync(fixtureFilepath()),
      //     fixtureFilepath()
      //   )
      }

      // track requests that were not mocked
      nock.emitter.removeListener(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);
      nock.emitter.on(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);

      if (isLockdownMode()) {
        // console.log(yellow("LOCKDOWN MODE"));
        nock.disableNetConnect();
      } else {
        // nock.enableNetConnect();
        // console.log(yellow('NOT LOCKDOWN MODE'))
      }
    }
  });

  afterEach(() => {
    const { uniqueTestName } = currentResult[SYMBOL_FOR_JEST_NOCK_FIXTURES_RESULT];

    console.log('afterEach', {
      uniqueTestName,
      currentResult,
    })
  // });
  // afterAll(() => {
      // // Avoid memory-leaks: https://github.com/nock/nock/issues/2057#issuecomment-666494539
    // nock.restore();


    if (isRecordingMode()) {
      let recordings = nock.recorder.play();
      console.log(yellow('recordings.length', recordings.length));
      console.log('recordings', recordings);
      nock.recorder.clear();
      // // nock.restore();

      if (recordings.length > 0) {
        // // ensure fixtures folder exists
        // mkdirp.sync(fixtureDir());
        // // sort it
        // // recordings = sortBy(recordings, ['status', 'scope', 'method', 'path', 'body']); // eslint-disable-line prettier/prettier
        // // write it
        // writeFileSync(fixtureFilepath(), JSON.stringify(recordings, null, 4));
        captured[uniqueTestName] = recordings;
        // message what happened
        print(
          yellow(
            `${mode}: Recorded requests: ${recordings.length}`
          )
        );
        // console.log( // eslint-disable-line no-console,prettier/prettier
        //   yellow(
        //     `${logNamePrefix}: ${mode}: Recorded requests: ${recordings.length}`
        //   )
        // );
      } else if (fixture.hasOwnProperty(uniqueTestName)) {
        console.log(red('TODO: cleanup fixtures.hasOwnProperty(uniqueTestName)', uniqueTestName));
        delete fixture[uniqueTestName];
      }
      // } else if (existsSync(fixtureFilepath())) {
      //   // // cleanup obsolete nock fixture file and dir if they exist
      //   // console.warn( // eslint-disable-line no-console,prettier/prettier
      //   //   `${logNamePrefix}: ${mode}: Nothing recorded, cleaning up ${fixtureFilepath()}.`
      //   // );
      //   // // remove the fixture file
      //   // unlinkSync(fixtureFilepath());
      //   // // remove the directory if not empty
      //   // try {
      //   //   rmdirSync(fixtureDir());
      //   //   // message what happened
      //   //   console.warn( // eslint-disable-line no-console,prettier/prettier
      //   //     `${logNamePrefix}: ${mode}: Cleaned up ${fixtureDir()} because no fixtures were left.`
      //   //   );
      //   // } catch (err) {
      //   //   if (err.code !== 'ENOTEMPTY') throw err;
      //   // }
      // }

    }

    const cachedUnmatched = unmatched;
    // console.log('cachedUnmatched', cachedUnmatched);
    // report about unmatched requests
    if (cachedUnmatched.length) {
      if (isLockdownMode()) {
        throw new Error(
          message(
            chalk.red(`${unmatchedErrorMessage(cachedUnmatched, {
              fixtureFilepath: fixtureFilepath(),
            })}`)
          )
        )
      } else if (isDryrunMode()) {
        print(
          yellow(
            `${cachedUnmatched.length} unmatched requests`
          )
        );
      }
    }
  });

  afterAll(() => {
    const { uniqueTestName } = currentResult[SYMBOL_FOR_JEST_NOCK_FIXTURES_RESULT];
    const cachedUnmatched = unmatched;

    // TODO: added this
    // Avoid memory-leaks: https://github.com/nock/nock/issues/2057#issuecomment-666494539
    nock.restore();
    // full cleanup
    nock.emitter.removeListener(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);
    unmatched = [];
    nock.cleanAll();
    nock.enableNetConnect();

    console.log('after all', {
      captured
    });

    // if (Object.keys(captured).length) {
    //   console.log(yellow('WRITING'));
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
    //   // const fixture = Object.assign({}, existingFixture, captured);
    //   writeFileSync(fixtureFilepath(), JSON.stringify(fixture, null, 2));
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
    //   console.log( // eslint-disable-line no-console,prettier/prettier
    //     yellow(
    //       `${logNamePrefix}: ${mode}: Nothing recorded, cleaning up ${fixtureFilepath()}.`
    //     )
    //   );
    //   console.log(red('TODO: CLEANUP', uniqueTestName));
    //   // // remove the fixture file
    //   // unlinkSync(fixtureFilepath());
    //   // // remove the directory if not empty
    //   // try {
    //   //   rmdirSync(fixtureDir());
    //   //   // message what happened
    //   //   console.warn( // eslint-disable-line no-console,prettier/prettier
    //   //     `${logNamePrefix}: ${mode}: Cleaned up ${fixtureDir()} because no fixtures were left.`
    //   //   );
    //   // } catch (err) {
    //   //   if (err.code !== 'ENOTEMPTY') throw err;
    //   // }
    // }

    // // console.log('cachedUnmatched', cachedUnmatched);
    // // report about unmatched requests
    // if (cachedUnmatched.length) {
    //   // console.log('found unmatched.  here they are hashed',
    //   //   cachedUnmatched.map((c) => stableHash(c))
    //   // );
    //   if (isLockdownMode()) {
    //     // throw new Error(
    //     console.error(
    //       `${logNamePrefix}: ${mode}: ${unmatchedErrorMessage(cachedUnmatched, {
    //         fixtureFilepath: fixtureFilepath(),
    //       })}`
    //     );
    //   } else if (isDryrunMode()) {
    //     console.log( // eslint-disable-line no-console,prettier/prettier
    //       yellow(
    //         `${logNamePrefix}: ${mode}: ${
    //           cachedUnmatched.length
    //         } unmatched requests`
    //       )
    //     );
    //   }
    // }

    console.log('global.jasming', global.jasmine.getEnv())
  });
}

module.exports = createNockFixturesTestWrapper;
module.exports.MODES = MODES;
