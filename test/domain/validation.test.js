const { assert, test } = require('../helpers/test-runner');
const {
  ValidationError,
  deriveAgeGroup,
  validateMember,
  validateTongueRecord,
} = require('../../src/domain/validation');

const validMember = {
  id: 'member-lin',
  name: '林女士',
  birthYear: 1988,
  needTags: ['spleen-support', 'low-oil'],
  preferenceTags: ['soup', 'mild'],
  allergies: ['peanut'],
  avoidIngredients: ['chili'],
  pregnancyStatus: 'none',
  chronicConditions: [],
  medications: [],
  notes: '示例',
};

test('derives the four age groups from birth year', () => {
  assert.strictEqual(deriveAgeGroup(2016, 2026), 'child');
  assert.strictEqual(deriveAgeGroup(2010, 2026), 'teen');
  assert.strictEqual(deriveAgeGroup(1988, 2026), 'adult');
  assert.strictEqual(deriveAgeGroup(1950, 2026), 'senior');
});

test('normalizes a valid member and derives age group', () => {
  const member = validateMember(validMember, { currentYear: 2026 });
  assert.strictEqual(member.ageGroup, 'adult');
  assert.notStrictEqual(member, validMember);
  assert.deepStrictEqual(member.needTags, ['spleen-support', 'low-oil']);
});

test('rejects unknown controlled member tags with a field path', () => {
  assert.throws(
    () => validateMember({ ...validMember, needTags: ['unknown-tag'] }),
    (error) => error instanceof ValidationError && error.details[0].field === 'needTags[0]'
  );
});

test('accepts an unconfirmed tongue record as a draft', () => {
  const record = validateTongueRecord({
    id: 'tongue-1',
    memberId: 'member-lin',
    observedAt: '2026-08-16',
    photoPath: 'uploads/test.webp',
    observations: { color: 'pink', coating: 'white', thickness: 'thick', moisture: 'normal' },
    doctorConclusion: '',
    confirmedTags: [],
    status: 'draft',
  });
  assert.strictEqual(record.status, 'draft');
});

test('rejects active tongue records without doctor confirmation', () => {
  assert.throws(
    () => validateTongueRecord({
      id: 'tongue-1',
      memberId: 'member-lin',
      observedAt: '2026-08-16',
      observations: { color: 'pink', coating: 'white', thickness: 'thin', moisture: 'normal' },
      doctorConclusion: '',
      confirmedTags: [],
      status: 'active',
    }),
    (error) => error instanceof ValidationError && error.details.some((item) => item.field === 'doctorConclusion')
  );
});

test('rejects unknown tongue observation values', () => {
  assert.throws(
    () => validateTongueRecord({
      id: 'tongue-1',
      memberId: 'member-lin',
      observedAt: '2026-08-16',
      observations: { color: 'blue', coating: 'white', thickness: 'thin', moisture: 'normal' },
      doctorConclusion: '',
      confirmedTags: [],
      status: 'draft',
    }),
    (error) => error instanceof ValidationError && error.details[0].field === 'observations.color'
  );
});
