const { assert, test } = require('../helpers/test-runner');

const toolsPromise = import('../../public/assets/data-tools.mjs');

test('export asks for privacy confirmation and downloads api data', async () => {
  const { exportData } = await toolsPromise;
  const calls = [];
  const result = await exportData({
    api: async (path) => { calls.push(path); return { filename: 'backup.json', data: { schemaVersion: 1 } }; },
    confirmFn: () => true,
    download: (filename, text) => calls.push([filename, JSON.parse(text)]),
  });
  assert.strictEqual(result, true);
  assert.deepStrictEqual(calls, ['/api/data/export', ['backup.json', { schemaVersion: 1 }]]);
});

test('cancelled export does not read private data', async () => {
  const { exportData } = await toolsPromise;
  let called = false;
  assert.strictEqual(await exportData({ api: async () => { called = true; }, confirmFn: () => false }), false);
  assert.strictEqual(called, false);
});

test('import rejects oversized files before reading and submits parsed json after confirmation', async () => {
  const { importData, IMPORT_FILE_LIMIT } = await toolsPromise;
  let read = false;
  await assert.rejects(() => importData({
    file: { size: IMPORT_FILE_LIMIT + 1, type: 'application/json', text: async () => { read = true; } },
    api: async () => {}, confirmFn: () => true,
  }), /40 MiB/);
  assert.strictEqual(read, false);

  const calls = [];
  assert.strictEqual(await importData({
    file: { size: 20, type: 'application/json', name: 'backup.json', text: async () => '{"schemaVersion":1}' },
    api: async (path, options) => calls.push([path, options]), confirmFn: () => true,
  }), true);
  assert.deepStrictEqual(calls[0][0], '/api/data/import');
  assert.deepStrictEqual(calls[0][1].body, { schemaVersion: 1 });
});

test('family page contains static-only local backup controls', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'assets', 'pages', 'family.js'), 'utf8');
  for (const marker of ['isStatic', 'export-local-data', 'import-local-data', '本地数据']) assert.ok(source.includes(marker), marker);
});
