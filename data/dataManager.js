const fs = require('fs').promises;
const path = require('path');

// Data storage
const DATA_DIR = path.join(__dirname, '..', 'data');
const RAW_MATERIALS_FILE = path.join(DATA_DIR, 'raw_materials.json');

// Load raw materials data
async function loadRawMaterials() {
  try {
    await fs.access(RAW_MATERIALS_FILE);
    const data = await fs.readFile(RAW_MATERIALS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to load raw materials:', error.message);
    return [];
  }
}

// Save raw materials data
async function saveRawMaterials(data) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(RAW_MATERIALS_FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Data saved to ${RAW_MATERIALS_FILE}`);
  } catch (error) {
    console.error('Failed to save data:', error.message);
    throw error;
  }
}

module.exports = {
  loadRawMaterials,
  saveRawMaterials
};