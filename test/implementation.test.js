const fetch = require('node-fetch');
// import fetch from 'node-fetch';

const { expect } = global;

// this server responds with a current-time-in-ms in each response body
const TEST_URL = 'http://worldclockapi.com/api/json/utc/now';

describe('implementation', () => {
  it('should not allow external requests in CI', async () => {
    // const res = await fetch(TEST_URL);
    let res = await fetch(TEST_URL);
    const json = await res.json();
    expect(json).toMatchSnapshot();
    res = await fetch('https://jsonplaceholder.typicode.com/todos/1');
    await res.json();
  });

  it('Hi here is another', async () => {
    // const res = await fetch('http://worldclockapi.com/api/json/est/now');
    const res = await fetch('https://jsonplaceholder.typicode.com/todos/1');
    // https://jsonplaceholder.typicode.com/todos/1
    const json = await res.json();
    expect(json).toMatchSnapshot();
  });

  it('AND here is another', async () => {
    // const res = await fetch('http://worldclockapi.com/api/json/est/now');
    const res = await fetch('https://jsonplaceholder.typicode.com/todos/1');
    // https://jsonplaceholder.typicode.com/todos/1
    const json = await res.json();
    expect(json).toMatchSnapshot();
  });

  it('AND YET here is another', async () => {
    const res = await fetch('http://worldclockapi.com/api/json/est/now');
    // const res = await fetch('https://jsonplaceholder.typicode.com/todos/1');
    // https://jsonplaceholder.typicode.com/todos/1
    const json = await res.json();
    expect(json).toMatchSnapshot();
  });
  it('AND YET here is another', async () => {
    const res = await fetch('http://worldclockapi.com/api/json/est/now');
    // const res = await fetch('https://jsonplaceholder.typicode.com/todos/1');
    // https://jsonplaceholder.typicode.com/todos/1
    const json = await res.json();
    expect(json).toMatchSnapshot();
  });
  it('has no requests', async () => {
    // const res = await fetch('http://worldclockapi.com/api/json/est/now');
    // // const res = await fetch('https://jsonplaceholder.typicode.com/todos/1');
    // // https://jsonplaceholder.typicode.com/todos/1
    // const json = await res.json();
    // expect(json).toMatchSnapshot();
    expect(2).toBe(2);
  });
});
