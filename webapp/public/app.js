let currentQuery = '';
let currentAbcFilter = '';
let currentPage = 1;
let currentLimit = 20;
let currentTotal = 0;
let currentPages = 0;
const PAGE_SIZE = 20;
const HISTORY_KEY = 'pw_search_history';
const MAX_HISTORY = 8;
const FORMULA_KEY = 'pw_formula';

const searchInput = document.getElementById('searchInput');
const abcFilter = document.getElementById('abcFilter');
const resetBtn = document.getElementById('resetBtn');
const statTotal = document.getElementById('statTotal');
const statCount = document.getElementById('statCount');
const mainContent = document.getElementById('mainContent');
const quickFilters = document.getElementById('quickFilters');
const detailModal = document.getElementById('detailModal');
const modalContent = document.getElementById('modalContent');
const searchHistoryEl = document.getElementById('searchHistory');
const formulaPanel = document.getElementById('formulaPanel');
const formulaList = document.getElementById('formulaList');
const formulaCount = document.getElementById('formulaCount');

let searchDebounce = null;

async function loadCategories() {
  try {
    const response = await fetch('/api/categories');
    const data = await response.json();
    if (!data) return;

    const select = document.getElementById('abcFilter');
    select.innerHTML = '<option value="">All ABC</option>';

    data.forEach(([name, count]) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name + ' (' + count + ')';
      select.appendChild(option);
    });

    quickFilters.innerHTML = '<span class="filter-label"><i class="fas fa-layer-group"></i> Quick ABC:</span>';

    data.forEach(([name, count]) => {
      const pill = document.createElement('a');
      pill.className = 'filter-pill';
      pill.href = '#';
      pill.dataset.abc = name;
      pill.innerHTML = name + ' <span class="count">(' + count + ')</span>';
      pill.onclick = function(e) {
        e.preventDefault();
        currentAbcFilter = (currentAbcFilter === name) ? '' : name;
        abcFilter.value = currentAbcFilter;
        loadProducts();
      };
      quickFilters.appendChild(pill);
    });
  } catch (error) {
    console.error('Failed to load categories:', error);
  }
}

async function loadProducts(page) {
  currentQuery = searchInput.value;
  currentAbcFilter = abcFilter.value;
  if (page !== undefined) currentPage = page;

  resetBtn.style.display = (currentQuery || currentAbcFilter) ? 'inline-flex' : 'none';

  mainContent.innerHTML = '<div class="loader"><div class="spinner"></div><p>Loading...</p></div>';

  const params = new URLSearchParams();
  if (currentQuery) params.set('q', currentQuery);
  if (currentAbcFilter) params.set('abc', currentAbcFilter);
  params.set('limit', String(currentLimit));
  params.set('offset', String((currentPage - 1) * currentLimit));
  params.set('page', String(currentPage));

  try {
    const response = await fetch('/api/products?' + params.toString());
    const data = await response.json();
    if (!data) {
      mainContent.innerHTML = '<div class="no-results"><h2>Error loading data</h2></div>';
      return;
    }

    statTotal.innerHTML = '<i class="fas fa-database"></i> ' + data.total;
    statCount.innerHTML = '<i class="fas fa-filter"></i> ' + data.count + ' shown';

    currentTotal = data.total;
    currentPages = data.pages || 1;

    document.querySelectorAll('.filter-pill').forEach(function(pill) {
      pill.classList.toggle('active', pill.dataset.abc === currentAbcFilter);
    });

    if (data.total === 0 && !currentQuery && !currentAbcFilter) {
      renderEmptyState();
      return;
    }

    renderProducts(data.products, data.count, data.total);
    renderPagination();
  } catch (error) {
    console.error('Failed to load products:', error);
    mainContent.innerHTML = '<div class="no-results"><h2>Error loading data</h2><p>Check server connection and try again.</p></div>';
  }
}

function renderEmptyState() {
  var main = document.getElementById('mainContent');
  main.innerHTML =
    '<div class="no-results">' +
      '<i class="fas fa-database fa-3x"></i>' +
      '<h2>No data yet</h2>' +
      '<p>Click the <strong>Sync</strong> button above to crawl all raw materials from PerfumersWorld.</p>' +
      '<p style="margin-top:8px;color:var(--text-muted)">This will take a few minutes depending on the number of products.</p>' +
    '</div>';
}

