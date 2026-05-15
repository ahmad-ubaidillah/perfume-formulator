const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const BASE_URL = 'https://www.perfumersworld.com';
const LISTING_URL = `${BASE_URL}/perfume-supplies.php`;
const BATCH_SIZE = 5; // concurrent requests
const DELAY_MS = 500; // ms between batches
const MAX_RETRIES = 3;

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'raw_materials.json');

// Sleep utility
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Fetch HTML with retries
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

// Step 1: Extract all product IDs from listing page
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

// Step 2: Scrape a single product page
async function scrapeProduct(proId) {
  const url = `${BASE_URL}/view.php?pro_id=${proId}`;
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);

  const product = { pro_id: proId };

  // SKU
  const skuEl = $('h5:contains("SKU")');
  if (skuEl.length) {
    product.sku = skuEl.text().replace('SKU', '').trim();
  }

  // Name
  const nameEl = $('h1[itemprop="name"]');
  if (nameEl.length) {
    product.raw_material = nameEl.text().trim();
  }

  // Description
  const descEl = $('p[itemprop="description"]');
  if (descEl.length) {
    product.description = descEl.text().trim();
  }

  // Price
  const priceEl = $('h5 strong').first();
  if (priceEl.length) {
    product.price = priceEl.text().trim();
  }

  // --- Sections ---

  // Odour
  const odourBox = $('.box-title').filter((_, el) => $(el).text().trim() === 'Odour').closest('.box');
  if (odourBox.length) {
    const paras = [];
    odourBox.find('p').each((_, el) => {
      const text = $(el).text().trim();
      if (text) paras.push(text);
    });
    product.odour_raw = paras.join(' | ');

    // Extract specific fields from odour
    odourBox.find('p').each((_, el) => {
      const text = $(el).text().trim();
      const odourMatch = text.match(/Odour\s*=>\s*(.+)/i);
      if (odourMatch) {
        product.odour = odourMatch[1].trim();
      }
      if (text.startsWith('Synaesthesia=>')) {
        product.synaesthesia = text.replace(/^Synaesthesia=>\s*/i, '').trim();
      }
      if (text.startsWith('Perfume-Uses=>')) {
        product.perfume_uses = text.replace(/^Perfume-Uses=>\s*/i, '').trim();
      }
      if (text.startsWith('Tips=>')) {
        product.tips = text.replace(/^Tips=>\s*/i, '').trim();
      }
    });

    // Relative Odor Impact and Odor Life
    odourBox.find('a').each((_, el) => {
      const text = $(el).text().trim();
      const impactMatch = text.match(/Relative Odor Impact\s+([\d,.]+)/i);
      if (impactMatch) product.relative_odor_impact = impactMatch[1].trim();
      const lifeMatch = text.match(/Odor Life on a smelling strip\s+([\d.]+\s*hrs?)/i);
      if (lifeMatch) product.odour_lifetime = lifeMatch[1].trim();
    });
  }

  // Synonyms
  const synBox = $('.box-title').filter((_, el) => $(el).text().trim() === 'Synonyms').closest('.box');
  if (synBox.length) {
    const synText = synBox.find('p').first().text().trim();
    if (synText) {
      product.synonyms = synText;
    }
  }

  // Description table (Physical State, etc.)
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

  // Regulatory (CAS, FEMA)
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

  // Perfumery Applications (Typical Usage)
  const appBox = $('.box-title').filter((_, el) => $(el).text().trim() === 'Perfumery Applications').closest('.box');
  if (appBox.length) {
    // Look for typical usage numbers in description-percentage spans
    appBox.find('.description-percentage').each((_, el) => {
      const text = $(el).text().trim();
      const parent = $(el).closest('.description-block');
      const label = parent.find('.description-text').text().trim().toLowerCase();
      if (label.includes('from')) product.typical_usage_from = text;
      else if (label.includes('average') || label.includes('avg')) product.typical_usage_average = text;
      else if (label.includes('maximum') || label.includes('max')) product.typical_usage_maximum = text;
    });

    // Fallback: parse from text
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

  // Application Suitability
  const suitBox = $('.box-title').filter((_, el) => $(el).text().trim() === 'Application Suitability').closest('.box');
  if (suitBox.length) {
    const apps = [];
    suitBox.find('.progress-group').each((_, el) => {
      const name = $(el).find('.progress-text').text().trim();
      const rating = $(el).find('.progress-number b').text().trim();
      if (name) {
        apps.push({ name, rating: rating || '' });
      }
    });
    if (apps.length > 0) {
      product.application_suitability = apps.map(a => `${a.name}: ${a.rating}`).join('; ');
    }
  }

  // ABC Donut - extract from script or image references
  const htmlFull = $.html();
  const donutMatch = htmlFull.match(/donut\s*=\s*'([^']+)'/);
  if (donutMatch) {
    let donutPath = donutMatch[1];
    // Make relative URL absolute
    if (donutPath.startsWith('images/')) {
      donutPath = `${BASE_URL}/${donutPath}`;
    }
    product.abc_donut = donutPath;
    // Extract category name from filename
    const catMatch = donutPath.match(/images\/syn\/([^\/]+)\.jpg/);
    if (catMatch) {
      product.abc_category = catMatch[1];
    }
  }

  // Source URL
  product.source_url = url;

  return product;
}

// Step 3: Scrape all products in batches
async function scrapeAllProducts(ids) {
  const products = [];
  const total = ids.length;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(total / BATCH_SIZE);

    console.log(`Batch ${batchNum}/${totalBatches} (products ${i + 1}-${Math.min(i + BATCH_SIZE, total)})`);

    const results = await Promise.allSettled(
      batch.map(id => scrapeProduct(id).then(p => ({ ...p, _status: 'ok' })))
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value._status === 'ok') {
        const p = result.value;
        delete p._status;
        products.push(p);
        console.log(`  OK: ${p.raw_material || p.sku || p.pro_id}`);
      } else {
        const proId = batch[results.indexOf(result)];
        console.log(`  FAIL: ${proId} - ${result.reason?.message || 'unknown error'}`);
      }
    }

    // Rate limiting delay between batches
    if (i + BATCH_SIZE < total) {
      await sleep(DELAY_MS);
    }
  }

  return products;
}

// Main
async function main() {
  console.log('=== PerfumersWorld Raw Material Crawler ===');
  console.log('');

  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    // Step 1: Get all product IDs
    const ids = await extractProductIDs();
    if (ids.length === 0) {
      throw new Error('No products found on listing page');
    }

    // Step 2: Scrape all products
    console.log('\nScraping product details...');
    const products = await scrapeAllProducts(ids);

    // Step 3: Save data
    console.log(`\nSaving ${products.length} products...`);
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(products, null, 2), 'utf8');
    console.log(`Data saved to ${OUTPUT_FILE}`);
    console.log('Done!');

  } catch (err) {
    console.error('Crawler failed:', err.message);
    process.exit(1);
  }
}

main();
