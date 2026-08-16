const { assert, test } = require('../helpers/test-runner');
const fixtures = require('../fixtures/recommendation-cases.json');

const corePromise = import('../../public/assets/static-core.mjs');

function member(overrides = {}) {
  return { ...fixtures.member, ...overrides };
}

function item(overrides = {}) {
  return { ...fixtures.item, ...overrides };
}

test('browser core matches safety filtering and documented scores', async () => {
  const { isEligible, scoreItemForMember } = await corePromise;
  assert.strictEqual(isEligible(item(), member({ allergies: ['yam'] })), false);
  assert.strictEqual(isEligible(item(), member({ avoidIngredients: ['yam'] })), false);
  assert.strictEqual(isEligible(item({ hardContraindications: ['pregnant'] }), member({ pregnancyStatus: 'pregnant' })), false);
  assert.strictEqual(isEligible(item({ medicinalTea: true }), member({ ageGroup: 'child' })), false);
  assert.strictEqual(scoreItemForMember(item(), member(), 'autumn'), fixtures.scores.documented);
  assert.strictEqual(
    scoreItemForMember(item({ cautionFlags: ['hypertension'] }), member({ chronicConditions: ['hypertension'] }), 'autumn'),
    fixtures.scores.withCaution
  );
});

test('browser core maps doctor tags and ranks by family minimum with stable ids', async () => {
  const { rankPlanPairs, scoreItemForMember } = await corePromise;
  assert.strictEqual(scoreItemForMember(
    item({ needTags: ['gentle-moistening'], preferenceTags: [], seasonTags: ['all'] }),
    member({ needTags: [], preferenceTags: [] }),
    'summer',
    ['dryness-tendency']
  ), fixtures.scores.confirmedDryness);

  const plans = rankPlanPairs({
    members: [member(), member({ id: 'member-2', needTags: ['low-oil'], preferenceTags: [] })],
    recipes: [item({ id: 'recipe-b' }), item({ id: 'recipe-a' })],
    teas: [item({ id: 'tea-a' })],
    date: '2026-10-01',
    confirmedTagsByMember: {},
  });
  assert.strictEqual(plans[0].recipe.id, 'recipe-a');
  assert.strictEqual(plans[0].recipeScore, 70);
});

test('browser core reports missing safe candidate types', async () => {
  const { NoSafePlanError, rankPlanPairs } = await corePromise;
  assert.throws(
    () => rankPlanPairs({ members: [member()], recipes: [], teas: [item()], date: '2026-08-16' }),
    (error) => error instanceof NoSafePlanError && error.details.missing[0] === 'recipe'
  );
});