function renderProducts(products, count, total) {
  const main = document.getElementById('mainContent');
  const formula = getFormula();

  if (products.length === 0) {
    main.innerHTML =
      '<div class="no-results">' +
        '<i class="fas fa-search fa-3x"></i>' +
        '<h2>No results found</h2>' +
        '<p>Try different keywords or remove filters</p>' +
        '<div class="search-tips">' +
          '<strong>Search tips:</strong><br>' +
          '&bull; By name: <code>bergamot</code>, <code>rose</code><br>' +
          '&bull; By odour: <code>fresh</code>, <code>green</code>, <code>floral</code><br>' +
          '&bull; By CAS: <code>80-54-6</code><br>' +
          '&bull; By SKU: <code>3MA00273</code>' +
        '</div>' +
      '</div>';
    return;
  }

  let html = '<div class="product-grid">';

  products.forEach(function(p) {
    const name = esc(p.raw_material || 'Unknown');
    const sku = p.sku || p.pro_id || '';
    const price = p.price || '';
    const desc = (p.description || '').substring(0, 100);
    const imgUrl = p.image_url || '';
    const abc = p.abc_donut_data && p.abc_donut_data.length > 0
      ? [...p.abc_donut_data].sort((a, b) => b.value - a.value)[0].label
      : (p.abc_donut
        ? (p.abc_donut.match(/syn\/([^\/]+)\.jpg/) || [])[1] || p.abc_donut.split('/').pop().replace('.jpg', '')
        : '');
    const cas = p.cas || '';
    const inFormula = formula.some(function(f) { return f.sku === sku; });

    html +=
      '<div class="product-card">' +
        '<div class="card-image" onclick="openDetail(\'' + escAttr(sku) + '\')">' +
          (imgUrl ? '<img class="product-thumb" src="' + escAttr(imgUrl) + '" alt="' + escAttr(name) + '" onerror="this.style.display=\'none\'">' : '') +
          (abc ? '<span class="abc-badge-overlay">' + esc(abc) + '</span>' : '') +
          '<button class="view-btn" onclick="event.stopPropagation(); openDetail(\'' + escAttr(sku) + '\')" title="View details"><i class="fas fa-eye"></i></button>' +
        '</div>' +
        '<div class="card-body">' +
          '<div class="product-name" onclick="openDetail(\'' + escAttr(sku) + '\')">' + name + '</div>' +
          (desc ? '<div class="product-desc">' + esc(desc) + '</div>' : '') +
          '<div class="product-meta">' +
            (sku ? '<span>SKU: ' + sku + '</span>' : '') +
            (cas ? '<span class="cas">CAS: ' + esc(cas) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="card-footer">' +
          '<button class="add-formula-btn' + (inFormula ? ' added' : '') + '" onclick="toggleFormulaItem(\'' + escAttr(sku) + '\', \'' + escAttr(name) + '\', \'' + escAttr(imgUrl) + '\')">' +
            (inFormula ? '<i class="fas fa-check"></i> Added' : '<i class="fas fa-plus"></i> Add') +
          '</button>' +
          (price ? '<span class="price">' + esc(price) + '</span>' : '') +
        '</div>' +
      '</div>';
  });

  html += '</div>';
  main.innerHTML = html;
}

async function openDetail(sku) {
  const modal = document.getElementById('detailModal');
  const content = document.getElementById('modalContent');

  modal.classList.add('open');
  content.innerHTML = '<div class="loader"><div class="spinner"></div><p>Loading detail...</p></div>';

  try {
    const response = await fetch('/api/detail/' + encodeURIComponent(sku));
    const data = await response.json();
    if (!data) {
      content.innerHTML = '<p style="color:var(--red)">Failed to load product detail</p>';
      return;
    }

    const p = data;
    const imgUrl = p.image_url || '';
    const uFrom = p.typical_usage_from || '';
    const uAvg = p.typical_usage_average || '';
    const uMax = p.typical_usage_maximum || '';
    const formula = getFormula();
    const inFormula = formula.some(function(f) { return f.sku === (p.sku || p.pro_id); });

    let appsHtml = '';
    if (p.apps && p.apps.length > 0) {
      appsHtml = '<div class="app-grid">';
      p.apps.forEach(function(a) {
        const pct = a.rating ? Math.round((parseInt(a.rating) / 9) * 100) : 0;
        const cls = a.rating >= 7 ? 'app-high' : (a.rating >= 4 ? 'app-mid' : 'app-low');
        appsHtml +=
          '<div class="app-item" title="' + escAttr(a.name) + ': ' + escAttr(a.rating) + '">' +
            '<div class="app-bar-container"><div class="app-bar" style="width:' + pct + '%"></div></div>' +
            '<span class="app-name">' + esc(a.name) + '</span>' +
            '<span class="app-rating ' + cls + '">' + (a.rating || '-') + '</span>' +
          '</div>';
      });
      appsHtml += '</div>';
    }

    let synHtml = '';
    if (p.synonyms && p.synonyms.length > 0) {
      synHtml = '<div class="synonyms-list">';
      p.synonyms.forEach(function(s) {
        synHtml += '<span class="syn-tag">' + esc(s) + '</span>';
      });
      synHtml += '</div>';
    }

    let relHtml = '';
    if (p.related && p.related.length > 0) {
      relHtml = '<div class="related-list">';
      p.related.forEach(function(r) {
        relHtml +=
          '<div class="related-item" onclick="closeModal(); openDetail(\'' + escAttr(r.sku) + '\')">' +
            '<span class="rel-name">' + esc(r.raw_material) + '</span>' +
            '<span class="rel-sku">' + r.sku + '</span>' +
          '</div>';
      });
      relHtml += '</div>';
    }

    let factsHtml = '';
    if (p.physical_state) factsHtml += '<tr><td>Physical State</td><td>' + esc(p.physical_state) + '</td></tr>';
    if (p.specific_gravity) factsHtml += '<tr><td>Specific Gravity</td><td>' + esc(p.specific_gravity) + '</td></tr>';
    if (p.refractive_index) factsHtml += '<tr><td>Refractive Index</td><td>' + esc(p.refractive_index) + '</td></tr>';
    if (p.melting_point) factsHtml += '<tr><td>Melting Point</td><td>' + esc(p.melting_point) + '</td></tr>';
    if (p.boiling_point) factsHtml += '<tr><td>Boiling Point</td><td>' + esc(p.boiling_point) + '</td></tr>';
    if (p.flash_point) factsHtml += '<tr><td>Flash Point</td><td>' + esc(p.flash_point) + '</td></tr>';
    factsHtml += '<tr><td>Source</td><td><a href="' + escAttr(p.source_url || '') + '" target="_blank">PerfumersWorld</a></td></tr>';

    let abcDonutHtml = '';
    if (p.abc_donut_data && p.abc_donut_data.length > 0) {
      const sorted = [...p.abc_donut_data].sort((a, b) => b.value - a.value);
      let barsHtml = '';
      sorted.forEach(function(entry) {
        const pct = entry.value + '%';
        barsHtml +=
          '<div class="donut-bar-row">' +
            '<span class="donut-bar-label">' + esc(entry.label) + '</span>' +
            '<div class="donut-bar-track"><div class="donut-bar-fill" style="width:' + pct + '"></div></div>' +
            '<span class="donut-bar-value">' + pct + '</span>' +
          '</div>';
      });
      abcDonutHtml =
        '<div class="detail-card donut-card">' +
          '<h3><i class="fas fa-chart-pie"></i> ABC Donut</h3>' +
          '<div class="donut-bars">' + barsHtml + '</div>' +
        '</div>';
    } else if (p.abc_donut) {
      const name = (p.abc_donut.match(/syn\/([^\/]+)\.jpg/) || [])[1] || p.abc_donut.split('/').pop().replace('.jpg', '');
      abcDonutHtml =
        '<div class="detail-card donut-card">' +
          '<h3><i class="fas fa-chart-pie"></i> ABC Donut</h3>' +
          '<div class="donut-placeholder">' +
            '<img src="' + escAttr(p.abc_donut) + '" alt="ABC Donut" onerror="this.parentElement.innerHTML=\'<p style=color:var(--text-muted)>No donut data</p>\'" style="max-width:100%;border-radius:8px;">' +
          '</div>' +
        '</div>';
    }

    const detailSku = p.sku || p.pro_id || '';
    content.innerHTML =
      '<button class="close-btn" onclick="closeModal()" title="Close">&times;</button>' +
      '<div class="breadcrumb">' +
        '<a href="#" onclick="closeModal(); return false;"><i class="fas fa-home"></i> Home</a>' +
        '<i class="fas fa-chevron-right"></i>' +
        '<span>' + esc(p.raw_material) + '</span>' +
      '</div>' +
      '<div class="detail-grid">' +
        '<div class="detail-left">' +
          '<div class="detail-card" style="margin-bottom:12px">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">' +
              '<h1 class="detail-title">' + esc(p.raw_material) + '</h1>' +
              '<span class="sku-tag">' + detailSku + '</span>' +
            '</div>' +
            (imgUrl ? '<div class="detail-image"><img src="' + escAttr(imgUrl) + '" alt="' + escAttr(p.raw_material) + '" onerror="this.style.display=\'none\'"></div>' : '') +
            (p.description ? '<div class="section"><h3><i class="fas fa-align-left"></i> Description</h3><p class="description-text">' + esc(p.description) + '</p></div>' : '') +
            (p.odour ? '<div class="section"><h3><i class="fas fa-nose"></i> Odour</h3><p class="odour-text">' + esc(p.odour) + '</p></div>' : '') +
            (p.perfume_uses ? '<div class="section"><h3><i class="fas fa-spray-can"></i> Perfume Uses</h3><p class="odour-text">' + esc(p.perfume_uses) + '</p></div>' : '') +
            (p.occurs_in ? '<div class="section"><h3><i class="fas fa-leaf"></i> Occurs In</h3><p class="odour-text">' + esc(p.occurs_in) + '</p></div>' : '') +
            (p.blends_well_with ? '<div class="section"><h3><i class="fas fa-object-group"></i> Blends Well With</h3><p class="odour-text">' + esc(p.blends_well_with) + '</p></div>' : '') +
            '<div class="info-grid">' +
              (p.price ? '<div class="info-item"><span class="info-label"><i class="fas fa-tag"></i> Price</span><span class="info-value price">' + esc(p.price) + '</span></div>' : '') +
              (p.cas ? '<div class="info-item"><span class="info-label"><i class="fas fa-barcode"></i> CAS</span><span class="info-value cas">' + esc(p.cas) + '</span></div>' : '') +
              (p.ifra ? '<div class="info-item"><span class="info-label"><i class="fas fa-file-alt"></i> FEMA</span><span class="info-value">' + esc(p.ifra) + '</span></div>' : '') +
              (p.relative_odor_impact ? '<div class="info-item"><span class="info-label"><i class="fas fa-chart-bar"></i> Odor Impact</span><span class="info-value">' + esc(p.relative_odor_impact) + '</span></div>' : '') +
              (p.odour_lifetime ? '<div class="info-item"><span class="info-label"><i class="fas fa-clock"></i> Odour Lifetime</span><span class="info-value">' + esc(p.odour_lifetime) + '</span></div>' : '') +
            '</div>' +
            (uFrom || uAvg || uMax ?
              '<div class="section">' +
                '<h3><i class="fas fa-chart-line"></i> Typical Usage</h3>' +
                '<div class="usage-display">' +
                  (uFrom ? '<div class="usage-item"><span class="usage-label">From</span><span class="usage-val">' + uFrom + '</span></div>' : '') +
                  (uAvg ? '<div class="usage-item"><span class="usage-label">Average</span><span class="usage-val avg">' + uAvg + '</span></div>' : '') +
                  (uMax ? '<div class="usage-item"><span class="usage-label">Maximum</span><span class="usage-val max">' + uMax + '</span></div>' : '') +
                '</div>' +
              '</div>' : '') +
            '<div style="margin-top:12px">' +
              '<button class="add-formula-btn' + (inFormula ? ' added' : '') + '" onclick="toggleFormulaItem(\'' + escAttr(detailSku) + '\', \'' + escAttr(p.raw_material) + '\', \'' + escAttr(imgUrl) + '\'); openDetail(\'' + escAttr(detailSku) + '\');">' +
                (inFormula ? '<i class="fas fa-check"></i> In Formula' : '<i class="fas fa-plus"></i> Add to Formula') +
              '</button>' +
            '</div>' +
          '</div>' +
          (synHtml ? '<div class="detail-card"><h3><i class="fas fa-tags"></i> Synonyms</h3>' + synHtml + '</div>' : '') +
          (appsHtml ? '<div class="detail-card"><h3><i class="fas fa-check-circle"></i> Application Suitability</h3>' +
            '<p class="app-note">Rating: 9=Very Good, 8=Good, 7=Reasonable, 6=Fair, 5=Mediocre, 4=Slight, 3=Discoloration, 2=Stability, 1=Major, 0=Not recommended</p>' +
            appsHtml + '</div>' : '') +
        '</div>' +
        '<div class="detail-right">' +
          abcDonutHtml +
          (relHtml ? '<div class="detail-card"><h3><i class="fas fa-link"></i> Related (Same ABC)</h3>' + relHtml + '</div>' : '') +
          '<div class="detail-card">' +
            '<h3><i class="fas fa-info-circle"></i> Quick Facts</h3>' +
            (factsHtml ? '<table class="facts-table">' + factsHtml + '</table>' : '<p style="color:var(--text-muted)">No additional data</p>') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="back-link">' +
        '<button class="btn-back" onclick="closeModal()"><i class="fas fa-arrow-left"></i> Back (' + (data.count || p.totalProducts || 0) + ')</button>' +
      '</div>';
  } catch (error) {
    console.error('Failed to load detail:', error);
    content.innerHTML = '<p style="color:var(--red)">Failed to load product detail: ' + esc(error.message) + '</p>';
  }
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('detailModal')) return;
  document.getElementById('detailModal').classList.remove('open');
}

