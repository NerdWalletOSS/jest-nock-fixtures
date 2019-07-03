# jest-nock-fixtures

jest-nock-fixtures is a wrapper for a jest testing environment. It uses `nock` to record and playback requests during test runs.  It is heavily inspired by `https://github.com/nock/nock#nock-back`

## Install
```
npm install @nerdwallet/jest-nock-fixtures
```

## Setup

Configure `jest` to setup this wrapper before the tests in each test file are executed.  In `jest@24`, this can be achieved by configuring `setupFilesAfterEnv` (https://jestjs.io/docs/en/configuration#setupfilesafterenv-array)

---
Create a file to import and activate `@nerdwallet/jest-nock-fixtures`, in this example named `setupAfterEvvJestNockFixtures.js`

activating the test wrapper
```js
/* setupAfterEvvJestNockFixtures.js */

const createJestNockFixturesTestWrapper = require('@nerdwallet/jest-nock-fixtures');

createJestNockFixturesTestWrapper();
```

optionally, the error message that is thrown in `lockdown` mode can be configured.  This allows you to hint at ways to fix that might be specific to the repo `@nerdwallet/jest-nock-fixtures` is used in, ex:

```js
/* setupAfterEvvJestNockFixtures.js */

const createJestNockFixturesTestWrapper = require('@nerdwallet/jest-nock-fixtures');

createJestNockFixturesTestWrapper({
  unmatchedErrorMessage: reqs =>
    `unmatched requests not allowed (found ${
      reqs.length
    }).\n\nRun \`npm run test:record\` to update fixtures, and try again.`    
});
```

### Configure Jest

then configure jest to activate `@nerdwallet/jest-nock-fixtures` and wrap each test file in nock fixture recording behavior

```js
// in jest config
{
  // ... the rest of the jest config

  // run the setup file created in the examples above
  setupFilesAfterEnv: ['<rootDir>/setupAfterEvvJestNockFixtures.js'],
  // and ignore the folder where the fixtures are saved so they don't endlessly trigger re-runs in record mode
  watchPathIgnorePatterns: ['__nocks__'],

}
```

#### Modes

Available modes:
- `dryrun`: The default, use recorded nocks, allow new http calls, doesn't record anything, useful for writing new tests
- `record`: record new nocks
- `lockdown`: use recorded nocks, disables all http calls even when not nocked, doesn't record
- `wild`: all requests go out to the internet, don't replay anything, don't record anything

`@nerdwallet/jest-nock-fixtures` reads `process.env.JEST_NOCK_FIXTURES_MODE` to control its behavior, allowing script aliases to be created, for example:
```json
  "scripts": {
    "jest": "jest --coverage",
    "test": "npm run jest --",
    "test:wild": "JEST_NOCK_FIXTURES_MODE=wild npm run test --",
    "test:record": "JEST_NOCK_FIXTURES_MODE=record npm run test --",
    "test:lockdown": "JEST_NOCK_FIXTURES_MODE=lockdown npm run test --"
  },
```

`lockdown` mode is *always* used in CI environments (e.g. `process.env.CI === true`).


An example workflow:
1. develop some code and write some tests.  code in question makes external network requests
2. record all the requests that happen during local test runs
3. playback those recordings during CI test runs to ensure consistency

```sh
# while developing
npm run test -- --watch
# when ready to push
npm run test:record
# commit and push the added/changed `__nocks__/*.json` fixture files

# and then in CI enjoy peace of mind for consistent and reproducable test runs in the context of network requests
```

## Developing

Main commands:

- `npm run test`: Run unit tests and generate coverage reports

Other commands you might care about:

- `npm run lint`: Run lint
