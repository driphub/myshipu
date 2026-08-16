const { assert, test } = require('../helpers/test-runner');
const { createSeedData } = require('../../src/storage/seed-data');
const { TAXONOMY } = require('../../src/domain/taxonomy');

const schemaPromise = import('../../public/assets/static-schema.mjs');

function state() {
  const seed = createSeedData();
  return {
    schemaVersion: 1,
    revision: 0,
    family: seed.family,
    recipes: seed.recipes,
    teas: seed.teas,
    tongueRecords: seed['tongue-records'],
    recommendationHistory: seed['recommendation-history'],
  };
}

function pngDataUrl(bytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) {
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

test('normalizes a valid static state and drops unknown fields', async () => {
  const { validateAndNormalizeState } = await schemaPromise;
  const input = state();
  input.unknown = 'drop-me';
  input.family.members[0].unknown = 'drop-me';
  const result = validateAndNormalizeState(input, TAXONOMY, { currentYear: 2026 });
  assert.strictEqual(result.schemaVersion, 1);
  assert.strictEqual(result.unknown, undefined);
  assert.strictEqual(result.family.members[0].unknown, undefined);
  assert.strictEqual(result.family.members[0].ageGroup, 'adult');
});

test('rejects unsafe or duplicate entity ids and broken member references', async () => {
  const { validateAndNormalizeState } = await schemaPromise;
  for (const badId of ['tongue-x\" onmouseover=\"alert(1)', '../x', 'UPPER', 'x'.repeat(65)]) {
    const input = state();
    input.family.members[0].id = badId;
    assert.throws(() => validateAndNormalizeState(input, TAXONOMY), /实体 ID/);
  }
  const duplicate = state();
  duplicate.recipes.items[0].id = duplicate.family.members[0].id;
  assert.throws(() => validateAndNormalizeState(duplicate, TAXONOMY), /实体 ID/);
  const broken = state();
  broken.tongueRecords.records.push({
    id: 'tongue-one', memberId: 'member-missing', observedAt: '2026-08-16', photoPath: '',
    observations: { color: 'pink', coating: 'white', thickness: 'thin', moisture: 'normal' },
    doctorConclusion: '', confirmedTags: [], status: 'draft', confirmedAt: null,
    createdAt: '2026-08-16T00:00:00.000Z', updatedAt: '2026-08-16T00:00:00.000Z',
  });
  assert.throws(() => validateAndNormalizeState(broken, TAXONOMY), /家庭成员/);
});

test('accepts signed image data and rejects external or disguised images', async () => {
  const { validateAndNormalizeState, validateImageDataUrl } = await schemaPromise;
  assert.strictEqual(validateImageDataUrl(pngDataUrl()), 8);
  for (const image of ['https://example.com/x.jpg', '//example.com/x.jpg', 'javascript:alert(1)', '../x.jpg']) {
    const input = state();
    input.recipes.items[0].image = image;
    assert.throws(() => validateAndNormalizeState(input, TAXONOMY), /图片路径/);
  }
  assert.throws(() => validateImageDataUrl(`data:image/png;base64,${Buffer.from('not-png').toString('base64')}`), /图片内容/);
});

test('marks imported recommendation history superseded and enforces state bytes', async () => {
  const { assertStateSize, validateAndNormalizeState } = await schemaPromise;
  const input = state();
  input.recommendationHistory.entries.push({
    id: 'plan-one', date: '2026-08-16', scopeKey: 'member:member-lin', memberIds: ['member-lin'],
    inputFingerprint: 'abc', recipeId: 'recipe-yam-lotus-soup', teaId: 'tea-chenpi-poria',
    status: 'active', sequence: 1, createdAt: '2026-08-16T00:00:00.000Z',
  });
  const normalized = validateAndNormalizeState(input, TAXONOMY, { imported: true });
  assert.strictEqual(normalized.recommendationHistory.entries[0].status, 'superseded');
  assert.throws(() => assertStateSize({ large: '12345' }, 5), /容量上限/);
  assert.doesNotThrow(() => assertStateSize({ small: '' }, 20));
});
