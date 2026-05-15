/* ============================================
   PerfumersWorld Raw Material Library
   Simple Black-and-White Theme
   ============================================ */

// PerfumersWorld Raw Material Viewer - Frontend App

let currentQuery = '';
let currentAbcFilter = '';

// DOM Elements
const searchInput = document.getElementById('searchInput');
const abcFilter = document.getElementById('abcFilter');
const clearBtn = document.getElementById('clearBtn');
const statTotal = document.getElementById('statTotal');
const statCount = document.getElementById('statCount');
const mainContent = document.getElementById('mainContent');
const quickFilters = document.getElementById('quickFilters');
const detailModal = document.getElementById('detailModal');
const modalContent = document.getElementById('modalContent');

// Load categories
async function loadCategories() {
  try {
    const response = await fetch('/api/categories');
    const data = await response.json();
    if (!data) return;

    // Update ABC filter dropdown
    const select = document.getElementById('abcFilter');
    select.innerHTML = '<option value="">All ABC Donuts</option>';

    data.forEach(([name, count]) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name + ' (' + count + ')';
      select.appendChild(option);
    });

    // Create quick filter pills
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

// Load products
async function loadProducts() {
  currentQuery = searchInput.value;
  currentAbcFilter = abcFilter.value;

  // Update clear button visibility
  clearBtn.style.display = (currentQuery || currentAbcFilter) ? 'inline-flex' : 'none';

  // Show loading state
  mainContent.innerHTML = '<div class="loader"><div class="spinner"></div><p>Loading...</p></div>';

  // Build query parameters
  const params = new URLSearchParams();
  if (currentQuery) params.set('q', currentQuery);
  if (currentAbcFilter) params.set('abc', currentAbcFilter);
  params.set('limit', '200');

  // Fetch products
  try {
    const response = await fetch('/api/products?' + params.toString());
    const data = await response.json();
    if (!data) {
      mainContent.innerHTML = '<div class="no-results"><h2>Error loading data</h2></div>';
      return;
    }

    // Update stats
    statTotal.innerHTML = '<i class="fas fa-database"></i> ' + data.total;
    statCount.innerHTML = '<i class="fas fa-filter"></i> ' + data.count + ' shown';

    // Update active filter pills
    document.querySelectorAll('.filter-pill').forEach(function(pill) {
      pill.classList.toggle('active', pill.dataset.abc === currentAbcFilter);
    });

    // Render products
    renderProducts(data.products, data.count, data.total);
  } catch (error) {
    console.error('Failed to load products:', error);
    mainContent.innerHTML = '<div class="no-results"><h2>Error loading data</h2></div>';
  }
}

// Render products
function renderProducts(products, count, total) {
  const main = document.getElementById('mainContent');

  if (products.length === 0) {
    main.innerHTML =
      '<div class="no-results">' +
        '<i class="fas fa-search fa-3x"></i>' +
        '<h2>No results found</h2>' +
        '<p>Try different keywords or remove filters</p>' +
        '<div class="search-tips">' +
          '<strong>Search tips:</strong><br>' +
          '&bull; By name: <code>lilial</code><br>' +
          '&bull; By odour: <code>fresh</code>, <code>green</code>, <code>lily</code>, <code>muguet</code><br>' +
          '&bull; By synonym: <code>lysmeral</code>, <code>citronellol</code><br>' +
          '&bull; By CAS: <code>80-54-6</code><br>' +
          '&bull; By SKU: <code>3MA00273</code><br>' +
          '&bull; By application: <code>perfume</code>, <code>shampoo</code><br>' +
          '&bull; By ABC: <code>Rose</code>, <code>Jasmine</code>' +
        '</div>' +
      '</div>';
    return;
  }

  let html = '<div class="product-grid">';

  products.forEach(function(p) {
    const name = esc(p.raw_material || 'Unknown');
    const sku = p.sku || '';
    const price = p.price || 'N/A';
    const odour = (p.odour || '').substring(0, 120);
    const impact = p.relative_odor_impact || '-';
    const lifetime = p.odour_lifetime || '-';
    const abc = p.abc_donut
      ? (p.abc_donut.match(/syn\/([^\/]+)\.jpg/) || [])[1] || p.abc_donut.split('/').pop().replace('.jpg', '')
      : '';
    const uFrom = p.typical_usage_from || '';
    const uAvg = p.typical_usage_average || '';
    const uMax = p.typical_usage_maximum || '';
    const syn = (p.synonyms || '').split(':').slice(0, 4).join(', ');

    html +=
      '<div class="product-card" onclick="openDetail(\'' + escAttr(sku) + '\')">' +
        '<div class="card-header">' +
          '<span class="product-name">' + name + '</span>' +
          (abc ? '<span class="abc-badge" title="ABC: ' + abc + '">' + abc + '</span>' : '') +
        '</div>' +
        '<div class="card-body">' +
          '<div class="field-row"><span class="field-label">SKU:</span><span class="field-value">' + sku + '</span></div>' +
          '<div class="field-row"><span class="field-label">Price:</span><span class="field-value price">' + price + '</span></div>' +
          '<div class="field-row"><span class="field-label">Odour:</span><span class="field-value odour" title="' + escAttr(odour) + '">' + odour + (odour.length >= 120 ? '...' : '') + '</span></div>' +
          '<div class="field-row synonyms"><span class="field-label">Syn:</span><span class="field-value">' + esc(syn) + '</span></div>' +
          (p.cas ? '<div class="field-row"><span class="field-label">CAS:</span><span class="field-value cas">' + esc(p.cas) + '</span></div>' : '') +
          (p.ifra ? '<div class="field-row"><span class="field-label">FEMA:</span><span class="field-value">' + esc(p.ifra) + '</span></div>' : '') +
          (uFrom ? '<div class="usage-bar"><span class="usage-from">' + uFrom + '</span><span class="usage-label">Avg: ' + uAvg + ' / Max: ' + uMax + '</span></div>' : '') +
        '</div>' +
        '<div class="card-footer">' +
          '<span class="impact-badge" title="Odor Impact Score">' + impact + '</span>' +
          '<span class="lifetime">' + lifetime + '</span>' +
          '<span class="detail-link">Detail <i class="fas fa-arrow-right"></i></span>' +
        '</div>' +
      '</div>';
  });

  html += '</div>';
  main.innerHTML = html;
}

// Open detail modal
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

    // Generate applications HTML
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

    // Generate synonyms HTML
    let synHtml = '';
    if (p.synonyms && p.synonyms.length > 0) {
      synHtml = '<div class="synonyms-list">';
      p.synonyms.forEach(function(s) {
        synHtml += '<span class="syn-tag">' + esc(s) + '</span>';
      });
      synHtml += '</div>';
    }

    // Generate related products HTML
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

    // Generate facts HTML
    let factsHtml = '';
    if (p.physical_state) factsHtml += '<tr><td>Physical State</td><td>' + esc(p.physical_state) + '</td></tr>';
    if (p.specific_gravity) factsHtml += '<tr><td>Specific Gravity</td><td>' + esc(p.specific_gravity) + '</td></tr>';
    if (p.refractive_index) factsHtml += '<tr><td>Refractive Index</td><td>' + esc(p.refractive_index) + '</td></tr>';
    if (p.melting_point) factsHtml += '<tr><td>Melting Point</td><td>' + esc(p.melting_point) + '</td></tr>';
    if (p.boiling_point) factsHtml += '<tr><td>Boiling Point</td><td>' + esc(p.boiling_point) + '</td></tr>';
    if (p.flash_point) factsHtml += '<tr><td>Flash Point</td><td>' + esc(p.flash_point) + '</td></tr>';
    factsHtml += '<tr><td>Source</td><td><a href="' + escAttr(p.source_url || '') + '" target="_blank">PerfumersWorld</a></td></tr>';

    // Generate ABC donut HTML
    let abcDonutHtml = '';
    if (p.abc_donut) {
      const name = (p.abc_donut.match(/syn\/([^\/]+)\.jpg/) || [])[1] || p.abc_donut.split('/').pop().replace('.jpg', '');
      abcDonutHtml =
        '<div class="detail-card donut-card">' +
          '<h3><i class="fas fa-chart-pie"></i> ABC Donut</h3>' +
          '<div class="donut-placeholder">' +
            '<img src="' + escAttr(p.abc_donut) + '" alt="ABC Donut ' + escAttr(p.raw_material) + '" onerror="setDonutFallback(this,\'' + escAttr(name) + '\')" style="max-width:100%;border-radius:8px;">' +
          '</div>' +
        '</div>';
    }

    // Update modal content
    content.innerHTML =
      '<button class="close-btn" onclick="closeModal()" title="Close">&times;</button>' +
      '\n' +
      '<div class="breadcrumb">' +
        '<a href="#" onclick="closeModal(); return false;"><i class="fas fa-home"></i> Home</a>' +
        '<i class="fas fa-chevron-right"></i>' +
        '<span>' + esc(p.raw_material) + '</span>' +
      '</div>' +
      '\n' +
      '<div class="detail-grid">' +
        '<div class="detail-left">' +
          '<div class="detail-card" style="margin-bottom:16px">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">' +
              '<h1 class="detail-title">' + esc(p.raw_material) + '</h1>' +
              '<span class="sku-tag">' + p.sku + '</span>' +
            '</div>' +
            '\n' +
            (p.description ? '<div class="section"><h3><i class="fas fa-align-left"></i> Description</h3><p class="description-text">' + esc(p.description) + '</p></div>' : '') +
            '\n' +
            (p.odour ? '<div class="section"><h3><i class="fas fa-nose"></i> Odour</h3><p class="odour-text">' + esc(p.odour) + '</p></div>' : '') +
            '\n' +
            '<div class="info-grid">' +
              (p.price ? '<div class="info-item"><span class="info-label"><i class="fas fa-tag"></i> Price</span><span class="info-value price">' + esc(p.price) + '</span></div>' : '') +
              (p.cas ? '<div class="info-item"><span class="info-label"><i class="fas fa-barcode"></i> CAS</span><span class="info-value cas">' + esc(p.cas) + '</span></div>' : '') +
              (p.ifra ? '<div class="info-item"><span class="info-label"><i class="fas fa-file-alt"></i> FEMA</span><span class="info-value">' + esc(p.ifra) + '</span></div>' : '') +
              (p.relative_odor_impact ? '<div class="info-item"><span class="info-label"><i class="fas fa-chart-bar"></i> Odor Impact</span><span class="info-value">' + esc(p.relative_odor_impact) + '</span></div>' : '') +
              (p.odour_lifetime ? '<div class="info-item"><span class="info-label"><i class="fas fa-clock"></i> Odour Lifetime</span><span class="info-value">' + esc(p.odour_lifetime) + '</span></div>' : '') +
            '</div>' +
            '\n' +
            (uFrom || uAvg || uMax ?
              '<div class="section">' +
                '<h3><i class="fas fa-chart-line"></i> Typical Usage in Perfume Compounds</h3>' +
                '<div class="usage-display">' +
                  (uFrom ? '<div class="usage-item"><span class="usage-label">From (min)</span><span class="usage-val">' + uFrom + '</span></div>' : '') +
                  (uAvg ? '<div class="usage-item"><span class="usage-label">Average</span><span class="usage-val avg">' + uAvg + '</span></div>' : '') +
                  (uMax ? '<div class="usage-item"><span class="usage-label">Maximum</span><span class="usage-val max">' + uMax + '</span></div>' : '') +
                '</div>' +
              '</div>' : '') +
          '</div>' +
          '\n' +
          (synHtml ? '<div class="detail-card"><h3><i class="fas fa-tags"></i> Synonyms</h3>' + synHtml + '</div>' : '') +
          '\n' +
          (appsHtml ? '<div class="detail-card"><h3><i class="fas fa-check-circle"></i> Application Suitability</h3>' +
            '<p class="app-note">Used in these perfume types but not limited to them. ' +
            'Rating: 9=Very Good, 8=Good, 7=Reasonable, 6=Fair, 5=Mediocre, 4=Slight, 3=Discoloration, 2=Stability, 1=Major, 0=Not recommended</p>' +
            appsHtml + '</div>' : '') +
        '</div>' +
        '\n' +
        '<div class="detail-right">' +
          abcDonutHtml +
          (relHtml ? '<div class="detail-card"><h3><i class="fas fa-link"></i> Related Products (Same ABC)</h3>' + relHtml + '</div>' : '') +
          '<div class="detail-card">' +
            '<h3><i class="fas fa-info-circle"></i> Quick Facts</h3>' +
            (factsHtml ? '<table class="facts-table">' + factsHtml + '</table>' : '<p style="color:var(--text-muted)">No additional data available</p>') +
          '</div>' +
        '</div>' +
      '</div>' +
      '\n' +
      '<div class="back-link">' +
        '<button class="btn-back" onclick="closeModal()"><i class="fas fa-arrow-left"></i> Back to results (' + (data.count || p.totalProducts || 0) + ')</button>' +
      '</div>';
  } catch (error) {
    console.error('Failed to load detail:', error);
    content.innerHTML = '<p style="color:var(--red)">Failed to load product detail</p>';
  }
}

// Close modal
function closeModal(e) {
  if (e && e.target !== document.getElementById('detailModal')) return;
  document.getElementById('detailModal').classList.remove('open');
}

// Search function
function doSearch() { loadProducts(); }

// Clear filters
function clearFilters() {
  searchInput.value = '';
  abcFilter.value = '';
  currentQuery = '';
  currentAbcFilter = '';
  loadProducts();
}

// Set donut fallback
function setDonutFallback(img, name) {
  img.parentElement.innerHTML =
    '<i class="fas fa-image donut-fallback" style="color:var(--text-muted);font-size:2rem;"></i>' +
    '<p class="donut-fallback" style="margin-top:8px;color:var(--text-muted);font-size:0.85rem;">ABC Donut: ' + esc(name) + '</p>';
}

// Escape HTML
function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// Escape attribute
function escAttr(s) {
  return (s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeModal();
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    searchInput.focus();
  }
});

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  loadCategories();
  loadProducts();
  searchInput.focus();
});
