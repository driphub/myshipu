const crypto = require('crypto');
const { validateTongueRecord, ValidationError } = require('../domain/validation');
const { ServiceError } = require('./errors');

function randomId() {
  return `tongue-${crypto.randomBytes(8).toString('hex')}`;
}

class TongueService {
  constructor({ repository, uploadStore, idGenerator, clock } = {}) {
    this.repository = repository;
    this.uploadStore = uploadStore || { remove: async () => {} };
    this.idGenerator = idGenerator || randomId;
    this.clock = clock || (() => new Date().toISOString());
  }

  async list(memberId) {
    const records = (await this.repository.read('tongue-records')).records;
    return records.filter((record) => !memberId || record.memberId === memberId)
      .sort((a, b) => String(b.observedAt).localeCompare(String(a.observedAt)));
  }

  async get(id) {
    const found = (await this.list()).find((record) => record.id === id);
    if (!found) throw new ServiceError('NOT_FOUND', '未找到舌象记录', 404);
    return found;
  }

  async create(input, file) {
    const members = (await this.repository.read('family')).members;
    if (!members.some((member) => member.id === input.memberId)) throw new ServiceError('NOT_FOUND', '未找到家庭成员', 404);
    const now = this.clock();
    const draft = validateTongueRecord({
      ...input,
      id: this.idGenerator(),
      photoPath: input.photoPath || '',
      status: 'draft',
      confirmedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    let savedPhoto = '';
    try {
      savedPhoto = file && this.uploadStore.save ? await this.uploadStore.save(file) : '';
      const record = { ...draft, photoPath: savedPhoto || draft.photoPath };
      await this.repository.update('tongue-records', (data) => ({ ...data, records: [...data.records, record] }));
      return record;
    } catch (error) {
      if (savedPhoto) await this.uploadStore.remove(savedPhoto);
      throw error;
    }
  }

  async update(id, patch, file) {
    if (Object.prototype.hasOwnProperty.call(patch, 'status')) throw new ServiceError('VALIDATION_ERROR', '请使用状态操作按钮', 400);
    const current = await this.get(id);
    const now = this.clock();
    const merged = { ...current, ...patch, id, photoPath: current.photoPath, updatedAt: now };
    if (merged.status === 'active' && (!String(merged.doctorConclusion || '').trim() || !(merged.confirmedTags || []).length)) {
      merged.status = 'draft';
      merged.confirmedAt = null;
    }
    const validated = validateTongueRecord(merged);
    let savedPhoto = '';
    try {
      savedPhoto = file && this.uploadStore.save ? await this.uploadStore.save(file) : '';
      const record = { ...validated, photoPath: savedPhoto || current.photoPath };
      await this._saveAndInvalidate(record, savedPhoto && current.photoPath ? [current.photoPath] : []);
      return record;
    } catch (error) {
      if (savedPhoto) await this.uploadStore.remove(savedPhoto);
      throw error;
    }
  }

  async confirm(id) {
    const current = await this.get(id);
    const record = validateTongueRecord({ ...current, status: 'active', confirmedAt: this.clock(), updatedAt: this.clock() });
    await this._saveAndInvalidate(record);
    return record;
  }

  async archive(id) {
    const current = await this.get(id);
    const record = validateTongueRecord({ ...current, status: 'archived', updatedAt: this.clock() });
    await this._saveAndInvalidate(record);
    return record;
  }

  async restore(id) {
    const current = await this.get(id);
    const canActivate = Boolean(String(current.doctorConclusion || '').trim() && (current.confirmedTags || []).length);
    const record = validateTongueRecord({
      ...current,
      status: canActivate ? 'active' : 'draft',
      confirmedAt: canActivate ? this.clock() : null,
      updatedAt: this.clock(),
    });
    await this._saveAndInvalidate(record);
    return record;
  }

  async remove(id) {
    return this.repository.transaction(['tongue-records', 'recommendation-history'], (stores) => {
      const tongue = stores['tongue-records'];
      const history = stores['recommendation-history'];
      const current = tongue.records.find((record) => record.id === id);
      if (!current) throw new ServiceError('NOT_FOUND', '未找到舌象记录', 404);
      return {
        changes: {
          'tongue-records': { ...tongue, records: tongue.records.filter((record) => record.id !== id) },
          'recommendation-history': {
            ...history,
            entries: history.entries.map((entry) => entry.memberIds.includes(current.memberId) && entry.status === 'active' ? { ...entry, status: 'superseded' } : entry),
          },
        },
        fileMoves: current.photoPath ? [current.photoPath] : [],
      };
    });
  }

  async _saveAndInvalidate(record, fileMoves = []) {
    return this.repository.transaction(['tongue-records', 'recommendation-history'], (stores) => {
      if (!stores['tongue-records'].records.some((entry) => entry.id === record.id)) {
        throw new ServiceError('NOT_FOUND', '未找到舌象记录', 404);
      }
      return {
        changes: {
          'tongue-records': {
            ...stores['tongue-records'],
            records: stores['tongue-records'].records.map((entry) => entry.id === record.id ? record : entry),
          },
          'recommendation-history': {
            ...stores['recommendation-history'],
            entries: stores['recommendation-history'].entries.map((entry) => entry.memberIds.includes(record.memberId) && entry.status === 'active' ? { ...entry, status: 'superseded' } : entry),
          },
        },
        fileMoves,
        result: record,
      };
    });
  }
}

module.exports = { TongueService };
