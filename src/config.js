const { dirname, basename, join } = require('path');
const { merge } = require('lodash');

const DEFAULT_CONFIG = {
  foo: 'bar',
  biz: 'baz',
};

function getConfigurationFilepath(filename = 'jest-nock-fixtures.config') {
  return join(process.cwd(), filename);
}

function getUserConfig(configFilepath) {
  try {
    return require(configFilepath);
  } catch(err) {
    console.log('loadConfig err', err);
    return;
  }
}

// merge a user provided configuration file with
// internal default config 
function loadConfig(configFilepath) {
  const userConfig = getUserConfig(configFilepath);
  return merge({}, DEFAULT_CONFIG, userConfig);
}

module.exports = loadConfig(getConfigurationFilepath());
