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
