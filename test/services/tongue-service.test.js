const fs = require('fs');
const path = require('path');
const { assert, test } = require('../helpers/test-runner');
const { createTestRepository } = require('../helpers/test-repository');
const { UploadStore } = require('../../src/storage/upload-store');
const { TongueService } = require('../../src/services/tongue-service');

const observations = { color: 'pink', coating: 'white', thickness: 'thick', moisture: 'normal' };

test('upload store accepts safe images and rejects invalid type or size', async () => {
  const context = await createTestRepository();
  const store = new UploadStore({ dataDir: context.dataDir, maxBytes: 8, idGenerator: () => 'photo-id' });
  const photoPath = await store.save({ buffer: Buffer.from('image'), mimeType: 'image/webp' });
  assert.strictEqual(photoPath, 'uploads/photo-id.webp');
  assert.ok(fs.existsSync(path.join(context.dataDir, photoPath)));
  await assert.rejects(() => store.save({ buffer: Buffer.from('bad'), mimeType: 'text/plain' }), (error) => error.code === 'UNSUPPORTED_MEDIA_TYPE');
  await assert.rejects(() => store.save({ buffer: Buffer.alloc(9), mimeType: 'image/png' }), (error) => error.code === 'PAYLOAD_TOO_LARGE');
  context.cleanup();
});

test('moves a tongue record through draft, active, archived, and restored states', async () => {
  const context = await createTestRepository();
  let nowIndex = 0;
  const times = ['2026-08-16T08:00:00.000Z', '2026-08-16T09:00:00.000Z', '2026-08-16T10:00:00.000Z'];
  const service = new TongueService({
    repository: context.repository,
    idGenerator: () => 'tongue-1',
    clock: () => times[Math.min(nowIndex++, times.length - 1)],
  });
  const draft = await service.create({ memberId: 'member-lin', observedAt: '2026-08-16', observations, doctorConclusion: '', confirmedTags: [] });
  assert.strictEqual(draft.status, 'draft');
  await assert.rejects(() => service.confirm(draft.id), (error) => error.code === 'VALIDATION_ERROR');

  await service.update(draft.id, { doctorConclusion: '医生已确认', confirmedTags: ['dampness-tendency'] });
  const active = await service.confirm(draft.id);
  assert.strictEqual(active.status, 'active');
  assert.ok(active.confirmedAt);
  assert.strictEqual((await service.archive(draft.id)).status, 'archived');
  assert.strictEqual((await service.restore(draft.id)).status, 'active');
  const downgraded = await service.update(draft.id, { doctorConclusion: '' });
  assert.strictEqual(downgraded.status, 'draft');
  context.cleanup();
});

test('does not leave an uploaded photo when draft validation fails', async () => {
  const context = await createTestRepository();
  const uploadStore = new UploadStore({ dataDir: context.dataDir, idGenerator: () => 'orphan' });
  const service = new TongueService({ repository: context.repository, uploadStore });
  await assert.rejects(() => service.create({
    memberId: 'member-lin', observedAt: '', observations, doctorConclusion: '', confirmedTags: [],
  }, { buffer: Buffer.from('image'), mimeType: 'image/webp' }), (error) => error.code === 'VALIDATION_ERROR');
  assert.deepStrictEqual(fs.readdirSync(path.join(context.dataDir, 'uploads')), []);
  context.cleanup();
});

test('rejects an update when the record is deleted before its transaction commits', async () => {
  const context = await createTestRepository();
  let releaseSave;
  let saveStarted;
  const started = new Promise((resolve) => { saveStarted = resolve; });
  const removed = [];
  const uploadStore = {
    save: async () => {
      saveStarted();
      await new Promise((resolve) => { releaseSave = resolve; });
      return 'uploads/new.webp';
    },
    remove: async (photoPath) => removed.push(photoPath),
  };
  const service = new TongueService({ repository: context.repository, uploadStore, idGenerator: () => 'tongue-race' });
  const record = await service.create({ memberId: 'member-lin', observedAt: '2026-08-16', observations, doctorConclusion: '', confirmedTags: [] });
  const updating = service.update(record.id, { doctorConclusion: '稍后提交' }, { buffer: Buffer.from('image'), mimeType: 'image/webp' });
  await started;
  await service.remove(record.id);
  releaseSave();
  await assert.rejects(() => updating, (error) => error.code === 'NOT_FOUND');
  assert.deepStrictEqual(removed, ['uploads/new.webp']);
  context.cleanup();
});
