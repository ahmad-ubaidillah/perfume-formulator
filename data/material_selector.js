function selectMaterials(products, themeResult, options = {}) {
  const targetFamilies = themeResult.family_distribution || {};
  const minMaterials = options.minMaterials || 8;
  const maxMaterials = options.maxMaterials || 15;

  const scored = [];
  for (const p of products) {
    let score = 0;
    const cat = (p.abc_category || '').toLowerCase();

    if (targetFamilies[cat]) {
      score += targetFamilies[cat] * 100;
    }

    const diffusion = p.diffusion_factor || 1.0;
    const persistence = p.persistence_factor || 0.5;
    score += (diffusion * 10) + (persistence * 5);

    if (p.functional_roles && p.functional_roles.includes('bridger')) score += 15;
    if (p.functional_roles && p.functional_roles.includes('radiator')) score += 10;
    if (p.functional_roles && p.functional_roles.includes('fixative')) score += 10;

    const usageMax = p.usage_max || 5;
    if (usageMax < 0.01) score -= 10;

    scored.push({ product: p, score });
  }

  scored.sort((a, b) => b.score - a.score);

  const selected = [];
  const selectedNames = new Set();
  const layers = { top: [], heart: [], base: [] };
  const roles = { radiator: false, fixative: false, bridger: false };

  for (const item of scored) {
    if (selected.length >= maxMaterials) break;
    const p = item.product;
    const baseName = (p.raw_material || '').replace(/\s*10%\s*in\s*\w+/i, '').replace(/\s*50%\s*in\s*\w+/i, '').replace(/\s*1%\s*in\s*\w+/i, '').trim();
    if (selectedNames.has(baseName)) continue;

    const layer = p.structural_role || 'heart';
    if (layers[layer].length < 6) {
      selected.push(p);
      selectedNames.add(baseName);
      layers[layer].push(p);
      (p.functional_roles || []).forEach(r => {
        if (r === 'radiator' || r === 'fixative' || r === 'bridger') roles[r] = true;
      });
    }
  }

  const autoInject = {
    radiator: !roles.radiator ? ['Iso E Super', 'Ambroxan'] : [],
    bridger: !roles.bridger ? ['Hedione', 'Linalool'] : [],
    fixative: !roles.fixative ? ['Patchouli', 'Vetiver'] : [],
  };

  for (const [role, candidates] of Object.entries(autoInject)) {
    for (const name of candidates) {
      if (selected.length >= maxMaterials) break;
      const match = products.find(p =>
        (p.raw_material || '').toLowerCase().includes(name.toLowerCase()) &&
        !selectedNames.has((p.raw_material || '').replace(/\s*10%\s*in\s*\w+/i, '').replace(/\s*50%\s*in\s*\w+/i, '').replace(/\s*1%\s*in\s*\w+/i, '').trim())
      );
      if (match) {
        selected.push(match);
        selectedNames.add((match.raw_material || '').replace(/\s*10%\s*in\s*\w+/i, '').replace(/\s*50%\s*in\s*\w+/i, '').replace(/\s*1%\s*in\s*\w+/i, '').trim());
        roles[role] = true;
      }
    }
  }

  return {
    materials: selected,
    layers: {
      top: selected.filter(p => p.structural_role === 'top'),
      heart: selected.filter(p => p.structural_role === 'heart'),
      base: selected.filter(p => p.structural_role === 'base'),
    },
    roles: roles,
    theme: themeResult,
  };
}

module.exports = { selectMaterials };
