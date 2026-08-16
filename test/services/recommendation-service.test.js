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

test('explains needs contributed by the latest confirmed tongue record', async () => {
  const context = await createTestRepository();
  await context.repository.update('tongue-records', (data) => ({
    ...data,
    records: [{
      id: 'tongue-confirmed', memberId: 'member-zhou', observedAt: '2026-08-16', photoPath: '',
      observations: { color: 'pink', coating: 'white', thickness: 'thick', moisture: 'normal' },
      doctorConclusion: '医生确认湿重倾向', confirmedTags: ['dampness-tendency'], status: 'active',
      confirmedAt: '2026-08-16T08:00:00.000Z', createdAt: '2026-08-16T08:00:00.000Z', updatedAt: '2026-08-16T08:00:00.000Z',
    }],
  }));
  const service = new RecommendationService({ repository: context.repository });
  const plan = await service.get({ date: '2026-08-16', scope: 'member:member-zhou' });
  assert.ok(plan.reasons.includes('健脾养胃'));
  context.cleanup();
});

test('preserves recommendation history from concurrent scopes', async () => {
  const context = await createTestRepository();
  let id = 0;
  const service = new RecommendationService({ repository: context.repository, idGenerator: () => `concurrent-${++id}` });
  await Promise.all([
    service.get({ date: '2026-08-16', scope: 'all' }),
    service.get({ date: '2026-08-16', scope: 'member:member-lin' }),
  ]);
  const entries = (await context.repository.read('recommendation-history')).entries;
  assert.strictEqual(entries.length, 2);
  assert.strictEqual(new Set(entries.map((entry) => entry.scopeKey)).size, 2);
  context.cleanup();
});
