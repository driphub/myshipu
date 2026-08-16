import { escapeHtml, mediaUrl } from '../api.js';

function card(item, labels) {
  return `<article class="library-card" data-item-id="${escapeHtml(item.id)}" data-item-type="${escapeHtml(item.type)}" tabindex="0"><img src="${escapeHtml(mediaUrl(item.image))}" alt="${escapeHtml(item.name)}"><div class="library-card-body"><span class="type-label">${item.type === 'recipe' ? '药膳菜谱' : '食养茶饮'}</span><h2>${escapeHtml(item.name)}</h2><p>${item.needTags.map((tag) => escapeHtml(labels[tag] || tag)).join(' · ')}</p><div class="tag-list">${item.seasonTags.map((tag) => `<span>${escapeHtml({ spring: '春', summer: '夏', autumn: '秋', winter: '冬', all: '四季' }[tag] || tag)}</span>`).join('')}</div></div></article>`;
}

export async function renderLibrary({ mount, api, taxonomy, labels, showToast }) {
  let type = 'all';
  mount.innerHTML = `<section class="page-wrap"><div class="page-head"><div><p class="eyebrow">药膳茶饮库</p><h1>从材料到做法，都有据可查</h1><p>按功效和类型筛选，查看适宜范围与慎用提示。</p></div></div><div class="library-toolbar"><label class="search-field"><span aria-hidden="true">⌕</span><input id="library-search" type="search" placeholder="搜索菜谱或茶饮"></label><div id="library-type" class="segmented" aria-label="类型筛选"><button class="active" data-type="all">全部</button><button data-type="recipe">菜谱</button><button data-type="tea">茶饮</button></div><label>功效<select id="library-tag"><option value="">全部功效</option>${taxonomy.needTags.map((tag) => `<option value="${tag}">${escapeHtml(labels[tag] || tag)}</option>`).join('')}</select></label></div><div id="library-results" class="library-grid" aria-live="polite"></div><dialog id="library-detail" class="modal detail-modal"></dialog></section>`;
  const results = mount.querySelector('#library-results');
  const search = mount.querySelector('#library-search');
  const tag = mount.querySelector('#library-tag');
  const dialog = mount.querySelector('#library-detail');

  async function load() {
    results.innerHTML = '<div class="page-loading compact">正在筛选…</div>';
    try {
      const response = await api(`/api/library?type=${type}&q=${encodeURIComponent(search.value.trim())}&tag=${encodeURIComponent(tag.value)}`);
      results.innerHTML = response.items.length ? response.items.map((item) => card(item, labels)).join('') : '<div class="empty-result">没有符合条件的条目</div>';
      results.querySelectorAll('[data-item-id]').forEach((entry) => {
        const open = () => openDetail(entry.dataset.itemType, entry.dataset.itemId);
        entry.addEventListener('click', open);
        entry.addEventListener('keydown', (event) => { if (event.key === 'Enter') open(); });
      });
    } catch (error) { results.innerHTML = `<div class="error-state compact">${escapeHtml(error.message)}</div>`; }
  }

  async function openDetail(itemType, id) {
    try {
      const { item } = await api(`/api/library/${itemType}/${id}`);
      const teaMeta = item.type === 'tea' ? `<dl><div><dt>每次用量</dt><dd>${escapeHtml(item.amount)}</dd></div><div><dt>饮用时间</dt><dd>${escapeHtml(item.timing)}</dd></div></dl>` : '';
      dialog.innerHTML = `<div class="detail-hero"><img src="${escapeHtml(mediaUrl(item.image))}" alt="${escapeHtml(item.name)}"><button class="icon-button close-on-image" aria-label="关闭">×</button></div><div class="detail-content"><span class="type-label">${item.type === 'recipe' ? '药膳菜谱' : '食养茶饮'}</span><h2>${escapeHtml(item.name)}</h2>${teaMeta}<h3>材料</h3><ul class="ingredient-list">${item.ingredients.map((ingredient) => `<li><span>${escapeHtml(ingredient.name)}</span><b>${escapeHtml(ingredient.amount)}</b></li>`).join('')}</ul><h3>做法</h3><ol class="steps">${item.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>${item.cautionFlags.length ? `<div class="warning-banner"><strong>慎用</strong><span>${item.cautionFlags.map(escapeHtml).join('、')}</span></div>` : ''}</div>`;
      dialog.querySelector('button').addEventListener('click', () => dialog.close());
      dialog.showModal();
    } catch (error) { showToast(error.message, 'error'); }
  }

  let debounce;
  search.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(load, 180); });
  tag.addEventListener('change', load);
  mount.querySelectorAll('[data-type]').forEach((button) => button.addEventListener('click', () => {
    type = button.dataset.type;
    mount.querySelectorAll('[data-type]').forEach((entry) => entry.classList.toggle('active', entry === button));
    load();
  }));
  await load();
  try {
    const pending = JSON.parse(sessionStorage.getItem('mingyuan-library-item') || 'null');
    sessionStorage.removeItem('mingyuan-library-item');
    if (pending?.type && pending?.id) await openDetail(pending.type, pending.id);
  } catch (_) { sessionStorage.removeItem('mingyuan-library-item'); }
}
