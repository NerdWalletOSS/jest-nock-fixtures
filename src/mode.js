// TODO: EW.  All of this process.env interaction directly is disgusting

const MODE = {
  DRYRUN: 'dryrun',
  LOCKDOWN: 'lockdown',
  RECORD: 'record',
  WILD: 'wild',
};

function getMode() {
  return process.env.JEST_NOCK_FIXTURES_MODE;
}

function setMode(mode) {
  process.env.JEST_NOCK_FIXTURES_MODE = mode;
}

// in CI:
//   - LOCKDOWN
//   - disallow all http calls that haven't been mocked (throws errors)
//   - will fail tests if any `unmatched` (read: unmocked) requests are initiated
if (process.env.CI) {
  setMode(MODE.LOCKDOWN);
}

// NOT in CI:
//   - use `npm run test:<mode>` to add matching JEST_NOCK_FIXTURES_MODE
//   - remember to run `npm run test:record` when http calls change

// `JEST_NOCK_FIXTURES_MODE=dryrun` is default mode.
//   explicitly/redundantly set it here and add this comment
//   to help expose this to anyone reading this
if (!getMode()) {
  setMode(MODE.DRYRUN);
}

module.exports = {
  MODE,
  getMode,
  setMode,
};
