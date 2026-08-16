const fs = require('fs');
const path = require('path');
const { assert, test } = require('../helpers/test-runner');
const { createTestRepository } = require('../helpers/test-repository');
const { FamilyService } = require('../../src/services/family-service');

test('creates, updates, and removes members with related records', async () => {
  const context = await createTestRepository();
  const service = new FamilyService({
    repository: context.repository,
    idGenerator: () => 'member-new',
  });
  const created = await service.create({
    name: '新成员', birthYear: 1990, needTags: ['low-oil'], preferenceTags: ['mild'],
    allergies: [], avoidIngredients: [], pregnancyStatus: 'none', chronicConditions: [], medications: [], notes: '',
  });
  assert.strictEqual(created.id, 'member-new');
  const updated = await service.update(created.id, { ...created, allergies: ['milk'] });
  assert.deepStrictEqual(updated.allergies, ['milk']);

  const photoPath = path.join(context.dataDir, 'uploads', 'a.webp');
  fs.writeFileSync(photoPath, 'image');
  await context.repository.write('tongue-records', { version: 1, records: [{ id: 't1', memberId: created.id, photoPath: 'uploads/a.webp' }] });
  await context.repository.write('recommendation-history', { version: 1, entries: [{ id: 'h1', memberIds: [created.id] }] });
  await service.remove(created.id);

  assert.strictEqual((await service.list()).some((entry) => entry.id === created.id), false);
  assert.strictEqual((await context.repository.read('tongue-records')).records.length, 0);
  assert.strictEqual((await context.repository.read('recommendation-history')).entries.length, 0);
  assert.strictEqual(fs.existsSync(photoPath), false);
  context.cleanup();
});

test('rejects updates for a missing member', async () => {
  const context = await createTestRepository();
  const service = new FamilyService({ repository: context.repository });
  await assert.rejects(() => service.update('missing', {}), (error) => error.code === 'NOT_FOUND');
  context.cleanup();
});

test('keeps at least one family member', async () => {
  const context = await createTestRepository();
  const family = await context.repository.read('family');
  await context.repository.write('family', { ...family, members: [family.members[0]] });
  const service = new FamilyService({ repository: context.repository });
  await assert.rejects(() => service.remove(family.members[0].id), (error) => error.code === 'LAST_MEMBER');
  assert.strictEqual((await service.list()).length, 1);
  context.cleanup();
});

test('preserves concurrent updates to different family members', async () => {
  const context = await createTestRepository();
  const service = new FamilyService({ repository: context.repository });
  await Promise.all([
    service.update('member-lin', { notes: '并发更新 A' }),
    service.update('member-zhou', { notes: '并发更新 B' }),
  ]);
  const members = await service.list();
  assert.strictEqual(members.find((member) => member.id === 'member-lin').notes, '并发更新 A');
  assert.strictEqual(members.find((member) => member.id === 'member-zhou').notes, '并发更新 B');
  context.cleanup();
});
