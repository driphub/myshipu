const fs = require('fs');
const path = require('path');
const { assert, test } = require('../helpers/test-runner');
const { createTestRepository } = require('../helpers/test-repository');
const { FamilyService } = require('../../src/services/family-service');

test('creates, updates, and removes members with related records', async () => {
  const context = await createTestRepository();
  const removedPhotos = [];
  const service = new FamilyService({
    repository: context.repository,
    idGenerator: () => 'member-new',
    uploadStore: { remove: async (photoPath) => removedPhotos.push(photoPath) },
  });
  const created = await service.create({
    name: '新成员', birthYear: 1990, needTags: ['low-oil'], preferenceTags: ['mild'],
    allergies: [], avoidIngredients: [], pregnancyStatus: 'none', chronicConditions: [], medications: [], notes: '',
  });
  assert.strictEqual(created.id, 'member-new');
  const updated = await service.update(created.id, { ...created, allergies: ['milk'] });
  assert.deepStrictEqual(updated.allergies, ['milk']);

  await context.repository.write('tongue-records', { version: 1, records: [{ id: 't1', memberId: created.id, photoPath: 'uploads/a.webp' }] });
  await context.repository.write('recommendation-history', { version: 1, entries: [{ id: 'h1', memberIds: [created.id] }] });
  await service.remove(created.id);

  assert.strictEqual((await service.list()).some((entry) => entry.id === created.id), false);
  assert.strictEqual((await context.repository.read('tongue-records')).records.length, 0);
  assert.strictEqual((await context.repository.read('recommendation-history')).entries.length, 0);
  assert.deepStrictEqual(removedPhotos, ['uploads/a.webp']);
  context.cleanup();
});

test('rejects updates for a missing member', async () => {
  const context = await createTestRepository();
  const service = new FamilyService({ repository: context.repository });
  await assert.rejects(() => service.update('missing', {}), (error) => error.code === 'NOT_FOUND');
  context.cleanup();
});
