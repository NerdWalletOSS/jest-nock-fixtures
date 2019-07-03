const path = require('path');

module.exports = {
  resolveSnapshotPath: (testPath, snapshotExtension) =>
    path.join(
      path.join(path.dirname(testPath), '__snapshots__other__'),
      path.basename(testPath) + snapshotExtension
    ),
  resolveTestPath: (snapshotPath, snapshotExtension) =>
    path.join(
      path.dirname(snapshotPath),
      '..',
      path.basename(snapshotPath, snapshotExtension)
    ),
  // Example test path, used for preflight consistency check of the implementation above
  testPathForConsistencyCheck: 'consistency_check/__tests__/example.test.js',
};
