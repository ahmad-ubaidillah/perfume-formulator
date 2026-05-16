const INTERACTION_MATRIX = {
  positive: [
    { pair: ['hedione', 'floral'], modifier: 1.2 },
    { pair: ['iso e super', 'wood'], modifier: 1.15 },
    { pair: ['ambroxan', 'amber'], modifier: 1.15 },
    { pair: ['linalool', 'floral'], modifier: 1.1 },
    { pair: ['bergamot', 'citrus'], modifier: 1.1 },
    { pair: ['patchouli', 'wood'], modifier: 1.1 },
    { pair: ['vanillin', 'vanilla'], modifier: 1.2 },
    { pair: ['musk', 'amber'], modifier: 1.1 },
  ],
  negative: [
    { pair: ['calone', 'rose'], modifier: 0.8 },
    { pair: ['indole', 'citrus'], modifier: 0.7 },
    { pair: ['skatole', 'citrus'], modifier: 0.6 },
    { pair: ['civet', 'citrus'], modifier: 0.75 },
    { pair: ['castoreum', 'floral'], modifier: 0.8 },
  ],
};

function calculateFormula(materials, options = {}) {
  const bottleSize = options.bottleSize || 50;
  const concentration = options.concentration || 0.10;
  const diffusionMode = options.diffusionMode || 'normal';
  const oilVolume = bottleSize * concentration;

  const diffusionMultipliers = { soft: 1.10, normal: 1.20, beast: 1.30 };
  const DL = diffusionMultipliers[diffusionMode] - 1;

  const structuralWeights = { top: 0.20, heart: 0.50, base: 0.30 };

  const maxOV = Math.max(...materials.map(m => m.ov || 1000), 1);
  const impactBalancer = 1 / maxOV;

  const rawScores = materials.map(m => {
    const L = 1.0;
    const W = structuralWeights[m.structural_role] || 0.33;
    const I = impactBalancer;
    const S = Math.min(1, (m.usage_max || 5) / 100);
    const OV = (m.ov || 1000) / 1000;
    const T = m.threshold_factor || 1.0;
    const D = m.diffusion_factor || 1.0;
    const P = m.persistence_factor || 0.5;
    const Rf = m.role_factor || 1.0;

    const gRaw = L * W * I * S * Math.pow(OV, 0.6) * Math.pow(T, 0.4) * D * P * Rf;
    return { material: m, gRaw };
  });

  const sumRaw = rawScores.reduce((s, r) => s + r.gRaw, 0);

  const formula = rawScores.map(r => {
    let G = (r.gRaw / sumRaw) * 100;
    G = G * (1 + DL);

    const cat = (r.material.abc_category || '').toLowerCase();
    const name = (r.material.raw_material || '').toLowerCase();

    for (const interaction of INTERACTION_MATRIX.positive) {
      if (name.includes(interaction.pair[0]) || cat.includes(interaction.pair[0]) ||
          name.includes(interaction.pair[1]) || cat.includes(interaction.pair[1])) {
        G *= interaction.modifier;
      }
    }
    for (const interaction of INTERACTION_MATRIX.negative) {
      if (name.includes(interaction.pair[0]) || cat.includes(interaction.pair[0]) ||
          name.includes(interaction.pair[1]) || cat.includes(interaction.pair[1])) {
        G *= interaction.modifier;
      }
    }

    if (r.material.usage_max && G > r.material.usage_max) {
      G = r.material.usage_max;
    }
    if (G > 0 && G < 0.001) G = 0;

    const grams = (G / 100) * oilVolume;
    let dilutionRequirement = null;
    if (grams > 0 && grams < 0.01) {
      dilutionRequirement = grams < 0.001 ? '1%' : '10%';
    }

    return {
      sku: r.material.sku,
      name: r.material.raw_material || r.material.name,
      percentage: parseFloat(G.toFixed(4)),
      grams: parseFloat(grams.toFixed(4)),
      structural_role: r.material.structural_role || 'heart',
      functional_roles: r.material.functional_roles || ['core'],
      dilution_requirement: dilutionRequirement,
      evaporation_constant: r.material.evaporation_constant || 0.173,
      diffusion_factor: r.material.diffusion_factor || 1.0,
    };
  });

  const totalPct = formula.reduce((s, f) => s + f.percentage, 0);
  const normalized = formula.map(f => ({
    ...f,
    percentage: totalPct > 0 ? parseFloat((f.percentage / totalPct * 100).toFixed(4)) : 0,
  }));

  const layers = {
    top: normalized.filter(f => f.structural_role === 'top'),
    heart: normalized.filter(f => f.structural_role === 'heart'),
    base: normalized.filter(f => f.structural_role === 'base'),
  };
  const layerPcts = {
    top: layers.top.reduce((s, f) => s + f.percentage, 0),
    heart: layers.heart.reduce((s, f) => s + f.percentage, 0),
    base: layers.base.reduce((s, f) => s + f.percentage, 0),
  };

  const performance = calculatePerformance(normalized);

  return {
    materials: normalized,
    layers,
    layer_percentages: layerPcts,
    total_percentage: parseFloat(totalPct.toFixed(2)),
    batch: {
      bottle_size: bottleSize,
      oil_volume: parseFloat(oilVolume.toFixed(2)),
      alcohol_volume: parseFloat((bottleSize - oilVolume).toFixed(2)),
      concentration: concentration * 100,
    },
    diffusion_mode: diffusionMode,
    performance,
  };
}

