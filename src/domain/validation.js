const { TAXONOMY } = require('./taxonomy');

class ValidationError extends Error {
  constructor(details) {
    super('数据校验失败');
    this.name = 'ValidationError';
    this.code = 'VALIDATION_ERROR';
    this.details = details;
  }
}

function deriveAgeGroup(birthYear, currentYear = new Date().getFullYear()) {
  const age = currentYear - Number(birthYear);
  if (age <= 12) return 'child';
  if (age <= 17) return 'teen';
  if (age <= 64) return 'adult';
  return 'senior';
}

function validateString(value, field, details, required = true) {
  if (typeof value !== 'string' || (required && !value.trim())) {
    details.push({ field, message: required ? '不能为空' : '必须是文本' });
    return '';
  }
  return value.trim();
}

function validateEnum(value, allowed, field, details) {
  if (!allowed.includes(value)) details.push({ field, message: '值不在允许范围内' });
  return value;
}

function validateArray(value, allowed, field, details) {
  if (!Array.isArray(value)) {
    details.push({ field, message: '必须是数组' });
    return [];
  }
  value.forEach((item, index) => {
    if (!allowed.includes(item)) details.push({ field: `${field}[${index}]`, message: '包含未知标签' });
  });
  return [...new Set(value)];
}

function validateMember(input, options = {}) {
  const details = [];
  const birthYear = Number(input.birthYear);
  const currentYear = options.currentYear || new Date().getFullYear();
  if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > currentYear) {
    details.push({ field: 'birthYear', message: '请输入有效出生年份' });
  }
  const member = {
    id: validateString(input.id, 'id', details),
    name: validateString(input.name, 'name', details),
    birthYear,
    ageGroup: deriveAgeGroup(birthYear, currentYear),
    needTags: validateArray(input.needTags || [], TAXONOMY.needTags, 'needTags', details),
    preferenceTags: validateArray(input.preferenceTags || [], TAXONOMY.preferenceTags, 'preferenceTags', details),
    allergies: validateArray(input.allergies || [], TAXONOMY.ingredients, 'allergies', details),
    avoidIngredients: validateArray(input.avoidIngredients || [], TAXONOMY.ingredients, 'avoidIngredients', details),
    pregnancyStatus: validateEnum(input.pregnancyStatus || 'none', TAXONOMY.pregnancyStatuses, 'pregnancyStatus', details),
    chronicConditions: validateArray(input.chronicConditions || [], TAXONOMY.chronicConditions, 'chronicConditions', details),
    medications: validateArray(input.medications || [], TAXONOMY.medications, 'medications', details),
    notes: typeof input.notes === 'string' ? input.notes.trim() : '',
  };
  if (details.length) throw new ValidationError(details);
  return member;
}

function validateTongueRecord(input) {
  const details = [];
  const observations = input.observations || {};
  const record = {
    ...input,
    id: validateString(input.id, 'id', details),
    memberId: validateString(input.memberId, 'memberId', details),
    observedAt: validateString(input.observedAt, 'observedAt', details),
    photoPath: typeof input.photoPath === 'string' ? input.photoPath : '',
    observations: {},
    doctorConclusion: typeof input.doctorConclusion === 'string' ? input.doctorConclusion.trim() : '',
    confirmedTags: validateArray(input.confirmedTags || [], TAXONOMY.confirmedTags, 'confirmedTags', details),
    status: validateEnum(input.status || 'draft', TAXONOMY.tongueStatuses, 'status', details),
  };
  Object.keys(TAXONOMY.tongue).forEach((key) => {
    record.observations[key] = validateEnum(observations[key], TAXONOMY.tongue[key], `observations.${key}`, details);
  });
  if (record.status === 'active') {
    if (!record.doctorConclusion) details.push({ field: 'doctorConclusion', message: '确认记录必须填写医生结论' });
    if (!record.confirmedTags.length) details.push({ field: 'confirmedTags', message: '确认记录必须选择确认标签' });
  }
  if (details.length) throw new ValidationError(details);
  return record;
}

module.exports = { ValidationError, deriveAgeGroup, validateMember, validateTongueRecord };
