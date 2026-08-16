const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { assert, test } = require('../helpers/test-runner');

const root = path.join(__dirname, '..', '..');
const docs = path.join(root, 'docs');

function documentHashes() {
  const base = path.join(docs, 'superpowers');
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else files.push(path.relative(base, full));
    }
  }
  visit(base);
  return Object.fromEntries(files.sort().map((file) => [
    file,
    crypto.createHash('sha256').update(fs.readFileSync(path.join(base, file))).digest('hex'),
  ]));
}

test('static build is deterministic and preserves source documentation', () => {
  const before = documentHashes();
  execFileSync(process.execPath, [path.join(root, 'scripts', 'build-static.js')], { cwd: root });
  const firstIndex = fs.readFileSync(path.join(docs, 'index.html'), 'utf8');
  const firstSeed = fs.readFileSync(path.join(docs, 'assets', 'data', 'seed-data.json'), 'utf8');
  execFileSync(process.execPath, [path.join(root, 'scripts', 'build-static.js')], { cwd: root });

  assert.deepStrictEqual(documentHashes(), before);
  assert.strictEqual(fs.readFileSync(path.join(docs, 'index.html'), 'utf8'), firstIndex);
  assert.strictEqual(fs.readFileSync(path.join(docs, 'assets', 'data', 'seed-data.json'), 'utf8'), firstSeed);
  assert.ok(fs.existsSync(path.join(docs, '.nojekyll')));
  assert.ok(firstIndex.includes('window.__MINGYUAN_STATIC__ = true'));
  assert.ok(firstIndex.indexOf('window.__MINGYUAN_STATIC__ = true') < firstIndex.indexOf('./assets/app.js'));
  assert.strictEqual(firstIndex.includes('href="/assets/'), false);
  assert.strictEqual(firstIndex.includes('src="/assets/'), false);
  const bootstrap = JSON.parse(firstSeed);
  assert.strictEqual(bootstrap.state.schemaVersion, 1);
  assert.strictEqual(bootstrap.state.revision, 0);
  assert.ok(Array.isArray(bootstrap.state.tongueRecords.records));
  assert.ok(Array.isArray(bootstrap.state.recommendationHistory.entries));
  assert.ok(bootstrap.taxonomy.needTags.length > 0);
  for (const file of ['app.js', 'static-api.mjs', 'static-core.mjs', 'static-schema.mjs', 'static-store.mjs']) {
    assert.ok(fs.existsSync(path.join(docs, 'assets', file)), file);
  }
});
