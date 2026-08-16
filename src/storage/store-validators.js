const { validateMember, validateTongueRecord } = require('../domain/validation');

function requireArray(value, path) {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
}

function validateLibrary(value, name) {
  requireArray(value && value.items, `${name}.items`);
  for (const item of value.items) {
    if (!item || typeof item.id !== 'string' || typeof item.name !== 'string') throw new Error(`${name} item is invalid`);
    requireArray(item.ingredients, `${name}.${item.id}.ingredients`);
    requireArray(item.needTags, `${name}.${item.id}.needTags`);
    if (!/^assets\/images\/[a-zA-Z0-9_-]+\.jpg$/.test(item.image || '')) throw new Error(`${name}.${item.id}.image is invalid`);
  }
}

const STORE_VALIDATORS = {
  family(value) {
    requireArray(value && value.members, 'family.members');
    value.members.forEach(validateMember);
  },
  recipes(value) { validateLibrary(value, 'recipes'); },
  teas(value) { validateLibrary(value, 'teas'); },
  'tongue-records'(value) {
    requireArray(value && value.records, 'tongue-records.records');
    value.records.forEach(validateTongueRecord);
  },
  'recommendation-history'(value) {
    requireArray(value && value.entries, 'recommendation-history.entries');
    for (const entry of value.entries) requireArray(entry.memberIds, `recommendation-history.${entry.id || 'entry'}.memberIds`);
  },
};

module.exports = { STORE_VALIDATORS };
