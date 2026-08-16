const { assert, test } = require('../helpers/test-runner');
const { createSeedData } = require('../../src/storage/seed-data');
const { TAXONOMY, LABELS } = require('../../src/domain/taxonomy');

const storePromise = import('../../public/assets/static-store.mjs');

function seedState() {
  const seed = createSeedData();
  return {
    schemaVersion: 1, revision: 0, family: seed.family, recipes: seed.recipes, teas: seed.teas,
    tongueRecords: seed['tongue-records'], recommendationHistory: seed['recommendation-history'],
  };
}

function fakeBackend() {
  let value;
  let queue = Promise.resolve();
  const clone = (input) => input == null ? input : JSON.parse(JSON.stringify(input));
  return {
    read: async () => clone(value),
    transact(mutator) {
      const operation = queue.then(() => {
        const next = mutator(clone(value));
        value = clone(next);
        return clone(value);
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}

test('initializes static state once and increments revision on updates', async () => {
  const { createStateStore } = await storePromise;
  let loads = 0;
  const store = createStateStore({
    backend: fakeBackend(),
    loadBootstrap: async () => { loads += 1; return { state: seedState(), taxonomy: TAXONOMY, labels: LABELS }; },
  });
  assert.strictEqual((await store.read()).family.members.length, 3);
  await store.update((state) => {
    state.family.members[0].name = '新名字';
    return state;
  });
  const result = await store.read();
  assert.strictEqual(result.family.members[0].name, '新名字');
  assert.strictEqual(result.revision, 1);
  assert.strictEqual(loads, 1);
});

test('serializes concurrent state updates without losing either change', async () => {
  const { createStateStore } = await storePromise;
  const store = createStateStore({
    backend: fakeBackend(),
    loadBootstrap: async () => ({ state: seedState(), taxonomy: TAXONOMY, labels: LABELS }),
  });
  await store.read();
  await Promise.all([
    store.update((state) => { state.family.members[0].name = '甲'; return state; }),
    store.update((state) => { state.family.members[1].name = '乙'; return state; }),
  ]);
  const result = await store.read();
  assert.strictEqual(result.family.members[0].name, '甲');
  assert.strictEqual(result.family.members[1].name, '乙');
  assert.strictEqual(result.revision, 2);
});

test('failed validation preserves state and imported revisions are ignored', async () => {
  const { createStateStore } = await storePromise;
  const store = createStateStore({
    backend: fakeBackend(),
    loadBootstrap: async () => ({ state: seedState(), taxonomy: TAXONOMY, labels: LABELS }),
  });
  const before = await store.read();
  await assert.rejects(() => store.update((state) => { state.family.members = []; return state; }), /至少保留/);
  assert.deepStrictEqual(await store.read(), before);
  const imported = seedState();
  imported.revision = 999;
  await store.replaceImported(imported);
  assert.strictEqual((await store.read()).revision, 1);
});
