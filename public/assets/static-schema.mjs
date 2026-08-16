export const IMPORT_FILE_LIMIT = 40 * 1024 * 1024;
export const STATE_SIZE_LIMIT = 38 * 1024 * 1024;
export const PHOTO_LIMIT = 5 * 1024 * 1024;
export const PHOTO_TOTAL_LIMIT = 25 * 1024 * 1024;

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const LIBRARY_IMAGE_PATTERN = /^assets\/images\/[a-zA-Z0-9._-]+\.(?:jpe?g|png|webp)$/;
const HISTORY_STATUSES = ['active', 'superseded'];

export class StaticValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'StaticValidationError';
    this.code = 'VALIDATION_ERROR';
    this.status = 400;
    this.details = details;
  }
}

function fail(message, field = '') {
  throw new StaticValidationError(message, field ? [{ field, message }] : []);
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${field} 必须是对象`, field);
  return value;
}

function array(value, field) {
  if (!Array.isArray(value)) fail(`${field} 必须是数组`, field);
  return value;
}

function string(value, field, { required = false } = {}) {
  if (typeof value !== 'string') fail(`${field} 必须是文本`, field);
  const result = value.trim();
  if (required && !result) fail(`${field} 不能为空`, field);
  return result;
}

function enumValue(value, allowed, field) {
  if (!allowed.includes(value)) fail(`${field} 包含未知值`, field);
  return value;
}

function controlledArray(value, allowed, field) {
  const result = array(value, field).map((entry, index) => enumValue(entry, allowed, `${field}[${index}]`));
  return [...new Set(result)];
}

function id(value, field, seen) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value) || seen.has(value)) fail('实体 ID 不合法或重复', field);
  seen.add(value);
  return value;
}

function referenceId(value, field) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) fail('引用 ID 不合法', field);
  return value;
}

function decodeBase64(value) {
  try {
    if (typeof globalThis.atob === 'function') {
      const binary = globalThis.atob(value);
      return Uint8Array.from(binary, (char) => char.charCodeAt(0));
    }
    return Uint8Array.from(globalThis.Buffer.from(value, 'base64'));
  } catch (_) {
    fail('图片 base64 格式不正确', 'photoPath');
  }
}

function hasPrefix(bytes, prefix) {
  return prefix.every((value, index) => bytes[index] === value);
}

export function validateImageDataUrl(value) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) fail('图片 Data URL 格式不正确', 'photoPath');
  const bytes = decodeBase64(match[2]);
  const signatures = {
    'image/jpeg': () => hasPrefix(bytes, [0xff, 0xd8, 0xff]),
    'image/png': () => hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    'image/webp': () => hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) && hasPrefix(bytes.slice(8), [0x57, 0x45, 0x42, 0x50]),
  };
  if (!signatures[match[1]]()) fail('图片内容与声明格式不一致', 'photoPath');
  if (bytes.byteLength > PHOTO_LIMIT) fail('单张图片超过 5 MiB', 'photoPath');
  return bytes.byteLength;
}

export function serializedStateSize(state) {
  return new TextEncoder().encode(JSON.stringify(state)).byteLength;
}

export function assertStateSize(state, limit = STATE_SIZE_LIMIT) {
  if (serializedStateSize(state) > limit) fail('本地数据超过容量上限');
}

function deriveAgeGroup(birthYear, currentYear) {
  const age = currentYear - birthYear;
  if (age <= 12) return 'child';
  if (age <= 17) return 'teen';
  if (age <= 64) return 'adult';
  return 'senior';
}

function normalizeMember(input, taxonomy, seen, currentYear, index) {
  const source = object(input, `family.members[${index}]`);
  const birthYear = Number(source.birthYear);
  if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > currentYear) fail('出生年份不合法', `family.members[${index}].birthYear`);
  return {
    id: id(source.id, `family.members[${index}].id`, seen),
    name: string(source.name, `family.members[${index}].name`, { required: true }),
    birthYear,
    ageGroup: deriveAgeGroup(birthYear, currentYear),
    needTags: controlledArray(source.needTags || [], taxonomy.needTags, `family.members[${index}].needTags`),
    preferenceTags: controlledArray(source.preferenceTags || [], taxonomy.preferenceTags, `family.members[${index}].preferenceTags`),
    allergies: controlledArray(source.allergies || [], taxonomy.ingredients, `family.members[${index}].allergies`),
    avoidIngredients: controlledArray(source.avoidIngredients || [], taxonomy.ingredients, `family.members[${index}].avoidIngredients`),
    pregnancyStatus: enumValue(source.pregnancyStatus || 'none', taxonomy.pregnancyStatuses, `family.members[${index}].pregnancyStatus`),
    chronicConditions: controlledArray(source.chronicConditions || [], taxonomy.chronicConditions, `family.members[${index}].chronicConditions`),
    medications: controlledArray(source.medications || [], taxonomy.medications, `family.members[${index}].medications`),
    notes: typeof source.notes === 'string' ? source.notes.trim() : '',
  };
}

function normalizeIngredients(value, taxonomy, field) {
  return array(value, field).map((entry, index) => {
    const source = object(entry, `${field}[${index}]`);
    return {
      id: enumValue(source.id, taxonomy.ingredients, `${field}[${index}].id`),
      name: string(source.name, `${field}[${index}].name`, { required: true }),
      amount: typeof source.amount === 'string' ? source.amount.trim() : '',
    };
  });
}

function normalizeLibraryItem(input, expectedType, taxonomy, seen, index) {
  const field = `${expectedType === 'recipe' ? 'recipes' : 'teas'}.items[${index}]`;
  const source = object(input, field);
  const image = string(source.image, `${field}.image`, { required: true });
  if (!LIBRARY_IMAGE_PATTERN.test(image)) fail('库图片路径不合法', `${field}.image`);
  const base = {
    id: id(source.id, `${field}.id`, seen),
    name: string(source.name, `${field}.name`, { required: true }),
    type: enumValue(source.type, [expectedType], `${field}.type`),
    ingredients: normalizeIngredients(source.ingredients, taxonomy, `${field}.ingredients`),
    needTags: controlledArray(source.needTags || [], taxonomy.needTags, `${field}.needTags`),
    preferenceTags: controlledArray(source.preferenceTags || [], taxonomy.preferenceTags, `${field}.preferenceTags`),
    seasonTags: controlledArray(source.seasonTags || [], taxonomy.seasons, `${field}.seasonTags`),
    hardContraindications: controlledArray(source.hardContraindications || [], [
      'child', 'teen', 'adult', 'senior', ...taxonomy.pregnancyStatuses.filter((entry) => entry !== 'none'),
      ...taxonomy.chronicConditions, ...taxonomy.medications, ...taxonomy.ingredients,
    ], `${field}.hardContraindications`),
    cautionFlags: controlledArray(source.cautionFlags || [], [
      'child', 'teen', 'adult', 'senior', ...taxonomy.pregnancyStatuses.filter((entry) => entry !== 'none'),
      ...taxonomy.chronicConditions, ...taxonomy.medications,
    ], `${field}.cautionFlags`),
    benefits: controlledArray(source.benefits || [], taxonomy.needTags, `${field}.benefits`),
    steps: array(source.steps, `${field}.steps`).map((step, stepIndex) => string(step, `${field}.steps[${stepIndex}]`, { required: true })),
    image,
  };
  if (expectedType === 'recipe') {
    return {
      ...base,
      duration: string(source.duration, `${field}.duration`, { required: true }),
      mealTime: string(source.mealTime, `${field}.mealTime`, { required: true }),
    };
  }
  return {
    ...base,
    medicinalTea: Boolean(source.medicinalTea),
    amount: string(source.amount, `${field}.amount`, { required: true }),
    timing: string(source.timing, `${field}.timing`, { required: true }),
  };
}

function normalizeTongueRecord(input, taxonomy, seen, memberIds, index, photoBytes) {
  const field = `tongueRecords.records[${index}]`;
  const source = object(input, field);
  const memberId = referenceId(source.memberId, `${field}.memberId`);
  if (!memberIds.has(memberId)) fail('舌象记录引用的家庭成员不存在', `${field}.memberId`);
  const status = enumValue(source.status || 'draft', taxonomy.tongueStatuses, `${field}.status`);
  const doctorConclusion = typeof source.doctorConclusion === 'string' ? source.doctorConclusion.trim() : '';
  const confirmedTags = controlledArray(source.confirmedTags || [], taxonomy.confirmedTags, `${field}.confirmedTags`);
  if (status === 'active' && (!doctorConclusion || !confirmedTags.length || !source.confirmedAt)) fail('已确认舌象缺少医生结论、标签或确认时间', field);
  const photoPath = typeof source.photoPath === 'string' ? source.photoPath : '';
  if (photoPath) photoBytes.total += validateImageDataUrl(photoPath);
  const observations = object(source.observations, `${field}.observations`);
  return {
    id: id(source.id, `${field}.id`, seen),
    memberId,
    observedAt: string(source.observedAt, `${field}.observedAt`, { required: true }),
    photoPath,
    observations: Object.fromEntries(Object.keys(taxonomy.tongue).map((key) => [
      key,
      enumValue(observations[key], taxonomy.tongue[key], `${field}.observations.${key}`),
    ])),
    doctorConclusion,
    confirmedTags,
    status,
    confirmedAt: source.confirmedAt == null ? null : string(source.confirmedAt, `${field}.confirmedAt`, { required: true }),
    createdAt: string(source.createdAt, `${field}.createdAt`, { required: true }),
    updatedAt: string(source.updatedAt, `${field}.updatedAt`, { required: true }),
  };
}

function normalizeHistoryEntry(input, seen, memberIds, recipeIds, teaIds, index, imported) {
  const field = `recommendationHistory.entries[${index}]`;
  const source = object(input, field);
  const members = array(source.memberIds, `${field}.memberIds`).map((value, memberIndex) => {
    const memberId = referenceId(value, `${field}.memberIds[${memberIndex}]`);
    if (!memberIds.has(memberId)) fail('推荐历史引用的家庭成员不存在', `${field}.memberIds[${memberIndex}]`);
    return memberId;
  });
  const recipeId = referenceId(source.recipeId, `${field}.recipeId`);
  const teaId = referenceId(source.teaId, `${field}.teaId`);
  if (!recipeIds.has(recipeId) || !teaIds.has(teaId)) fail('推荐历史引用的库条目不存在', field);
  return {
    id: id(source.id, `${field}.id`, seen),
    date: string(source.date, `${field}.date`, { required: true }),
    scopeKey: string(source.scopeKey, `${field}.scopeKey`, { required: true }),
    memberIds: members,
    inputFingerprint: string(source.inputFingerprint, `${field}.inputFingerprint`, { required: true }),
    recipeId,
    teaId,
    status: imported ? 'superseded' : enumValue(source.status, HISTORY_STATUSES, `${field}.status`),
    sequence: Number.isInteger(source.sequence) && source.sequence > 0 ? source.sequence : 1,
    createdAt: string(source.createdAt, `${field}.createdAt`, { required: true }),
  };
}

function versionedStore(value, field, collection) {
  const source = object(value, field);
  if (source.version !== 1) fail(`${field}.version 必须为 1`, `${field}.version`);
  return { version: 1, [collection]: array(source[collection], `${field}.${collection}`) };
}

export function validateAndNormalizeState(input, taxonomy, options = {}) {
  const source = object(input, 'state');
  if (source.schemaVersion !== 1) fail('schemaVersion 必须严格等于 1', 'schemaVersion');
  const seen = new Set();
  const currentYear = options.currentYear || new Date().getFullYear();
  const familyStore = versionedStore(source.family, 'family', 'members');
  const recipeStore = versionedStore(source.recipes, 'recipes', 'items');
  const teaStore = versionedStore(source.teas, 'teas', 'items');
  const tongueStore = versionedStore(source.tongueRecords, 'tongueRecords', 'records');
  const historyStore = versionedStore(source.recommendationHistory, 'recommendationHistory', 'entries');

  const family = { version: 1, members: familyStore.members.map((entry, index) => normalizeMember(entry, taxonomy, seen, currentYear, index)) };
  if (!family.members.length) fail('家庭档案至少保留一名成员', 'family.members');
  const recipes = { version: 1, items: recipeStore.items.map((entry, index) => normalizeLibraryItem(entry, 'recipe', taxonomy, seen, index)) };
  const teas = { version: 1, items: teaStore.items.map((entry, index) => normalizeLibraryItem(entry, 'tea', taxonomy, seen, index)) };
  const memberIds = new Set(family.members.map((entry) => entry.id));
  const recipeIds = new Set(recipes.items.map((entry) => entry.id));
  const teaIds = new Set(teas.items.map((entry) => entry.id));
  const photoBytes = { total: 0 };
  const tongueRecords = {
    version: 1,
    records: tongueStore.records.map((entry, index) => normalizeTongueRecord(entry, taxonomy, seen, memberIds, index, photoBytes)),
  };
  if (photoBytes.total > PHOTO_TOTAL_LIMIT) fail('舌象照片总量超过 25 MiB', 'tongueRecords.records');
  const recommendationHistory = {
    version: 1,
    entries: historyStore.entries.map((entry, index) => normalizeHistoryEntry(
      entry, seen, memberIds, recipeIds, teaIds, index, Boolean(options.imported)
    )),
  };
  const normalized = {
    schemaVersion: 1,
    revision: Number.isInteger(source.revision) && source.revision >= 0 ? source.revision : 0,
    family,
    recipes,
    teas,
    tongueRecords,
    recommendationHistory,
  };
  assertStateSize(normalized);
  return normalized;
}
