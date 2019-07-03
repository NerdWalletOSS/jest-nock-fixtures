const fetch = require('node-fetch');
// import fetch from 'node-fetch';

const { expect } = global;

// this server responds with a current-time-in-ms in each response body
const TEST_URL = 'http://worldclockapi.com/api/json/utc/now';

describe('implementation', () => {
  it('should not allow external requests in CI', async () => {
    const res = await fetch(TEST_URL);
    const json = await res.json();
    expect(json).toMatchSnapshot();
  });
});
