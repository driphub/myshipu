const crypto = require('crypto');
const { rankPlanPairs, memberSafetyFlags } = require('../domain/recommendation-engine');
const { LABELS, CONFIRMED_TAG_TO_NEED } = require('../domain/taxonomy');
const { ServiceError } = require('./errors');

function randomId() {
  return `plan-${crypto.randomBytes(8).toString('hex')}`;
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

class RecommendationService {
  constructor({ repository, idGenerator, clock } = {}) {
    this.repository = repository;
    this.idGenerator = idGenerator || randomId;
    this.clock = clock || (() => new Date().toISOString());
  }

  async get({ date, scope = 'all' }) {
    return this._resolve({ date, scope, rotate: false });
  }

  async rotate({ date, scope = 'all' }) {
    return this._resolve({ date, scope, rotate: true });
  }

  async history({ date, scope = 'all' }) {
    const members = await this._scopeMembers(scope, (await this.repository.read('family')).members);
    const scopeKey = this._scopeKey(scope, members);
    const entries = (await this.repository.read('recommendation-history')).entries;
    return entries.filter((entry) => (!date || entry.date === date) && entry.scopeKey === scopeKey);
  }

  async _resolve({ date, scope, rotate }) {
    const storeNames = ['family', 'recipes', 'teas', 'tongue-records', 'recommendation-history'];
    return this.repository.transaction(storeNames, async (stores) => {
      const family = stores.family;
      const recipes = stores.recipes;
      const teas = stores.teas;
      const tongue = stores['tongue-records'];
      const history = stores['recommendation-history'];
      const members = await this._scopeMembers(scope, family.members);
      const scopeKey = this._scopeKey(scope, members);
      const activeRecords = this._activeTongueRecords(members, tongue.records);
      const confirmedTagsByMember = Object.fromEntries(activeRecords.map((record) => [record.memberId, record.confirmedTags]));
      const inputFingerprint = stableHash({
        members,
        records: activeRecords.map((record) => ({ id: record.id, memberId: record.memberId, confirmedAt: record.confirmedAt, confirmedTags: record.confirmedTags })),
        recipeVersion: recipes.version,
        teaVersion: teas.version,
      });
      const plans = rankPlanPairs({ members, recipes: recipes.items, teas: teas.items, date, confirmedTagsByMember });
      const relevant = history.entries.filter((entry) => entry.date === date && entry.scopeKey === scopeKey);
      const active = relevant.find((entry) => entry.status === 'active');

      if (!rotate && active && active.inputFingerprint === inputFingerprint) {
        const existing = plans.find((plan) => plan.recipe.id === active.recipeId && plan.tea.id === active.teaId);
        if (existing) return { result: this._present(existing, active, members, confirmedTagsByMember) };
      }

      const excluded = rotate ? new Set(relevant.map((entry) => `${entry.recipeId}:${entry.teaId}`)) : new Set();
      const selected = plans.find((plan) => !excluded.has(`${plan.recipe.id}:${plan.tea.id}`));
      if (!selected) throw new ServiceError('NO_ALTERNATIVE', '本范围暂无更多安全候选', 409);
      const sequence = relevant.reduce((max, entry) => Math.max(max, entry.sequence || 0), 0) + 1;
      const entry = {
        id: this.idGenerator(), date, scopeKey, memberIds: members.map((member) => member.id), inputFingerprint,
        recipeId: selected.recipe.id, teaId: selected.tea.id, status: 'active', sequence, createdAt: this.clock(),
      };
      const entries = history.entries.map((item) => item.date === date && item.scopeKey === scopeKey && item.status === 'active'
        ? { ...item, status: 'superseded' }
        : item);
      entries.push(entry);
      return {
        changes: { 'recommendation-history': { ...history, entries } },
        result: this._present(selected, entry, members, confirmedTagsByMember),
      };
    });
  }

  async _scopeMembers(scope, allMembers) {
    if (scope === 'all') return allMembers;
    if (!String(scope).startsWith('member:')) throw new ServiceError('VALIDATION_ERROR', '推荐范围不合法', 400);
    const id = String(scope).slice('member:'.length);
    const found = allMembers.find((member) => member.id === id);
    if (!found) throw new ServiceError('NOT_FOUND', '未找到家庭成员', 404);
    return [found];
  }

  _scopeKey(scope, members) {
    return scope === 'all' ? `all:${members.map((member) => member.id).sort().join(',')}` : scope;
  }

  _activeTongueRecords(members, records) {
    return members.map((member) => records
      .filter((record) => record.memberId === member.id && record.status === 'active')
      .sort((a, b) => String(b.confirmedAt).localeCompare(String(a.confirmedAt)))[0])
      .filter(Boolean);
  }

  _present(plan, entry, members, confirmedTagsByMember = {}) {
    const memberNeeds = new Set(members.flatMap((member) => [
      ...member.needTags,
      ...(confirmedTagsByMember[member.id] || []).map((tag) => CONFIRMED_TAG_TO_NEED[tag]).filter(Boolean),
    ]));
    const matchedNeeds = [...new Set(plan.recipe.needTags.concat(plan.tea.needTags))]
      .filter((tag) => memberNeeds.has(tag));
    const warnings = [];
    for (const member of members) {
      for (const candidate of [plan.recipe, plan.tea]) {
        const flags = memberSafetyFlags(member).filter((flag) => candidate.cautionFlags.includes(flag));
        if (flags.length) warnings.push(`${member.name}：${candidate.name}含慎用提示，请结合专业意见`);
      }
    }
    return {
      historyId: entry.id,
      date: entry.date,
      scopeKey: entry.scopeKey,
      recipe: plan.recipe,
      tea: plan.tea,
      scores: plan.scores,
      season: plan.season,
      reasons: matchedNeeds.map((tag) => LABELS[tag] || tag),
      warnings,
      sequence: entry.sequence,
    };
  }
}

module.exports = { RecommendationService, stableHash };
