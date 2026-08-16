const { assert, test } = require('../helpers/test-runner');
const { createTestRepository } = require('../helpers/test-repository');
const { RecommendationService } = require('../../src/services/recommendation-service');

test('reuses a current fingerprint and invalidates it when family inputs change', async () => {
  const context = await createTestRepository();
  let id = 0;
  const service = new RecommendationService({ repository: context.repository, idGenerator: () => `plan-${++id}` });
  const first = await service.get({ date: '2026-08-16', scope: 'all' });
  const reused = await service.get({ date: '2026-08-16', scope: 'all' });
  assert.strictEqual(reused.historyId, first.historyId);

  await context.repository.update('family', (data) => ({
    ...data,
    members: data.members.map((member) => member.id === 'member-lin' ? { ...member, needTags: ['low-salt'] } : member),
  }));
  const changed = await service.get({ date: '2026-08-16', scope: 'all' });
  assert.notStrictEqual(changed.historyId, first.historyId);
  context.cleanup();
});

test('rotates to an unseen pair and preserves history on exhaustion errors', async () => {
  const context = await createTestRepository();
  let id = 0;
  const service = new RecommendationService({ repository: context.repository, idGenerator: () => `plan-${++id}` });
  const first = await service.get({ date: '2026-08-16', scope: 'member:member-lin' });
  const second = await service.rotate({ date: '2026-08-16', scope: 'member:member-lin' });
  assert.notStrictEqual(`${second.recipe.id}:${second.tea.id}`, `${first.recipe.id}:${first.tea.id}`);
  const entries = (await context.repository.read('recommendation-history')).entries;
  assert.strictEqual(entries.filter((entry) => entry.status === 'active').length, 1);
  assert.strictEqual(entries.length, 2);
  context.cleanup();
});

test('never recommends medicinal tea to a child scope', async () => {
  const context = await createTestRepository();
  const service = new RecommendationService({ repository: context.repository });
  const plan = await service.get({ date: '2026-08-16', scope: 'member:member-an' });
  assert.strictEqual(plan.tea.medicinalTea, false);
  context.cleanup();
});
