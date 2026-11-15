/**
 * NASA Mars Explorer - Elevation-Derived Atmospheric Pressure Model
 *
 * Implements a physics-based, barometric atmospheric pressure model for Mars:
 *   P(h) = P0 * exp( - (M_CO2 * g * (h - h0)) / (R * T) )
 *
 * Equivalently, using scale height H = (R * T) / (M_CO2 * g):
 *   P(h) = P0 * exp( - (h - h0) / H )
 *
 * SCIENTIFIC FOUNDATION & REFERENCE PARAMETERS:
 * - P0: 610.0 Pa (6.10 mbar). Established by NASA Viking missions and MGS MOLA geodesy team
 *       as the reference surface atmospheric pressure at zero datum (h0 = 0 m).
 *       Historically near the triple point of pure water (611.65 Pa).
 * - h0: 0.0 m (MOLA Areoid elevation datum).
 * - T:  210.0 K (-63.15 °C). Climatological mean representative temperature of Mars's lower troposphere.
 *       Label: Isothermal atmospheric approximation.
 * - M_CO2: 0.04401 kg/mol (Molar mass of carbon dioxide, ~95.3% of Mars atmosphere).
 * - g:  3.71 m/s² (Standard Mars surface gravitational acceleration, IAU value).
 * - R:  8.314462618 J/(mol·K) (Universal gas constant, CODATA 2018).
 *
 * PHYSICAL LIMITATIONS:
 * This model calculates the altitude-dependent hydrostatic pressure component under chosen reference
 * conditions. It does NOT model seasonal CO2 polar freeze-out (~30% annual pressure variation),
 * diurnal thermal tides, or regional dust storm atmospheric expansion.
 * It is clearly designated as: Atmospheric Pressure (Modeled).
 */

// Configurable model state
export const ATMOSPHERIC_MODEL_CONFIG = {
  // Reference parameters
  p0_pa: 610.0,            // Reference pressure P0 in Pa at reference elevation h0
  h0_m: 0.0,               // Reference elevation h0 in meters (MOLA datum = 0 m)
  temperature_k: 210.0,    // Representative atmospheric temperature T in Kelvin (isothermal)
  molar_mass_kg_mol: 0.04401, // Molar mass of CO2 in kg/mol
  gravity_m_s2: 3.71,      // Mars surface gravitational acceleration g in m/s²
  gas_constant_j_mol_k: 8.314462618, // Universal gas constant R

  // Model metadata & scientific provenance classification
  model_name: "Mars Isothermal Barometric Hydrostatic Formulation",
  model_type: "PHYSICS_BASED_MODELED_ESTIMATE",
  provenance_category: "MODELED_ESTIMATE",
  is_in_situ_measurement: false,
  citation: "Smith et al. (2001) / NASA MGS MOLA Geodesy Reference Datum (P0 = 610 Pa at h0 = 0 m)",
  assumptions: [
    "Isothermal lower troposphere (T = 210.0 K = -63.15 °C)",
    "Pure CO2 molar mass approximation (M = 0.04401 kg/mol, ~95.3% CO2)",
    "Hydrostatic equilibrium under uniform surface gravity (g = 3.71 m/s²)"
  ],
  unmodeled_effects: [
    "Seasonal CO2 polar cap condensation/sublimation cycle (~25-30% annual pressure swing with solar longitude Ls)",
    "Tropospheric vertical temperature lapse rate (~ -2.5 K/km)",
    "Diurnal thermal tides and regional dust storm barometric perturbations"
  ]
};

// Cache for calculated scale height
let cachedScaleHeightM = null;

// Subscribers for model parameter changes
const configChangeListeners = [];

/**
 * Calculate Mars atmospheric scale height: H = (R * T) / (M_CO2 * g)
 * @param {Object} [cfg] - Optional configuration overrides
 * @returns {number} Scale height in meters
 */
export function calculateScaleHeight(cfg = ATMOSPHERIC_MODEL_CONFIG) {
  const R = cfg.gas_constant_j_mol_k;
  const T = cfg.temperature_k;
  const M = cfg.molar_mass_kg_mol;
  const g = cfg.gravity_m_s2;
  return (R * T) / (M * g);
}

/**
 * Get current scale height in meters
 */
export function getScaleHeightM() {
  if (cachedScaleHeightM === null) {
    cachedScaleHeightM = calculateScaleHeight(ATMOSPHERIC_MODEL_CONFIG);
  }
  return cachedScaleHeightM;
}

/**
 * Retrieve a copy of the active atmospheric model configuration
 * @returns {Object}
 */
export function getAtmosphericModelConfig() {
  return { ...ATMOSPHERIC_MODEL_CONFIG, scale_height_m: getScaleHeightM() };
}

/**
 * Update atmospheric model configuration and invalidate caches
 * @param {Object} updates
 */
export function setAtmosphericModelConfig(updates = {}) {
  let changed = false;
  for (const [key, val] of Object.entries(updates)) {
    if (key in ATMOSPHERIC_MODEL_CONFIG && typeof val === 'number' && !isNaN(val)) {
      ATMOSPHERIC_MODEL_CONFIG[key] = val;
      changed = true;
    }
  }
  if (changed) {
    cachedScaleHeightM = calculateScaleHeight(ATMOSPHERIC_MODEL_CONFIG);
    // Invalidate listeners (e.g. caches in 2D and 3D)
    configChangeListeners.forEach(listener => {
      try { listener(getAtmosphericModelConfig()); } catch (e) { console.warn('Config change listener error:', e); }
    });
  }
  return getAtmosphericModelConfig();
}

/**
 * Register a listener for model configuration changes
 * @param {Function} callback
 */
