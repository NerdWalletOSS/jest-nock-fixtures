const { murmur3 } = require('murmurhash-js');
const stringify = require('json-stable-stringify');

const SEED = 2;

module.exports = function stableHash(obj) {
  // ensure that the value will never be read as a number
  // by adding non-numeric characters to the return
  // because lodash set is convenient, but tricky
  return `x${murmur3(stringify(obj), SEED)}`;
}
