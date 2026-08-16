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
    const photoPath = file && this.uploadStore.save ? await this.uploadStore.save(file) : (input.photoPath || '');
    const record = validateTongueRecord({
      ...input,
      id: this.idGenerator(),
      photoPath,
      status: 'draft',
      confirmedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await this.repository.update('tongue-records', (data) => ({ ...data, records: [...data.records, record] }));
    return record;
  }

  async update(id, patch, file) {
    if (Object.prototype.hasOwnProperty.call(patch, 'status')) throw new ServiceError('VALIDATION_ERROR', '请使用状态操作按钮', 400);
    const current = await this.get(id);
    const now = this.clock();
    const nextPhoto = file && this.uploadStore.save ? await this.uploadStore.save(file) : current.photoPath;
    const merged = { ...current, ...patch, id, photoPath: nextPhoto, updatedAt: now };
    if (merged.status === 'active' && (!String(merged.doctorConclusion || '').trim() || !(merged.confirmedTags || []).length)) {
      merged.status = 'draft';
      merged.confirmedAt = null;
    }
    const record = validateTongueRecord(merged);
    await this._saveAndInvalidate(record);
    if (file && current.photoPath && current.photoPath !== nextPhoto) await this.uploadStore.remove(current.photoPath);
    return record;
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
    const current = await this.get(id);
    const data = await this.repository.read('tongue-records');
    await this.repository.write('tongue-records', { ...data, records: data.records.filter((record) => record.id !== id) });
    await this._invalidate(current.memberId);
    await this.uploadStore.remove(current.photoPath);
  }

  async _saveAndInvalidate(record) {
    const [tongue, history] = await Promise.all([
      this.repository.read('tongue-records'),
      this.repository.read('recommendation-history'),
    ]);
    await this.repository.writeBatch({
      'tongue-records': { ...tongue, records: tongue.records.map((entry) => entry.id === record.id ? record : entry) },
      'recommendation-history': {
        ...history,
        entries: history.entries.map((entry) => entry.memberIds.includes(record.memberId) && entry.status === 'active' ? { ...entry, status: 'superseded' } : entry),
      },
    });
  }

  async _invalidate(memberId) {
    await this.repository.update('recommendation-history', (history) => ({
      ...history,
      entries: history.entries.map((entry) => entry.memberIds.includes(memberId) && entry.status === 'active' ? { ...entry, status: 'superseded' } : entry),
    }));
  }
}

module.exports = { TongueService };
