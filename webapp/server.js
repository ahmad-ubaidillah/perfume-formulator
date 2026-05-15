const express = require('express');
const path = require('path');
const { loadRawMaterials } = require('../data/dataManager');

const app = express();
const PORT = 5000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Load product data
let products = [];
async function loadProducts() {
  try {
    products = await loadRawMaterials();
    console.log(`Loaded ${products.length} products`);
  } catch (e) {
    console.error('Failed to load data:', e.message);
    process.exit(1);
  }
}

// Super search engine
function searchProducts(query, abcFilter) {
  let results = [...products];

  // Filter by ABC donut
  if (abcFilter) {
    results = results.filter(p =>
      (p.abc_donut || '').toLowerCase().includes(abcFilter.toLowerCase())
    );
  }

  // Search by multiple fields
  if (query) {
    const q = query.toLowerCase().trim();
    results = results.filter(p =>
      (p.raw_material || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.odour || '').toLowerCase().includes(q) ||
      (p.synonyms || '').toLowerCase().includes(q) ||
      (p.cas || '').toLowerCase().includes(q)
    );
  }

  return results;
}

// API routes
app.get('/api/products', async (req, res) => {
  const q = req.query.q || '';
  const abc = req.query.abc || '';
  const limit = parseInt(req.query.limit) || 100;
  const results = searchProducts(q, abc).slice(0, limit);
  res.json({ query: q, abc_filter: abc, count: results.length, total: products.length, products: results });
});

app.get('/api/detail/:sku', async (req, res) => {
  const p = products.find(x => x.sku?.toLowerCase() === req.params.sku.toLowerCase());
  if (!p) return res.status(404).json({ error: 'Not found' });

  // Parse apps
  const apps = [];
  if (p.application_suitability) {
    p.application_suitability.split('; ').forEach(item => {
      if (item.includes(':')) {
        const [name, r] = item.split(':');
        apps.push({ name: name.trim(), rating: r?.trim() || '' });
      } else {
        apps.push({ name: item.trim(), rating: '' });
      }
    });
  }

  // Parse synonyms
  const synonyms = p.synonyms ? p.synonyms.split(':').map(s => s.trim()).filter(Boolean) : [];

  // Related products
  const related = products.filter(x => x.abc_donut === p.abc_donut && x.sku !== p.sku).slice(0, 6);

  res.json({ ...p, apps, synonyms, related, totalProducts: products.length });
});

app.get('/api/categories', async (req, res) => {
  const tags = {};
  products.forEach(p => {
    if (p.abc_donut) {
      const key = (p.abc_donut.match(/syn\/([^\/]+)\.jpg/) || [])[1]
        || p.abc_donut.split('/').pop().replace('.jpg', '');
      tags[key] = (tags[key] || 0) + 1;
    }
  });
  res.json(Object.entries(tags).sort((a, b) => b[1] - a[1]));
});

// Serve static SPA files
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback - serve index.html for all non-API GET routes
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

// Load products on startup
loadProducts();