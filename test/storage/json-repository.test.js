const fs = require('fs');
const os = require('os');
const path = require('path');
const { assert, test } = require('../helpers/test-runner');
const { JsonRepository } = require('../../src/storage/json-repository');
const { createSeedData } = require('../../src/storage/seed-data');

function tempDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mingyuanshipu-'));
}

test('initializes five json files with usable example data', async () => {
  const dataDir = tempDataDir();
  const repository = new JsonRepository({ dataDir, seedData: createSeedData() });
  await repository.init();

  assert.strictEqual((await repository.read('family')).members.length, 3);
  assert.ok((await repository.read('recipes')).items.length >= 8);
  assert.ok((await repository.read('teas')).items.length >= 6);
  for (const name of ['family', 'recipes', 'teas', 'tongue-records', 'recommendation-history']) {
    assert.ok(fs.existsSync(path.join(dataDir, `${name}.json`)), `${name}.json should exist`);
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('serializes concurrent updates without losing changes', async () => {
  const dataDir = tempDataDir();
  const repository = new JsonRepository({ dataDir, seedData: createSeedData() });
  await repository.init();
  await Promise.all([
    repository.update('family', (data) => ({ ...data, markerA: true })),
    repository.update('family', (data) => ({ ...data, markerB: true })),
  ]);

  const family = await repository.read('family');
  assert.strictEqual(family.markerA, true);
  assert.strictEqual(family.markerB, true);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('recovers a corrupt primary file from its last backup', async () => {
  const dataDir = tempDataDir();
  const repository = new JsonRepository({ dataDir, seedData: createSeedData() });
  await repository.init();
  await repository.update('family', (data) => ({ ...data, recoveredValue: 'kept' }));
  fs.writeFileSync(path.join(dataDir, 'family.json'), '{broken', 'utf8');

  const family = await repository.read('family');
  assert.strictEqual(family.recoveredValue, undefined);
  assert.strictEqual(family.members.length, 3);
  assert.deepStrictEqual(
    JSON.parse(fs.readFileSync(path.join(dataDir, 'family.json'), 'utf8')),
    family
  );
  assert.strictEqual(repository.consumeWarnings()[0].code, 'RECOVERED_FROM_BACKUP');
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('failed validation leaves the previous file untouched', async () => {
  const dataDir = tempDataDir();
  const repository = new JsonRepository({
    dataDir,
    seedData: createSeedData(),
    validators: { family: (value) => { if (!Array.isArray(value.members)) throw new Error('invalid family'); } },
  });
  await repository.init();
  const before = fs.readFileSync(path.join(dataDir, 'family.json'), 'utf8');

  await assert.rejects(() => repository.write('family', { members: null }), /invalid family/);
  assert.strictEqual(fs.readFileSync(path.join(dataDir, 'family.json'), 'utf8'), before);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('all seeded visual assets use the public assets path', () => {
  const seed = createSeedData();
  for (const item of [...seed.recipes.items, ...seed.teas.items]) {
    assert.ok(item.image.startsWith('assets/images/'), `${item.id}: ${item.image}`);
  }
});

test('commits json changes and staged upload removals together', async () => {
  const dataDir = tempDataDir();
  const repository = new JsonRepository({ dataDir, seedData: createSeedData() });
  await repository.init();
  const photo = path.join(dataDir, 'uploads', 'staged.webp');
  fs.writeFileSync(photo, 'image');
  const family = await repository.read('family');
  await repository.writeBatch({ family: { ...family, marker: 'committed' } }, ['uploads/staged.webp']);
  assert.strictEqual((await repository.read('family')).marker, 'committed');
  assert.strictEqual(fs.existsSync(photo), false);
  assert.deepStrictEqual(fs.readdirSync(path.join(dataDir, '.trash')), []);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('recovers a structurally invalid primary file from backup', async () => {
  const dataDir = tempDataDir();
  const repository = new JsonRepository({
    dataDir,
    seedData: createSeedData(),
    validators: { family: (value) => { if (!Array.isArray(value.members)) throw new Error('invalid family'); } },
  });
  await repository.init();
  await repository.update('family', (family) => ({ ...family, marker: 'newer' }));
  fs.writeFileSync(path.join(dataDir, 'family.json'), '{"version":1,"members":null}\n', 'utf8');
  const recovered = await repository.read('family');
  assert.ok(Array.isArray(recovered.members));
  assert.ok(Array.isArray(JSON.parse(fs.readFileSync(path.join(dataDir, 'family.json'), 'utf8')).members));
  fs.rmSync(dataDir, { recursive: true, force: true });
});
