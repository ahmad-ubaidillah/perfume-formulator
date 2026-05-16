# Olfactory Engine — Implementation Plan

## Data Mapping: PRD Fields vs Available Data

| PRD Field | Source | Coverage | Strategy |
|---|---|---|---|
| `name` | `raw_material` | 100% | Direct map |
| `cas_number` | `cas` | 100% | Direct map |
| `odor_description` | `odour` | 71% | Direct map, fallback to `description` |
| `olfactive_family` | `abc_category` | 100% | Direct map |
| `abc_donut_family` | `abc_donut_data` | 100% | Direct map |
| `relative_odor_impact` | `relative_odor_impact` | 97% | Direct map, default 1000 if missing |
| `odor_life` | `odour_lifetime` | 95% | Parse "0.2 hrs" → float, default 4.0 if missing |
| `usage_min` | `typical_usage_from` | 100% | Parse "0.020%" → float |
| `usage_avg` | `typical_usage_average` | 100% | Parse "0.200%" → float |
| `usage_max` | `typical_usage_maximum` | 100% | Parse "1.000%" → float |
| `physical_state` | `physical_state` | 100% | Direct map |
| `ifra_notes` | `ifra` | 100% | Direct map (FEMA number) |
| `synonyms` | `synonyms` | 100% | Direct map |
| `evaporation_constant` | **Derived** | 0% | Calculate from `odor_life`: k = ln(2) / half_life |
| `threshold_factor` | **Estimated** | 0% | Inverse of `relative_odor_impact`: T = 1000 / OV |
| `diffusion_factor` | **Estimated** | 0% | Map from `abc_category` + `physical_state` |
| `persistence_factor` | **Derived** | 0% | Normalize `odor_life` to 0-1 scale |
| `structural_role` | **Assigned** | 0% | Rule-based from `odor_life` + `abc_category` |
| `functional_roles` | **Assigned** | 0% | Rule-based from material properties |
| `semantic_embedding` | **AI-generated** | 0% | LLM batch generation (Phase 3) |
| `compatibility_tags` | **AI-generated** | 0% | LLM batch generation (Phase 3) |
| `accord_tags` | **AI-generated** | 0% | LLM batch generation (Phase 3) |

---

## Phase 1: Data Enrichment & Formula UI

### Task 1.1: Enrich Material Database with Derived Fields

**Goal**: Add computed fields to every material in `raw_materials.json`

**Subtasks**:

1. **1.1a — Parse numeric fields**
   - `odour_lifetime`: "0.2 hrs" → `0.2` (float), "12-24 hrs" → `18.0` (midpoint)
   - `typical_usage_from/avg/max`: "0.020%" → `0.02` (float)
   - `relative_odor_impact`: "1540" → `1540` (int)

2. **1.1b — Calculate evaporation_constant**
   - Formula: `k = ln(2) / odor_life_hours`
   - If `odor_life` is 0.2 hrs → k = 3.47 (fast evaporating)
   - If `odor_life` is 100 hrs → k = 0.007 (slow evaporating)
   - Default: k = 0.173 (4 hrs half-life) if missing

3. **1.1c — Calculate threshold_factor**
   - Formula: `T = 1000 / relative_odor_impact`
   - High OV (1540) → low T (0.65) = easily detected
   - Low OV (100) → high T (10.0) = needs more to detect
   - Default: T = 1.0 if OV missing

4. **1.1d — Calculate diffusion_factor**
   - Map from `abc_category`:
     - citrus, aliphatic, green → 1.3 (high diffusion)
     - floral, fruity, spice → 1.0 (medium)
     - wood, musk, vanilla, balsamic → 0.7 (low diffusion)
     - animalic, amber → 0.5 (very low)
   - Adjust by `physical_state`: gas/liquid → ×1.2, solid → ×0.8

5. **1.1e — Calculate persistence_factor**
   - Normalize `odor_life_hours` to 0-1 scale:
   - `P = min(1.0, odor_life / 100)` (100 hrs = max persistence)
   - Default: P = 0.04 if missing (4 hrs)

