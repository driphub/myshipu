const assert = require('assert');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

async function run() {
  let failed = 0;
  for (const item of tests) {
    try {
      await item.fn();
      process.stdout.write(`ok - ${item.name}\n`);
    } catch (error) {
      failed += 1;
      process.stderr.write(`not ok - ${item.name}\n${error.stack}\n`);
    }
  }
  process.stdout.write(`\n${tests.length - failed} passed, ${failed} failed\n`);
  if (failed) process.exitCode = 1;
}

module.exports = { assert, test, run };
