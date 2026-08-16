const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { assert, test } = require('../helpers/test-runner');
const { createApp } = require('../../src/http/app');

function request(baseUrl, route, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(new URL(route, baseUrl), { method: options.method || 'GET', headers: options.headers || {} }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null });
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

async function start(dataDir) {
  const app = createApp({ dataDir, publicDir: path.resolve(__dirname, '..', '..', 'public') });
  await app.init();
  const server = http.createServer(app.handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

test('persists the full family, tongue record, and recommendation invalidation workflow', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mingyuan-e2e-'));
  const firstServer = await start(dataDir);
  const date = '2026-08-16';
  const firstPlan = (await request(firstServer.baseUrl, `/api/recommendations?date=${date}&scope=member:member-lin`)).body;
  const member = (await request(firstServer.baseUrl, '/api/family/member-lin')).body.member;
  const blockedIngredient = firstPlan.recipe.ingredients[0].id;
  await request(firstServer.baseUrl, '/api/family/member-lin', jsonOptions('PUT', { ...member, allergies: [...member.allergies, blockedIngredient] }));
  const saferPlan = (await request(firstServer.baseUrl, `/api/recommendations?date=${date}&scope=member:member-lin`)).body;
  assert.notStrictEqual(saferPlan.recipe.id, firstPlan.recipe.id);

  const boundary = 'workflow-boundary';
  const values = {
    memberId: 'member-lin', observedAt: date,
    observations: JSON.stringify({ color: 'pink', coating: 'white', thickness: 'thick', moisture: 'normal' }),
    doctorConclusion: '专业医生确认记录', confirmedTags: JSON.stringify(['dampness-tendency']),
  };
  const multipart = Object.entries(values).map(([name, value]) => `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`).join('') + `--${boundary}--\r\n`;
  const draft = (await request(firstServer.baseUrl, '/api/tongue-records', { method: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, body: multipart })).body.record;
  await request(firstServer.baseUrl, `/api/tongue-records/${draft.id}/confirm`, { method: 'POST' });
  const confirmedPlan = (await request(firstServer.baseUrl, `/api/recommendations?date=${date}&scope=member:member-lin`)).body;
  await request(firstServer.baseUrl, `/api/tongue-records/${draft.id}/archive`, { method: 'POST' });
  const archivedPlan = (await request(firstServer.baseUrl, `/api/recommendations?date=${date}&scope=member:member-lin`)).body;
  assert.notStrictEqual(archivedPlan.historyId, confirmedPlan.historyId);
  await new Promise((resolve) => firstServer.server.close(resolve));

  const secondServer = await start(dataDir);
  const persisted = (await request(secondServer.baseUrl, '/api/family/member-lin')).body.member;
  const records = (await request(secondServer.baseUrl, '/api/tongue-records?memberId=member-lin')).body.records;
  assert.ok(persisted.allergies.includes(blockedIngredient));
  assert.strictEqual(records[0].status, 'archived');
  await new Promise((resolve) => secondServer.server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('delivery includes local startup and safety documentation', () => {
  const root = path.resolve(__dirname, '..', '..');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const launcher = fs.readFileSync(path.join(root, 'start-macos.command'), 'utf8');
  assert.ok(readme.includes('npm start'));
  assert.ok(readme.includes('不替代医疗'));
  assert.ok(launcher.includes('npm start'));
});