6. **1.1f — Assign structural_role (top/heart/base)**
   - Rules based on `odor_life_hours`:
     - < 2 hrs → `top`
     - 2-20 hrs → `heart`
     - > 20 hrs → `base`
   - Override by `abc_category`:
     - citrus always top (even if 4 hrs)
     - musk, amber, wood always base (even if 10 hrs)

7. **1.1g — Assign functional_roles**
   - Rules:
     - `abc_category` = musk → `fixative`
     - `abc_category` = wood → `fixative`
     - `abc_category` = aliphatic → `radiator`
     - `abc_category` = linalool → `bridger`
     - `abc_category` = floral + `odor_life` 2-8 hrs → `bridger`
     - `abc_category` = citrus → `modifier`
     - High OV (>2000) + low usage_max (<0.1%) → `modifier`
     - Can have multiple roles: `["core", "bridger"]`

8. **1.1h — Calculate role_factor**
   - Based on assigned functional_roles:
     - `core` → 1.0
     - `bridger` → 0.85
     - `radiator` → 1.2
     - `fixative` → 1.1
     - `modifier` → 0.75
     - `blender` → 0.9
   - If multiple roles, use the highest

**Output**: Updated `raw_materials.json` with new fields, or separate `material_enriched.json`

**Files to modify**:
- `data/enrich_materials.js` — new script to enrich existing data
- `data/raw_materials.json` — updated with new fields

---

### Task 1.2: Formula Builder UI — Percentages & Grams

**Goal**: User can set percentage per material, see gram amounts in real-time

**Subtasks**:

1. **1.2a — Formula item input**
   - Add percentage input field to each formula item
   - Default: auto-calculate equal distribution
   - Show gram amount next to percentage

2. **1.2b — Batch calculator**
   - Add inputs: bottle size (ml), concentration type (EDT 10%, EDP 15%, Parfum 20%, Extrait 30%)
   - Calculate: `oil_volume = bottle_size × concentration%`
   - Calculate: `alcohol_volume = bottle_size - oil_volume`
   - Per material: `grams = (percentage / 100) × oil_volume`
   - Display: oil volume, alcohol volume, final concentration

3. **1.2c — Formula validation**
   - Warning if total % ≠ 100%
   - Warning if any material exceeds `usage_max`
   - Warning if any material below `usage_min`
   - Color-coded: green (OK), yellow (warning), red (error)

**Files to modify**:
- `webapp/public/app.js` — formula logic
- `webapp/public/index.html` — formula panel HTML
- `webapp/public/style.css` — formula panel styles

---

### Task 1.3: Layer & Role Assignment UI

**Goal**: User can assign top/heart/base layer and functional role per material

**Subtasks**:

1. **1.3a — Layer visualization**
   - Show formula items grouped by layer (top → heart → base)
   - Visual pyramid or stacked bar showing layer distribution
   - Target: top 15-25%, heart 40-60%, base 20-35%

2. **1.3b — Role badges**
   - Show role badges on each formula item (🔥 radiator, 🔗 bridger, 📌 fixative)
   - Color-coded by role type
   - Auto-suggest role based on material properties

3. **1.3c — Layer summary**
   - Show percentage breakdown per layer
   - Show functional role coverage (has radiator? has fixative? has bridger?)
   - Warning if missing required roles

**Files to modify**:
- `webapp/public/app.js` — layer/role logic
- `webapp/public/index.html` — formula panel HTML
- `webapp/public/style.css` — layer visualization styles

---

## Phase 2: AI Theme Interpreter & Auto-Selection

### Task 2.1: AI Theme Interpreter

**Goal**: Convert natural language → structured olfactory intent

**Subtasks**:

1. **2.1a — Theme input UI**
   - Text input: "blooming rose after rain"
   - Optional: theme distribution sliders (rose 75%, rain 20%, petrichor 5%)
   - Optional: olfactive family selector

2. **2.1b — LLM theme parsing**
   - Send theme text to LLM API
   - Parse response into: `{ concept: weight }` pairs
   - Map concepts to `abc_category` families
   - Example: "blooming rose after rain" → `{ floral: 0.75, green: 0.20, aliphatic: 0.05 }`

