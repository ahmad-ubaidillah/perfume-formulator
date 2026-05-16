const CONCEPT_MAP = {
  'rose': { families: { floral: 0.7, narcotic: 0.2, green: 0.1 }, keywords: ['rose', 'rosa', 'damask', 'bulgarian rose'] },
  'jasmine': { families: { floral: 0.7, narcotic: 0.2, animalic: 0.1 }, keywords: ['jasmine', 'jasmin', 'sambac'] },
  'citrus': { families: { citrus: 0.8, green: 0.2 }, keywords: ['citrus', 'lemon', 'lime', 'orange', 'bergamot', 'grapefruit', 'mandarin', 'tangerine'] },
  'fresh': { families: { green: 0.4, citrus: 0.3, aliphatic: 0.3 }, keywords: ['fresh', 'clean', 'crisp', 'bright'] },
  'woody': { families: { wood: 0.7, balsamic: 0.2, konifer: 0.1 }, keywords: ['woody', 'wood', 'cedar', 'sandalwood', 'vetiver', 'oud', 'agarwood'] },
  'floral': { families: { floral: 0.8, narcotic: 0.1, iris: 0.1 }, keywords: ['floral', 'flower', 'bouquet', 'petal', 'blooming', 'blossom'] },
  'musk': { families: { musk: 0.8, animalic: 0.2 }, keywords: ['musk', 'musky', 'skin'] },
  'amber': { families: { amber: 0.6, vanilla: 0.2, balsamic: 0.2 }, keywords: ['amber', 'warm', 'resinous'] },
  'vanilla': { families: { vanilla: 0.7, edible: 0.2, dairy: 0.1 }, keywords: ['vanilla', 'sweet', 'creamy'] },
  'green': { families: { green: 0.7, aliphatic: 0.2, konifer: 0.1 }, keywords: ['green', 'leaf', 'grass', 'stem', 'fresh-cut'] },
  'rain': { families: { green: 0.4, aliphatic: 0.3, 'yeast-mossy': 0.3 }, keywords: ['rain', 'petrichor', 'wet', 'after rain', 'earthy'] },
  'ocean': { families: { green: 0.3, aliphatic: 0.4, 'yeast-mossy': 0.3 }, keywords: ['ocean', 'sea', 'marine', 'aquatic', 'water'] },
  'spice': { families: { spice: 0.8, edible: 0.2 }, keywords: ['spice', 'spicy', 'cinnamon', 'clove', 'pepper', 'cardamom', 'nutmeg'] },
  'fruity': { families: { fruity: 0.8, edible: 0.2 }, keywords: ['fruity', 'fruit', 'apple', 'pear', 'peach', 'berry', 'mango', 'pineapple'] },
  'smoky': { families: { wood: 0.4, 'yeast-mossy': 0.3, spice: 0.3 }, keywords: ['smoky', 'smoke', 'burnt', 'charred', 'incense'] },
  'leather': { families: { animalic: 0.5, wood: 0.3, spice: 0.2 }, keywords: ['leather', 'suede', 'hide'] },
  'powdery': { families: { iris: 0.5, floral: 0.3, vanilla: 0.2 }, keywords: ['powdery', 'powder', 'soft', 'iris', 'violet'] },
  'oriental': { families: { amber: 0.4, vanilla: 0.3, spice: 0.3 }, keywords: ['oriental', 'exotic', 'opulent'] },
  'chypre': { families: { green: 0.3, wood: 0.3, floral: 0.2, 'yeast-mossy': 0.2 }, keywords: ['chypre', 'oakmoss', 'bergamot', 'patchouli'] },
  'fougere': { families: { green: 0.3, wood: 0.3, aliphatic: 0.2, spice: 0.2 }, keywords: ['fougere', 'fern', 'lavender', 'coumarin'] },
  'gourmand': { families: { edible: 0.6, vanilla: 0.3, dairy: 0.1 }, keywords: ['gourmand', 'edible', 'chocolate', 'coffee', 'caramel', 'honey'] },
  'earthy': { families: { 'yeast-mossy': 0.5, green: 0.3, wood: 0.2 }, keywords: ['earthy', 'soil', 'mushroom', 'truffle', 'root'] },
  'animalic': { families: { animalic: 0.7, musk: 0.3 }, keywords: ['animalic', 'civet', 'castoreum', 'ambergris', 'sweaty'] },
  'herbal': { families: { green: 0.5, spice: 0.3, aliphatic: 0.2 }, keywords: ['herbal', 'herb', 'sage', 'rosemary', 'thyme', 'basil', 'mint'] },
  'lavender': { families: { green: 0.4, spice: 0.3, floral: 0.3 }, keywords: ['lavender', 'lavandin'] },
  'patchouli': { families: { wood: 0.5, 'yeast-mossy': 0.3, earthy: 0.2 }, keywords: ['patchouli', 'earthy'] },
  'oud': { families: { wood: 0.7, animalic: 0.2, balsamic: 0.1 }, keywords: ['oud', 'agarwood', 'arabian'] },
  'white floral': { families: { narcotic: 0.6, floral: 0.4 }, keywords: ['white floral', 'tuberose', 'gardenia', 'ylang', 'frangipani'] },
  'clean': { families: { aliphatic: 0.4, green: 0.3, citrus: 0.3 }, keywords: ['clean', 'soapy', 'laundry', 'fresh'] },
  'dark': { families: { wood: 0.3, animalic: 0.3, amber: 0.2, spice: 0.2 }, keywords: ['dark', 'mysterious', 'deep', 'noir'] },
};

function interpretTheme(text) {
  const lower = text.toLowerCase().trim();
  const familyWeights = {};
  const concepts = [];

  for (const [conceptName, conceptData] of Object.entries(CONCEPT_MAP)) {
    for (const keyword of conceptData.keywords) {
      if (lower.includes(keyword)) {
        concepts.push(conceptName);
        for (const [family, weight] of Object.entries(conceptData.families)) {
          familyWeights[family] = (familyWeights[family] || 0) + weight;
        }
        break;
      }
    }
  }

  if (concepts.length === 0) {
    familyWeights.floral = 0.4;
    familyWeights.wood = 0.3;
    familyWeights.musk = 0.3;
    concepts.push('generic');
  }

  const total = Object.values(familyWeights).reduce((s, v) => s + v, 0);
  const normalized = {};
  for (const [family, weight] of Object.entries(familyWeights)) {
    normalized[family] = parseFloat((weight / total).toFixed(4));
  }

  const sorted = Object.entries(normalized).sort((a, b) => b[1] - a[1]);

  return {
    input: text,
    concepts: [...new Set(concepts)],
    family_distribution: Object.fromEntries(sorted),
    top_families: sorted.slice(0, 3).map(([f, w]) => ({ family: f, weight: w }))
  };
}

module.exports = { interpretTheme, CONCEPT_MAP };
