import { memberSafetyFlags, rankPlanPairs } from './static-core.mjs';
import { validateImageDataUrl } from './static-schema.mjs';
import { browserStore, loadBootstrap as loadBrowserBootstrap } from './static-store.mjs';

const CONFIRMED_TAG_TO_NEED = Object.freeze({
  'dampness-tendency': 'spleen-support',
  'dryness-tendency': 'gentle-moistening',
  'weak-digestion': 'digestion-support',
});

class StaticApiError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.name = 'StaticApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function error(code, message, status = 400, details) {
  throw new StaticApiError(code, message, status, details);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function methodOf(options) {
  return String(options.method || 'GET').toUpperCase();
}

function bodyObject(options) {
  if (!options.body || typeof options.body !== 'object') error('VALIDATION_ERROR', '请求数据格式不正确');
  return options.body;
}

function formValue(body, name) {
  return body && typeof body.get === 'function' ? body.get(name) : body?.[name];
}

function optionalJsonField(body, name, fallback) {
  const value = formValue(body, name);
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { error('VALIDATION_ERROR', '表单 JSON 字段格式不正确'); }
}

function stableFingerprint(value) {
  const source = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function scopeMembers(scope, members) {
  if (scope === 'all') return members;
  if (!String(scope).startsWith('member:')) error('VALIDATION_ERROR', '推荐范围不合法');
  const member = members.find((entry) => entry.id === String(scope).slice(7));
  if (!member) error('NOT_FOUND', '未找到家庭成员', 404);
  return [member];
}

function recommendationContext(state, date, scope) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) error('VALIDATION_ERROR', '缺少日期');
  const members = scopeMembers(scope, state.family.members);
  const scopeKey = scope === 'all' ? `all:${members.map((member) => member.id).sort().join(',')}` : scope;
  const activeRecords = members.map((member) => state.tongueRecords.records
    .filter((record) => record.memberId === member.id && record.status === 'active')
    .sort((left, right) => String(right.confirmedAt).localeCompare(String(left.confirmedAt)))[0])
    .filter(Boolean);
  const confirmedTagsByMember = Object.fromEntries(activeRecords.map((record) => [record.memberId, record.confirmedTags]));
  const inputFingerprint = stableFingerprint({
    members,
    records: activeRecords.map((record) => ({
      id: record.id, memberId: record.memberId, confirmedAt: record.confirmedAt, confirmedTags: record.confirmedTags,
    })),
    recipeVersion: state.recipes.version,
    teaVersion: state.teas.version,
  });
  const plans = rankPlanPairs({
    members,
    recipes: state.recipes.items,
    teas: state.teas.items,
    date,
    confirmedTagsByMember,
  });
  return { members, scopeKey, activeRecords, confirmedTagsByMember, inputFingerprint, plans };
}

function presentPlan(plan, entry, members, confirmedTagsByMember, labels) {
  const memberNeeds = new Set(members.flatMap((member) => [
    ...member.needTags,
    ...(confirmedTagsByMember[member.id] || []).map((tag) => CONFIRMED_TAG_TO_NEED[tag]).filter(Boolean),
  ]));
  const matchedNeeds = [...new Set(plan.recipe.needTags.concat(plan.tea.needTags))].filter((tag) => memberNeeds.has(tag));
  const warnings = [];
  for (const member of members) {
    for (const candidate of [plan.recipe, plan.tea]) {
      if (memberSafetyFlags(member).some((flag) => candidate.cautionFlags.includes(flag))) {
        warnings.push(`${member.name}：${candidate.name}含慎用提示，请结合专业意见`);
      }
    }
  }
  return {
    historyId: entry.id,
    date: entry.date,
    scopeKey: entry.scopeKey,
    recipe: clone(plan.recipe),
    tea: clone(plan.tea),
    scores: clone(plan.scores),
    season: plan.season,
    reasons: matchedNeeds.map((tag) => labels[tag] || tag),
    warnings,
    sequence: entry.sequence,
  };
}

function invalidateHistory(state, memberId) {
  state.recommendationHistory.entries = state.recommendationHistory.entries.map((entry) => (
    entry.memberIds.includes(memberId) && entry.status === 'active' ? { ...entry, status: 'superseded' } : entry
  ));
}

function bytesToBase64(bytes) {
  if (typeof globalThis.btoa === 'function') {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return globalThis.btoa(binary);
  }
  return globalThis.Buffer.from(bytes).toString('base64');
}

