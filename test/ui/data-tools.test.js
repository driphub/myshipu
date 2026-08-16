const { assert, test } = require('../helpers/test-runner');

const toolsPromise = import('../../public/assets/data-tools.mjs');

test('export asks for privacy confirmation and downloads api data', async () => {
  const { exportData } = await toolsPromise;
  const calls = [];
  const result = await exportData({
    api: async (path) => { calls.push(path); return { filename: 'backup.json', data: { schemaVersion: 1 } }; },
    confirmFn: () => true,
    download: (filename, text) => calls.push([filename, text]),
  });
  assert.strictEqual(result, true);
  assert.deepStrictEqual(calls, ['/api/data/export', ['backup.json', '{"schemaVersion":1}\n']]);
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
  const validBytes = new TextEncoder().encode('{"schemaVersion":1}');
  assert.strictEqual(await importData({
    file: { size: validBytes.byteLength, type: 'application/json', name: 'backup.json', arrayBuffer: async () => validBytes.buffer },
    api: async (path, options) => calls.push([path, options]), confirmFn: () => true,
  }), true);
  assert.deepStrictEqual(calls[0][0], '/api/data/import');
  assert.deepStrictEqual(calls[0][1].body, { schemaVersion: 1 });
});

test('import rejects invalid UTF-8 bytes', async () => {
  const { importData } = await toolsPromise;
  const bytes = Uint8Array.from([0xff, 0xfe, 0x7b, 0x7d]);
  await assert.rejects(() => importData({
    file: { size: bytes.byteLength, type: 'application/json', name: 'backup.json', arrayBuffer: async () => bytes.buffer },
    api: async () => {}, confirmFn: () => true,
  }), /UTF-8/);
});

test('family page contains static-only local backup controls', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'assets', 'pages', 'family.js'), 'utf8');
  for (const marker of ['isStatic', 'export-local-data', 'import-local-data', '本地数据']) assert.ok(source.includes(marker), marker);
});