function doSearch() {
  var q = searchInput.value.trim();
  if (q) saveToHistory(q);
  hideSearchHistory();
  currentPage = 1;
  loadProducts();
}

function onAbcFilterChange() {
  searchInput.value = '';
  currentQuery = '';
  currentPage = 1;
  loadProducts();
}

function resetFilters() {
  searchInput.value = '';
  abcFilter.value = '';
  currentQuery = '';
  currentAbcFilter = '';
  currentPage = 1;
  loadProducts();
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}

function saveToHistory(query) {
  var history = getHistory().filter(function(h) { return h !== query; });
  history.unshift(query);
  if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function showSearchHistory() {
  var history = getHistory();
  if (history.length === 0) { hideSearchHistory(); return; }

  var html = '';
  history.forEach(function(h) {
    html += '<div class="history-item" onclick="pickHistory(\'' + escAttr(h) + '\')">' + esc(h) + '</div>';
  });
  html += '<div class="history-item history-clear" onclick="clearHistory()"><i class="fas fa-trash"></i> Clear history</div>';
  searchHistoryEl.innerHTML = html;
  searchHistoryEl.style.display = 'block';
}

function hideSearchHistory() { searchHistoryEl.style.display = 'none'; }

function pickHistory(query) {
  searchInput.value = query;
  hideSearchHistory();
  currentPage = 1;
  loadProducts();
}

function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
  hideSearchHistory();
}

