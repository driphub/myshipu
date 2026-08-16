const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { assert, test } = require('../helpers/test-runner');
const { createApp } = require('../../src/http/app');

async function withServer(fn) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mingyuan-http-'));
  const app = createApp({ dataDir, publicDir: path.join(dataDir, 'public') });
  await app.init();
  const server = http.createServer(app.handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try { await fn(baseUrl); } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

function request(baseUrl, route, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(route, baseUrl);
    const req = http.request(url, { method: options.method || 'GET', headers: options.headers || {} }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body = text;
        try { body = text ? JSON.parse(text) : null; } catch (_) {}
        resolve({ status: res.statusCode, body, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function jsonOptions(method, value) {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) };
}

test('serves family CRUD and structured validation errors', async () => withServer(async (baseUrl) => {
  assert.strictEqual((await request(baseUrl, '/api/family')).body.members.length, 3);
  const created = await request(baseUrl, '/api/family', jsonOptions('POST', {
    name: '新成员', birthYear: 1991, needTags: ['low-oil'], preferenceTags: ['mild'], allergies: [],
    avoidIngredients: [], pregnancyStatus: 'none', chronicConditions: [], medications: [], notes: '',
  }));
  assert.strictEqual(created.status, 201);
  const updated = await request(baseUrl, `/api/family/${created.body.member.id}`, jsonOptions('PUT', { ...created.body.member, allergies: ['milk'] }));
  assert.deepStrictEqual(updated.body.member.allergies, ['milk']);
  assert.strictEqual((await request(baseUrl, `/api/family/${created.body.member.id}`, { method: 'DELETE' })).status, 204);
  const invalid = await request(baseUrl, '/api/family', jsonOptions('POST', { name: '' }));
  assert.strictEqual(invalid.status, 400);
  assert.strictEqual(invalid.body.code, 'VALIDATION_ERROR');
}));

test('serves library filters, details, recommendations, and rotation', async () => withServer(async (baseUrl) => {
  const library = await request(baseUrl, '/api/library?type=recipe&tag=spleen-support');
  assert.strictEqual(library.status, 200);
  assert.ok(library.body.items.every((item) => item.needTags.includes('spleen-support')));
  const detail = await request(baseUrl, `/api/library/recipe/${library.body.items[0].id}`);
  assert.strictEqual(detail.body.item.id, library.body.items[0].id);
  const plan = await request(baseUrl, '/api/recommendations?date=2026-08-16&scope=all');
  assert.strictEqual(plan.status, 200);
  const rotated = await request(baseUrl, '/api/recommendations/rotate', jsonOptions('POST', { date: '2026-08-16', scope: 'all' }));
  assert.strictEqual(rotated.status, 200);
  assert.notStrictEqual(rotated.body.historyId, plan.body.historyId);
  const child = await request(baseUrl, '/api/recommendations?date=2026-08-16&scope=member:member-an');
  assert.strictEqual(child.body.tea.medicinalTea, false);
}));

test('supports tongue draft upload and explicit state actions', async () => withServer(async (baseUrl) => {
  const boundary = 'app-test-boundary';
  const fields = {
    memberId: 'member-lin', observedAt: '2026-08-16', observations: JSON.stringify({ color: 'pink', coating: 'white', thickness: 'thick', moisture: 'normal' }),
    doctorConclusion: '医生确认', confirmedTags: JSON.stringify(['dampness-tendency']),
  };
  let multipart = '';
  for (const [name, value] of Object.entries(fields)) {
    multipart += `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
  }
  multipart += `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="tongue.webp"\r\nContent-Type: image/webp\r\n\r\nimage\r\n--${boundary}--\r\n`;
  const created = await request(baseUrl, '/api/tongue-records', {
    method: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, body: Buffer.from(multipart, 'latin1'),
  });
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.body.record.status, 'draft');
  const id = created.body.record.id;
  assert.strictEqual((await request(baseUrl, `/api/tongue-records/${id}/confirm`, { method: 'POST' })).body.record.status, 'active');
  assert.strictEqual((await request(baseUrl, `/api/tongue-records/${id}/archive`, { method: 'POST' })).body.record.status, 'archived');
  assert.strictEqual((await request(baseUrl, `/api/tongue-records/${id}/restore`, { method: 'POST' })).body.record.status, 'active');
  assert.strictEqual((await request(baseUrl, `/api/tongue-records/${id}`, { method: 'DELETE' })).status, 204);
}));

test('rejects static path traversal and returns not-found envelopes', async () => withServer(async (baseUrl) => {
  const traversal = await request(baseUrl, '/..%2Fpackage.json');
  assert.ok([400, 404].includes(traversal.status));
  const missing = await request(baseUrl, '/api/family/missing');
  assert.strictEqual(missing.status, 404);
  assert.strictEqual(missing.body.code, 'NOT_FOUND');
}));
