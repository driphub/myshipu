import { escapeHtml } from '../api.js';

function localDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function memberSelector(members, scope) {
  const options = [`<option value="all" ${scope === 'all' ? 'selected' : ''}>全家方案</option>`]
    .concat(members.map((member) => `<option value="member:${escapeHtml(member.id)}" ${scope === `member:${member.id}` ? 'selected' : ''}>${escapeHtml(member.name)}</option>`));
  return `<label class="mobile-member-select">推荐范围<select id="mobile-scope">${options.join('')}</select></label>`;
}

function sidebar(members, scope, records) {
  const scopedMembers = members.filter((member) => scope === 'all' || scope === `member:${member.id}`);
  const latestRows = scopedMembers.map((member) => {
    const record = records.filter((entry) => entry.memberId === member.id)
      .sort((left, right) => String(right.observedAt).localeCompare(String(left.observedAt)))[0];
    return `<li><span>${escapeHtml(member.name)}</span><small>${record ? `${escapeHtml(record.observedAt)} · ${escapeHtml({ draft: '待确认', active: '已确认', archived: '已归档' }[record.status] || record.status)}` : '暂无记录'}</small></li>`;
  }).join('');
  return `<aside class="member-sidebar"><p class="section-label">推荐范围</p>
    <button class="member-choice ${scope === 'all' ? 'active' : ''}" data-scope="all"><span class="avatar">全</span><span><strong>全家方案</strong><small>${members.length} 人综合适配</small></span></button>
    ${members.map((member) => `<button class="member-choice ${scope === `member:${member.id}` ? 'active' : ''}" data-scope="member:${escapeHtml(member.id)}"><span class="avatar">${escapeHtml(member.name.slice(0, 1))}</span><span><strong>${escapeHtml(member.name)}</strong><small>${member.needTags.length} 项健康目标</small></span></button>`).join('')}
    <a class="manage-link" href="#family">＋ 管理家庭成员</a>
    <div class="sidebar-note"><p><strong>最近舌象</strong></p><ul>${latestRows}</ul><a href="#tongue">查看全部记录</a></div>
    <div class="sidebar-note"><span aria-hidden="true">◎</span><p><strong>记录会影响新推荐</strong><br>只有医生确认的舌象标签参与匹配。</p></div>
  </aside>`;
}

function scoreRows(scores, members) {
  return members.filter((member) => scores[member.id]).map((member) => {
    const score = scores[member.id].overall;
    return `<div class="score-row"><span class="avatar small">${escapeHtml(member.name.slice(0, 1))}</span><div><div class="score-label"><strong>${escapeHtml(member.name)}</strong><span>${score}%</span></div><div class="score-track"><i style="width:${score}%"></i></div></div></div>`;
  }).join('');
}

