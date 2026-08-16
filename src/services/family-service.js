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
    return this.repository.transaction(['family', 'recommendation-history'], ({ family, 'recommendation-history': history }) => {
      const current = family.members.find((member) => member.id === id);
      if (!current) throw new ServiceError('NOT_FOUND', '未找到家庭成员', 404);
      const member = validateMember({ ...current, ...input, id });
      return {
        changes: {
          family: { ...family, members: family.members.map((entry) => entry.id === id ? member : entry) },
          'recommendation-history': {
            ...history,
            entries: history.entries.map((entry) => entry.memberIds.includes(id) && entry.status === 'active' ? { ...entry, status: 'superseded' } : entry),
          },
        },
        result: member,
      };
    });
  }

  async remove(id) {
    return this.repository.transaction(['family', 'tongue-records', 'recommendation-history'], (stores) => {
      const family = stores.family;
      const tongue = stores['tongue-records'];
      const history = stores['recommendation-history'];
      if (!family.members.some((member) => member.id === id)) throw new ServiceError('NOT_FOUND', '未找到家庭成员', 404);
      if (family.members.length <= 1) throw new ServiceError('LAST_MEMBER', '家庭档案至少保留一名成员', 409);
      const related = tongue.records.filter((record) => record.memberId === id);
      return {
        changes: {
          family: { ...family, members: family.members.filter((member) => member.id !== id) },
          'tongue-records': { ...tongue, records: tongue.records.filter((record) => record.memberId !== id) },
          'recommendation-history': { ...history, entries: history.entries.filter((entry) => !entry.memberIds.includes(id)) },
        },
        fileMoves: related.map((record) => record.photoPath).filter(Boolean),
      };
    });
  }
}

module.exports = { FamilyService };
