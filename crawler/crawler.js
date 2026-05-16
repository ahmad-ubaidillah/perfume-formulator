const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const BASE_URL = 'https://www.perfumersworld.com';
const LISTING_URL = `${BASE_URL}/perfume-supplies.php`;
const CONCURRENCY = 5;
const DELAY_MS = 200;
const MAX_RETRIES = 3;
const CACHE_TTL_HOURS = 24;

const NON_MATERIAL_SKU_PREFIXES = new Set([
  'BOT', 'FCO', 'CLK', 'LAB', 'MIN', 'FTE', 'WKB', 'TPW',
  'BOD', 'HAI', 'HAN', 'SHA', 'SHW', 'SOA', 'STR', 'MIX',
]);

function isRawMaterial(product) {
  const sku = (product.sku || '').trim();
  if (sku) {
    const prefix = sku.substring(0, 3).toUpperCase();
    if (NON_MATERIAL_SKU_PREFIXES.has(prefix)) return false;
  }

  const name = (product.raw_material || '').toLowerCase();
  const nonMaterialPatterns = [
    'glass bottles', 'amber glass bottles',
    'foundation course', 'online course',
    'colour kit', 'color kit',
    'lab essentials', 'starter set', 'explorer set', 'compact set', 'full-display set',
    'creation system',
    'digital scale', 'mini scale',
    'workbook', 'perfumer\'s wizard',
    'base - unscented', 'base (unscented)',
    'smelling strips', 'mixing pots',
  ];
  for (const pattern of nonMaterialPatterns) {
    if (name.includes(pattern)) return false;
  }

  return true;
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'raw_materials.json');
const CACHE_FILE = path.join(DATA_DIR, 'sync_cache.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

const forceSync = process.argv.includes('--force');

async function fetchHTML(url, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml'
        },
        signal: AbortSignal.timeout(30000)
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.text();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.log(`  Retry ${i + 1} for ${url}: ${err.message}`);
      await sleep(2000 * (i + 1));
    }
  }
}

