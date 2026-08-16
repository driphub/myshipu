import { escapeHtml } from '../api.js';

function options(values, selected = [], labels = {}) {
  return values.map((value) => `<option value="${escapeHtml(value)}" ${selected.includes(value) ? 'selected' : ''}>${escapeHtml(labels[value] || value)}</option>`).join('');
}

function formMarkup(member, taxonomy, labels) {
  const data = member || { needTags: [], preferenceTags: [], allergies: [], avoidIngredients: [], chronicConditions: [], medications: [], pregnancyStatus: 'none' };
  return `<form id="member-form" class="form-grid">
    <input type="hidden" name="id" value="${escapeHtml(data.id || '')}">
    <label>姓名<input name="name" required maxlength="20" value="${escapeHtml(data.name || '')}"></label>
    <label>出生年份<input name="birthYear" type="number" min="1900" max="${new Date().getFullYear()}" required value="${escapeHtml(data.birthYear || '')}"></label>
    <label>健康目标<select name="needTags" multiple required>${options(taxonomy.needTags, data.needTags, labels)}</select></label>
    <label>饮食偏好<select name="preferenceTags" multiple>${options(taxonomy.preferenceTags, data.preferenceTags, labels)}</select></label>
    <label>过敏食材<select name="allergies" multiple>${options(taxonomy.ingredients, data.allergies, labels)}</select></label>
    <label>明确忌口<select name="avoidIngredients" multiple>${options(taxonomy.ingredients, data.avoidIngredients, labels)}</select></label>
    <label>孕期/产后<select name="pregnancyStatus">${options(taxonomy.pregnancyStatuses, [data.pregnancyStatus], { none: '无', pregnant: '孕期', postpartum: '产后' })}</select></label>
    <label>慢性病提示<select name="chronicConditions" multiple>${options(taxonomy.chronicConditions, data.chronicConditions, labels)}</select></label>
    <label>用药提示<select name="medications" multiple>${options(taxonomy.medications, data.medications, labels)}</select></label>
    <label class="span-two">备注<textarea name="notes" rows="3" maxlength="300">${escapeHtml(data.notes || '')}</textarea></label>
    <div class="form-actions span-two"><button type="button" class="button secondary" data-close>取消</button><button class="button primary" type="submit">保存档案</button></div>
  </form>`;
}

function selected(form, name) {
  return Array.from(form.elements[name].selectedOptions).map((option) => option.value);
}

export async function renderFamily(context) {
  const { mount, api, members, taxonomy, labels, refreshMembers, showToast } = context;
  mount.innerHTML = `<section class="page-wrap"><div class="page-head"><div><p class="eyebrow">家庭档案</p><h1>认识每一位家人的日常需求</h1><p>过敏和明确忌口会被硬性排除，其他信息用于解释推荐。</p></div><button class="button primary" id="add-member">＋ 新增成员</button></div>
    <div class="member-grid">${members.map((member) => `<article class="member-card"><div class="member-card-head"><span class="avatar large">${escapeHtml(member.name.slice(0, 1))}</span><div><h2>${escapeHtml(member.name)}</h2><p>${new Date().getFullYear() - member.birthYear} 岁 · ${escapeHtml(member.ageGroup)}</p></div></div><div class="tag-list">${member.needTags.map((tag) => `<span>${escapeHtml(labels[tag] || tag)}</span>`).join('')}</div><dl><div><dt>过敏</dt><dd>${member.allergies.map(escapeHtml).join('、') || '无'}</dd></div><div><dt>忌口</dt><dd>${member.avoidIngredients.map(escapeHtml).join('、') || '无'}</dd></div></dl><div class="card-actions"><button class="icon-button" data-edit="${escapeHtml(member.id)}" title="编辑档案" aria-label="编辑${escapeHtml(member.name)}">✎</button><button class="icon-button danger" data-delete="${escapeHtml(member.id)}" title="删除成员" aria-label="删除${escapeHtml(member.name)}">×</button></div></article>`).join('')}</div>
    <dialog id="member-dialog" class="modal"><div class="modal-head"><h2 id="member-dialog-title">家庭成员</h2><button class="icon-button" data-close aria-label="关闭">×</button></div><div id="member-form-slot"></div></dialog></section>`;
  const dialog = mount.querySelector('#member-dialog');
  const slot = mount.querySelector('#member-form-slot');

  function open(member) {
    slot.innerHTML = formMarkup(member, taxonomy, labels);
    mount.querySelector('#member-dialog-title').textContent = member ? '编辑家庭成员' : '新增家庭成员';
    slot.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => dialog.close()));
    slot.querySelector('#member-form').addEventListener('submit', save);
    dialog.showModal();
  }

  async function save(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const value = { name: form.elements.name.value.trim(), birthYear: Number(form.elements.birthYear.value), needTags: selected(form, 'needTags'), preferenceTags: selected(form, 'preferenceTags'), allergies: selected(form, 'allergies'), avoidIngredients: selected(form, 'avoidIngredients'), pregnancyStatus: form.elements.pregnancyStatus.value, chronicConditions: selected(form, 'chronicConditions'), medications: selected(form, 'medications'), notes: form.elements.notes.value.trim() };
    const id = form.elements.id.value;
    try {
      await api(id ? `/api/family/${id}` : '/api/family', { method: id ? 'PUT' : 'POST', body: value });
      dialog.close();
      await refreshMembers();
      showToast('家庭档案已保存', 'success');
      await renderFamily({ ...context, members: window.__mingyuanMembers });
    } catch (error) { showToast(error.message, 'error'); }
  }

  mount.querySelector('#add-member').addEventListener('click', () => open(null));
  mount.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => open(members.find((member) => member.id === button.dataset.edit))));
  mount.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', async () => {
    const member = members.find((entry) => entry.id === button.dataset.delete);
    if (!confirm(`确认删除“${member.name}”及其舌象记录吗？`)) return;
    try {
      await api(`/api/family/${member.id}`, { method: 'DELETE' });
      await refreshMembers();
      showToast('成员已删除', 'success');
      await renderFamily({ ...context, members: window.__mingyuanMembers });
    } catch (error) { showToast(error.message, 'error'); }
  }));
}
