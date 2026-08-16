const TAXONOMY = Object.freeze({
  needTags: ['spleen-support', 'digestion-support', 'low-oil', 'low-salt', 'gentle-moistening', 'growth-support'],
  preferenceTags: ['mild', 'soft', 'soup', 'vegetarian'],
  confirmedTags: ['dampness-tendency', 'dryness-tendency', 'weak-digestion'],
  pregnancyStatuses: ['none', 'pregnant', 'postpartum'],
  chronicConditions: ['hypertension', 'diabetes', 'kidney-disease'],
  medications: ['anticoagulant', 'glucose-lowering', 'blood-pressure-lowering'],
  ingredients: [
    'peanut', 'shrimp', 'milk', 'chili', 'yam', 'lotus-seed', 'pork-rib', 'carrot',
    'ginger', 'millet', 'rice', 'pumpkin', 'lily-bulb', 'chicken', 'mushroom', 'tofu',
    'winter-melon', 'red-bean', 'coix-seed', 'corn', 'fish', 'pear', 'tremella',
    'black-sesame', 'walnut', 'jujube', 'goji', 'chenpi', 'poria', 'barley',
    'hawthorn', 'malt', 'chrysanthemum', 'cassia-seed', 'mint', 'honey', 'green-bean',
  ],
  tongue: {
    color: ['pale', 'pink', 'red', 'dark'],
    coating: ['white', 'yellow', 'none'],
    thickness: ['thin', 'thick'],
    moisture: ['dry', 'normal', 'wet'],
  },
  tongueStatuses: ['draft', 'active', 'archived'],
  seasons: ['spring', 'summer', 'autumn', 'winter', 'all'],
});

const LABELS = Object.freeze({
  'spleen-support': '健脾养胃',
  'digestion-support': '帮助消化',
  'low-oil': '少油',
  'low-salt': '少盐',
  'gentle-moistening': '温和润养',
  'growth-support': '成长营养',
  mild: '清淡',
  soft: '软烂',
  soup: '汤羹',
  vegetarian: '素食',
  'dampness-tendency': '湿重倾向（医生确认）',
  'dryness-tendency': '偏燥倾向（医生确认）',
  'weak-digestion': '消化偏弱（医生确认）',
});

const CONFIRMED_TAG_TO_NEED = Object.freeze({
  'dampness-tendency': 'spleen-support',
  'dryness-tendency': 'gentle-moistening',
  'weak-digestion': 'digestion-support',
});

module.exports = { TAXONOMY, LABELS, CONFIRMED_TAG_TO_NEED };
