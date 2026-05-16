const express = require('express');
const path = require('path');
const { loadRawMaterials } = require('../data/dataManager');
const rateLimit = require('express-rate-limit');
const { spawn } = require('child_process');
const fs = require('fs').promises;

const app = express();
const PORT = 5000;

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests from this IP, please try again later.' }
});

app.use(limiter);
app.use(express.json());

let products = [];
let searchIndex = { tokens: {} };
let syncState = { running: false, progress: 0, total: 0, current: '', message: '', log: [] };

const FIELD_WEIGHTS = {
  raw_material: 100,
  sku: 80,
  cas: 80,
  synonyms: 30,
  description: 10,
  odour: 5
};

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

function tokenize(text) {
  if (!text) return [];
  return text.toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 2);
}

function buildSearchIndex() {
  searchIndex = { tokens: {} };
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
      const tokens = tokenize(p[field]);
      for (const token of tokens) {
        if (!searchIndex.tokens[token]) searchIndex.tokens[token] = new Set();
        searchIndex.tokens[token].add(i);
      }
    }
  }
  const tokenCount = Object.keys(searchIndex.tokens).length;
  console.log(`Search index built: ${tokenCount} tokens, ${products.length} products`);
}

async function loadProducts() {
  try {
    const raw = await loadRawMaterials();
    const withName = raw.filter(p => p.raw_material && p.raw_material.trim() !== '');
    const emptyProducts = raw.filter(p => !p.raw_material || p.raw_material.trim() === '');
    products = withName.filter(isRawMaterial);
    const nonMaterials = withName.filter(p => !isRawMaterial(p));
    console.log(`Loaded ${products.length} raw materials (filtered ${emptyProducts.length} empty, ${nonMaterials.length} non-material)`);

    if (emptyProducts.length > 0) {
      const emptyPath = path.join(__dirname, '..', 'data', 'empty_products.json');
      await fs.writeFile(emptyPath, JSON.stringify(emptyProducts, null, 2), 'utf8');
      console.log(`Empty products list saved to data/empty_products.json`);
    }
    if (nonMaterials.length > 0) {
      const nonMatPath = path.join(__dirname, '..', 'data', 'non_material_products.json');
      await fs.writeFile(nonMatPath, JSON.stringify(nonMaterials.map(p => ({ pro_id: p.pro_id, sku: p.sku, name: p.raw_material })), null, 2), 'utf8');
      console.log(`Non-material products list saved to data/non_material_products.json`);
    }

    buildSearchIndex();
  } catch (e) {
    console.warn('No data file found — start with empty data. Click Sync to crawl.');
    products = [];
    searchIndex = { tokens: {} };
  }
}

