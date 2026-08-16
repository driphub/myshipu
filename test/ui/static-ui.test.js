const fs = require('fs');
const path = require('path');
const { assert, test } = require('../helpers/test-runner');

function read(relative) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relative), 'utf8');
}

test('application shell exposes the approved navigation and safety language', () => {
  const html = read('public/index.html');
  for (const label of ['今日推荐', '家庭档案', '药膳茶饮库', 'AI舌诊']) assert.ok(html.includes(label), label);
  assert.ok(html.includes('id="app"'));
  assert.ok(html.includes('不替代医疗诊断'));
  assert.ok(html.includes('aria-label="主导航"'));
});

test('frontend is self-contained and references local visual assets', () => {
  const html = read('public/index.html');
  const today = read('public/assets/pages/today.js');
  assert.strictEqual(/https?:\/\//.test(html), false);
  assert.ok(today.includes('recipe.image'));
  assert.ok(today.includes('tea.image'));
  for (const image of ['yam-soup.jpg', 'herbal-tea.jpg']) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', '..', 'public', 'assets', 'images', image)), image);
  }
});

test('interactive controls have explicit accessible names', () => {
  const today = read('public/assets/pages/today.js');
  assert.ok(today.includes('aria-label="换一套方案"'));
  assert.ok(today.includes('aria-live="polite"'));
});
