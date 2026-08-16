function recipe(id, name, ingredients, needTags, preferenceTags, seasonTags, extra = {}) {
  const { image = 'yam-soup.jpg', ...overrides } = extra;
  return {
    id, name, type: 'recipe', ingredients, needTags, preferenceTags, seasonTags,
    hardContraindications: [], cautionFlags: [], duration: '35分钟', mealTime: '午餐或晚餐',
    benefits: needTags, steps: ['食材洗净并按标注切配', '加水或少量油烹制至熟', '少盐调味后温热食用'],
    image: `assets/images/${image}`, ...overrides,
  };
}

function tea(id, name, ingredients, needTags, seasonTags, extra = {}) {
  const { image = 'herbal-tea.jpg', ...overrides } = extra;
  return {
    id, name, type: 'tea', ingredients, needTags, preferenceTags: ['mild'], seasonTags,
    hardContraindications: [], cautionFlags: [], medicinalTea: true, amount: '每次300ml',
    timing: '餐后温饮', benefits: needTags, steps: ['材料冲洗后放入杯中', '沸水焖泡10分钟后温饮'],
    image: `assets/images/${image}`, ...overrides,
  };
}

function createSeedData() {
  const members = [
    { id: 'member-lin', name: '林女士', birthYear: 1988, ageGroup: 'adult', needTags: ['spleen-support', 'gentle-moistening'], preferenceTags: ['soup', 'mild'], allergies: [], avoidIngredients: ['chili'], pregnancyStatus: 'none', chronicConditions: [], medications: [], notes: '偏爱清淡汤羹' },
    { id: 'member-zhou', name: '周先生', birthYear: 1985, ageGroup: 'adult', needTags: ['low-oil', 'low-salt'], preferenceTags: ['mild'], allergies: ['peanut'], avoidIngredients: [], pregnancyStatus: 'none', chronicConditions: ['hypertension'], medications: ['blood-pressure-lowering'], notes: '日常注意少油少盐' },
    { id: 'member-an', name: '小安', birthYear: 2017, ageGroup: 'child', needTags: ['growth-support', 'digestion-support'], preferenceTags: ['soft', 'soup'], allergies: [], avoidIngredients: ['chili'], pregnancyStatus: 'none', chronicConditions: [], medications: [], notes: '儿童示例档案' },
  ];
  const recipes = [
    recipe('recipe-yam-lotus-soup', '山药莲子排骨汤', [{ id: 'yam', name: '山药', amount: '200g' }, { id: 'lotus-seed', name: '莲子', amount: '30g' }, { id: 'pork-rib', name: '排骨', amount: '300g' }], ['spleen-support', 'gentle-moistening'], ['soup', 'mild'], ['autumn', 'winter'], { image: 'yam-soup.jpg', duration: '45分钟' }),
    recipe('recipe-pumpkin-lily', '百合蒸南瓜', [{ id: 'pumpkin', name: '南瓜', amount: '300g' }, { id: 'lily-bulb', name: '百合', amount: '30g' }], ['gentle-moistening', 'digestion-support'], ['soft', 'vegetarian'], ['autumn'], { image: 'pumpkin-lily.jpg', duration: '25分钟' }),
    recipe('recipe-mushroom-tofu', '菌菇豆腐煲', [{ id: 'mushroom', name: '菌菇', amount: '150g' }, { id: 'tofu', name: '豆腐', amount: '250g' }], ['low-oil', 'growth-support'], ['soft', 'vegetarian'], ['all'], { image: 'lotus-chicken.jpg' }),
    recipe('recipe-winter-melon-barley', '冬瓜薏米瘦肉汤', [{ id: 'winter-melon', name: '冬瓜', amount: '300g' }, { id: 'coix-seed', name: '炒薏米', amount: '30g' }, { id: 'pork-rib', name: '瘦肉', amount: '180g' }], ['spleen-support', 'low-oil'], ['soup', 'mild'], ['summer'], { cautionFlags: ['pregnant'] }),
    recipe('recipe-millet-yam', '山药小米粥', [{ id: 'yam', name: '山药', amount: '120g' }, { id: 'millet', name: '小米', amount: '80g' }], ['spleen-support', 'digestion-support'], ['soft', 'mild'], ['all']),
    recipe('recipe-corn-carrot-chicken', '玉米胡萝卜鸡汤', [{ id: 'corn', name: '玉米', amount: '1根' }, { id: 'carrot', name: '胡萝卜', amount: '1根' }, { id: 'chicken', name: '鸡肉', amount: '300g' }], ['growth-support', 'gentle-moistening'], ['soup', 'mild'], ['all'], { image: 'lotus-chicken.jpg' }),
    recipe('recipe-tremella-pear', '银耳雪梨羹', [{ id: 'tremella', name: '银耳', amount: '15g' }, { id: 'pear', name: '雪梨', amount: '1个' }], ['gentle-moistening'], ['soft', 'vegetarian'], ['autumn']),
    recipe('recipe-red-bean-pumpkin', '赤小豆南瓜粥', [{ id: 'red-bean', name: '赤小豆', amount: '40g' }, { id: 'pumpkin', name: '南瓜', amount: '150g' }, { id: 'rice', name: '大米', amount: '60g' }], ['spleen-support', 'low-oil'], ['soft', 'vegetarian'], ['summer', 'autumn']),
    recipe('recipe-fish-tofu', '鲫鱼豆腐汤', [{ id: 'fish', name: '鲫鱼', amount: '1条' }, { id: 'tofu', name: '豆腐', amount: '200g' }, { id: 'ginger', name: '生姜', amount: '3片' }], ['growth-support', 'spleen-support'], ['soup'], ['all']),
    recipe('recipe-black-sesame-walnut', '黑芝麻核桃糊', [{ id: 'black-sesame', name: '黑芝麻', amount: '30g' }, { id: 'walnut', name: '核桃', amount: '20g' }, { id: 'rice', name: '糯米', amount: '30g' }], ['growth-support', 'gentle-moistening'], ['soft'], ['winter'], { hardContraindications: ['walnut'] }),
  ];
  const teas = [
    tea('tea-chenpi-poria', '陈皮茯苓饮', [{ id: 'chenpi', name: '陈皮', amount: '3g' }, { id: 'poria', name: '茯苓', amount: '8g' }], ['spleen-support'], ['all']),
    tea('tea-roasted-barley', '炒薏米陈皮水', [{ id: 'barley', name: '炒薏米', amount: '15g' }, { id: 'chenpi', name: '陈皮', amount: '3g' }], ['spleen-support'], ['summer'], { cautionFlags: ['pregnant'] }),
    tea('tea-hawthorn-malt', '山楂麦芽饮', [{ id: 'hawthorn', name: '山楂', amount: '5g' }, { id: 'malt', name: '炒麦芽', amount: '8g' }], ['digestion-support'], ['all'], { cautionFlags: ['pregnant'] }),
    tea('tea-jujube-goji', '红枣枸杞饮', [{ id: 'jujube', name: '红枣', amount: '3枚' }, { id: 'goji', name: '枸杞', amount: '8g' }], ['gentle-moistening'], ['winter'], { cautionFlags: ['diabetes'] }),
    tea('tea-chrysanthemum', '菊花枸杞饮', [{ id: 'chrysanthemum', name: '菊花', amount: '5朵' }, { id: 'goji', name: '枸杞', amount: '6g' }], ['gentle-moistening'], ['spring', 'summer']),
    tea('tea-mint-chenpi', '薄荷陈皮饮', [{ id: 'mint', name: '薄荷', amount: '3g' }, { id: 'chenpi', name: '陈皮', amount: '3g' }], ['digestion-support'], ['summer']),
    tea('tea-pear-honey', '雪梨蜂蜜饮', [{ id: 'pear', name: '雪梨', amount: '半个' }, { id: 'honey', name: '蜂蜜', amount: '5g' }], ['gentle-moistening'], ['autumn'], { medicinalTea: false, cautionFlags: ['diabetes'] }),
    tea('tea-jujube-ginger', '红枣姜饮', [{ id: 'jujube', name: '红枣', amount: '3枚' }, { id: 'ginger', name: '生姜', amount: '2片' }], ['spleen-support'], ['winter']),
  ];
  return {
    family: { version: 1, members },
    recipes: { version: 1, items: recipes },
    teas: { version: 1, items: teas },
    'tongue-records': { version: 1, records: [] },
    'recommendation-history': { version: 1, entries: [] },
  };
}

module.exports = { createSeedData };
