const { assert, test } = require('../helpers/test-runner');
const {
  NoSafePlanError,
  getSeason,
  isEligible,
  scoreItemForMember,
  rankPlanPairs,
} = require('../../src/domain/recommendation-engine');
const fixtures = require('../fixtures/recommendation-cases.json');

function member(overrides = {}) {
  return { ...fixtures.member, ...overrides };
}

function item(overrides = {}) {
  return { ...fixtures.item, ...overrides };
}

test('maps calendar months to deterministic local seasons', () => {
  assert.strictEqual(getSeason('2026-03-01'), 'spring');
  assert.strictEqual(getSeason('2026-08-16'), 'summer');
  assert.strictEqual(getSeason('2026-10-01'), 'autumn');
  assert.strictEqual(getSeason('2026-12-01'), 'winter');
});

test('filters allergies, avoided ingredients, hard flags, and medicinal tea for children', () => {
  assert.strictEqual(isEligible(item(), member({ allergies: ['yam'] })), false);
  assert.strictEqual(isEligible(item(), member({ avoidIngredients: ['yam'] })), false);
  assert.strictEqual(isEligible(item({ hardContraindications: ['pregnant'] }), member({ pregnancyStatus: 'pregnant' })), false);
  assert.strictEqual(isEligible(item({ medicinalTea: true }), member({ ageGroup: 'child' })), false);
});

test('calculates the documented 95 score and subtracts cautions before clamping', () => {
  assert.strictEqual(scoreItemForMember(item(), member(), 'autumn'), fixtures.scores.documented);
  assert.strictEqual(
    scoreItemForMember(item({ cautionFlags: ['hypertension'] }), member({ chronicConditions: ['hypertension'] }), 'autumn'),
    fixtures.scores.withCaution
  );
});

test('maps confirmed doctor tags into recommendation needs', () => {
  const result = scoreItemForMember(
    item({ needTags: ['gentle-moistening'], preferenceTags: [], seasonTags: ['all'] }),
    member({ needTags: [], preferenceTags: [] }),
    'summer',
    ['dryness-tendency']
  );
  assert.strictEqual(result, fixtures.scores.confirmedDryness);
});

test('ranks plan pairs by the least-suited family member and then stable ids', () => {
  const plans = rankPlanPairs({
    members: [member(), member({ id: 'member-2', needTags: ['low-oil'], preferenceTags: [] })],
    recipes: [item({ id: 'recipe-b' }), item({ id: 'recipe-a' })],
    teas: [item({ id: 'tea-a' })],
    date: '2026-10-01',
    confirmedTagsByMember: {},
  });
  assert.strictEqual(plans[0].recipe.id, 'recipe-a');
  assert.deepStrictEqual(Object.keys(plans[0].scores).sort(), ['member-1', 'member-2']);
  assert.strictEqual(plans[0].recipeScore, 70);
});

test('reports whether recipe or tea candidates are missing', () => {
  assert.throws(
    () => rankPlanPairs({ members: [member()], recipes: [], teas: [item()], date: '2026-08-16' }),
    (error) => error instanceof NoSafePlanError && error.details.missing[0] === 'recipe'
  );
});
