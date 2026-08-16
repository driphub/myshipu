const fs = require('fs');
const os = require('os');
const path = require('path');
const { JsonRepository } = require('../../src/storage/json-repository');
const { createSeedData } = require('../../src/storage/seed-data');

async function createTestRepository() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mingyuan-services-'));
  const repository = new JsonRepository({ dataDir, seedData: createSeedData() });
  await repository.init();
  return { repository, dataDir, cleanup: () => fs.rmSync(dataDir, { recursive: true, force: true }) };
}

module.exports = { createTestRepository };
