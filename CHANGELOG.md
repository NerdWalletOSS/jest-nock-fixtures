## 2.1.0 (2022-12-08)

- Move many logs behind a `JEST_NOCK_FIXTURES_VERBOSE` environment variable flag

## 2.0.0 (2021-03-31) benjroy

- BREAKING: changed chape of fixture file to store recordings per test.
  - allows better cleanup and cleaner diffs
  - fixtures must be re-recorded after updating
- FEAT: adds JestWatchPlugin
  - when jest is configured to use this watch plugin (see README), `mode` can be changed on the fly by pressing `'r'` when running `jest --watch ...`

## 1.1.1 (2021-03-23) benjroy

- run `npm update` and `npm audit fix` to clear security warning from dependencies

## 1.1.0 (2020-10-09) brian123zx

- When nocks encounters a number of unmatched requests, the error function it calls now includes the path it expects to find the nock file at.
- Fixes a bug introduced in v1.0.2 where the first argument to `unmatchedErrorMessage` was the length of the unmatched request array instead of the array itself

## 1.0.2 (2020-10-07) brian123zx

- fix errors not throwing when there are unmatched requests

## 1.0.1 (2019-07-03) benjroy

- fix .npm ignore so it publishes the `src/` directory

## 1.0.0 (2019-07-03) benjroy

- implementation ported and merged
