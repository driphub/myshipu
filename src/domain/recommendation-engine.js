const { CONFIRMED_TAG_TO_NEED } = require('./taxonomy');

class NoSafePlanError extends Error {
  constructor(missing) {
    super('当前范围没有足够的安全候选');
    this.name = 'NoSafePlanError';
    this.code = 'NO_SAFE_PLAN';
    this.status = 422;
    this.details = { missing };
  }
}

function getSeason(dateString) {
  const month = Number(String(dateString).slice(5, 7));
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

function memberSafetyFlags(member) {
  const flags = [member.ageGroup];
  if (member.pregnancyStatus && member.pregnancyStatus !== 'none') flags.push(member.pregnancyStatus);
  return [...new Set(flags.concat(member.chronicConditions || [], member.medications || []))];
}

function ingredientIds(item) {
  return (item.ingredients || []).map((ingredient) => ingredient.id);
}

function intersects(left, right) {
  const rightSet = new Set(right || []);
  return (left || []).some((value) => rightSet.has(value));
}

function isEligible(item, member) {
  const ingredients = ingredientIds(item);
  if (intersects(ingredients, member.allergies)) return false;
  if (intersects(ingredients, member.avoidIngredients)) return false;
  if (intersects(item.hardContraindications, memberSafetyFlags(member))) return false;
  if (member.ageGroup === 'child' && item.medicinalTea === true) return false;
  return true;
}

function mappedNeeds(confirmedTags) {
  return (confirmedTags || []).map((tag) => CONFIRMED_TAG_TO_NEED[tag]).filter(Boolean);
}

function scoreItemForMember(item, member, season, confirmedTags = []) {
  const needs = new Set([...(member.needTags || []), ...mappedNeeds(confirmedTags)]);
  const preferences = new Set(member.preferenceTags || []);
  const needMatches = (item.needTags || []).filter((tag) => needs.has(tag)).length;
  const preferenceMatches = (item.preferenceTags || []).filter((tag) => preferences.has(tag)).length;
  const seasonMatch = (item.seasonTags || []).includes(season) || (item.seasonTags || []).includes('all');
  const cautionMatches = (item.cautionFlags || []).filter((tag) => memberSafetyFlags(member).includes(tag)).length;
  const positive = 4 * needMatches + 2 * Number(seasonMatch) + preferenceMatches;
  return Math.max(0, Math.min(100, 60 + 5 * positive - 10 * cautionMatches));
}

function eligibleForAll(item, members) {
  return members.every((member) => isEligible(item, member));
}

function scoreForFamily(item, members, season, confirmedTagsByMember) {
  const scores = members.map((member) => scoreItemForMember(
    item,
    member,
    season,
    confirmedTagsByMember[member.id] || []
  ));
  return { minimum: Math.min(...scores), scores };
}

function rankPlanPairs({ members, recipes, teas, date, confirmedTagsByMember = {} }) {
  const safeRecipes = (recipes || []).filter((candidate) => eligibleForAll(candidate, members));
  const safeTeas = (teas || []).filter((candidate) => eligibleForAll(candidate, members));
  const missing = [];
  if (!safeRecipes.length) missing.push('recipe');
  if (!safeTeas.length) missing.push('tea');
  if (missing.length) throw new NoSafePlanError(missing);

  const season = getSeason(date);
  const recipeScores = new Map(safeRecipes.map((candidate) => [candidate.id, scoreForFamily(candidate, members, season, confirmedTagsByMember)]));
  const teaScores = new Map(safeTeas.map((candidate) => [candidate.id, scoreForFamily(candidate, members, season, confirmedTagsByMember)]));
  const plans = [];

  for (const recipe of safeRecipes) {
    for (const tea of safeTeas) {
      const recipeResult = recipeScores.get(recipe.id);
      const teaResult = teaScores.get(tea.id);
      const scores = {};
      members.forEach((member, index) => {
        scores[member.id] = {
          recipe: recipeResult.scores[index],
          tea: teaResult.scores[index],
          overall: Math.min(recipeResult.scores[index], teaResult.scores[index]),
        };
      });
      plans.push({
        recipe,
        tea,
        recipeScore: recipeResult.minimum,
        teaScore: teaResult.minimum,
        totalScore: recipeResult.minimum + teaResult.minimum,
        scores,
        season,
      });
    }
  }

  return plans.sort((left, right) => (
    right.totalScore - left.totalScore
    || left.recipe.id.localeCompare(right.recipe.id)
    || left.tea.id.localeCompare(right.tea.id)
  ));
}

module.exports = {
  NoSafePlanError,
  getSeason,
  memberSafetyFlags,
  isEligible,
  scoreItemForMember,
  rankPlanPairs,
};
