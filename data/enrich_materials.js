const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..');
const RAW_FILE = path.join(DATA_DIR, 'data', 'raw_materials.json');
const ENRICHED_FILE = path.join(DATA_DIR, 'data', 'raw_materials_enriched.json');

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
  const enriched = { ...p };

  // 1.1a — Parse numeric fields
  enriched._odor_life_hours = parseOdourLife(p.odour_lifetime);
  enriched._usage_min = parseUsage(p.typical_usage_from);
  enriched._usage_avg = parseUsage(p.typical_usage_average);
  enriched._usage_max = parseUsage(p.typical_usage_maximum);
  enriched._ov = p.relative_odor_impact ? parseInt(String(p.relative_odor_impact).replace(/,/g, '')) : null;

  // 1.1b — evaporation_constant: k = ln(2) / half_life
  if (enriched._odor_life_hours && enriched._odor_life_hours > 0) {
    enriched.evaporation_constant = parseFloat((Math.log(2) / enriched._odor_life_hours).toFixed(6));
  } else {
    enriched.evaporation_constant = 0.1733; // default 4 hrs
  }

  // 1.1c — threshold_factor: T = 1000 / OV
  if (enriched._ov && enriched._ov > 0) {
    enriched.threshold_factor = parseFloat((1000 / enriched._ov).toFixed(4));
  } else {
    enriched.threshold_factor = 1.0;
  }

  // 1.1d — diffusion_factor
  const cat = (p.abc_category || '').toLowerCase();
  let diffusion = DIFFUSION_BY_CATEGORY[cat] || 1.0;
  const state = (p.physical_state || '').toLowerCase();
  if (state.includes('gas') || state.includes('volatile')) diffusion *= 1.2;
  else if (state.includes('solid') || state.includes('crystal') || state.includes('powder')) diffusion *= 0.8;
  enriched.diffusion_factor = parseFloat(diffusion.toFixed(2));

  // 1.1e — persistence_factor: P = min(1.0, odor_life / 100)
  if (enriched._odor_life_hours) {
    enriched.persistence_factor = parseFloat(Math.min(1.0, enriched._odor_life_hours / 100).toFixed(4));
  } else {
    enriched.persistence_factor = 0.04;
  }

  // 1.1f — structural_role
  let structuralRole;
  if (ALWAYS_TOP.has(cat)) {
    structuralRole = 'top';
  } else if (ALWAYS_BASE.has(cat)) {
    structuralRole = 'base';
  } else if (enriched._odor_life_hours !== null) {
    if (enriched._odor_life_hours < 2) structuralRole = 'top';
    else if (enriched._odor_life_hours <= 20) structuralRole = 'heart';
    else structuralRole = 'base';
  } else {
    structuralRole = 'heart';
  }
  enriched.structural_role = structuralRole;

  // 1.1g — functional_roles
  const roles = ['core'];
  if (cat === 'musk' || cat === 'amber' || cat === 'animalic') roles.push('fixative');
  if (cat === 'wood' || cat === 'balsamic') roles.push('fixative');
  if (cat === 'aliphatic' || cat === 'zolvent') roles.push('radiator');
  if (cat === 'linalool') roles.push('bridger');
  if ((cat === 'floral' || cat === 'fruity') && enriched._odor_life_hours >= 2 && enriched._odor_life_hours <= 8) {
    if (!roles.includes('bridger')) roles.push('bridger');
  }
  if (cat === 'citrus' || cat === 'green') roles.push('modifier');
  if (enriched._ov > 2000 && enriched._usage_max !== null && enriched._usage_max < 0.1) {
    if (!roles.includes('modifier')) roles.push('modifier');
  }
  enriched.functional_roles = [...new Set(roles)];

  // 1.1h — role_factor (highest among assigned roles)
  const roleFactors = { core: 1.0, bridger: 0.85, radiator: 1.2, fixative: 1.1, modifier: 0.75, blender: 0.9 };
  enriched.role_factor = Math.max(...enriched.functional_roles.map(r => roleFactors[r] || 1.0));

  // Clean up internal fields
  delete enriched._odor_life_hours;
  delete enriched._usage_min;
  delete enriched._usage_avg;
  delete enriched._usage_max;
  delete enriched._ov;

  return enriched;
}

async function main() {
  console.log('Loading raw materials...');
  const raw = JSON.parse(await fs.readFile(RAW_FILE, 'utf8'));
  const materials = raw.filter(isRawMaterial);
  console.log(`Found ${materials.length} raw materials`);

  console.log('Enriching materials...');
  const enriched = materials.map(enrichMaterial);

  // Stats
  const roleCounts = {};
  const funcRoleCounts = {};
  enriched.forEach(m => {
    roleCounts[m.structural_role] = (roleCounts[m.structural_role] || 0) + 1;
    m.functional_roles.forEach(r => {
      funcRoleCounts[r] = (funcRoleCounts[r] || 0) + 1;
    });
  });

  console.log('\nStructural role distribution:');
  Object.entries(roleCounts).sort((a, b) => b[1] - a[1]).forEach(([role, count]) => {
    console.log(`  ${role}: ${count} (${(count / enriched.length * 100).toFixed(1)}%)`);
  });

  console.log('\nFunctional role distribution:');
  Object.entries(funcRoleCounts).sort((a, b) => b[1] - a[1]).forEach(([role, count]) => {
    console.log(`  ${role}: ${count} (${(count / enriched.length * 100).toFixed(1)}%)`);
  });

  const withEvap = enriched.filter(m => m.evaporation_constant !== 0.1733).length;
  const withThresh = enriched.filter(m => m.threshold_factor !== 1.0).length;
  console.log(`\nDerived fields:`);
  console.log(`  evaporation_constant: ${withEvap}/${enriched.length} calculated from odor_life`);
  console.log(`  threshold_factor: ${withThresh}/${enriched.length} calculated from OV`);
  console.log(`  diffusion_factor: ${enriched.length}/${enriched.length} mapped from category+state`);
  console.log(`  persistence_factor: ${enriched.length}/${enriched.length} normalized`);

  await fs.writeFile(ENRICHED_FILE, JSON.stringify(enriched, null, 2), 'utf8');
  console.log(`\nSaved ${enriched.length} enriched materials to data/raw_materials_enriched.json`);
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
