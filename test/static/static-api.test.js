const { assert, test } = require('../helpers/test-runner');
const { createSeedData } = require('../../src/storage/seed-data');
const { TAXONOMY, LABELS } = require('../../src/domain/taxonomy');

const apiPromise = import('../../public/assets/static-api.mjs');
const storePromise = import('../../public/assets/static-store.mjs');

function seedState() {
  const seed = createSeedData();
  return {
    schemaVersion: 1, revision: 0, family: seed.family, recipes: seed.recipes, teas: seed.teas,
    tongueRecords: seed['tongue-records'], recommendationHistory: seed['recommendation-history'],
  };
}

function backend() {
  let value;
  let queue = Promise.resolve();
  const clone = (input) => input == null ? input : JSON.parse(JSON.stringify(input));
  return {
    read: async () => clone(value),
    transact(mutator) {
      const operation = queue.then(() => { value = clone(mutator(clone(value))); return clone(value); });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}

async function context() {
  const { createStaticApi } = await apiPromise;
  const { createStateStore } = await storePromise;
  const bootstrap = { state: seedState(), taxonomy: TAXONOMY, labels: LABELS };
  const store = createStateStore({ backend: backend(), loadBootstrap: async () => bootstrap });
  let sequence = 0;
  const api = createStaticApi({
    store,
    loadBootstrap: async () => bootstrap,
    clock: () => new Date('2026-08-16T08:00:00.000Z'),
    idGenerator: (prefix) => `${prefix}-generated-${++sequence}`,
  });
  return { api, store };
}

class Fields {
  constructor(values) { this.values = values; }
  get(name) { return this.values[name] ?? null; }
}

test('static api supports family CRUD and library queries', async () => {
  const { api } = await context();
  assert.strictEqual((await api('/api/family')).members.length, 3);
  const created = await api('/api/family', { method: 'POST', body: {
    name: '测试家人', birthYear: 1990, needTags: [], preferenceTags: [], allergies: [], avoidIngredients: [],
    pregnancyStatus: 'none', chronicConditions: [], medications: [], notes: '',
  } });
  assert.strictEqual(created.member.name, '测试家人');
  const updated = await api(`/api/family/${created.member.id}`, { method: 'PUT', body: { ...created.member, name: '更新家人' } });
  assert.strictEqual(updated.member.name, '更新家人');
  await api(`/api/family/${created.member.id}`, { method: 'DELETE' });
  assert.strictEqual((await api('/api/family')).members.length, 3);
  const library = await api('/api/library?type=tea&q=%E9%99%88%E7%9A%AE&tag=spleen-support');
  assert.ok(library.items.length > 0);
  assert.strictEqual((await api(`/api/library/tea/${library.items[0].id}`)).item.type, 'tea');
});

test('static api reuses and rotates safe recommendation history', async () => {
  const { api } = await context();
  const first = await api('/api/recommendations?date=2026-08-16&scope=member%3Amember-lin');
  const reused = await api('/api/recommendations?date=2026-08-16&scope=member%3Amember-lin');
  assert.strictEqual(reused.historyId, first.historyId);
  const rotated = await api('/api/recommendations/rotate', { method: 'POST', body: { date: '2026-08-16', scope: 'member:member-lin' } });
  assert.notStrictEqual(`${rotated.recipe.id}:${rotated.tea.id}`, `${first.recipe.id}:${first.tea.id}`);
  const history = await api('/api/recommendation-history?date=2026-08-16&scope=member%3Amember-lin');
  assert.strictEqual(history.entries.length, 2);
  const child = await api('/api/recommendations?date=2026-08-16&scope=member%3Amember-an');
  assert.strictEqual(child.tea.medicinalTea, false);
});

test('static api supports tongue draft and explicit state actions', async () => {
  const { api } = await context();
  const body = new Fields({
    memberId: 'member-lin', observedAt: '2026-08-16',
    observations: JSON.stringify({ color: 'pink', coating: 'white', thickness: 'thin', moisture: 'normal' }),
    doctorConclusion: '医生确认偏燥', confirmedTags: JSON.stringify(['dryness-tendency']),
  });
  const created = await api('/api/tongue-records', { method: 'POST', body });
  assert.strictEqual(created.record.status, 'draft');
  const confirmed = await api(`/api/tongue-records/${created.record.id}/confirm`, { method: 'POST' });
  assert.strictEqual(confirmed.record.status, 'active');
  assert.strictEqual((await api('/api/tongue-records?memberId=member-lin')).records.length, 1);
  assert.strictEqual((await api(`/api/tongue-records/${created.record.id}/archive`, { method: 'POST' })).record.status, 'archived');
  assert.strictEqual((await api(`/api/tongue-records/${created.record.id}/restore`, { method: 'POST' })).record.status, 'active');
  await api(`/api/tongue-records/${created.record.id}`, { method: 'DELETE' });
  assert.strictEqual((await api('/api/tongue-records')).records.length, 0);
});

test('static api exports and atomically imports v1 data', async () => {
  const { api } = await context();
  const exported = await api('/api/data/export');
  assert.match(exported.filename, /^mingyuan-backup-/);
  assert.strictEqual(exported.data.schemaVersion, 1);
  exported.data.family.members[0].name = '备份姓名';
  exported.data.revision = 999;
  assert.deepStrictEqual(await api('/api/data/import', { method: 'POST', body: exported.data }), { imported: true });
  assert.strictEqual((await api('/api/family')).members[0].name, '备份姓名');
  assert.notStrictEqual((await api('/api/data/export')).data.revision, 999);
  assert.strictEqual((await api('/api/taxonomy')).taxonomy.needTags.length, TAXONOMY.needTags.length);
  assert.deepStrictEqual(await api('/api/health'), { status: 'ok', warnings: [] });
});
