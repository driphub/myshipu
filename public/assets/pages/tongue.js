import { escapeHtml } from '../api.js';

const observationLabels = {
  color: { pale: '淡', pink: '淡红', red: '红', dark: '暗' },
  coating: { white: '白苔', yellow: '黄苔', none: '少苔' },
  thickness: { thin: '薄', thick: '厚' },
  moisture: { dry: '偏干', normal: '适中', wet: '偏润' },
};

function observationSelect(name, label) {
  return `<label>${label}<select name="${name}">${Object.entries(observationLabels[name]).map(([value, text]) => `<option value="${value}">${text}</option>`).join('')}</select></label>`;
}

function statusLabel(status) {
  return { draft: '待确认', active: '已确认', archived: '已归档' }[status] || status;
}

export async function renderTongue({ mount, api, members, taxonomy, labels, showToast }) {
  mount.innerHTML = `<section class="page-wrap"><div class="page-head"><div><p class="eyebrow">AI舌诊</p><h1>辅助记录，不做自动诊断</h1><p>保存舌苔照片和观察项；只有专业医生结论及你确认的标签会影响后续推荐。</p></div><button class="button primary" id="new-tongue">＋ 新建记录</button></div><div class="safety-callout"><strong>安全边界</strong><span>照片不会被上传到互联网，系统不根据照片判断疾病或开具处方。</span></div><div id="tongue-records" class="record-list" aria-live="polite"></div><dialog id="tongue-dialog" class="modal"><div class="modal-head"><h2 id="tongue-dialog-title">新建舌象记录</h2><button class="icon-button" data-close aria-label="关闭">×</button></div><form id="tongue-form" class="form-grid"><label>家庭成员<select name="memberId" required>${members.map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.name)}</option>`).join('')}</select></label><label>观察日期<input type="date" name="observedAt" required value="${new Date().toISOString().slice(0, 10)}"></label><label class="span-two file-field">舌苔照片<input type="file" name="photo" accept="image/jpeg,image/png,image/webp"><span>仅 JPG、PNG、WebP，最大 5MB；编辑时留空即保留原照片</span></label>${observationSelect('color', '舌色')}${observationSelect('coating', '苔色')}${observationSelect('thickness', '厚薄')}${observationSelect('moisture', '润燥')}<label class="span-two">专业医生结论<textarea name="doctorConclusion" rows="4" placeholder="可先留空，获得专业结论后再确认"></textarea></label><fieldset class="span-two"><legend>医生确认标签</legend><div class="check-grid">${taxonomy.confirmedTags.map((tag) => `<label><input type="checkbox" name="confirmedTags" value="${tag}">${escapeHtml(labels[tag] || tag)}</label>`).join('')}</div></fieldset><div class="form-actions span-two"><button type="button" class="button secondary" data-close>取消</button><button class="button primary">保存草稿</button></div></form></dialog></section>`;
  const list = mount.querySelector('#tongue-records');
  const dialog = mount.querySelector('#tongue-dialog');
  const form = mount.querySelector('#tongue-form');
  let currentRecords = [];
  let editingId = '';

  async function load() {
    const { records } = await api('/api/tongue-records');
    currentRecords = records;
    list.innerHTML = records.length ? records.map((record) => {
      const member = members.find((entry) => entry.id === record.memberId);
      const observations = Object.entries(record.observations).map(([key, value]) => observationLabels[key]?.[value]).filter(Boolean).join(' · ');
      return `<article class="record-card"><div class="record-photo">${record.photoPath ? `<img src="/${escapeHtml(record.photoPath)}" alt="${escapeHtml(member?.name || '')}的舌苔记录">` : '<span>无照片</span>'}</div><div class="record-body"><div class="record-meta"><span class="status status-${record.status}">${statusLabel(record.status)}</span><span>${escapeHtml(record.observedAt)}</span></div><h2>${escapeHtml(member?.name || '已删除成员')}</h2><p>${escapeHtml(observations)}</p><blockquote>${escapeHtml(record.doctorConclusion || '尚未录入专业医生结论')}</blockquote><div class="tag-list">${record.confirmedTags.map((tag) => `<span>${escapeHtml(labels[tag] || tag)}</span>`).join('')}</div></div><div class="record-actions"><button class="button secondary" data-action="edit" data-id="${record.id}">编辑</button>${record.status === 'draft' ? `<button class="button primary" data-action="confirm" data-id="${record.id}">确认用于推荐</button>` : ''}${record.status === 'active' ? `<button class="button secondary" data-action="archive" data-id="${record.id}">归档</button>` : ''}${record.status === 'archived' ? `<button class="button secondary" data-action="restore" data-id="${record.id}">恢复</button>` : ''}<button class="icon-button danger" data-action="delete" data-id="${record.id}" aria-label="删除记录">×</button></div></article>`;
    }).join('') : '<div class="empty-result">还没有舌象记录</div>';
    list.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => act(button.dataset.action, button.dataset.id)));
  }

  async function act(action, id) {
    try {
      if (action === 'edit') {
        const record = currentRecords.find((entry) => entry.id === id);
        if (!record) return;
        editingId = id;
        form.reset();
        form.elements.memberId.value = record.memberId;
        form.elements.memberId.disabled = true;
        form.elements.observedAt.value = record.observedAt;
        for (const [name, value] of Object.entries(record.observations)) form.elements[name].value = value;
        form.elements.doctorConclusion.value = record.doctorConclusion || '';
        form.querySelectorAll('[name="confirmedTags"]').forEach((input) => { input.checked = record.confirmedTags.includes(input.value); });
        mount.querySelector('#tongue-dialog-title').textContent = '编辑舌象记录';
        dialog.showModal();
        return;
      } else if (action === 'delete') {
        if (!confirm('确认删除这条舌象记录吗？')) return;
        await api(`/api/tongue-records/${id}`, { method: 'DELETE' });
      } else {
        const actionPaths = {
          confirm: `/api/tongue-records/${id}/confirm`,
          archive: `/api/tongue-records/${id}/archive`,
          restore: `/api/tongue-records/${id}/restore`,
        };
        if (!actionPaths[action]) throw new Error('未知记录操作');
        await api(actionPaths[action], { method: 'POST' });
      }
      showToast('舌象记录已更新', 'success');
      await load();
    } catch (error) { showToast(error.message, 'error'); }
  }

  mount.querySelector('#new-tongue').addEventListener('click', () => {
    editingId = '';
    form.reset();
    form.elements.memberId.disabled = false;
    mount.querySelector('#tongue-dialog-title').textContent = '新建舌象记录';
    dialog.showModal();
  });
  mount.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => dialog.close()));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const observations = Object.fromEntries(['color', 'coating', 'thickness', 'moisture'].map((name) => [name, form.elements[name].value]));
    const confirmedTags = Array.from(form.querySelectorAll('[name="confirmedTags"]:checked')).map((input) => input.value);
    const body = new FormData();
    if (!editingId) body.append('memberId', form.elements.memberId.value);
    body.append('observedAt', form.elements.observedAt.value);
    body.append('observations', JSON.stringify(observations));
    body.append('doctorConclusion', form.elements.doctorConclusion.value.trim());
    body.append('confirmedTags', JSON.stringify(confirmedTags));
    if (form.elements.photo.files[0]) body.append('photo', form.elements.photo.files[0]);
    try {
      await api(editingId ? `/api/tongue-records/${editingId}` : '/api/tongue-records', { method: editingId ? 'PATCH' : 'POST', body });
      dialog.close();
      form.reset();
      form.elements.memberId.disabled = false;
      showToast(editingId ? '舌象记录已保存' : '舌象草稿已保存', 'success');
      editingId = '';
      await load();
    } catch (error) { showToast(error.message, 'error'); }
  });
  await load();
}