3. **2.1c — Accord decomposition**
   - Break down each concept into sub-accords
   - "rose" → { rose_absolute, phenyl_ethyl_alcohol, citronellol, geraniol }
   - Use existing material data to find matching materials

**Files to create**:
- `webapp/server.js` — `/api/theme/parse` endpoint
- `webapp/public/app.js` — theme input UI

---

### Task 2.2: Material Selection Engine

**Goal**: Auto-select materials based on theme intent

**Subtasks**:

1. **2.2a — Semantic matching**
   - Match theme concepts to material `odour` descriptions
   - Match theme concepts to material `abc_category`
   - Score each material: concept_match × abc_match × relevance

2. **2.2b — Layer balancing**
   - Ensure selected materials cover top, heart, base layers
   - Enforce minimum: top ≥ 1, heart ≥ 2, base ≥ 2
   - Auto-fill missing layers from candidate pool

3. **2.2c — Role auto-injection**
   - Check if formula has radiator, fixative, bridger
   - If missing radiator → inject Iso E Super or Ambroxan
   - If missing bridger → inject Hedione or Linalool
   - If missing fixative → inject Patchouli, Vetiver, or Musk

4. **2.2d — Compatibility scoring**
   - Basic compatibility: same `abc_category` → +1
   - `blends_well_with` match → +2
   - Known conflicts (hardcoded matrix) → -3

**Files to create**:
- `webapp/server.js` — `/api/formula/generate` endpoint
- `data/compatibility_matrix.json` — known material interactions

---

## Phase 3: Formula Engine & Simulation

### Task 3.1: Master Formula Engine

**Goal**: Calculate material weights using PRD equation

**Subtasks**:

1. **3.1a — Implement G_raw equation**
   ```
   G_raw = (L × W × I × S × OV^0.6 × T^0.4 × D × P × Rf) / SUM(all materials)
   ```
   - L = theme weight (from theme interpreter)
   - W = structural weight (top=0.2, heart=0.5, base=0.3)
   - I = impact balancer (1 / max(OV_in_formula))
   - S = safety factor (min(1, usage_max / proposed_amount))
   - OV, T, D, P, Rf = from enriched material data

2. **3.1b — Diffusion modes**
   - soft: G_final = G_raw × 1.10
   - normal: G_final = G_raw × 1.20
   - beast: G_final = G_raw × 1.30

3. **3.1c — Constraint engine**
   - Enforce: G_i ≤ usage_max
   - Enforce: G_i ≥ practical_threshold (0.001%)
   - Auto-dilute: if G_i < 0.01g → suggest 10% or 1% dilution

4. **3.1d — Interaction matrix**
   - Apply corrections: G_i = G_i × C_interaction
   - Positive pairs: Hedione + Floral → ×1.2
   - Negative pairs: Calone + Rose → ×0.8
   - Load from `data/compatibility_matrix.json`

**Files to create**:
- `webapp/server.js` — `/api/formula/calculate` endpoint
- `data/formula_engine.js` — core calculation logic
- `data/compatibility_matrix.json` — interaction pairs

---

### Task 3.2: Simulation Engine

**Goal**: Simulate evaporation curve over time

**Subtasks**:

1. **3.2a — Evaporation calculation**
   - For each material: `Intensity(t) = G_i × e^(-k_i × t)`
   - k_i = evaporation_constant (from Task 1.1b)
   - Calculate at t = 0, 1, 2, 4, 8, 12, 24, 48 hours

2. **3.2b — Phase detection**
   - Opening phase (0-2 hrs): materials with intensity > 50%
   - Heart phase (2-8 hrs): materials with peak intensity
   - Drydown phase (8-48 hrs): remaining materials

3. **3.2c — Visualization**
   - Line chart: intensity over time per material
   - Stacked area: total intensity over time
   - Phase markers: opening → heart → drydown

4. **3.2d — Performance scores**
   - Longevity: time until total intensity < 10%
   - Projection: max total intensity in first 2 hrs
   - Sillage: area under curve (0-8 hrs)
   - Balance: std deviation of layer percentages
   - Diffusion: average diffusion_factor weighted by %

