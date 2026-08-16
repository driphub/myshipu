const path = require('path');
const fs = require('fs');
const { run } = require('./helpers/test-runner');

function findTests(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findTests(fullPath);
    return entry.name.endsWith('.test.js') ? [fullPath] : [];
  });
}

const selected = process.argv.slice(2);
const files = selected.length
  ? selected.map((file) => path.resolve(file))
  : findTests(path.join(__dirname));

for (const file of files) require(file);
run();
