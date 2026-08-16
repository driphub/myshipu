const crypto = require('crypto');
const { validateMember } = require('../domain/validation');
const { ServiceError } = require('./errors');

function randomId() {
  return `member-${crypto.randomBytes(8).toString('hex')}`;
}

class FamilyService {
  constructor({ repository, uploadStore, idGenerator } = {}) {
    this.repository = repository;
    this.uploadStore = uploadStore || { remove: async () => {} };
    this.idGenerator = idGenerator || randomId;
  }

  async list() {
    return (await this.repository.read('family')).members;
  }

  async get(id) {
    const found = (await this.list()).find((member) => member.id === id);
    if (!found) throw new ServiceError('NOT_FOUND', '未找到家庭成员', 404);
    return found;
  }

  async create(input) {
    const member = validateMember({ ...input, id: input.id || this.idGenerator() });
    await this.repository.update('family', (data) => ({ ...data, members: [...data.members, member] }));
    return member;
  }

  async update(id, input) {
    const current = await this.get(id);
    const member = validateMember({ ...current, ...input, id });
    const family = await this.repository.read('family');
    const history = await this.repository.read('recommendation-history');
    await this.repository.writeBatch({
      family: { ...family, members: family.members.map((entry) => entry.id === id ? member : entry) },
      'recommendation-history': {
        ...history,
        entries: history.entries.map((entry) => entry.memberIds.includes(id) && entry.status === 'active' ? { ...entry, status: 'superseded' } : entry),
      },
    });
    return member;
  }

  async remove(id) {
    await this.get(id);
    const [family, tongue, history] = await Promise.all([
      this.repository.read('family'),
      this.repository.read('tongue-records'),
      this.repository.read('recommendation-history'),
    ]);
    const related = tongue.records.filter((record) => record.memberId === id);
    await this.repository.writeBatch({
      family: { ...family, members: family.members.filter((member) => member.id !== id) },
      'tongue-records': { ...tongue, records: tongue.records.filter((record) => record.memberId !== id) },
      'recommendation-history': { ...history, entries: history.entries.filter((entry) => !entry.memberIds.includes(id)) },
    });
    for (const record of related) await this.uploadStore.remove(record.photoPath);
  }
}

module.exports = { FamilyService };