function searchProducts(query, abcFilter, limit = 20, offset = 0) {
  let results = [...products];

  if (abcFilter) {
    results = results.filter(p =>
      (p.abc_donut || '').toLowerCase().includes(abcFilter.toLowerCase())
    );
  }

  if (query) {
    const q = query.toLowerCase().trim();
    const queryTokens = tokenize(q);

    let candidateIndices = null;
    for (const token of queryTokens) {
      if (searchIndex.tokens[token]) {
        if (!candidateIndices) {
          candidateIndices = new Set(searchIndex.tokens[token]);
        } else {
          for (const idx of searchIndex.tokens[token]) {
            candidateIndices.add(idx);
          }
        }
      }
    }

    let candidates;
    if (candidateIndices) {
      candidates = [...candidateIndices].map(i => products[i]);
    } else {
      candidates = results;
    }

    const scored = [];
    for (const p of candidates) {
      let score = 0;
      const name = (p.raw_material || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      const odour = (p.odour || '').toLowerCase();
      const syn = (p.synonyms || '').toLowerCase();
      const cas = (p.cas || '').toLowerCase();
      const sku = (p.sku || '').toLowerCase();

      if (name === q) score += 1000;
      else if (name.startsWith(q)) score += 500;
      else if (name.includes(q)) score += 100;

      if (sku === q) score += 800;
      else if (sku.includes(q)) score += 50;

      if (cas === q) score += 800;
      else if (cas.includes(q)) score += 50;

      if (syn.includes(q)) score += 30;
      if (desc.includes(q)) score += 10;
      if (odour.includes(q)) score += 5;

      if (score > 0) scored.push({ product: p, score });
    }

    scored.sort((a, b) => b.score - a.score);
    results = scored.map(s => s.product);
  }

  const paginatedResults = results.slice(offset, offset + limit);
  const total = results.length;

  return { results: paginatedResults, total, limit, offset };
}

app.get('/api/products', async (req, res) => {
  try {
    const q = req.query.q || '';
    const abc = req.query.abc || '';
    let limit = parseInt(req.query.limit) || 20;
    let offset = parseInt(req.query.offset) || 0;
    const page = parseInt(req.query.page) || 1;

    if (limit < 1) limit = 1;
    if (limit > 100) limit = 100;
    if (offset < 0) offset = 0;

    const { results, total, limit: actualLimit, offset: actualOffset } = searchProducts(q, abc, limit, offset);

    res.json({
      query: q,
      abc_filter: abc,
      count: results.length,
      total: total,
      limit: actualLimit,
      offset: actualOffset,
      page: page,
      pages: Math.ceil(total / limit),
      products: results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/detail/:sku', async (req, res) => {
  const param = req.params.sku.toLowerCase();
  const p = products.find(x =>
    (x.sku && x.sku.toLowerCase() === param) ||
    (x.pro_id && x.pro_id.toLowerCase() === param)
  );
  if (!p) return res.status(404).json({ error: 'Not found' });

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

  const synonyms = p.synonyms ? p.synonyms.split(':').map(s => s.trim()).filter(Boolean) : [];
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

app.get('/api/sync/status', async (req, res) => {
  res.json(syncState);
});

app.post('/api/sync/start', async (req, res) => {
  if (syncState.running) {
    return res.status(409).json({ error: 'Sync already in progress' });
  }

  syncState = { running: true, progress: 0, total: 0, current: '', message: 'Starting crawler...', log: [] };

  const crawlerPath = path.join(__dirname, '..', 'crawler', 'crawler.js');
  const crawler = spawn('node', [crawlerPath], { cwd: path.join(__dirname, '..') });

  crawler.stdout.on('data', (data) => {
    const line = data.toString().trim();
    syncState.log.push(line);

    const batchMatch = line.match(/Batch (\d+)\/(\d+)/);
    if (batchMatch) {
      syncState.total = parseInt(batchMatch[2]);
      syncState.progress = parseInt(batchMatch[1]);
      syncState.message = `Batch ${batchMatch[1]}/${batchMatch[2]}`;
    }

    const okMatch = line.match(/OK:\s+(.+)/);
    if (okMatch) {
      syncState.current = okMatch[1];
    }

    const doneMatch = line.match(/Saving (\d+) products/);
    if (doneMatch) {
      syncState.message = `Saving ${doneMatch[1]} products...`;
    }
  });

  crawler.stderr.on('data', (data) => {
    syncState.log.push('ERR: ' + data.toString().trim());
  });

  crawler.on('close', async (code) => {
    if (code === 0) {
      syncState.message = 'Sync complete! Reloading data...';
      syncState.progress = syncState.total || 100;
      await loadProducts();
      syncState.message = `Done! ${products.length} products loaded.`;
    } else {
      syncState.message = `Sync failed (exit code ${code})`;
    }
    syncState.running = false;
  });

  crawler.on('error', (err) => {
    syncState.message = `Sync error: ${err.message}`;
    syncState.running = false;
  });

  res.json({ message: 'Sync started' });
});

const clients = [];
app.get('/api/sync/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify(syncState)}\n\n`);

  const send = () => {
    res.write(`data: ${JSON.stringify(syncState)}\n\n`);
  };
  clients.push(send);

  req.on('close', () => {
    const idx = clients.indexOf(send);
    if (idx >= 0) clients.splice(idx, 1);
  });
});

function broadcastSync() {
  const data = `data: ${JSON.stringify(syncState)}\n\n`;
  clients.forEach(fn => {
    try { fn(); } catch (e) {}
  });
}

setInterval(broadcastSync, 1000);

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

loadProducts();