function calculatePerformance(formula) {
  const kValues = formula.map(f => f.evaporation_constant || 0.173);
  const avgK = kValues.reduce((s, k) => s + k, 0) / kValues.length;

  const longevity = Math.max(1, Math.min(48, 24 / (avgK || 0.1)));
  const projection = formula.reduce((s, f) => s + (f.percentage * (f.functional_roles || []).includes('radiator') ? 1.2 : 1), 0) / 100;
  const sillage = formula.reduce((s, f) => s + f.percentage * (f.evaporation_constant || 0.173), 0) / 100;

  const layerVals = Object.values({
    top: formula.filter(f => f.structural_role === 'top').reduce((s, f) => s + f.percentage, 0),
    heart: formula.filter(f => f.structural_role === 'heart').reduce((s, f) => s + f.percentage, 0),
    base: formula.filter(f => f.structural_role === 'base').reduce((s, f) => s + f.percentage, 0),
  });
  const avgLayer = layerVals.reduce((s, v) => s + v, 0) / layerVals.length;
  const balance = 1 - (Math.sqrt(layerVals.reduce((s, v) => s + Math.pow(v - avgLayer, 2), 0) / layerVals.length) / 50);

  return {
    longevity_score: parseFloat(Math.min(10, longevity / 4.8).toFixed(1)),
    projection_score: parseFloat(Math.min(10, projection * 10).toFixed(1)),
    sillage_score: parseFloat(Math.min(10, sillage * 5).toFixed(1)),
    balance_score: parseFloat(Math.max(0, Math.min(10, balance * 10)).toFixed(1)),
    diffusion_score: parseFloat(Math.min(10, formula.reduce((s, f) => s + f.percentage * (f.diffusion_factor || 1), 0) / 10).toFixed(1)),
  };
}

function simulateEvaporation(formula, hours = 48) {
  const timePoints = [0, 0.5, 1, 2, 4, 8, 12, 24, 36, 48].filter(t => t <= hours);
  const phases = [];

  for (const t of timePoints) {
    const intensities = formula.map(f => {
      const k = f.evaporation_constant || 0.173;
      const intensity = f.percentage * Math.exp(-k * t);
      return { sku: f.sku, name: f.name, intensity: parseFloat(intensity.toFixed(4)) };
    });
    const totalIntensity = intensities.reduce((s, i) => s + i.intensity, 0);

    let phase;
    if (t <= 2) phase = 'opening';
    else if (t <= 8) phase = 'heart';
    else phase = 'drydown';

    phases.push({
      time: t,
      phase,
      total_intensity: parseFloat(totalIntensity.toFixed(4)),
      materials: intensities.filter(i => i.intensity > 0.01),
    });
  }

  return phases;
}

module.exports = { calculateFormula, simulateEvaporation, INTERACTION_MATRIX };