async function loadCache() {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveCache(cache) {
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

function contentHash(product) {
  const key = `${product.raw_material || ''}|${product.description || ''}|${product.price || ''}`;
  return crypto.createHash('md5').update(key).digest('hex');
}

function isCacheValid(cache, proId) {
  if (forceSync || !cache[proId]) return false;
  const entry = cache[proId];
  const age = Date.now() - new Date(entry.last_synced).getTime();
  return age < CACHE_TTL_HOURS * 3600 * 1000;
}

async function extractProductIDs() {
  console.log('Fetching listing page...');
  const html = await fetchHTML(LISTING_URL);
  const $ = cheerio.load(html);

  const ids = new Set();
  $('a[href*="view.php?pro_id="]').each((_, el) => {
    const href = $(el).attr('href');
    const match = href.match(/pro_id=([^&]+)/);
    if (match) ids.add(match[1]);
  });

  const idList = [...ids];
  console.log(`Found ${idList.length} unique products`);
  return idList;
}

async function scrapeProduct(proId) {
  const url = `${BASE_URL}/view.php?pro_id=${proId}`;
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);

  const product = { pro_id: proId };

  const skuEl = $('h5:contains("SKU")');
  if (skuEl.length) product.sku = skuEl.text().replace('SKU', '').trim();

  const nameEl = $('h1[itemprop="name"]');
  if (nameEl.length) product.raw_material = nameEl.text().trim();

  const descEl = $('p[itemprop="description"]');
  if (descEl.length) product.description = descEl.text().trim();

  const priceEl = $('h5 strong').first();
  if (priceEl.length) product.price = priceEl.text().trim();

  const imgEl = $('img[itemprop="image"]');
  if (imgEl.length) {
    const imgSrc = imgEl.attr('src');
    if (imgSrc) product.image_url = imgSrc.startsWith('http') ? imgSrc : `${BASE_URL}/${imgSrc}`;
  }

  const odourBox = $('.box-title').filter((_, el) => $(el).text().trim() === 'Odour').closest('.box');
  if (odourBox.length) {
    const paras = [];
    odourBox.find('p').each((_, el) => {
      const text = $(el).text().trim();
      if (text) paras.push(text);
    });
    product.odour_raw = paras.join(' | ');

    odourBox.find('p').each((_, el) => {
      const text = $(el).text().trim();
      const odourMatch = text.match(/Odour\s*=>\s*(.+)/i);
      if (odourMatch) product.odour = odourMatch[1].trim();
      if (text.startsWith('Synaesthesia=>')) product.synaesthesia = text.replace(/^Synaesthesia=>\s*/i, '').trim();
      if (text.startsWith('Perfume-Uses=>')) product.perfume_uses = text.replace(/^Perfume-Uses=>\s*/i, '').trim();
      if (text.startsWith('Occurs-in=>')) product.occurs_in = text.replace(/^Occurs-in=>\s*/i, '').trim();
      if (text.startsWith('Tips=>')) product.tips = text.replace(/^Tips=>\s*/i, '').trim();
      if (text.startsWith('Blends-well-with=>') || text.startsWith('Blends Well With=>')) product.blends_well_with = text.replace(/^Blends[- ]well[- ]with=>\s*/i, '').trim();
    });

    const htmlContent = odourBox.html() || '';
    const perfumeUsesMatch = htmlContent.match(/<b>Perfume-Uses=&gt;<\/b>\s*([^<]+)/i) || htmlContent.match(/<b>Perfume-Uses=<\/b>\s*([^<]+)/i);
    if (perfumeUsesMatch && !product.perfume_uses) product.perfume_uses = perfumeUsesMatch[1].trim();
    const occursMatch = htmlContent.match(/<b>Occurs-in=&gt;<\/b>\s*([^<]+)/i) || htmlContent.match(/<b>Occurs-in=<\/b>\s*([^<]+)/i);
    if (occursMatch && !product.occurs_in) product.occurs_in = occursMatch[1].trim();
    const blendsMatch = htmlContent.match(/<Blends-well-with=>\s*([^<]+)/i) || htmlContent.match(/<Blends-well-with=&gt;\s*([^<]+)/i);
    if (blendsMatch && !product.blends_well_with) product.blends_well_with = blendsMatch[1].trim();

    odourBox.find('a').each((_, el) => {
      const text = $(el).text().trim();
      const impactMatch = text.match(/Relative Odor Impact\s+([\d,.]+)/i);
      if (impactMatch) product.relative_odor_impact = impactMatch[1].trim();
      const lifeMatch = text.match(/Odor Life on a smelling strip\s+([\d.]+\s*hrs?)/i);
      if (lifeMatch) product.odour_lifetime = lifeMatch[1].trim();
    });
  }

  const synBox = $('.box-title').filter((_, el) => $(el).text().trim() === 'Synonyms').closest('.box');
  if (synBox.length) {
    const synText = synBox.find('p').first().text().trim();
    if (synText) product.synonyms = synText;
  }

  const descBox = $('.box-title').filter((_, el) => $(el).text().trim() === 'Description').closest('.box');
  if (descBox.length) {
    descBox.find('table tr').each((_, tr) => {
      const cells = $(tr).find('td');
      if (cells.length >= 2) {
        const key = $(cells[0]).text().trim();
        const val = $(cells[1]).text().trim();
        if (key === 'Physical State') product.physical_state = val;
        else if (key === 'Product') product.product_name = val;
        else if (key === 'Specific Gravity') product.specific_gravity = val;
        else if (key === 'Refractive Index') product.refractive_index = val;
        else if (key === 'Melting Point') product.melting_point = val;
        else if (key === 'Boiling Point') product.boiling_point = val;
        else if (key === 'Flash Point') product.flash_point = val;
        else if (key === 'Formula') product.formula = val;
        else if (key === 'Molecular Weight') product.molecular_weight = val;
        else product[`desc_${key}`] = val;
      }
    });
  }

  const regBox = $('.box-title').filter((_, el) => $(el).text().trim() === 'Regulatory').closest('.box');
  if (regBox.length) {
    regBox.find('table tr').each((_, tr) => {
      const cells = $(tr).find('td');
      if (cells.length >= 2) {
        const key = $(cells[0]).text().trim();
        const val = $(cells[1]).text().trim();
        if (key.includes('CAS')) product.cas = val;
        else if (key.includes('FEMA')) product.ifra = val;
        else if (key.includes('Safety')) product.safety_notes = val;
      }
    });
  }

  const appBox = $('.box-title').filter((_, el) => $(el).text().trim() === 'Perfumery Applications').closest('.box');
  if (appBox.length) {
    appBox.find('.description-percentage').each((_, el) => {
      const text = $(el).text().trim();
      const parent = $(el).closest('.description-block');
      const label = parent.find('.description-text').text().trim().toLowerCase();
      if (label.includes('from')) product.typical_usage_from = text;
      else if (label.includes('average') || label.includes('avg')) product.typical_usage_average = text;
      else if (label.includes('maximum') || label.includes('max')) product.typical_usage_maximum = text;
    });

    if (!product.typical_usage_from) {
      const text = appBox.text();
      const fromMatch = text.match(/from\s+([\d.]+%)/i);
      const avgMatch = text.match(/Average\s+([\d.]+%)/i);
      const maxMatch = text.match(/Maximum\s+([\d.]+%)/i);
      if (fromMatch) product.typical_usage_from = fromMatch[1];
      if (avgMatch) product.typical_usage_average = avgMatch[1];
      if (maxMatch) product.typical_usage_maximum = maxMatch[1];
    }
  }

  const suitBox = $('.box-title').filter((_, el) => $(el).text().trim() === 'Application Suitability').closest('.box');
  if (suitBox.length) {
    const apps = [];
    suitBox.find('.progress-group').each((_, el) => {
      const name = $(el).find('.progress-text').text().trim();
      const rating = $(el).find('.progress-number b').text().trim();
      if (name) apps.push({ name, rating: rating || '' });
    });
    if (apps.length > 0) product.application_suitability = apps.map(a => `${a.name}: ${a.rating}`).join('; ');
  }

  const htmlFull = $.html();
  const morrisMatch = htmlFull.match(/Morris\.Donut\(\{[\s\S]*?data:\s*\[([\s\S]*?)\]/);
  if (morrisMatch) {
    const dataBlock = morrisMatch[1];
    const entries = [];
    const entryRegex = /\{label:\s*"([^"]+)",\s*value:\s*([\d.]+)\s*\}/g;
    let m;
    while ((m = entryRegex.exec(dataBlock)) !== null) {
      entries.push({ label: m[1], value: parseFloat(m[2]) });
    }
    if (entries.length > 0) {
      product.abc_donut_data = entries;
      entries.sort((a, b) => b.value - a.value);
      product.abc_category = entries[0].label.toLowerCase().replace(/\s+/g, '-');
      product.abc_donut = `${BASE_URL}/images/syn/${product.abc_category}.jpg`;
    }
  }

  if (!product.abc_donut) {
    const donutMatch = htmlFull.match(/donut\s*=\s*'([^']+)'/);
    if (donutMatch) {
      let donutPath = donutMatch[1];
      if (donutPath.startsWith('images/')) donutPath = `${BASE_URL}/${donutPath}`;
      product.abc_donut = donutPath;
      const catMatch = donutPath.match(/images\/syn\/([^\/]+)\.jpg/);
      if (catMatch) product.abc_category = catMatch[1];
    }
  }

  product.source_url = url;
  return product;
}

async function scrapeAllProducts(ids, cache) {
  const results = {};
  const total = ids.length;
  let completed = 0;
  let batchCounter = 0;
  const totalBatches = Math.ceil(total / CONCURRENCY);

  const queue = [...ids];
  const inFlight = new Map();

  async function processNext() {
    if (queue.length === 0) return;
    const proId = queue.shift();

    if (isCacheValid(cache, proId)) {
      results[proId] = { product: cache[proId].data, cached: true };
      completed++;
      const name = cache[proId].data.raw_material || proId;
      console.log(`  OK: ${name} [cached]`);
      processNext();
      return;
    }

    try {
      const product = await scrapeProduct(proId);
      results[proId] = { product, cached: false };
      completed++;
      console.log(`  OK: ${product.raw_material || proId}`);
    } catch (err) {
      results[proId] = { error: err.message, cached: false };
      completed++;
      console.log(`  FAIL: ${proId} - ${err.message}`);
    }

    if (queue.length > 0) {
      setTimeout(processNext, DELAY_MS);
    }
  }

  for (let i = 0; i < Math.min(CONCURRENCY, total); i++) {
    processNext();
  }

  const logInterval = setInterval(() => {
    batchCounter++;
    console.log(`Batch ${Math.min(batchCounter, totalBatches)}/${totalBatches}`);
    if (completed >= total) clearInterval(logInterval);
  }, 5000);

  while (completed < total) {
    await sleep(200);
  }

  clearInterval(logInterval);

  const products = [];
  const newCache = { ...cache };
  let skipped = 0;

  for (const proId of ids) {
    const entry = results[proId];
    if (entry && entry.product) {
      if (!isRawMaterial(entry.product)) {
        skipped++;
        continue;
      }
      products.push(entry.product);
      newCache[proId] = {
        last_synced: new Date().toISOString(),
        content_hash: contentHash(entry.product),
        data: entry.product
      };
    }
  }

  if (skipped > 0) {
    console.log(`\nFiltered ${skipped} non-raw-material products (bottles, kits, courses, bases, etc.)`);
  }

  return { products, newCache };
}

async function main() {
  console.log('=== Perfume Formulator Crawler ===');
  console.log('');

  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    const ids = await extractProductIDs();
    if (ids.length === 0) throw new Error('No products found on listing page');

    const cache = forceSync ? {} : await loadCache();
    if (forceSync) {
      console.log('\nForce sync — ignoring cache');
    } else {
      const cachedCount = ids.filter(id => isCacheValid(cache, id)).length;
      console.log(`\nCache: ${cachedCount}/${ids.length} products up to date (${CACHE_TTL_HOURS}h TTL)`);
    }

    console.log('\nScraping product details...');
    const { products, newCache } = await scrapeAllProducts(ids, cache);

    console.log(`\nSaving ${products.length} products...`);
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(products, null, 2), 'utf8');
    await saveCache(newCache);
    console.log(`Data saved to ${OUTPUT_FILE}`);
    console.log(`Cache saved to ${CACHE_FILE}`);
    console.log('Done!');

  } catch (err) {
    console.error('Crawler failed:', err.message);
    process.exit(1);
  }
}

main();
