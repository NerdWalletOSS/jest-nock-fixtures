const http = require('http');
const https = require('https');
const { dirname, basename, join } = require('path');
const { existsSync, writeFileSync, unlinkSync, rmdirSync, readFileSync } = require('fs');
const { sortBy } = require('lodash');
const mkdirp = require('mkdirp'); // eslint-disable-line import/no-extraneous-dependencies
const nock = require('nock'); // eslint-disable-line import/no-extraneous-dependencies
const URL = require('url-parse');
const zlib = require('zlib');
const { MODE } = require('./mode');
const stableHash = require('./stableHash');
// https://github.com/nock/nock#events
const NOCK_NO_MATCH_EVENT = 'no match';

const METHODS = [
  "DELETE",
  "GET",
  "HEAD",
  "MERGE",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
];

const HTTP_REQUEST = http.request;
const HTTPS_REQUEST = https.request;

function getHrefFromOptions(options) {
  if (options.href) {
    return options.href;
  }

  const protocol = options.protocol || `${options.proto}:` || "http:";
  const host = options.hostname || options.host || "localhost";
  const { path, port } = options;

  const url = new URL("", true);

  url.set("protocol", protocol);
  url.set("host", host);
  url.set("pathname", path);

  if (
    port &&
    !host.includes(":") &&
    (port !== 80 || protocol !== "http:") &&
    (port !== 443 || protocol !== "https:")
  ) {
    url.set("port", port);
  }

  return url.href;
}