function clearFilters() {
  resetFilters();
}

function goToPage(page) {
  if (page < 1 || page > currentPages) return;
  loadProducts(page);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderPagination() {
  let existing = document.getElementById('pagination');
  if (existing) existing.remove();

  if (currentPages <= 1) return;

  const container = document.createElement('div');
  container.id = 'pagination';
  container.className = 'pagination';

  let html = '';
  html += '<button class="page-btn" onclick="goToPage(' + (currentPage - 1) + ')"' + (currentPage <= 1 ? ' disabled' : '') + '><i class="fas fa-chevron-left"></i> Prev</button>';

  var startPage = Math.max(1, currentPage - 2);
  var endPage = Math.min(currentPages, currentPage + 2);

  if (startPage > 1) {
    html += '<button class="page-btn" onclick="goToPage(1)">1</button>';
    if (startPage > 2) html += '<span class="page-ellipsis">...</span>';
  }

  for (var i = startPage; i <= endPage; i++) {
    html += '<button class="page-btn' + (i === currentPage ? ' active' : '') + '" onclick="goToPage(' + i + ')">' + i + '</button>';
  }

  if (endPage < currentPages) {
    if (endPage < currentPages - 1) html += '<span class="page-ellipsis">...</span>';
    html += '<button class="page-btn" onclick="goToPage(' + currentPages + ')">' + currentPages + '</button>';
  }

  html += '<button class="page-btn" onclick="goToPage(' + (currentPage + 1) + ')"' + (currentPage >= currentPages ? ' disabled' : '') + '>Next <i class="fas fa-chevron-right"></i></button>';
  html += '<span class="page-info">Page ' + currentPage + ' of ' + currentPages + '</span>';

  container.innerHTML = html;
  mainContent.appendChild(container);
}

function getFormula() {
  try { return JSON.parse(localStorage.getItem(FORMULA_KEY)) || []; }
  catch { return []; }
}

function saveFormula(formula) {
  localStorage.setItem(FORMULA_KEY, JSON.stringify(formula));
  updateFormulaUI();
}

function toggleFormulaItem(sku, name, imgUrl) {
  var formula = getFormula();
  var idx = -1;
  for (var i = 0; i < formula.length; i++) {
    if (formula[i].sku === sku) { idx = i; break; }
  }
  if (idx >= 0) {
    formula.splice(idx, 1);
  } else {
    formula.push({ sku: sku, name: name, image: imgUrl, pct: 0 });
  }
  saveFormula(formula);
  loadProducts(currentPage);
}

function removeFromFormula(sku) {
  var formula = getFormula().filter(function(f) { return f.sku !== sku; });
  saveFormula(formula);
  loadProducts(currentPage);
}

function clearFormula() {
  if (confirm('Clear all items from formula?')) {
    saveFormula([]);
    loadProducts(currentPage);
  }
}

function updateFormulaPct(sku, val) {
  var formula = getFormula();
  for (var i = 0; i < formula.length; i++) {
    if (formula[i].sku === sku) {
      formula[i].pct = parseFloat(val) || 0;
      break;
    }
  }
  saveFormula(formula);
}

function getBatchSettings() {
  var bottleSize = parseFloat(document.getElementById('bottleSize').value) || 50;
  var conc = parseFloat(document.getElementById('concentrationType').value) || 0.10;
  return { bottleSize: bottleSize, conc: conc, oilVolume: bottleSize * conc, alcoholVolume: bottleSize * (1 - conc) };
}

function recalcFormula() {
  var settings = getBatchSettings();
  document.getElementById('oilVolume').textContent = settings.oilVolume.toFixed(1);
  document.getElementById('alcoholVolume').textContent = settings.alcoholVolume.toFixed(1);
  updateFormulaUI();
}

function exportFormula() {
  var formula = getFormula();
  if (formula.length === 0) return;
  var settings = getBatchSettings();
  var totalPct = formula.reduce(function(s, f) { return s + (f.pct || 0); }, 0);

  var text = 'Perfume Formula\n';
  text += '========================\n\n';
  text += 'Bottle: ' + settings.bottleSize + 'ml | Concentration: ' + (settings.conc * 100) + '%\n';
  text += 'Oil: ' + settings.oilVolume.toFixed(1) + 'ml | Alcohol: ' + settings.alcoholVolume.toFixed(1) + 'ml\n\n';
  text += 'Material'.padEnd(40) + '  %'.padStart(8) + '   Grams\n';
  text += '-'.repeat(60) + '\n';
  formula.forEach(function(f) {
    var grams = ((f.pct || 0) / 100 * settings.oilVolume).toFixed(3);
    text += f.name.padEnd(40) + '  ' + (f.pct || 0).toFixed(2).padStart(6) + '%  ' + grams.padStart(7) + 'g\n';
  });
  text += '-'.repeat(60) + '\n';
  text += 'Total:'.padEnd(40) + '  ' + totalPct.toFixed(2).padStart(6) + '%\n';

  var blob = new Blob([text], { type: 'text/plain' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'formula.txt';
  a.click();
}

let formulaMaterialData = {};

function updateFormulaUI() {
  var formula = getFormula();
  var settings = getBatchSettings();
  formulaCount.textContent = formula.length;

  document.getElementById('oilVolume').textContent = settings.oilVolume.toFixed(1);
  document.getElementById('alcoholVolume').textContent = settings.alcoholVolume.toFixed(1);

  if (formula.length === 0) {
    formulaList.innerHTML =
      '<div class="formula-empty">' +
        '<i class="fas fa-flask"></i>' +
        '<p>Click <strong>+ Add</strong> on any material to start building your formula</p>' +
      '</div>';
    document.getElementById('formulaTotalPct').textContent = '0';
    document.getElementById('formulaTotalGrams').textContent = '0.00g';
    document.getElementById('formulaTotalBar').className = 'formula-total-bar';
    document.getElementById('formulaWarnings').innerHTML = '';
    document.getElementById('formulaWarnings').className = 'formula-warnings';
    return;
  }

  var skus = formula.map(function(f) { return f.sku; });
  fetch('/api/materials/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skus: skus })
  })
  .then(function(r) { return r.json(); })
  .then(function(materials) {
    formulaMaterialData = {};
    materials.forEach(function(m) { formulaMaterialData[m.sku] = m; });

    var totalPct = formula.reduce(function(s, f) { return s + (f.pct || 0); }, 0);
    var totalBar = document.getElementById('formulaTotalBar');
    totalBar.className = 'formula-total-bar ' + (Math.abs(totalPct - 100) < 0.01 ? 'ok' : (totalPct > 100 ? 'over' : ''));
    document.getElementById('formulaTotalPct').textContent = totalPct.toFixed(2);
    document.getElementById('formulaTotalGrams').textContent = (totalPct / 100 * settings.oilVolume).toFixed(2) + 'g';

    var layerPcts = { top: 0, heart: 0, base: 0 };
    var roleCoverage = { radiator: false, fixative: false, bridger: false };
    formula.forEach(function(f) {
      var mat = formulaMaterialData[f.sku];
      if (mat && f.pct > 0) {
        var layer = mat.structural_role || 'heart';
        layerPcts[layer] = (layerPcts[layer] || 0) + f.pct;
        (mat.functional_roles || []).forEach(function(r) {
          if (r === 'radiator' || r === 'fixative' || r === 'bridger') roleCoverage[r] = true;
        });
      }
    });

    var layerSummary = document.getElementById('formulaLayerSummary');
    var layerHtml = '';
    ['top', 'heart', 'base'].forEach(function(layer) {
      var pct = layerPcts[layer] || 0;
      var barWidth = totalPct > 0 ? (pct / totalPct * 100) : 0;
      layerHtml += '<div class="layer-bar-row">' +
        '<span class="layer-bar-label ' + layer + '">' + layer + '</span>' +
        '<div class="layer-bar-track"><div class="layer-bar-fill ' + layer + '" style="width:' + barWidth + '%"></div></div>' +
        '<span class="layer-bar-pct">' + pct.toFixed(1) + '%</span>' +
      '</div>';
    });
    var roleHtml = '<div class="role-coverage">';
    ['radiator', 'fixative', 'bridger'].forEach(function(role) {
      var present = roleCoverage[role];
      var icons = { radiator: '🔥', fixative: '📌', bridger: '🔗' };
      roleHtml += '<span class="role-badge ' + (present ? 'present' : 'missing') + '">' + (icons[role] || '') + ' ' + role + '</span>';
    });
    roleHtml += '</div>';
    layerSummary.innerHTML = layerHtml + roleHtml;
    layerSummary.className = 'formula-layer-summary has-data';

    var warnings = [];
    if (!roleCoverage.radiator) warnings.push({ msg: 'Missing radiator — poor projection', type: 'warn' });
    if (!roleCoverage.fixative) warnings.push({ msg: 'Missing Fixative — poor longevity', type: 'warn' });
    if (!roleCoverage.bridger) warnings.push({ msg: 'Missing Bridger — harsh transitions', type: 'warn' });
    if (layerPcts.top < 10 && totalPct > 0) warnings.push({ msg: 'Top notes < 10%', type: 'warn' });
    if (layerPcts.heart < 20 && totalPct > 0) warnings.push({ msg: 'Heart notes < 20%', type: 'warn' });
    if (layerPcts.base < 10 && totalPct > 0) warnings.push({ msg: 'Base notes < 10%', type: 'warn' });

    var html = '';
    formula.forEach(function(f) {
      var pct = f.pct || 0;
      var grams = (pct / 100 * settings.oilVolume);
      var itemClass = 'formula-item';
      var itemWarnings = [];
      var mat = formulaMaterialData[f.sku];

      if (mat) {
        if (mat.usage_max !== null && pct > mat.usage_max) {
          itemClass += ' error';
          itemWarnings.push('Exceeds max (' + mat.usage_max + '%)');
        }
        if (mat.usage_min !== null && pct > 0 && pct < mat.usage_min) {
          itemClass += ' warn';
          itemWarnings.push('Below min (' + mat.usage_min + '%)');
        }
      }
      if (pct > 0 && grams < 0.01) {
        itemClass += ' warn';
        itemWarnings.push('< 0.01g — dilute');
      }

      var imgUrl = (mat && mat.image_url) || f.image || '';
      var rolesHtml = '';
      if (mat && mat.functional_roles) {
        var displayRoles = mat.functional_roles.filter(function(r) { return r !== 'core'; });
        if (displayRoles.length > 0) {
          rolesHtml = '<div class="formula-item-roles">' + displayRoles.map(function(r) {
            return '<span class="item-role-badge ' + r + '">' + r + '</span>';
          }).join('') + '</div>';
        }
      }

      html +=
        '<div class="' + itemClass + '">' +
          (imgUrl ? '<img src="' + escAttr(imgUrl) + '" alt="" onerror="this.style.display=\'none\'">' : '') +
          '<div class="formula-item-info">' +
            '<div class="formula-item-name">' + esc(f.name) + '</div>' +
            '<div class="formula-item-sku">' + f.sku + '</div>' +
            rolesHtml +
          '</div>' +
          '<div class="formula-item-pct">' +
            '<input type="number" value="' + (pct || '') + '" min="0" max="100" step="0.01" placeholder="%" onchange="updateFormulaPct(\'' + escAttr(f.sku) + '\', this.value)" oninput="updateFormulaPct(\'' + escAttr(f.sku) + '\', this.value)">' +
            '<span class="pct-label">%</span>' +
          '</div>' +
          '<span class="formula-item-grams">' + grams.toFixed(3) + 'g</span>' +
          '<button class="formula-item-remove" onclick="removeFromFormula(\'' + escAttr(f.sku) + '\')" title="Remove"><i class="fas fa-times"></i></button>' +
        '</div>';

      itemWarnings.forEach(function(w) {
        warnings.push({ sku: f.sku, name: f.name, msg: w, type: itemClass.includes('error') ? 'error' : 'warn' });
      });
    });
    formulaList.innerHTML = html;

    if (Math.abs(totalPct - 100) > 0.01) {
      warnings.push({ msg: 'Total is ' + totalPct.toFixed(2) + '% (should be 100%)', type: totalPct > 100 ? 'error' : 'warn' });
    }

    var warnEl = document.getElementById('formulaWarnings');
    if (warnings.length > 0) {
      warnEl.className = 'formula-warnings has-warnings';
      warnEl.innerHTML = warnings.map(function(w) {
        return '<div class="formula-warning-item ' + w.type + '"><i class="fas fa-' + (w.type === 'error' ? 'exclamation-circle' : 'exclamation-triangle') + '"></i>' + (w.name ? esc(w.name) + ': ' : '') + esc(w.msg) + '</div>';
      }).join('');
    } else {
      warnEl.className = 'formula-warnings';
      warnEl.innerHTML = '';
    }
  })
  .catch(function(err) {
    console.error('Failed to load material data:', err);
  });
}

function toggleFormulaPanel() {
  formulaPanel.classList.toggle('open');
}

let syncEventSource = null;
let syncLogVisible = false;

function startSync() {
  const bar = document.getElementById('syncBar');
  const btn = document.getElementById('syncBtn');
  const progress = document.getElementById('syncBarProgress');
  const current = document.getElementById('syncBarCurrent');
  const pct = document.getElementById('syncBarPct');
  const log = document.getElementById('syncBarLog');

  bar.style.display = 'block';
  btn.disabled = true;
  btn.classList.add('syncing');
  log.innerHTML = '';
  syncLogVisible = false;
  document.getElementById('syncLogToggleIcon').className = 'fas fa-chevron-down';
  progress.textContent = '0 / 0';
  pct.textContent = '0%';
  current.textContent = '';

  fetch('/api/sync/start', { method: 'POST' })
    .catch(() => {
      current.textContent = 'Failed to start sync';
      btn.disabled = false;
      btn.classList.remove('syncing');
    });

  if (syncEventSource) syncEventSource.close();
  syncEventSource = new EventSource('/api/sync/stream');

  syncEventSource.onmessage = function(e) {
    const state = JSON.parse(e.data);
    const total = state.total || 0;
    const prog = state.progress || 0;
    const percent = total > 0 ? Math.round((prog / total) * 100) : 0;

    progress.textContent = prog + ' / ' + total;
    pct.textContent = percent + '%';
    current.textContent = state.current || '';

    if (state.log && state.log.length > 0) {
      const lastLines = state.log.slice(-80);
      log.innerHTML = lastLines.map(function(line) {
        var cls = '';
        if (line.startsWith('  OK:')) cls = 'ok';
        else if (line.startsWith('  FAIL:')) cls = 'fail';
        return '<div class="' + cls + '">' + esc(line) + '</div>';
      }).join('');
      log.scrollTop = log.scrollHeight;
    }

    if (!state.running) {
      syncEventSource.close();
      btn.disabled = false;
      btn.classList.remove('syncing');
      document.getElementById('syncBarIcon').className = 'fas fa-check-circle';
      document.getElementById('syncBarIcon').style.color = 'var(--green)';
      current.textContent = 'Sync complete — ' + total + ' products processed';
      loadProducts();
      loadCategories();
    }
  };

  syncEventSource.onerror = function() {
    syncEventSource.close();
    btn.disabled = false;
    btn.classList.remove('syncing');
    current.textContent = 'Sync connection lost';
  };
}

function toggleSyncLog() {
  syncLogVisible = !syncLogVisible;
  document.getElementById('syncBarLog').style.display = syncLogVisible ? 'block' : 'none';
  document.getElementById('syncLogToggleIcon').className = syncLogVisible ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
}

function dismissSync() {
  const bar = document.getElementById('syncBar');
  bar.style.display = 'none';
  if (syncEventSource) {
    syncEventSource.close();
    syncEventSource = null;
  }
  const btn = document.getElementById('syncBtn');
  btn.disabled = false;
  btn.classList.remove('syncing');
  document.getElementById('syncBarIcon').className = 'fas fa-sync-alt';
  document.getElementById('syncBarIcon').style.color = '';
}

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function escAttr(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') { closeModal(); hideSearchHistory(); }
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    searchInput.focus();
  }
});

searchInput.addEventListener('focus', function() {
  if (!searchInput.value.trim()) showSearchHistory();
});
searchInput.addEventListener('input', function() {
  hideSearchHistory();
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(function() {
    currentPage = 1;
    loadProducts();
  }, 300);
});
document.addEventListener('click', function(e) {
  if (!e.target.closest('.search-input-wrapper')) hideSearchHistory();
});

document.addEventListener('DOMContentLoaded', function() {
  loadCategories();
  loadProducts();
  updateFormulaUI();
  searchInput.focus();
});
