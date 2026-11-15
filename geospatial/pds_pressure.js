/**
 * PDS Mars Atmospheric Data Module (DEPRECATED & SUPERSEDED)
 * 
 * In accordance with Master Prompt:
 * Direct dependencies on climate TAB files (2025073120_DDR.TXT / 2025073120_DDR_LBL.TXT)
 * and associated climate layers (dust, temperature, optical depth, water ice, water vapor, co2 ice)
 * have been completely removed.
 *
 * Atmospheric pressure is now computed using the shared elevation-derived barometric model
 * defined in geospatial/atmospheric_pressure.js:
 *   P(h) = P0 * exp( - (M_CO2 * g * (h - h0)) / (R * T) )
 */

import { 
  calculateElevationPressure, 
  evaluatePressureSafety,
  getAtmosphericModelConfig,
  setAtmosphericModelConfig,
  ATMOSPHERIC_MODEL_CONFIG 
} from './atmospheric_pressure.js';

export const PDS_PRESSURE_METADATA = {
  status: "DEPRECATED",
  replaced_by: "geospatial/atmospheric_pressure.js",
  model: "Mars Isothermal Barometric Hydrostatic Formulation P(h)",
  provenance_category: "MODELED_ESTIMATE",
  is_in_situ_measurement: false,
  note: "Legacy PDS DDR climate TAB layers are deprecated and inactive. All atmospheric pressure queries are computed deterministically from MOLA elevation via the hydrostatic barometric equation."
};

export const PDS_CLIMATE_VARIABLES = {};

export function samplePdsAtmosphericPressure(lat, lon, elev = null) {
  const p = calculateElevationPressure(elev);
  return {
    dataValid: p.dataValid,
    pressureValue: p.pressurePa,
    pressurePa: p.pressurePa,
    pressureMbar: p.pressureMbar,
    status: p.status,
    isModeled: true,
    source: "Barometric Model P(h)",
    missingDataReason: p.missingDataReason
  };
}

export function samplePdsClimateVariable(varId, lat, lon, elev = null) {
  if (varId === 'pressure') {
    const p = calculateElevationPressure(elev);
    return {
      dataValid: p.dataValid,
      value: p.pressurePa,
      unit: "Pa",
      varId: "pressure",
      status: p.status,
      isModeled: true
    };
  }
  return {
    dataValid: false,
    value: null,
    status: "REMOVED",
    missingDataReason: `Climate variable '${varId}' from DDR TAB data has been removed.`
  };
}

export function findNearestClimateSounding() {
  return null;
}

export { 
  calculateElevationPressure, 
  evaluatePressureSafety, 
  getAtmosphericModelConfig, 
  setAtmosphericModelConfig, 
  ATMOSPHERIC_MODEL_CONFIG 
};