export function onAtmosphericModelConfigChange(callback) {
  if (typeof callback === 'function') {
    configChangeListeners.push(callback);
  }
}

export const SPACESUIT_PRESSURE_LIMITS = {
  P_MIN_SAFE: 400.0,
  P_MAX_SAFE: 611.65,
  P_MIN_APPLICABLE: 180.0,
  P_MAX_APPLICABLE: 1150.0
};

/**
 * Evaluate spacesuit pressure safety against NASA xEMU operating standards
 * Supports either:
 * - evaluatePressureSafety(pressurePa)
 * - evaluatePressureSafety(lat, lon, elevationMeters)
 *
 * @param {number|null} pressureOrLat
 * @param {number} [lon]
 * @param {number} [elev]
 * @returns {Object} Pressure safety evaluation object (implements toString() for string comparison)
 */
export function evaluatePressureSafety(pressureOrLat, lon, elev) {
  let pPa = null;
  if (typeof pressureOrLat === 'number') {
    if (lon === undefined && elev === undefined) {
      pPa = pressureOrLat;
    } else if (typeof elev === 'number') {
      const ep = calculateElevationPressure(elev);
      pPa = ep.pressurePa;
    } else {
      pPa = null;
    }
  } else if (pressureOrLat === null || pressureOrLat === undefined) {
    pPa = null;
  }

  let status = 'UNKNOWN';
  let score = null;
  if (pPa !== null && !isNaN(pPa)) {
    if (pPa < 180.0 || pPa > 1150.0) {
      status = 'UNSAFE';
      score = 0;
    } else if ((pPa >= 180.0 && pPa < 400.0) || (pPa > 611.65 && pPa <= 1150.0)) {
      status = 'CAUTION';
      score = 70;
    } else {
      status = 'SAFE';
      score = 100;
    }
  }

  const pMbar = pPa !== null ? pPa / 100.0 : null;
  return {
    dataValid: pPa !== null,
    pressurePa: pPa,
    pressureValue: pPa,
    pressureMbar: pMbar,
    status: status,
    pressureStatus: status,
    score: score,
    safetyScore: score,
    isModeled: true,
    source: "Barometric Model P(h)",
    explanation: pPa !== null ? `Modeled pressure ${pPa.toFixed(1)} Pa` : "PRESSURE UNKNOWN — ELEVATION DATA UNAVAILABLE",
    toString: () => status
  };
}

/**
 * Calculate modeled atmospheric pressure from elevation:
 *   P(h) = P0 * exp( - (M_CO2 * g * (h - h0)) / (R * T) )
 *
 * @param {number|null} elevationMeters - Elevation relative to MOLA datum (in meters)
 * @param {Object} [customConfig] - Optional custom configuration
 * @returns {Object} Modeled pressure result
 */
export function calculateElevationPressure(elevationMeters, customConfig = null) {
  // Missing / Invalid Elevation Guard
  if (
    elevationMeters === null ||
    elevationMeters === undefined ||
    isNaN(elevationMeters) ||
    elevationMeters === -9999 ||
    elevationMeters === -32768
  ) {
    return {
      dataValid: false,
      pressurePa: null,
      pressureMbar: null,
      pressureKpa: null,
      status: 'UNKNOWN',
      elevationMeters: null,
      isModeled: true,
      modelType: 'Mars Isothermal Barometric Model',
      missingDataReason: 'PRESSURE UNKNOWN — ELEVATION DATA UNAVAILABLE',
      formattedText: 'PRESSURE UNKNOWN — ELEVATION DATA UNAVAILABLE'
    };
  }

  const cfg = customConfig ? { ...ATMOSPHERIC_MODEL_CONFIG, ...customConfig } : ATMOSPHERIC_MODEL_CONFIG;
  const H = calculateScaleHeight(cfg);
  const deltaH = elevationMeters - cfg.h0_m;

  // Barometric exponential equation
  const pPa = cfg.p0_pa * Math.exp(-deltaH / H);
  const pMbar = pPa / 100.0;
  const pKpa = pPa / 1000.0;
  const safetyStatus = evaluatePressureSafety(pPa);

  return {
    dataValid: true,
    pressurePa: pPa,
    pressureMbar: pMbar,
    pressureKpa: pKpa,
    status: safetyStatus,
    elevationMeters: elevationMeters,
    scaleHeightM: H,
    referencePressurePa: cfg.p0_pa,
    referenceElevationM: cfg.h0_m,
    isModeled: true,
    modelType: 'Mars Isothermal Barometric Model',
    missingDataReason: null,
    formattedText: `${pPa.toFixed(1)} Pa (${pMbar.toFixed(2)} mbar) [Barometric Model]`
  };
}

/**
 * Helper to sample elevation from a raster/sampler and compute modeled pressure
 * @param {number} lat - Latitude in degrees (-90 to +90)
 * @param {number} lon - Longitude in degrees (0 to 360)
 * @param {Object|Function} elevationSampler - Sampler instance with .sample(lat, lon) or function(lat, lon)
 * @returns {Object} Modeled pressure result
 */
export function sampleAtmosphericPressure(lat, lon, elevationSampler) {
  if (!elevationSampler) {
    return calculateElevationPressure(null);
  }

  let elev = null;
  try {
    if (typeof elevationSampler.sample === 'function') {
      const s = elevationSampler.sample(lat, lon);
      elev = s && !s.isNoData ? s.value : null;
    } else if (typeof elevationSampler === 'function') {
      const s = elevationSampler(lat, lon);
      elev = typeof s === 'object' && s !== null ? (s.isNoData ? null : s.elevation ?? s.value) : s;
    }
  } catch (err) {
    console.warn('Elevation sampling error in sampleAtmosphericPressure:', err);
    elev = null;
  }

  return calculateElevationPressure(elev);
}
