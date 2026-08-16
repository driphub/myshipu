const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { assert, test } = require('./helpers/test-runner');

test('package exposes local start, dev, and test scripts', () => {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  assert.strictEqual(packageJson.scripts.start, 'node src/server.js');
  assert.strictEqual(packageJson.scripts.dev, 'node src/server.js');
  assert.strictEqual(packageJson.scripts.test, 'node test/run.js');
});

test('test runner exits non-zero when a test fails', () => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mingyuanshipu-runner-'));
  const fixturePath = path.join(fixtureDirectory, 'failing-test.js');
  const runnerPath = path.join(__dirname, 'helpers', 'test-runner.js');

  try {
    fs.writeFileSync(
      fixturePath,
      [
        `const { test, run } = require(${JSON.stringify(runnerPath)});`,
        "test('expected failure', () => { throw new Error('fixture failure'); });",
        'run();',
      ].join('\n'),
    );

    const result = spawnSync(process.execPath, [fixturePath], { encoding: 'utf8' });

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /not ok - expected failure/);
    assert.match(result.stdout, /0 passed, 1 failed/);
  } finally {
    fs.rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});