function planMarkup(plan, members) {
  const reasons = plan.reasons.length ? plan.reasons : ['兼顾已登记的家庭需求'];
  return `<div class="today-heading"><div><p class="eyebrow">${escapeHtml(plan.date)} · ${escapeHtml({ spring: '春季', summer: '夏季', autumn: '秋季', winter: '冬季' }[plan.season])}</p><h1>今日${plan.scopeKey.startsWith('all:') ? '全家' : '个人'}食养方案</h1><p class="lede">从家庭档案、忌口和已确认记录中筛选，给出可解释的日常搭配。</p></div><button class="button primary" id="rotate-plan" aria-label="换一套方案"><span aria-hidden="true">↻</span> 换一套方案</button></div>
    <div class="recommendation-grid" aria-live="polite">
      <article class="recipe-feature"><img src="/${escapeHtml(plan.recipe.image)}" alt="${escapeHtml(plan.recipe.name)}"><div class="image-shade"></div><div class="recipe-copy"><span class="on-image-tag">主菜 · ${escapeHtml(plan.recipe.duration)}</span><h2>${escapeHtml(plan.recipe.name)}</h2><p>${plan.recipe.ingredients.map((item) => escapeHtml(item.name)).join(' · ')}</p><button class="text-action" data-library-id="${escapeHtml(plan.recipe.id)}">查看做法 <span aria-hidden="true">→</span></button></div></article>
      <article class="tea-feature"><div class="tea-symbol" aria-hidden="true">茶</div><p class="section-label">今日茶饮</p><h2>${escapeHtml(plan.tea.name)}</h2><p>${plan.tea.ingredients.map((item) => `${escapeHtml(item.name)} ${escapeHtml(item.amount)}`).join(' · ')}</p><dl><div><dt>用量</dt><dd>${escapeHtml(plan.tea.amount)}</dd></div><div><dt>时间</dt><dd>${escapeHtml(plan.tea.timing)}</dd></div></dl><img src="/${escapeHtml(plan.tea.image)}" alt="${escapeHtml(plan.tea.name)}"></article>
    </div>
    ${plan.warnings.length ? `<div class="warning-banner"><strong>慎用提示</strong>${plan.warnings.map((warning) => `<span>${escapeHtml(warning)}</span>`).join('')}</div>` : ''}
    <div class="insight-grid">
      <section class="insight-panel"><header><h2>推荐依据</h2><span>可追溯</span></header>${reasons.map((reason, index) => `<div class="reason-row"><i>${index + 1}</i><div><strong>${escapeHtml(reason)}</strong><p>${index === 0 ? '综合成员当前健康目标与季节特征。' : '同时避开已登记过敏与明确忌口。'}</p></div></div>`).join('')}</section>
      <section class="insight-panel"><header><h2>成员适配度</h2><span>最低分优先</span></header>${scoreRows(plan.scores, members)}</section>
    </div>`;
}

export async function renderToday({ mount, api, members, showToast }) {
  let scope = sessionStorage.getItem('mingyuan-scope') || 'all';
  if (scope !== 'all' && !members.some((member) => scope === `member:${member.id}`)) scope = 'all';
  let tongueRecords = [];
  try { tongueRecords = (await api('/api/tongue-records')).records; } catch (_) {}
  mount.innerHTML = `<div class="today-layout">${sidebar(members, scope, tongueRecords)}<section class="today-main">${memberSelector(members, scope)}<div id="plan-content" class="page-loading" aria-live="polite">正在生成安全食养方案…</div></section></div>`;
  const content = mount.querySelector('#plan-content');

  async function load(rotate = false) {
    content.className = 'page-loading';
    content.textContent = rotate ? '正在为你更换方案…' : '正在读取今日方案…';
    try {
      const plan = rotate
        ? await api('/api/recommendations/rotate', { method: 'POST', body: { date: localDate(), scope } })
        : await api(`/api/recommendations?date=${localDate()}&scope=${encodeURIComponent(scope)}`);
      content.className = '';
      content.innerHTML = planMarkup(plan, members.filter((member) => scope === 'all' || scope === `member:${member.id}`));
      content.querySelector('#rotate-plan')?.addEventListener('click', () => load(true));
      content.querySelector('[data-library-id]')?.addEventListener('click', (event) => {
        sessionStorage.setItem('mingyuan-library-item', JSON.stringify({ type: 'recipe', id: event.currentTarget.dataset.libraryId }));
        location.hash = '#library';
      });
    } catch (error) {
      content.className = 'error-state';
      content.innerHTML = `<h2>${error.code === 'NO_ALTERNATIVE' ? '暂无更多安全组合' : '无法生成今日方案'}</h2><p>${escapeHtml(error.message)}</p><button class="button secondary" id="retry-plan">重试</button>`;
      content.querySelector('#retry-plan')?.addEventListener('click', () => load(false));
      showToast(error.message, 'error');
    }
  }

  function changeScope(next) {
    scope = next;
    sessionStorage.setItem('mingyuan-scope', scope);
    renderToday({ mount, api, members, showToast });
  }
  mount.querySelectorAll('[data-scope]').forEach((button) => button.addEventListener('click', () => changeScope(button.dataset.scope)));
  mount.querySelector('#mobile-scope')?.addEventListener('change', (event) => changeScope(event.target.value));
  await load(false);
}