async function fileDataUrl(file) {
  if (!file || typeof file.arrayBuffer !== 'function' || !file.size) return '';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) error('UNSUPPORTED_MEDIA_TYPE', '仅支持 JPG、PNG 或 WebP 图片', 415);
  if (file.size > 5 * 1024 * 1024) error('PAYLOAD_TOO_LARGE', '图片不能超过 5 MiB', 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const value = `data:${file.type};base64,${bytesToBase64(bytes)}`;
  validateImageDataUrl(value);
  return value;
}

function tongueInput(body, { partial = false } = {}) {
  const input = {};
  for (const name of ['memberId', 'observedAt', 'doctorConclusion']) {
    const value = formValue(body, name);
    if (!partial || value != null) input[name] = value == null ? '' : String(value);
  }
  const observations = optionalJsonField(body, 'observations', partial ? undefined : {});
  const confirmedTags = optionalJsonField(body, 'confirmedTags', partial ? undefined : []);
  if (observations !== undefined) input.observations = observations;
  if (confirmedTags !== undefined) input.confirmedTags = confirmedTags;
  return input;
}

export function createStaticApi({ store, loadBootstrap, clock = () => new Date(), idGenerator } = {}) {
  const makeId = idGenerator || ((prefix) => `${prefix}-${crypto.randomUUID()}`);

  async function recommend(date, scope, rotate) {
    const bootstrap = await loadBootstrap();
    const current = await store.read();
    const initial = recommendationContext(current, date, scope);
    const relevant = current.recommendationHistory.entries.filter((entry) => entry.date === date && entry.scopeKey === initial.scopeKey);
    const active = relevant.find((entry) => entry.status === 'active');
    if (!rotate && active && active.inputFingerprint === initial.inputFingerprint) {
      const existing = initial.plans.find((plan) => plan.recipe.id === active.recipeId && plan.tea.id === active.teaId);
      if (existing) return presentPlan(existing, active, initial.members, initial.confirmedTagsByMember, bootstrap.labels);
    }

    let result;
    await store.update((state) => {
      const context = recommendationContext(state, date, scope);
      const entries = state.recommendationHistory.entries;
      const currentRelevant = entries.filter((entry) => entry.date === date && entry.scopeKey === context.scopeKey);
      const transactionWinner = currentRelevant.find((entry) => entry.status === 'active');
      if (!rotate && transactionWinner?.inputFingerprint === context.inputFingerprint) {
        const existing = context.plans.find((plan) => (
          plan.recipe.id === transactionWinner.recipeId && plan.tea.id === transactionWinner.teaId
        ));
        if (existing) {
          result = presentPlan(existing, transactionWinner, context.members, context.confirmedTagsByMember, bootstrap.labels);
          return state;
        }
      }
      const excluded = rotate ? new Set(currentRelevant.map((entry) => `${entry.recipeId}:${entry.teaId}`)) : new Set();
      const selected = context.plans.find((plan) => !excluded.has(`${plan.recipe.id}:${plan.tea.id}`));
      if (!selected) error('NO_ALTERNATIVE', '本范围暂无更多安全候选', 409);
      const sequence = currentRelevant.reduce((maximum, entry) => Math.max(maximum, entry.sequence || 0), 0) + 1;
      const entry = {
        id: makeId('plan'), date, scopeKey: context.scopeKey, memberIds: context.members.map((member) => member.id),
        inputFingerprint: context.inputFingerprint, recipeId: selected.recipe.id, teaId: selected.tea.id,
        status: 'active', sequence, createdAt: clock().toISOString(),
      };
      state.recommendationHistory.entries = entries.map((item) => (
        item.date === date && item.scopeKey === context.scopeKey && item.status === 'active'
          ? { ...item, status: 'superseded' }
          : item
      ));
      state.recommendationHistory.entries.push(entry);
      result = presentPlan(selected, entry, context.members, context.confirmedTagsByMember, bootstrap.labels);
      return state;
    });
    return result;
  }

  return async function api(path, options = {}) {
    const method = methodOf(options);
    const url = new URL(path, 'http://mingyuan.invalid');
    const pathname = url.pathname;
    let match;

    if (pathname === '/api/health' && method === 'GET') return { status: 'ok', warnings: [] };
    if (pathname === '/api/taxonomy' && method === 'GET') {
      const bootstrap = await loadBootstrap();
      return { taxonomy: clone(bootstrap.taxonomy), labels: clone(bootstrap.labels) };
    }
    if (pathname === '/api/family' && method === 'GET') return { members: (await store.read()).family.members };
    if (pathname === '/api/family' && method === 'POST') {
      let member;
      await store.update((state) => {
        member = { ...bodyObject(options), id: makeId('member') };
        state.family.members.push(member);
        return state;
      });
      member = (await store.read()).family.members.find((entry) => entry.id === member.id);
      return { member };
    }
    if ((match = pathname.match(/^\/api\/family\/([^/]+)$/))) {
      const id = decodeURIComponent(match[1]);
      if (method === 'GET') {
        const member = (await store.read()).family.members.find((entry) => entry.id === id);
        if (!member) error('NOT_FOUND', '未找到家庭成员', 404);
        return { member };
      }
      if (method === 'PUT') {
        let member;
        await store.update((state) => {
          const index = state.family.members.findIndex((entry) => entry.id === id);
          if (index < 0) error('NOT_FOUND', '未找到家庭成员', 404);
          member = { ...state.family.members[index], ...bodyObject(options), id };
          state.family.members[index] = member;
          invalidateHistory(state, id);
          return state;
        });
        member = (await store.read()).family.members.find((entry) => entry.id === id);
        return { member };
      }
      if (method === 'DELETE') {
        await store.update((state) => {
          if (!state.family.members.some((entry) => entry.id === id)) error('NOT_FOUND', '未找到家庭成员', 404);
          if (state.family.members.length <= 1) error('LAST_MEMBER', '家庭档案至少保留一名成员', 409);
          state.family.members = state.family.members.filter((entry) => entry.id !== id);
          state.tongueRecords.records = state.tongueRecords.records.filter((entry) => entry.memberId !== id);
          state.recommendationHistory.entries = state.recommendationHistory.entries.filter((entry) => !entry.memberIds.includes(id));
          return state;
        });
        return null;
      }
    }
    if (pathname === '/api/library' && method === 'GET') {
      const state = await store.read();
      const type = url.searchParams.get('type') || 'all';
      const query = (url.searchParams.get('q') || '').toLowerCase();
      const tag = url.searchParams.get('tag') || '';
      let items = [];
      if (type === 'all' || type === 'recipe') items.push(...state.recipes.items);
      if (type === 'all' || type === 'tea') items.push(...state.teas.items);
      items = items.filter((item) => (!query || item.name.toLowerCase().includes(query)) && (!tag || item.needTags.includes(tag)));
      return { items };
    }
    if ((match = pathname.match(/^\/api\/library\/(recipe|tea)\/([^/]+)$/)) && method === 'GET') {
      const state = await store.read();
      const items = match[1] === 'recipe' ? state.recipes.items : state.teas.items;
      const item = items.find((entry) => entry.id === decodeURIComponent(match[2]));
      if (!item) error('NOT_FOUND', '未找到库条目', 404);
      return { item };
    }
    if (pathname === '/api/recommendations' && method === 'GET') {
      return recommend(url.searchParams.get('date'), url.searchParams.get('scope') || 'all', false);
    }
    if (pathname === '/api/recommendations/rotate' && method === 'POST') {
      const body = bodyObject(options);
      return recommend(body.date, body.scope || 'all', true);
    }
    if (pathname === '/api/recommendation-history' && method === 'GET') {
      const state = await store.read();
      const scope = url.searchParams.get('scope') || 'all';
      const members = scopeMembers(scope, state.family.members);
      const scopeKey = scope === 'all' ? `all:${members.map((member) => member.id).sort().join(',')}` : scope;
      const date = url.searchParams.get('date');
      return { entries: state.recommendationHistory.entries.filter((entry) => (!date || entry.date === date) && entry.scopeKey === scopeKey) };
    }
    if (pathname === '/api/tongue-records' && method === 'GET') {
      const memberId = url.searchParams.get('memberId');
      const records = (await store.read()).tongueRecords.records
        .filter((record) => !memberId || record.memberId === memberId)
        .sort((left, right) => String(right.observedAt).localeCompare(String(left.observedAt)));
      return { records };
    }
    if (pathname === '/api/tongue-records' && method === 'POST') {
      const body = bodyObject(options);
      const input = tongueInput(body);
      const photoPath = await fileDataUrl(formValue(body, 'photo'));
      let record;
      await store.update((state) => {
        if (!state.family.members.some((member) => member.id === input.memberId)) error('NOT_FOUND', '未找到家庭成员', 404);
        const now = clock().toISOString();
        record = {
          ...input, id: makeId('tongue'), photoPath, status: 'draft', confirmedAt: null,
          createdAt: now, updatedAt: now,
        };
        state.tongueRecords.records.push(record);
        return state;
      });
      record = (await store.read()).tongueRecords.records.find((entry) => entry.id === record.id);
      return { record };
    }
    if ((match = pathname.match(/^\/api\/tongue-records\/([^/]+)\/(confirm|archive|restore)$/)) && method === 'POST') {
      const id = decodeURIComponent(match[1]);
      const action = match[2];
      let record;
      await store.update((state) => {
        const index = state.tongueRecords.records.findIndex((entry) => entry.id === id);
        if (index < 0) error('NOT_FOUND', '未找到舌象记录', 404);
        const current = state.tongueRecords.records[index];
        const now = clock().toISOString();
        if (action === 'confirm') {
          if (!String(current.doctorConclusion || '').trim() || !(current.confirmedTags || []).length) {
            error('VALIDATION_ERROR', '确认记录必须填写医生结论并选择确认标签');
          }
          record = { ...current, status: 'active', confirmedAt: now, updatedAt: now };
        } else if (action === 'archive') {
          record = { ...current, status: 'archived', updatedAt: now };
        } else {
          const canActivate = Boolean(String(current.doctorConclusion || '').trim() && (current.confirmedTags || []).length);
          record = { ...current, status: canActivate ? 'active' : 'draft', confirmedAt: canActivate ? now : null, updatedAt: now };
        }
        state.tongueRecords.records[index] = record;
        invalidateHistory(state, current.memberId);
        return state;
      });
      record = (await store.read()).tongueRecords.records.find((entry) => entry.id === id);
      return { record };
    }
    if ((match = pathname.match(/^\/api\/tongue-records\/([^/]+)$/))) {
      const id = decodeURIComponent(match[1]);
      if (method === 'GET') {
        const record = (await store.read()).tongueRecords.records.find((entry) => entry.id === id);
        if (!record) error('NOT_FOUND', '未找到舌象记录', 404);
        return { record };
      }
      if (method === 'PATCH') {
        const body = bodyObject(options);
        const patch = tongueInput(body, { partial: true });
        if (Object.prototype.hasOwnProperty.call(body, 'status') || formValue(body, 'status') != null) {
          error('VALIDATION_ERROR', '请使用状态操作按钮');
        }
        const photoPath = await fileDataUrl(formValue(body, 'photo'));
        let record;
        await store.update((state) => {
          const index = state.tongueRecords.records.findIndex((entry) => entry.id === id);
          if (index < 0) error('NOT_FOUND', '未找到舌象记录', 404);
          const current = state.tongueRecords.records[index];
          record = { ...current, ...patch, id, memberId: current.memberId, photoPath: photoPath || current.photoPath, updatedAt: clock().toISOString() };
          if (record.status === 'active' && (!String(record.doctorConclusion || '').trim() || !(record.confirmedTags || []).length)) {
            record.status = 'draft';
            record.confirmedAt = null;
          }
          state.tongueRecords.records[index] = record;
          invalidateHistory(state, current.memberId);
          return state;
        });
        record = (await store.read()).tongueRecords.records.find((entry) => entry.id === id);
        return { record };
      }
      if (method === 'DELETE') {
        await store.update((state) => {
          const record = state.tongueRecords.records.find((entry) => entry.id === id);
          if (!record) error('NOT_FOUND', '未找到舌象记录', 404);
          state.tongueRecords.records = state.tongueRecords.records.filter((entry) => entry.id !== id);
          invalidateHistory(state, record.memberId);
          return state;
        });
        return null;
      }
    }
    if (pathname === '/api/data/export' && method === 'GET') {
      const state = await store.read();
      return { filename: `mingyuan-backup-${clock().toISOString().slice(0, 10)}.json`, data: state };
    }
    if (pathname === '/api/data/import' && method === 'POST') {
      await store.replaceImported(bodyObject(options));
      return { imported: true };
    }
    error('NOT_FOUND', '未找到请求的资源', 404);
  };
}

export const api = createStaticApi({
  store: browserStore,
  loadBootstrap: loadBrowserBootstrap,
});
