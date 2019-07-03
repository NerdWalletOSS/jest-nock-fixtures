/* '@nerdwallet/jest-nock-fixtures' */
const createJestNockFixturesTestWrapper = require('../src/jest-nock-fixtures');

createJestNockFixturesTestWrapper({
  unmatchedErrorMessage: reqs =>
    `unmatched requests not allowed (found ${
      reqs.length
    }).\n\nRun \`npm run test:record\` to update fixtures, and try again.`    
});
