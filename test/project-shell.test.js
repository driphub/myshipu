const fs = require('fs');
const path = require('path');
const { assert, test } = require('./helpers/test-runner');

test('package exposes local start, dev, and test scripts', () => {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  assert.strictEqual(packageJson.scripts.start, 'node src/server.js');
  assert.strictEqual(packageJson.scripts.dev, 'node src/server.js');
  assert.strictEqual(packageJson.scripts.test, 'node test/run.js');
});
