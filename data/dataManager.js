const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const RAW_MATERIALS_FILE = path.join(DATA_DIR, 'raw_materials.json');
const ENRICHED_FILE = path.join(DATA_DIR, 'raw_materials_enriched.json');

async function loadRawMaterials() {
  try {
    await fs.access(ENRICHED_FILE);
    const data = await fs.readFile(ENRICHED_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    try {
      await fs.access(RAW_MATERIALS_FILE);
      const data = await fs.readFile(RAW_MATERIALS_FILE, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }
}

async function saveRawMaterials(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(RAW_MATERIALS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = { loadRawMaterials, saveRawMaterials };