function createNockFixturesTestWrapper(options = {}) {
  const {
    beforeAll,
    afterAll,
    fixtureFolderName = '__nocks__',
    // by default this is passed the `fixtureFolderName` supplied above
    getFixtureFolderName = folderName => folderName,
    mode = MODE.DRYRUN,
    logNamePrefix = 'createNockFixturesTestWrapper',
    getTestPath = () => {
      throw new Error(
        'createNockFixturesTestWrapper: options.getTestPath must be a function'
      );
    },
    unmatchedErrorMessage = unmatchedRequests =>
      `unmatched requests not allowed (found ${
        unmatchedRequests.length
      }). Record fixtures and try again.`,
  } = options;

  const fixtureDir = () =>
    join(dirname(getTestPath()), getFixtureFolderName(fixtureFolderName));
  const fixtureFilename = () => `${basename(getTestPath())}.json`;
  const fixtureFilepath = () => join(fixtureDir(), fixtureFilename());

  const isRecordingMode = () => mode === MODE.RECORD;
  const isLockdownMode = () => mode === MODE.LOCKDOWN;
  const isDryrunMode = () => mode === MODE.DRYRUN;
  const isWildMode = () => mode === MODE.WILD;

  // keeping track of unmatched requests when not recording
  // is used to provide hints that fixtures need to be recorded
  // and to fail the tests in 'lockdown' mode (most useful in CI)
  let unmatched = [];
  const handleUnmatchedRequest = req => unmatched.push(req);

  // function trackUnmatchedRequests() {
  //   // track requests that were not mocked
  //   nock.emitter.on(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);
  // }

  function playbackFixtures() {
    if (existsSync(fixtureFilepath())) {
      // load and define mocks from previously recorded fixtures
      const recordings = nock.loadDefs(fixtureFilepath());
      nock.define(recordings);
      console.warn( // eslint-disable-line no-console,prettier/prettier
        `${logNamePrefix}: ${mode}: Defined (${
          recordings.length
        }) request mocks for definitions found in ${fixtureFilepath()}`
      );
    }
  };

  // Cannot use `Symbol` here, since it's referentially different
  // between the dist/ & src/ versions.
  const IS_STUBBED = "IS_STUBBED";
  const REQUEST_ARGS_WEAK_MAP = new WeakMap();

  const modes = {
    [MODE.DRYRUN]: {
      setup() {
      },
      start() {
        playbackFixtures();
      },
      handleRequest(interceptedRequest) {
        // const recordingPath = fixtureExists(interceptedRequest);
        try {
          const fixture = getFixture(interceptedRequest);
          return replayRequestFromFixture(interceptedRequest, fixture);
        } catch(err) {
          return makeActualRequest(interceptedRequest);
        }
      },
      finish() {
        // report about unmatched requests
        if (unmatched.length === 0) return;
        console.warn( // eslint-disable-line no-console,prettier/prettier
          `${logNamePrefix}: ${mode}: ${unmatched.length} unmatched requests`
        );
      },
    },
    [MODE.LOCKDOWN]: {
      setup() {},
      start() {
        playbackFixtures();
        console.log('disabling netConnect');
        nock.disableNetConnect();
      },
      handleRequest({ body, headers, method, options, req, respond }) {
        console.log('lockdown handleRequest', method, req.url);
      },
      finish() {
        // report and error if unmatched requests
        if (unmatched.length === 0) return;
        throw new Error(
          `${logNamePrefix}: ${mode}: ${unmatchedErrorMessage(unmatched)}`
        );
      },
    },
    [MODE.RECORD]: {
      setup() {},
      start() {
        nock.recorder.rec({
          dont_print: true,
          output_objects: true,
        });
      },
      handleRequest({ body, headers, method, options, req, respond }) {
        console.log('record handleRequest', method, req.url);
      },
      finish() {
        let recording = nock.recorder.play();
        nock.recorder.clear();
        nock.restore();

        if (recording.length > 0) {
          // ensure fixtures folder exists
          mkdirp.sync(fixtureDir());
          // sort it
          recording = sortBy(recording, ['status', 'scope', 'method', 'path', 'body']); // eslint-disable-line prettier/prettier
          // write it
          writeFileSync(fixtureFilepath(), JSON.stringify(recording, null, 4));
          // message what happened
          console.warn( // eslint-disable-line no-console,prettier/prettier
            `${logNamePrefix}: ${mode}: Recorded requests: ${recording.length}`
          );
        } else if (existsSync(fixtureFilepath())) {
          // cleanup obsolete nock fixture file and dir if they exist
          console.warn( // eslint-disable-line no-console,prettier/prettier
            `${logNamePrefix}: ${mode}: Nothing recorded, cleaning up ${fixtureFilepath()}.`
          );
          // remove the fixture file
          unlinkSync(fixtureFilepath());
          // remove the directory if not empty
          try {
            rmdirSync(fixtureDir());
            // message what happened
            console.warn( // eslint-disable-line no-console,prettier/prettier
              `${logNamePrefix}: ${mode}: Cleaned up ${fixtureDir()} because no fixtures were left.`
            );
          } catch (err) {
            if (err.code !== 'ENOTEMPTY') throw err;
          }
        }
      },
    },
    [MODE.WILD]: {
      setup() {},
      start() {},
      handleRequest({ body, headers, method, options, req, respond }) {
        console.log('record handleRequest', method, req.url);
      },
      finish() {},
    },
  }

  function createNockInterceptors() {
    console.log('createNockInterceptors');
    // setup nock
    nock.restore();
    nock.cleanAll();

    const interceptor = nock(/.*/).persist();

    METHODS.forEach(verb => {
      console.log('createNockInterceptors', verb);

      interceptor
        .intercept(/.*/, verb)
        .reply(async function reply(uri, body, respond) {
          console.log('reply', uri);

          const { method, req } = this;
          const { headers } = req;
          const [options] = REQUEST_ARGS_WEAK_MAP.get(req);

          const interceptedRequest = {
            body,
            headers,
            method,
            options,
            req,
            respond
          };

          // modes[mode].handleRequest(interceptedRequest);
          handleRequest(interceptedRequest);

          // recorder.handleRequest(interceptedRequest);
        });
    });

    nock.activate();
  }

  const { ClientRequest: OriginalClientRequest } = http;

  function patchNockHttpRequest() {
    if (http.ClientRequest[IS_STUBBED]) {
      // ! No need to log this, now that the fix is in place
      // console.warn(
      throw new Error(
        "Network requests are already intercepted, so there are multiple versions running!"
      );
      return;
    }

    // This is Nock's `OverriddenClientRequest`
    // const { ClientRequest } = http;
    http.ClientRequest = function recordClientRequest(url, cb) {
      console.log('patched ClientRequest', arguments.length);
      const req = new OriginalClientRequest(url, cb);
      REQUEST_ARGS_WEAK_MAP.set(req, [url, cb]);
      return req;
    };
    // TODO: diff comment: We need a way to tell that we've already overridden nock.
    http.ClientRequest[IS_STUBBED] = true;
  }

  function unpatchNockHttpRequest() {
    http.ClientRequest = OriginalClientRequest;
  }

  function deepClone(thing) {
    return JSON.parse(JSON.stringify(thing));
  }

  function normalize(interceptedRequest, response) {
    const headers = deepClone(interceptedRequest.headers);
    const { body, method, options } = interceptedRequest;
    const href = getHrefFromOptions(options);
    const url = new URL(href, true);

    // fThis is redundant with `href`, so why should we keep it?
    delete headers.host;

    // Remove ephemeral ports from superagent testing
    // ! user-agent can be "..." or ["..."]
    if (String(headers["user-agent"]).includes("node-superagent")) {
      url.set("port", undefined);
    }

    const recording = {
      request: { method, href, headers, body, url },
      response
    };

    // TODO: configurable.  see node-recorder
    // const { normalizer } = this.config;

    // if (normalizer) {
    //   normalizer(recording.request, recording.response);
    // }

    // Update href to match url object
    recording.request.href = recording.request.url.toString();

    // Don't save parsed url
    delete recording.request.url;

    return recording;
  }

  function getFixturePath(request) {
    const { href } = request;
    const url = new URL(href, true);
    const { hostname, pathname } = url;

    if (!hostname) throw new Error(`Cannot parse hostname: ${JSON.stringify(href)}`);
    if (!pathname) throw new Error(`Cannot parse pathname: ${JSON.stringify(href)}`);

    // const identity = this.identify(request);
    // const filename = identity ? `${hash}-${identity}` : hash;
    // TODO: all configurable identify from config file.  see node-recorder

    // replace all special chars in url with underscore
    const hostpath = join(hostname, pathname).replace(/[^A-Z0-9]/ig, '_');
    const filename = `${hostpath}_${stableHash(request)}.json`
    const recordingPath = join(fixtureDir(), filename);

    console.log('getFixturePath', recordingPath, filename);
    return recordingPath;
  }

  function handleResponse() {
    console.log('handleResponse')
  }

  function replayRequestFromFixture(interceptedRequest, fixture) {
    console.warn('replayRequestFromFixture');

    try {
      // const fixture = getFixture(interceptedRequest);
      return handleResponse(interceptedRequest, fixture);
    } catch(err) {
      interceptedRequest.req.emit('error', err);
    }
  }

  async function makeActualRequest(interceptedRequest) {
    console.log('makeActualRequest');
    const { statusCode, body, headers } = await makeRequest(interceptedRequest);
    interceptedRequest.respond(null, [statusCode, body, headers]);
    // return Promise.resolve()
    //   .then(() => makeRequest(interceptedRequest))
    //   .then(({ statusCode, body, headers }) => interceptedRequest.respond(null, [statusCode, body, headers]))
  }

  function getFixture() {
    const { request } = normalize(interceptedRequest);
    const recordingPath = getFixturePath(request);
    if (!existsSync(recordingPath)) throw new Error(`Missing recording ${this.getRecordingLink(recordingPath)}`);
    // TODO: use require instead?
    return JSON.parse(readFileSync(recordingPath, "utf8"));;
  }

  // TODO weird semantics in this name and operations
  function fixtureExists(interceptedRequest) {
    const { request } = normalize(interceptedRequest);
    const fixturePath = getFixturePath(request);

    return existsSync(fixturePath) ? fixturePath : false;
  }

  async function makeRequest(interceptedRequest) {
    console.log('makeRequest');

    const { body, headers, method, options } = interceptedRequest;
    const protocolRequest = (options.proto === "https" ? HTTPS_REQUEST : HTTP_REQUEST);
    // throw 1;
    const request = protocolRequest({ ...options, method, headers });
    const responsePromise = new Promise((resolve, reject) => {
      request.once("response", resolve);
      request.once("error", reject);
      request.once("timeout", reject);
    });

    // TODO: REMOVE COMMENT - Because we JSON.parse responses, we need to stringify it
    // TODO: BETTER COMMENT
    // json requests need to be re-stringified because json responses are parsed
    if (String(headers["content-type"]).includes("application/json")) {
      request.write(JSON.stringify(body));
    } else {
      request.write(body);
    }
    // throw 1;
    // TODO: combine the write and end
    request.end();
    throw 2;
    const response = await responsePromise;
    // throw 3;
    const responseBody = 'foo';
    // const responseBody = await new Promise((resolve, reject) => {
    //   const chunks = [];
    //   throw new Error('fake error');
    //   // response.on("data", (chunk) => chunks.push(chunk));
    //   // response.once("end", () => {
    //   //   const { headers } = response;

    //   //   // GitHub sends compressed, chunked payloads
    //   //   if (
    //   //     headers["content-encoding"] === "gzip" &&
    //   //     headers["transfer-encoding"] === "chunked"
    //   //   ) {
    //   //     const decoded = Buffer.concat(chunks);
    //   //     const unzipped = zlib.gunzipSync(decoded).toString("utf8");

    //   //     // TODO Is this the correct thing to do?
    //   //     delete headers["content-encoding"];
    //   //     delete headers["transfer-encoding"];

    //   //     try {
    //   //       const json = JSON.parse(unzipped);

    //   //       // TODO Is this safe to assume?
    //   //       headers["content-encoding"] = "application/json";
    //   //       return resolve(json);
    //   //     } catch (error) {
    //   //       return resolve(unzipped);
    //   //     }

    //   //     return resolve(unzipped);
    //   //   }

    //   //   const body = Buffer.concat(chunks).toString("utf8");

    //   //   // Simple services oftent send "application/json; charset=utf-8"
    //   //   if (String(headers["content-type"]).includes("application/json")) {
    //   //     try {
    //   //       return resolve(JSON.parse(body));
    //   //     } catch (error) {
    //   //       console.warn(error);
    //   //     }
    //   //   }

    //   //   return resolve(body);
    //   // });

    //   // response.once("error", reject);
    // });

    return {
      statusCode: response.statusCode,
      headers: response.headers,
      body: responseBody
    };
  }

  function _makeRequest(interceptedRequest) {
    console.log('makeRequest');
    // throw 2;
    return new Promise((resolve, reject) => {
      console.log('promise 1 insode')
      const { body, headers, method, options } = interceptedRequest;

      // const responsePromise = new Promise((resolve, reject) => {
      console.log('promise 2 insode')

      const resolveResponse = responseBody => ({
        statusCode: response.statusCode,
        headers: response.headers,
        body: responseBody,
      });

      const protocolRequest = (options.proto === "https" ? HTTPS_REQUEST : HTTP_REQUEST);
      const request = protocolRequest({ ...options, method, headers }, (err, response) => {
        console.log('promise 2 cb', err, response);
        if (err) return reject(err);
        console.log('in the res', response);
        const chunks = [];

        return resolveResponse('foo');

        // response.on("data", chunk => chunks.push(chunk));
        // response.once("end", () => {
        //   console.log('data end');

        //   const { headers } = response;

        //   // GitHub sends compressed, chunked payloads
        //   if (
        //     headers["content-encoding"] === "gzip" &&
        //     headers["transfer-encoding"] === "chunked"
        //   ) {
        //     const decoded = Buffer.concat(chunks);
        //     const unzipped = zlib.gunzipSync(decoded).toString("utf8");

        //     // TODO Is this the correct thing to do?
        //     delete headers["content-encoding"];
        //     delete headers["transfer-encoding"];

        //     try {
        //       const json = JSON.parse(unzipped);

        //       // TODO Is this safe to assume?
        //       headers["content-encoding"] = "application/json";
        //       return resolve(json);
        //     } catch (error) {
        //       return resolve(unzipped);
        //     }

        //     return resolve(unzipped);
        //   }

        //   const body = Buffer.concat(chunks).toString("utf8");

        //   // Simple services often send "application/json; charset=utf-8"
        //   if (String(headers["content-type"]).includes("application/json")) {
        //     try {
        //       return resolve(JSON.parse(body));
        //     } catch (error) {
        //       console.warn(error);
        //     }
        //   }

        //   return resolve(body);
        // });
      });

      // TODO: REMOVE COMMENT - Because we JSON.parse responses, we need to stringify it
      // TODO: BETTER COMMENT
      // json requests need to be re-stringified because json responses are parsed
      if (String(headers["content-type"]).includes("application/json")) {
        request.write(JSON.stringify(body));
      } else {
        request.write(body);
      }
      // TODO: combine the write and end
      request.end();
      // });
    });

    // const { body, headers, method, options } = interceptedRequest;
    // const protocolRequest = (options.proto === "https" ? HTTPS_REQUEST : HTTP_REQUEST);

    // const request = protocolRequest({ ...options, method, headers });

    // const responsePromise = new Promise((resolve, reject) => {
    //   request.once("response", resolve);
    //   request.once("error", reject);
    //   request.once("timeout", reject);
    // });

    // // TODO: REMOVE COMMENT - Because we JSON.parse responses, we need to stringify it
    // // TODO: BETTER COMMENT
    // // json requests need to be re-stringified because json responses are parsed
    // if (String(headers["content-type"]).includes("application/json")) {
    //   request.write(JSON.stringify(body));
    // } else {
    //   request.write(body);
    // }

    // request.end();

    // return responsePromise.then(response => {
    //   console.log('response', response);
    //   throw 3;
    // });

    // // return new Promise((resolve, reject) => {
    // //   request.once("response", resolve);
    // //   request.once("error", reject);
    // //   request.once("timeout", reject);
    // // })
    // return responsePromise
    // .then(response =>
    //   new Promise((resolve, reject) => {
    //     console.log('in the res', response);

    //     const chunks = [];

    //     response.on("data", chunk => chunks.push(chunk));
    //     response.once("end", () => {
    //       console.log('data end');

    //       const { headers } = response;

    //       // GitHub sends compressed, chunked payloads
    //       if (
    //         headers["content-encoding"] === "gzip" &&
    //         headers["transfer-encoding"] === "chunked"
    //       ) {
    //         const decoded = Buffer.concat(chunks);
    //         const unzipped = zlib.gunzipSync(decoded).toString("utf8");

    //         // TODO Is this the correct thing to do?
    //         delete headers["content-encoding"];
    //         delete headers["transfer-encoding"];

    //         try {
    //           const json = JSON.parse(unzipped);

    //           // TODO Is this safe to assume?
    //           headers["content-encoding"] = "application/json";
    //           return resolve(json);
    //         } catch (error) {
    //           return resolve(unzipped);
    //         }

    //         return resolve(unzipped);
    //       }

    //       const body = Buffer.concat(chunks).toString("utf8");

    //       // Simple services often send "application/json; charset=utf-8"
    //       if (String(headers["content-type"]).includes("application/json")) {
    //         try {
    //           return resolve(JSON.parse(body));
    //         } catch (error) {
    //           console.warn(error);
    //         }
    //       }

    //       return resolve(body);
    //     });

    //     response.once("error", reject);
    //   })
    //     .then(responseBody => ({
    //       statusCode: response.statusCode,
    //       headers: response.headers,
    //       body: responseBody,
    //     }))
    // );
  }

  function handleRequest(interceptedRequest) {
    console.log('handleRequest');
    // const { method, options } = interceptedRequest;
    // const request = (options.proto === "https"
    //   ? this.httpsRequest
    //   : this.httpRequest)({
    //   ...options,
    //   method,
    //   headers
    // });


    // const recordingPath = fixtureExists(interceptedRequest);


    // const href = getHrefFromOptions(options);
    // const link = terminalLink(href, href, {
    //   fallback: (text: string) => text
    // });

    // if (this.config.ignore) {
    //   const { request } = this.normalize(interceptedRequest);
    //   const url = new URL(request.href, true);

    //   if (this.config.ignore({ ...request, url })) {
    //     log(`Ignoring ${link}`);
    //     return this.bypassRequest(interceptedRequest);
    //   }
    // }

    return modes[mode].handleRequest(interceptedRequest);
  }

  beforeAll(() => {
    createNockInterceptors();
    patchNockHttpRequest();

    // modes[mode].setup();
    // track requests that were not mocked
    unmatched = [];
    // nock.emitter.on(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);

    // modes[mode].start();

    // if (isRecordingMode()) {
    //   // nock.recorder.rec({
    //   //   dont_print: true,
    //   //   output_objects: true,
    //   // });
    // } else {
    //   // if (!isWildMode() && existsSync(fixtureFilepath())) {
    //   //   // load and define mocks from previously recorded fixtures
    //   //   const recordings = nock.loadDefs(fixtureFilepath());
    //   //   nock.define(recordings);
    //   //   console.warn( // eslint-disable-line no-console,prettier/prettier
    //   //     `${logNamePrefix}: ${mode}: Defined (${
    //   //       recordings.length
    //   //     }) request mocks for definitions found in ${fixtureFilepath()}`
    //   //   );
    //   // }

    //   // // track requests that were not mocked
    //   // nock.emitter.on(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);

    //   // if (isLockdownMode()) {
    //   //   // console.log('disabling netConnect');
    //   //   // nock.disableNetConnect();
    //   // }
    // }
  });

  afterAll(() => {
    unpatchNockHttpRequest();

    let error;
    try {
      // modes[mode].finish();
    } catch (err) {
      error = err;
    } finally {
      // full cleanup
      nock.emitter.removeListener(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);
      // unmatched = [];
      nock.cleanAll();
      nock.enableNetConnect();

      if (error) throw error;
    }

    // if (isRecordingMode()) {
    //   let recording = nock.recorder.play();
    //   nock.recorder.clear();
    //   nock.restore();

    //   if (recording.length > 0) {
    //     // ensure fixtures folder exists
    //     mkdirp.sync(fixtureDir());
    //     // sort it
    //     recording = sortBy(recording, ['status', 'scope', 'method', 'path', 'body']); // eslint-disable-line prettier/prettier
    //     // write it
    //     writeFileSync(fixtureFilepath(), JSON.stringify(recording, null, 4));
    //     // message what happened
    //     console.warn( // eslint-disable-line no-console,prettier/prettier
    //       `${logNamePrefix}: ${mode}: Recorded requests: ${recording.length}`
    //     );
    //   } else if (existsSync(fixtureFilepath())) {
    //     // cleanup obsolete nock fixture file and dir if they exist
    //     console.warn( // eslint-disable-line no-console,prettier/prettier
    //       `${logNamePrefix}: ${mode}: Nothing recorded, cleaning up ${fixtureFilepath()}.`
    //     );
    //     // remove the fixture file
    //     unlinkSync(fixtureFilepath());
    //     // remove the directory if not empty
    //     try {
    //       rmdirSync(fixtureDir());
    //       // message what happened
    //       console.warn( // eslint-disable-line no-console,prettier/prettier
    //         `${logNamePrefix}: ${mode}: Cleaned up ${fixtureDir()} because no fixtures were left.`
    //       );
    //     } catch (err) {
    //       if (err.code !== 'ENOTEMPTY') throw err;
    //     }
    //   }
    // }

    // // full cleanup
    // nock.emitter.removeListener(NOCK_NO_MATCH_EVENT, handleUnmatchedRequest);
    // unmatched = [];
    // nock.cleanAll();
    // nock.enableNetConnect();

    // // report about unmatched requests
    // if (unmatched.length) {
    //   if (isLockdownMode()) {
    //     throw new Error(
    //       `${logNamePrefix}: ${mode}: ${unmatchedErrorMessage(unmatched)}`
    //     );
    //   } else if (isDryrunMode()) {
    //     console.warn( // eslint-disable-line no-console,prettier/prettier
    //       `${logNamePrefix}: ${mode}: ${unmatched.length} unmatched requests`
    //     );
    //   }
    // }
  });
}

module.exports = createNockFixturesTestWrapper;