**Files to create**:
- `webapp/public/app.js` — simulation visualization
- `webapp/public/style.css` — chart styles
- `data/simulation.js` — evaporation calculation

---

## Phase 4: Advanced Features

### Task 4.1: Semantic Embeddings

**Goal**: Generate vector embeddings for each material

**Subtasks**:

1. **4.1a — Batch LLM embedding generation**
   - For each material, create text: "{name}: {odour}. {description}. Family: {abc_category}"
   - Send to embedding API (OpenAI, local model)
   - Store as `semantic_embedding` array

2. **4.1b — Similarity search**
   - Cosine similarity between material embeddings
   - "Find materials similar to Hedione"
   - Use for auto-suggestion in formula builder

3. **4.1c — Compatibility tags**
   - Cluster materials by embedding similarity
   - Tag materials with cluster IDs
   - Same cluster → compatible, different cluster → potential conflict

**Files to create**:
- `data/generate_embeddings.js` — batch embedding script
- `data/material_embeddings.json` — stored embeddings

---

### Task 4.2: Perfume DNA Matching

**Goal**: Reverse-engineer existing perfumes

**Subtasks**:

1. **4.2a — Reference database**
   - Build database of known perfume compositions
   - Each perfume: { name, brand, materials: [{ name, % }] }

2. **4.2b — DNA comparison**
   - Compare user formula against reference database
   - Similarity score based on material overlap + percentage match

3. **4.2c — Accord learning**
   - Track which material combinations users rate highly
   - Build accord database from user feedback

---

## Implementation Order & Dependencies

```
Phase 1 (Week 1-2)
├── 1.1 Data Enrichment ← BLOCKS everything else
│   ├── 1.1a Parse numerics
│   ├── 1.1b evaporation_constant
│   ├── 1.1c threshold_factor
│   ├── 1.1d diffusion_factor
│   ├── 1.1e persistence_factor
│   ├── 1.1f structural_role
│   ├── 1.1g functional_roles
│   └── 1.1h role_factor
├── 1.2 Formula UI (percentages + grams)
│   ├── 1.2a Percentage input
│   ├── 1.2b Batch calculator
│   └── 1.2c Validation warnings
└── 1.3 Layer & Role UI
    ├── 1.3a Layer visualization
    ├── 1.3b Role badges
    └── 1.3c Layer summary

Phase 2 (Week 3-4)
├── 2.1 AI Theme Interpreter
│   ├── 2.1a Theme input UI
│   ├── 2.1b LLM parsing
│   └── 2.1c Accord decomposition
└── 2.2 Material Selection
    ├── 2.2a Semantic matching
    ├── 2.2b Layer balancing
    ├── 2.2c Role auto-injection
    └── 2.2d Compatibility scoring

Phase 3 (Week 5-6)
├── 3.1 Formula Engine
│   ├── 3.1a G_raw equation
│   ├── 3.1b Diffusion modes
│   ├── 3.1c Constraint engine
│   └── 3.1d Interaction matrix
└── 3.2 Simulation Engine
    ├── 3.2a Evaporation calculation
    ├── 3.2b Phase detection
    ├── 3.2c Visualization
    └── 3.2d Performance scores

Phase 4 (Week 7+)
├── 4.1 Semantic Embeddings
│   ├── 4.1a Batch generation
│   ├── 4.1b Similarity search
│   └── 4.1c Compatibility tags
└── 4.2 Perfume DNA Matching
    ├── 4.2a Reference database
    ├── 4.2b DNA comparison
    └── 4.2c Accord learning
```

## Quick Wins (Can implement today)

1. **Task 1.1** — Data enrichment script. Run once, enrich all 1208 materials.
2. **Task 1.2a** — Add percentage input to formula panel.
3. **Task 1.2b** — Add batch calculator (bottle size + concentration).
4. **Task 1.2c** — Add usage constraint warnings.

These 4 items alone transform the app from "material library" to "formula builder" — no AI needed, all rule-based, all data already available.
