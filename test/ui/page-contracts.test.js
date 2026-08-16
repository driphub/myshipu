const fs = require('fs');
const path = require('path');
const { assert, test } = require('../helpers/test-runner');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'assets', 'pages', name), 'utf8');
}

test('family page includes complete member profile editing and deletion confirmation', () => {
  const source = read('family.js');
  for (const field of ['birthYear', 'needTags', 'preferenceTags', 'allergies', 'avoidIngredients', 'pregnancyStatus', 'chronicConditions', 'medications']) {
    assert.ok(source.includes(field), field);
  }
  assert.ok(source.includes('confirm('));
  assert.ok(source.includes("method: 'DELETE'"));
});

test('library page provides search, type, tag filters, and detail content', () => {
  const source = read('library.js');
  for (const marker of ['library-search', 'library-type', 'library-tag', 'ingredients', 'steps', 'item.amount', 'item.timing']) assert.ok(source.includes(marker), marker);
  assert.ok(source.includes('/api/library'));
});

test('tongue page exposes safe assisted recording and explicit state actions', () => {
  const source = read('tongue.js');
  for (const marker of ['type="file"', 'observations', 'doctorConclusion', 'confirmedTags', '/confirm', '/archive', '/restore', 'data-action="edit"', "'PATCH'"]) assert.ok(source.includes(marker), marker);
  assert.ok(source.includes('辅助记录，不做自动诊断'));
  assert.ok(source.includes('accept="image/jpeg,image/png,image/webp"'));
});

test('application router loads all four real page modules', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'assets', 'app.js'), 'utf8');
  for (const module of ['./pages/today.js', './pages/family.js', './pages/library.js', './pages/tongue.js']) assert.ok(app.includes(module), module);
  assert.strictEqual(app.includes('此模块正在载入'), false);
});

test('today page links recipes to the library and shows recent tongue context', () => {
  const source = read('today.js');
  assert.ok(source.includes('mingyuan-library-item'));
  assert.ok(source.includes('最近舌象'));
  assert.ok(source.includes('/api/tongue-records'));
});
