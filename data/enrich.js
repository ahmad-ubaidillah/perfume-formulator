const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const RAW_FILE = path.join(DATA_DIR, 'raw_materials.json');

const NON_MATERIAL_SKU_PREFIXES = new Set([
  'BOT', 'FCO', 'CLK', 'LAB', 'MIN', 'FTE', 'WKB', 'TPW',
  'BOD', 'HAI', 'HAN', 'SHA', 'SHW', 'SOA', 'STR', 'MIX',
]);

function isRawMaterial(p) {
  const sku = (p.sku || '').trim();
  if (sku && NON_MATERIAL_SKU_PREFIXES.has(sku.substring(0, 3).toUpperCase())) return false;
  const name = (p.raw_material || '').toLowerCase();
  const patterns = [
    'glass bottles', 'amber glass bottles',
    'foundation course', 'online course',
    'colour kit', 'color kit',
    'lab essentials', 'starter set', 'explorer set', 'compact set', 'full-display set',
    'creation system', 'digital scale', 'mini scale',
    'workbook', 'perfumer\'s wizard',
    'base - unscented', 'base (unscented)',
    'smelling strips', 'mixing pots',
  ];
  return !patterns.some(pattern => name.includes(pattern));
}

function parseOdourLife(raw) {
  if (!raw) return null;
  const str = String(raw).trim().toLowerCase();
  const range = str.match(/([\d.]+)\s*[-–to]+\s*([\d.]+)\s*hrs?/);
  if (range) return (parseFloat(range[1]) + parseFloat(range[2])) / 2;
  const single = str.match(/([\d.]+)\s*hrs?/);
  if (single) return parseFloat(single[1]);
  return null;
}

function parseUsage(raw) {
  if (!raw) return null;
  const str = String(raw).trim();
  const match = str.match(/([\d.]+)\s*%?/);
  return match ? parseFloat(match[1]) : null;
}

const DIFFUSION_BY_CATEGORY = {
  'citrus': 1.3, 'aliphatic': 1.3, 'green': 1.2, 'konifer': 1.2,
  'floral': 1.0, 'fruity': 1.0, 'spice': 1.0, 'edible': 1.0,
  'narcotic': 0.9, 'iris': 0.9, 'orchid': 0.9, 'linalool': 1.0,
  'wood': 0.7, 'balsamic': 0.7, 'vanilla': 0.6, 'dairy': 0.8,
  'musk': 0.5, 'animalic': 0.5, 'amber': 0.5, 'yeast-mossy': 0.6,
  'zolvent': 1.4, 'data-pending': 1.0,
};

const ALWAYS_TOP = new Set(['citrus', 'aliphatic', 'green', 'konifer', 'zolvent']);
const ALWAYS_BASE = new Set(['musk', 'animalic', 'amber', 'wood', 'vanilla', 'balsamic', 'yeast-mossy']);

function enrichMaterial(p) {
  const e = { ...p };

  e._odor_life_hours = parseOdourLife(p.odour_lifetime);
  e.usage_min = parseUsage(p.typical_usage_from);
  e.usage_avg = parseUsage(p.typical_usage_average);
  e.usage_max = parseUsage(p.typical_usage_maximum);
  e.ov = p.relative_odor_impact ? parseInt(String(p.relative_odor_impact).replace(/,/g, '')) : null;

  e.evaporation_constant = e._odor_life_hours && e._odor_life_hours > 0
    ? parseFloat((Math.log(2) / e._odor_life_hours).toFixed(6))
    : 0.1733;

  e.threshold_factor = e.ov && e.ov > 0
    ? parseFloat((1000 / e.ov).toFixed(4))
    : 1.0;

  const cat = (p.abc_category || '').toLowerCase();
  let diffusion = DIFFUSION_BY_CATEGORY[cat] || 1.0;
  const state = (p.physical_state || '').toLowerCase();
  if (state.includes('gas') || state.includes('volatile')) diffusion *= 1.2;
  else if (state.includes('solid') || state.includes('crystal') || state.includes('powder')) diffusion *= 0.8;
  e.diffusion_factor = parseFloat(diffusion.toFixed(2));

  e.persistence_factor = e._odor_life_hours
    ? parseFloat(Math.min(1.0, e._odor_life_hours / 100).toFixed(4))
    : 0.04;

  let structuralRole;
  if (ALWAYS_TOP.has(cat)) structuralRole = 'top';
  else if (ALWAYS_BASE.has(cat)) structuralRole = 'base';
  else if (e._odor_life_hours !== null) {
    if (e._odor_life_hours < 2) structuralRole = 'top';
    else if (e._odor_life_hours <= 20) structuralRole = 'heart';
    else structuralRole = 'base';
  } else {
    structuralRole = 'heart';
  }
  e.structural_role = structuralRole;

  const roles = ['core'];
  if (cat === 'musk' || cat === 'amber' || cat === 'animalic') roles.push('fixative');
  if (cat === 'wood' || cat === 'balsamic') roles.push('fixative');
  if (cat === 'aliphatic' || cat === 'zolvent') roles.push('radiator');
  if (cat === 'linalool') roles.push('bridger');
  if ((cat === 'floral' || cat === 'fruity') && e._odor_life_hours >= 2 && e._odor_life_hours <= 8) {
    if (!roles.includes('bridger')) roles.push('bridger');
  }
  if (cat === 'citrus' || cat === 'green') roles.push('modifier');
  if (e.ov > 2000 && e.usage_max !== null && e.usage_max < 0.1) {
    if (!roles.includes('modifier')) roles.push('modifier');
  }
  e.functional_roles = [...new Set(roles)];

  const roleFactors = { core: 1.0, bridger: 0.85, radiator: 1.2, fixative: 1.1, modifier: 0.75, blender: 0.9 };
  e.role_factor = Math.max(...e.functional_roles.map(r => roleFactors[r] || 1.0));

  delete e._odor_life_hours;

  return e;
}

function enrichMaterials(materials) {
  return materials.filter(isRawMaterial).map(enrichMaterial);
}

if (require.main === module) {
  async function main() {
    console.log('Loading raw materials...');
    const raw = JSON.parse(await fs.readFile(RAW_FILE, 'utf8'));
    const enriched = enrichMaterials(raw);
    console.log(`Enriched ${enriched.length} materials`);

    const roleCounts = {};
    const funcRoleCounts = {};
    enriched.forEach(m => {
      roleCounts[m.structural_role] = (roleCounts[m.structural_role] || 0) + 1;
      m.functional_roles.forEach(r => { funcRoleCounts[r] = (funcRoleCounts[r] || 0) + 1; });
    });

    console.log('\nStructural role distribution:');
    Object.entries(roleCounts).sort((a, b) => b[1] - a[1]).forEach(([role, count]) => {
      console.log(`  ${role}: ${count} (${(count / enriched.length * 100).toFixed(1)}%)`);
    });

    console.log('\nFunctional role distribution:');
    Object.entries(funcRoleCounts).sort((a, b) => b[1] - a[1]).forEach(([role, count]) => {
      console.log(`  ${role}: ${count} (${(count / enriched.length * 100).toFixed(1)}%)`);
    });

    const enrichedPath = path.join(DATA_DIR, 'raw_materials_enriched.json');
    await fs.writeFile(enrichedPath, JSON.stringify(enriched, null, 2), 'utf8');
    console.log(`\nSaved to ${enrichedPath}`);
  }
  main().catch(err => { console.error('Failed:', err.message); process.exit(1); });
}

module.exports = { enrichMaterials, isRawMaterial };
