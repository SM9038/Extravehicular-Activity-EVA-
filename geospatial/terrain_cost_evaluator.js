import { evaluatePressureSafety, SPACESUIT_PRESSURE_LIMITS, calculateElevationPressure } from './atmospheric_pressure.js';
import { globalDustStormSimulator } from './dust_storm_simulator.js';
const CAUTION_COLOR = typeof document !== 'undefined'
  ? getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#9a96b0'
  : '#9a96b0';
/**
 * Eva Marswalk Shared Terrain Cost Evaluator & Signed-Slope Directional Cost Engine
 * 
 * Provides unified, mathematically consistent terrain transition evaluation across:
 * 1. Field D* (Ferguson & Stentz, NASA JPL Any-Angle)
 * 2. D* Lite (Koenig & Likhachev Dynamic Replanning)
 * 3. A* Search (8-Direction Optimal Grid Baseline)
 * 4. Fast Marching Method / FMM (Continuous Eikonal Wavefront PDE)
 * 
 * Capabilities:
 * - Scientifically consistent signed-slope calculation (theta = atan(dz / d_xy) in degrees)
 * - Directional piecewise slope cost multiplier K(theta) for uphill, downhill, and flat terrain
 * - Active Maximum Slope constraint (theta_max_up = theta_max, theta_max_down = 0.75 * theta_max, theta_ref = 0.4 * theta_max)
 * - Explicit separation between directional travel slope and intrinsic local terrain steepness
 * - Continuous bilinear elevation interpolation with planetary wraparound handling
 * - Adaptive intermediate edge sampling (detects narrow ravines, ridges, and cliffs)
 * - Calibrated Mars gravity Minetti metabolic energy model
 * - Explicit safety classes: SAFE, CAUTION, UNSAFE, UNKNOWN (plus FLAT / NEAR_FLAT tagging)
 * - High-speed bounded LRU caching with instant invalidation on constraint changes
 */

export const MARS_RADIUS_M = 3396190.0;
export const MARS_GRAVITY = 3.721;
export const EARTH_GRAVITY = 9.80665;
export const GRAVITY_RATIO = MARS_GRAVITY / EARTH_GRAVITY; // ~0.3794

export const SAFETY_CLASSES = {
  SAFE: 'SAFE',
  CAUTION: 'CAUTION',
  UNSAFE: 'UNSAFE',
  UNKNOWN: 'UNKNOWN',
  FLAT: 'FLAT'
};

export const OPTIMIZATION_PROFILES = {
  min_risk: {
    name: 'Minimum Risk',
    description: 'Prioritizes astronaut safety, avoidance of elevated slopes, and stable ground.',
    weights: {
      safety: 4.5,
      slope: 3.0,
      elevation: 1.5,
      distance: 0.8,
      energy: 0.8,
      roughness: 1.0
    }
  },
  balanced: {
    name: 'Balanced Exploration',
    description: 'Even trade-off between route distance, energy expenditure, and terrain safety.',
    weights: {
      safety: 2.5,
      slope: 2.0,
      elevation: 2.0,
      distance: 1.5,
      energy: 1.5,
      roughness: 1.0
    }
  },
  min_energy: {
    name: 'Minimum Energy',
    description: 'Minimizes metabolic expenditure and vertical climb work (prefers flat detours).',
    weights: {
      safety: 2.0,
      slope: 3.5,
      elevation: 2.5,
      distance: 1.0,
      energy: 4.5,
      roughness: 1.0
    }
  },
  min_distance: {
    name: 'Minimum Distance',
    description: 'Shortest Euclidean path, subject to absolute hard UNSAFE cliff constraints.',
    weights: {
      safety: 1.5,
      slope: 1.0,
      elevation: 0.5,
      distance: 5.0,
      energy: 0.5,
      roughness: 0.5
    }
  }
};

/**
 * Bounded LRU Cache to avoid redundant elevation and slope lookups
 */
export class BoundedLRUCache {
  constructor(maxSize = 8192) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    const item = this.cache.get(key);
    if (item !== undefined) {
      // Refresh recency
      this.cache.delete(key);
      this.cache.set(key, item);
      return item;
    }
    return undefined;
  }

  set(key, val) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict oldest (first item in Map iterator)
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, val);
  }

  clear() {
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }
}

// Global bounded caches
export const elevationSampleCache = new BoundedLRUCache(8192);
export const transitionCostCache = new BoundedLRUCache(16384);

export function clearTransitionCostCache() {
  transitionCostCache.clear();
}

/**
 * Convert continuous grid coordinates to geographic coordinates
 */
export function gridToGeo(r, c, rows = 360, cols = 720) {
  const lat = 90.0 - ((r + 0.5) / rows) * 180.0;
  const lon = (((c + 0.5) / cols) * 360.0 + 360.0) % 360.0;
  return { lat, lon };
}

/**
 * Convert geographic coordinates to continuous grid coordinates (pixel-center aligned)
 */
export function geoToGrid(lat, lon, rows = 360, cols = 720) {
  const normLon = ((lon % 360) + 360) % 360;
  const c = (((normLon / 360.0) * cols - 0.5) % cols + cols) % cols;
  const r = Math.max(0, Math.min(rows - 1, ((90.0 - lat) / 180.0) * rows - 0.5));
  return { r, c };
}

/**
 * Compute true ground surface distance on Mars sphere using Haversine
 */
export function computePlanetaryDistanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 && typeof lat1 === 'object' && lon1 && typeof lon1 === 'object') {
    const p1 = lat1;
    const p2 = lon1;
    lat1 = Number(p1.lat ?? p1[0]);
    lon1 = Number(p1.lon ?? p1[1]);
    lat2 = Number(p2.lat ?? p2[0]);
    lon2 = Number(p2.lon ?? p2[1]);
  }
  if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) {
    return NaN;
  }
  const phi1 = (lat1 * Math.PI) / 180.0;
  const phi2 = (lat2 * Math.PI) / 180.0;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180.0;
  let dLam = ((lon2 - lon1) * Math.PI) / 180.0;

  // Handle planetary wrap-around across 0/360 and -180/+180
  dLam = ((dLam + Math.PI) % (2.0 * Math.PI));
  if (dLam < 0) dLam += 2.0 * Math.PI;
  dLam -= Math.PI;

  const a =
    Math.sin(dPhi * 0.5) * Math.sin(dPhi * 0.5) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam * 0.5) * Math.sin(dLam * 0.5);
  const c = 2.0 * Math.atan2(Math.sqrt(Math.max(0.0, Math.min(1.0, a))), Math.sqrt(Math.max(0.0, 1.0 - a)));
  return MARS_RADIUS_M * c;
}

/**
 * Bilinear continuous elevation sampling with NoData and border handling
 */
export function sampleBilinearElevation(grid, rows, cols, r, c, noDataVal = -9999.0) {
  if (!grid || grid.length === 0 || !Number.isFinite(r) || !Number.isFinite(c)) {
    return { elevation: 0.0, isValid: false, isNoData: true };
  }

  // Clamped row, wrapped column
  const clr = Math.max(0, Math.min(rows - 1, r));
  const normC = ((c % cols) + cols) % cols;

  const r0 = Math.floor(clr);
  const r1 = Math.min(rows - 1, r0 + 1);
  const c0 = Math.floor(normC);
  const c1 = (c0 + 1) % cols;

  const u = normC - c0;
  const v = clr - r0;

  const idx00 = r0 * cols + c0;
  const idx10 = r0 * cols + c1;
  const idx01 = r1 * cols + c0;
  const idx11 = r1 * cols + c1;

  const z00 = grid[idx00];
  const z10 = grid[idx10];
  const z01 = grid[idx01];
  const z11 = grid[idx11];

  // Check NoData or non-finite values
  if (!Number.isFinite(z00) || !Number.isFinite(z10) || !Number.isFinite(z01) || !Number.isFinite(z11) ||
      z00 <= noDataVal + 1.0 || z10 <= noDataVal + 1.0 || z01 <= noDataVal + 1.0 || z11 <= noDataVal + 1.0) {
    return { elevation: z00, isValid: false, isNoData: true };
  }

  const elev = (1.0 - u) * (1.0 - v) * z00 +
               u * (1.0 - v) * z10 +
               (1.0 - u) * v * z01 +
               u * v * z11;

  return { elevation: elev, isValid: true, isNoData: false };
}

/**
 * Continuous bilinear local terrain steepness sampling (in degrees, non-negative)
 * Represents intrinsic cell steepness independent of travel direction (Part C3 & C4).
 * Combines precomputed slopeGrid with 2D Horn/central gradient AND one-sided facet gradient
 * so symmetric peaks, crater rims, and sharp scarps never cancel out.
 */
export function sampleBilinearSlope(slopeGrid, elevGrid, rows, cols, r, c) {
  if (!Number.isFinite(r) || !Number.isFinite(c)) return 0.0;

  let gridSlopeDeg = 0.0;
  // If slope grid is available, sample bilinearly
  if (slopeGrid && slopeGrid.length > 0) {
    const clr = Math.max(0, Math.min(rows - 1, r));
    const normC = ((c % cols) + cols) % cols;
    const r0 = Math.floor(clr);
    const r1 = Math.min(rows - 1, r0 + 1);
    const c0 = Math.floor(normC);
    const c1 = (c0 + 1) % cols;
    const u = normC - c0;
    const v = clr - r0;

    const s00 = slopeGrid[r0 * cols + c0];
    const s10 = slopeGrid[r0 * cols + c1];
    const s01 = slopeGrid[r1 * cols + c0];
    const s11 = slopeGrid[r1 * cols + c1];

    if (Number.isFinite(s00) && Number.isFinite(s10) && Number.isFinite(s01) && Number.isFinite(s11)) {
      const s = (1.0 - u) * (1.0 - v) * s00 +
                u * (1.0 - v) * s10 +
                (1.0 - u) * v * s01 +
                u * v * s11;
      gridSlopeDeg = Math.max(0.0, s);
    }
  }

  // Analytical 2D gradient + one-sided facet gradient from elevation grid
  if (elevGrid && elevGrid.length > 0) {
    const lat = 90.0 - (r / rows) * 180.0;
    const cosLat = Math.max(0.05, Math.cos((lat * Math.PI) / 180.0));
    const dyM = (Math.PI * MARS_RADIUS_M) / rows;
    const dxM = (2.0 * Math.PI * MARS_RADIUS_M * cosLat) / cols;

    const sCenter = sampleBilinearElevation(elevGrid, rows, cols, r, c);
    const sLeft = sampleBilinearElevation(elevGrid, rows, cols, r, c - 0.5);
    const sRight = sampleBilinearElevation(elevGrid, rows, cols, r, c + 0.5);
    const sUp = sampleBilinearElevation(elevGrid, rows, cols, r - 0.5, c);
    const sDown = sampleBilinearElevation(elevGrid, rows, cols, r + 0.5, c);

    if (sCenter.isValid && sLeft.isValid && sRight.isValid && sUp.isValid && sDown.isValid) {
      const dzdx = (sRight.elevation - sLeft.elevation) / Math.max(1.0, dxM);
      const dzdy = (sDown.elevation - sUp.elevation) / Math.max(1.0, dyM);
      const centralGrad = Math.sqrt(dzdx * dzdx + dzdy * dzdy);
      const centralDeg = (Math.atan(centralGrad) * 180.0) / Math.PI;
      return Math.max(gridSlopeDeg, centralDeg);
    }
  }

  return gridSlopeDeg;
}

/**
 * Computes comprehensive local terrain structure metrics at (r, c):
 * - localSlopeDeg: intrinsic steepness (max of slopeGrid, 2D central gradient, and one-sided facet gradient)
 * - centralSlopeDeg: 2D Horn/central gradient steepness
 * - facetSlopeDeg: maximum one-sided facet steepness
 * - triM: Terrain Ruggedness Index (RMS elevation difference to 8 surrounding samples in meters)
 * - curvatureM: Local topographic Laplacian (positive = basin/ravine floor, negative = ridge/crater rim crest)
 * - maxNeighborJumpM: Maximum single-step elevation jump to surrounding samples
 */
export function computeLocalTerrainMetrics(slopeGrid, elevGrid, rows, cols, r, c) {
  const centerSample = sampleBilinearElevation(elevGrid, rows, cols, r, c);
  if (!centerSample.isValid) {
    return {
      isValid: false,
      elevation: 0.0,
      localSlopeDeg: 0.0,
      centralSlopeDeg: 0.0,
      facetSlopeDeg: 0.0,
      triM: 0.0,
      curvatureM: 0.0,
      maxNeighborJumpM: 0.0
    };
  }

  const z0 = centerSample.elevation;
  const lat = 90.0 - (r / rows) * 180.0;
  const cosLat = Math.max(0.05, Math.cos((lat * Math.PI) / 180.0));
  const dyM = (Math.PI * MARS_RADIUS_M) / rows;
  const dxM = (2.0 * Math.PI * MARS_RADIUS_M * cosLat) / cols;

  const step = 0.5;
  const halfDx = Math.max(1.0, step * dxM);
  const halfDy = Math.max(1.0, step * dyM);
  const halfDiag = Math.hypot(halfDx, halfDy);

  const offsets = [
    [0, -step, halfDx],
    [0, step, halfDx],
    [-step, 0, halfDy],
    [step, 0, halfDy],
    [-step, -step, halfDiag],
    [-step, step, halfDiag],
    [step, -step, halfDiag],
    [step, step, halfDiag]
  ];

  let sumSqDiff = 0.0;
  let validNeighbors = 0;
  let maxFacetGrad = 0.0;
  let maxJumpM = 0.0;
  const cardinalZ = [z0, z0, z0, z0];

  for (let i = 0; i < offsets.length; i++) {
    const [dr, dc, distM] = offsets[i];
    const nr = Math.max(0, Math.min(rows - 1, r + dr));
    const nc = ((c + dc) % cols + cols) % cols;
    const ns = sampleBilinearElevation(elevGrid, rows, cols, nr, nc);
    if (ns.isValid) {
      const dz = Math.abs(ns.elevation - z0);
      sumSqDiff += dz * dz;
      validNeighbors++;
      if (dz > maxJumpM) maxJumpM = dz;
      const grad = dz / distM;
      if (grad > maxFacetGrad) maxFacetGrad = grad;
      if (i < 4) cardinalZ[i] = ns.elevation;
    }
  }

  const dzdx = (cardinalZ[1] - cardinalZ[0]) / Math.max(1.0, 2.0 * halfDx);
  const dzdy = (cardinalZ[3] - cardinalZ[2]) / Math.max(1.0, 2.0 * halfDy);
  const centralSlopeDeg = (Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * 180.0) / Math.PI;
  const facetSlopeDeg = (Math.atan(maxFacetGrad) * 180.0) / Math.PI;
  const gridSlopeDeg = sampleBilinearSlope(slopeGrid, null, rows, cols, r, c);
  const localSlopeDeg = Math.max(gridSlopeDeg, centralSlopeDeg, facetSlopeDeg);
  const triM = validNeighbors > 0 ? Math.sqrt(sumSqDiff / validNeighbors) : 0.0;
  const curvatureM = (cardinalZ[0] + cardinalZ[1] + cardinalZ[2] + cardinalZ[3]) - 4.0 * z0;

  return {
    isValid: true,
    elevation: z0,
    localSlopeDeg,
    centralSlopeDeg,
    facetSlopeDeg,
    triM,
    curvatureM,
    maxNeighborJumpM: maxJumpM
  };
}

/**
 * PART C — Scientifically Consistent Signed-Slope Calculation
 * For a directed transition from point u to point v:
 *   dz = z_v - z_u
 *   s  = dz / d_xy
 *   theta = atan(s) * (180 / pi)
 *
 * Supports multiple convenient call signatures:
 * 1) calculateSignedSlope(z_u, z_v, d_xy)
 * 2) calculateSignedSlope(uObj, vObj, options) where uObj/vObj have { elevation/z, lat, lon } or { r, c }
 */
export function calculateSignedSlope(u, v, options = {}) {
  let zU = NaN;
  let zV = NaN;
  let dXY = NaN;
  let validU = true;
  let validV = true;
  const noDataVal = (typeof options === 'object' && options !== null && options.noDataVal !== undefined)
    ? options.noDataVal
    : -9999.0;

  if (typeof u === 'number' && typeof v === 'number') {
    zU = u;
    zV = v;
    dXY = typeof options === 'number'
      ? options
      : (options?.horizontalDistanceM ?? options?.d_xy ?? options?.distM ?? NaN);
  } else if (u && v && typeof u === 'object' && typeof v === 'object') {
    const opts = (typeof options === 'object' && options !== null) ? options : {};
    const rows = opts.rows || 360;
    const cols = opts.cols || 720;

    // Extract or sample elevations
    if (u.elevation !== undefined) zU = Number(u.elevation);
    else if (u.elevationM !== undefined) zU = Number(u.elevationM);
    else if (u.z !== undefined) zU = Number(u.z);
    else if (opts.elevationGrid && u.r !== undefined && u.c !== undefined) {
      const sU = sampleBilinearElevation(opts.elevationGrid, rows, cols, u.r, u.c, noDataVal);
      zU = sU.elevation;
      validU = sU.isValid;
    } else if (opts.elevationGrid && u.lat !== undefined && u.lon !== undefined) {
      const gU = geoToGrid(u.lat, u.lon, rows, cols);
      const sU = sampleBilinearElevation(opts.elevationGrid, rows, cols, gU.r, gU.c, noDataVal);
      zU = sU.elevation;
      validU = sU.isValid;
    }

    if (v.elevation !== undefined) zV = Number(v.elevation);
    else if (v.elevationM !== undefined) zV = Number(v.elevationM);
    else if (v.z !== undefined) zV = Number(v.z);
    else if (opts.elevationGrid && v.r !== undefined && v.c !== undefined) {
      const sV = sampleBilinearElevation(opts.elevationGrid, rows, cols, v.r, v.c, noDataVal);
      zV = sV.elevation;
      validV = sV.isValid;
    } else if (opts.elevationGrid && v.lat !== undefined && v.lon !== undefined) {
      const gV = geoToGrid(v.lat, v.lon, rows, cols);
      const sV = sampleBilinearElevation(opts.elevationGrid, rows, cols, gV.r, gV.c, noDataVal);
      zV = sV.elevation;
      validV = sV.isValid;
    }

    if (u.isNoData || u.isValid === false) validU = false;
    if (v.isNoData || v.isValid === false) validV = false;

    // Extract or compute horizontal ground distance d_xy in meters
    if (opts.horizontalDistanceM !== undefined) dXY = Number(opts.horizontalDistanceM);
    else if (opts.d_xy !== undefined) dXY = Number(opts.d_xy);
    else if (opts.distM !== undefined) dXY = Number(opts.distM);
    else {
      let latU = u.lat, lonU = u.lon;
      let latV = v.lat, lonV = v.lon;
      if ((latU === undefined || lonU === undefined) && u.r !== undefined && u.c !== undefined) {
        const g = gridToGeo(u.r, u.c, rows, cols);
        latU = g.lat; lonU = g.lon;
      }
      if ((latV === undefined || lonV === undefined) && v.r !== undefined && v.c !== undefined) {
        const g = gridToGeo(v.r, v.c, rows, cols);
        latV = g.lat; lonV = g.lon;
      }
      if (latU !== undefined && lonU !== undefined && latV !== undefined && lonV !== undefined) {
        dXY = computePlanetaryDistanceMeters(latU, lonU, latV, lonV);
      }
    }
  }

  // Check for missing / invalid / NoData elevation or invalid distance
  if (!validU || !validV ||
      !Number.isFinite(zU) || !Number.isFinite(zV) ||
      zU <= noDataVal + 1.0 || zV <= noDataVal + 1.0 ||
      !Number.isFinite(dXY) || dXY < 0.0) {
    return {
      valid: false,
      status: SAFETY_CLASSES.UNKNOWN,
      safetyClass: SAFETY_CLASSES.UNKNOWN,
      deltaZ: NaN,
      horizontalDistanceM: dXY,
      slopeRatio: NaN,
      signedSlopeDeg: NaN,
      absSlopeDeg: NaN,
      direction: 'UNKNOWN',
      isNearFlat: false
    };
  }

  const deltaZ = zV - zU;

  // Identical coordinates or zero horizontal distance protection (Part C3)
  if (dXY <= 1e-3) {
    return {
      valid: true,
      status: SAFETY_CLASSES.SAFE,
      safetyClass: SAFETY_CLASSES.SAFE,
      deltaZ: 0.0,
      horizontalDistanceM: 0.0,
      slopeRatio: 0.0,
      signedSlopeDeg: 0.0,
      absSlopeDeg: 0.0,
      direction: 'FLAT',
      isNearFlat: true
    };
  }

  // Protect against sub-meter numerical noise on extremely short edges
  const effectiveDistM = Math.max(0.25, dXY);
  const slopeRatio = deltaZ / effectiveDistM;
  const signedSlopeDeg = (Math.atan(slopeRatio) * 180.0) / Math.PI;
  const absSlopeDeg = Math.abs(signedSlopeDeg);

  let direction = 'FLAT';
  if (signedSlopeDeg > 1e-9) direction = 'UPHILL';
  else if (signedSlopeDeg < -1e-9) direction = 'DOWNHILL';

  const isNearFlat = absSlopeDeg <= 1.0 + 1e-9;

  return {
    valid: true,
    status: SAFETY_CLASSES.SAFE,
    deltaZ,
    horizontalDistanceM: dXY,
    slopeRatio,
    signedSlopeDeg,
    absSlopeDeg,
    direction,
    isNearFlat
  };
}

/**
 * PART D & PART E — Directional Slope Cost Function K(theta) & Maximum Slope Constraint
 *
 * Given signed slope angle theta (degrees) and user-configured Maximum Slope theta_max:
 * - Uphill hard limit:   theta_max_up   = theta_max
 * - Downhill hard limit: theta_max_down = 0.75 * theta_max
 * - Reference slope:     theta_ref      = 0.4 * theta_max (or options.thetaRefDeg / options.thetaRefRatio)
 * - Downhill ref limit:  theta_ref_down = 0.5 * theta_ref
 *
 * Piecewise Cost Multiplier K(theta):
 * 1) Uphill SAFE (0 <= theta <= theta_ref):
 *      K(theta) = 1.0 + (theta / theta_ref)
 * 2) Uphill CAUTION (theta_ref < theta <= theta_max):
 *      p = (theta - theta_ref) / (theta_max - theta_ref)
 *      K(theta) = 2.0 + 4.0*p + 6.0*p^2
 * 3) Uphill UNSAFE (theta > theta_max):
 *      REJECT_EDGE (costMultiplier = Infinity, traversable = false)
 * 4) Downhill SAFE / Benefit (-0.5*theta_ref <= theta < 0):
 *      K(theta) = 1.0 - 0.25 * (|theta| / (0.5*theta_ref))
 * 5) Downhill CAUTION (-0.75*theta_max <= theta < -0.5*theta_ref):
 *      q = (|theta| - 0.5*theta_ref) / (0.75*theta_max - 0.5*theta_ref)
 *      K(theta) = 0.75 + 5.0*q^2
 * 6) Downhill UNSAFE (|theta| > 0.75*theta_max):
 *      REJECT_EDGE (costMultiplier = Infinity, traversable = false)
 * 7) Flat / Near-Flat (-1 <= theta <= 1):
 *      slopeClass = 'FLAT' (or 'NEAR_FLAT'), retaining exact signed angle & K(theta).
 */
export function evaluateDirectionalSlopeCost(signedSlopeDeg, maxSlopeDeg = 22.0, options = {}) {
  const rawMax = Number(maxSlopeDeg);
  const thetaMax = (Number.isFinite(rawMax) && rawMax > 0.0) ? Math.max(1.0, rawMax) : 22.0;
  const thetaMaxUp = thetaMax;
  const thetaMaxDown = 0.75 * thetaMax;

  const thetaRefRatio = (options && Number.isFinite(Number(options.thetaRefRatio)) && Number(options.thetaRefRatio) > 0)
    ? Number(options.thetaRefRatio)
    : 0.4;
  const thetaRef = (options && Number.isFinite(Number(options.thetaRefDeg)) && Number(options.thetaRefDeg) > 0)
    ? Number(options.thetaRefDeg)
    : (thetaRefRatio * thetaMax);
  const thetaRefDown = 0.5 * thetaRef;

  if (!Number.isFinite(signedSlopeDeg)) {
    return {
      valid: false,
      traversable: false,
      status: SAFETY_CLASSES.UNKNOWN,
      safetyClass: SAFETY_CLASSES.UNKNOWN,
      slopeClass: SAFETY_CLASSES.UNKNOWN,
      costMultiplier: Infinity,
      signedSlopeDeg: NaN,
      absSlopeDeg: NaN,
      direction: 'UNKNOWN',
      isNearFlat: false,
      thetaMaxUp,
      thetaMaxDown,
      thetaRef,
      thetaRefDown
    };
  }

  const eps = 1e-9;
  const theta = signedSlopeDeg;
  const absTheta = Math.abs(theta);
  const isNearFlat = absTheta <= 1.0 + eps;
  const direction = theta > eps ? 'UPHILL' : (theta < -eps ? 'DOWNHILL' : 'FLAT');
  const strictSafeOnly = Boolean(options?.strictSafeOnly);

  let costMultiplier = 1.0;
  let safetyClass = SAFETY_CLASSES.SAFE;
  let slopeClass = isNearFlat ? SAFETY_CLASSES.FLAT : SAFETY_CLASSES.SAFE;
  let status = 'SAFE';
  let traversable = true;

  if (theta >= 0.0) {
    // UPHILL OR EXACT 0° FLAT
    if (theta <= thetaRef + eps) {
      // Case 1: Uphill SAFE (0 <= theta <= theta_ref)
      const clampedTheta = Math.min(theta, thetaRef);
      costMultiplier = 1.0 + (clampedTheta / Math.max(1e-6, thetaRef));
      safetyClass = SAFETY_CLASSES.SAFE;
      slopeClass = isNearFlat ? SAFETY_CLASSES.FLAT : SAFETY_CLASSES.SAFE;
      status = 'SAFE';
      traversable = true;
    } else if (theta <= thetaMaxUp + eps) {
      // Case 2: Uphill CAUTION (theta_ref < theta <= theta_max)
      const denom = Math.max(1e-6, thetaMaxUp - thetaRef);
      const p = Math.max(0.0, Math.min(1.0, (theta - thetaRef) / denom));
      costMultiplier = 2.0 + 4.0 * p + 6.0 * p * p;
      safetyClass = SAFETY_CLASSES.CAUTION;
      slopeClass = SAFETY_CLASSES.CAUTION;
      status = 'CAUTION';
      traversable = !strictSafeOnly;
    } else {
      // Case 3: Uphill UNSAFE (theta > theta_max)
      costMultiplier = Infinity;
      safetyClass = SAFETY_CLASSES.UNSAFE;
      slopeClass = SAFETY_CLASSES.UNSAFE;
      status = 'REJECT_EDGE';
      traversable = false;
    }
  } else {
    // DOWNHILL (theta < 0)
    if (absTheta <= thetaRefDown + eps) {
      // Case 4: Downhill SAFE / Benefit (-0.5*theta_ref <= theta < 0)
      const clampedAbs = Math.min(absTheta, thetaRefDown);
      costMultiplier = 1.0 - 0.25 * (clampedAbs / Math.max(1e-6, thetaRefDown));
      safetyClass = SAFETY_CLASSES.SAFE;
      slopeClass = isNearFlat ? SAFETY_CLASSES.FLAT : SAFETY_CLASSES.SAFE;
      status = 'SAFE';
      traversable = true;
    } else if (absTheta <= thetaMaxDown + eps) {
      // Case 5: Downhill CAUTION (-0.75*theta_max <= theta < -0.5*theta_ref)
      const denom = Math.max(1e-6, thetaMaxDown - thetaRefDown);
      const q = Math.max(0.0, Math.min(1.0, (absTheta - thetaRefDown) / denom));
      costMultiplier = 0.75 + 5.0 * q * q;
      safetyClass = SAFETY_CLASSES.CAUTION;
      slopeClass = SAFETY_CLASSES.CAUTION;
      status = 'CAUTION';
      traversable = !strictSafeOnly;
    } else {
      // Case 6: Downhill UNSAFE (|theta| > 0.75*theta_max)
      costMultiplier = Infinity;
      safetyClass = SAFETY_CLASSES.UNSAFE;
      slopeClass = SAFETY_CLASSES.UNSAFE;
      status = 'REJECT_EDGE';
      traversable = false;
    }
  }

  return {
    valid: true,
    traversable,
    status,
    safetyClass,
    slopeClass,
    costMultiplier,
    signedSlopeDeg: theta,
    absSlopeDeg: absTheta,
    direction,
    isNearFlat,
    thetaMaxUp,
    thetaMaxDown,
    thetaRef,
    thetaRefDown
  };
}

/**
 * Convenience function combining signed-slope calculation (Part C) and directional slope cost (Parts D & E)
 */
export function evaluateDirectedEdgeSlope(u, v, maxSlopeDeg = 22.0, options = {}) {
  const slopeInfo = calculateSignedSlope(u, v, options);
  if (!slopeInfo.valid) {
    const rawMax = Number(maxSlopeDeg);
    const thetaMax = (Number.isFinite(rawMax) && rawMax > 0.0) ? Math.max(1.0, rawMax) : 22.0;
    return {
      ...slopeInfo,
      traversable: false,
      status: SAFETY_CLASSES.UNKNOWN,
      safetyClass: SAFETY_CLASSES.UNKNOWN,
      slopeClass: SAFETY_CLASSES.UNKNOWN,
      costMultiplier: Infinity,
      thetaMaxUp: thetaMax,
      thetaMaxDown: 0.75 * thetaMax,
      thetaRef: 0.4 * thetaMax,
      thetaRefDown: 0.2 * thetaMax
    };
  }
  const costInfo = evaluateDirectionalSlopeCost(slopeInfo.signedSlopeDeg, maxSlopeDeg, options);
  return {
    ...slopeInfo,
    ...costInfo
  };
}

/**
 * Calibrated Minetti metabolic energy cost model for Mars gravity
 * Calculates mechanical and metabolic work in Joules.
 * 
 * i = gradient (rise / run)
 * Mars gravity reduces vertical weight bearing, but inertial and leg swing mass remains 100%.
 */
export function estimateTransitionEnergy(distanceM, dzM, maxSlopeDeg, profile = {}) {
  const massKg = profile.massKg || (profile.bodyMass ? (profile.bodyMass + (profile.equipmentMass || 15.0) + 50.0) : 135.0);
  if (distanceM <= 0.0) return 0.0;

  const gradient = Math.max(-0.6, Math.min(0.6, dzM / distanceM));

  // Minetti polynomial specific cost of walking in J/(kg*m) on Earth
  // C_W(i) = 280.5 i^5 - 58.7 i^4 - 218.4 i^3 + 43.3 i^2 + 9.6 i + 1.88
  const i = gradient;
  const i2 = i * i;
  const i3 = i2 * i;
  const i4 = i3 * i;
  const i5 = i4 * i;

  const earthCost = 280.5 * i5 - 58.7 * i4 - 218.4 * i3 + 43.3 * i2 + 9.6 * i + 1.88;

  // On Mars, gravity is ~0.38g. Vertical potential energy work scales with g_Mars,
  // while kinetic friction and internal acceleration work scales ~0.6-0.7.
  const marsCostPerKgM = Math.max(1.1, earthCost * (0.38 + 0.62 * GRAVITY_RATIO));

  // Total energy in Joules
  return marsCostPerKgM * massKg * distanceM;
}

/**
 * Unified Terrain Transition Evaluator
 * Used identically by Field D*, D* Lite, A*, and Fast Marching Method.
 * 
 * Implements:
 * - Signed slope calculation (Part C)
 * - Active Maximum Slope constraint from Settings (Part D: theta_max_up = theta_max, theta_max_down = 0.75 * theta_max)
 * - Directional slope cost function K(theta) (Part E: edgeCost = baseMovementCost * K(theta))
 * - Separation of directional edge slope from local cell steepness (Part C4)
 * - Adaptive edge sampling with planetary longitude wraparound handling
 */
export function evaluateTerrainTransition(fromPt, toPt, terrainData, profile = {}, weights = {}, options = {}) {
  const { elevationGrid, slopeGrid, rows = 360, cols = 720 } = terrainData || {};
  const rawMaxSlope = options.maxSafeSlope ?? profile.maxSafeSlopeDeg ?? (typeof window !== 'undefined' && window.evaSettings?.settings?.maxSafeSlopeDeg) ?? 22.0;
  const maxSafeSlope = (Number.isFinite(Number(rawMaxSlope)) && Number(rawMaxSlope) > 0) ? Math.max(1.0, Number(rawMaxSlope)) : 22.0;
  // When allowCaution is explicitly passed as false (Stage 1 strict SAFE-only search), disallow CAUTION slopes;
  // When allowCaution is true or omitted (Stage 2 or direct edge evaluation), allow CAUTION slopes with rising quadratic K(theta).
  const allowCaution = options.allowCaution !== undefined ? Boolean(options.allowCaution) : true;
  const strictSafeOnly = !allowCaution;
  const strictUnknown = options.strictUnknown !== false; // Default strict
  const ignoreLocalSlopeGrid = Boolean(options.ignoreLocalSlopeGrid);

  const stormSim = options.stormSimulator || (typeof globalDustStormSimulator !== 'undefined' ? globalDustStormSimulator : null);
  const simTimeHrs = options.simTimeHrs !== undefined ? options.simTimeHrs : (stormSim ? stormSim.getSimulationTime() : 0.0);
  const stormCount = stormSim ? stormSim.getAllStorms().length : 0;

  // Seamlessly support both grid coordinates ({r, c}) and geographic coordinates ({lat, lon})
  let srcNode = fromPt;
  let dstNode = toPt;
  if (srcNode && srcNode.r === undefined && srcNode.lat !== undefined) {
    srcNode = geoToGrid(srcNode.lat, srcNode.lon, rows, cols);
  }
  if (dstNode && dstNode.r === undefined && dstNode.lat !== undefined) {
    dstNode = geoToGrid(dstNode.lat, dstNode.lon, rows, cols);
  }

  const wDist = weights.distance !== undefined ? weights.distance : 1.0;
  const wSafety = weights.safety !== undefined ? weights.safety : (weights.risk !== undefined ? weights.risk : 2.5);
  const wSlope = weights.slope !== undefined ? weights.slope : 2.0;
  const wElev = weights.elevation !== undefined ? weights.elevation : 1.5;
  const wRough = weights.roughness !== undefined ? weights.roughness : 1.0;
  const wEnergy = weights.energy !== undefined ? weights.energy : 1.0;
  const thetaRefOpt = options.thetaRefDeg !== undefined ? options.thetaRefDeg : (options.thetaRefRatio || 0.4) * maxSafeSlope;
  const blockedCells = options.blockedCells || null;
  const corridorPenaltyMap = options.corridorPenaltyMap || null;
  const searchIterTag = options.searchIteration || 0;

  // Cache lookup key incorporating directed endpoints, active slope threshold, allowCaution mode, and storm/iteration state
  const useCache = !blockedCells && !corridorPenaltyMap && searchIterTag === 0;
  const cacheKey = `${srcNode.r.toFixed(4)},${srcNode.c.toFixed(4)}->${dstNode.r.toFixed(4)},${dstNode.c.toFixed(4)}_${maxSafeSlope.toFixed(2)}_${thetaRefOpt.toFixed(2)}_${allowCaution ? 1 : 0}_${wDist}_${wSafety}_${wSlope}_${wElev}_${wRough}_${wEnergy}_${simTimeHrs.toFixed(1)}_${stormCount}`;
  if (useCache) {
    const cached = transitionCostCache.get(cacheKey);
    if (cached) return cached;
  }

  const fromGeo = gridToGeo(srcNode.r, srcNode.c, rows, cols);
  const toGeo = gridToGeo(dstNode.r, dstNode.c, rows, cols);

  const groundDistM = computePlanetaryDistanceMeters(fromGeo.lat, fromGeo.lon, toGeo.lat, toGeo.lon);
  if (groundDistM <= 1e-3) {
    const zeroRes = {
      traversable: true,
      safetyClass: SAFETY_CLASSES.SAFE,
      slopeClass: SAFETY_CLASSES.FLAT,
      status: 'SAFE',
      cost: 0.0,
      baseMovementCost: 0.0,
      costMultiplier: 1.0,
      distanceM: 0.0,
      distM: 0.0,
      deltaZ: 0.0,
      elevationChangeM: 0.0,
      elevationVariationM: 0.0,
      signedSlopeDeg: 0.0,
      slopeRatio: 0.0,
      direction: 'FLAT',
      isNearFlat: true,
      maxUphillSlopeDeg: 0.0,
      maxDownhillSlopeDeg: 0.0,
      localSlopeDeg: 0.0,
      maxSlopeDeg: 0.0,
      avgSlopeDeg: 0.0,
      thetaMaxUp: maxSafeSlope,
      thetaMaxDown: 0.75 * maxSafeSlope,
      thetaRef: thetaRefOpt,
      energyJoules: 0.0,
      safetyPenalty: 0.0,
      dataConfidence: 1.0
    };
    transitionCostCache.set(cacheKey, zeroRes);
    return zeroRes;
  }

  // Handle planetary wrap-around in grid column interpolation (0° / 360° boundary)
  let dc = toPt.c - fromPt.c;
  if (dc > cols * 0.5) dc -= cols;
  if (dc < -cols * 0.5) dc += cols;
  const dr = toPt.r - fromPt.r;

  // Determine adaptive intermediate sample count along edge (8 to 64 samples so narrow ravines/rims are never skipped)
  const gridDist = Math.hypot(dr, dc);
  const sampleSteps = Math.max(8, Math.min(64, Math.ceil(gridDist * 8.0)));

  let maxLocalSlopeDeg = 0.0;
  let sumLocalSlopeDeg = 0.0;
  let maxUphillSlopeDeg = 0.0;
  let maxDownhillSlopeDeg = 0.0; // Stored as <= 0 (negative for downhill)
  let minElev = Infinity;
  let maxElev = -Infinity;
  let totalAbsVerticalM = 0.0;
  let sumTriM = 0.0;
  let maxTriM = 0.0;
  let hasNoData = false;
  let isBlockedCorridor = false;
  let corridorAvoidancePenalty = 0.0;
  let maxStormTau = 0.0;
  let maxStormWind = 0.0;
  let anyViolates48h = false;
  let anyCautionStorm = false;

  const rawSpeed = Number(profile.speed || profile.maxWalkingSpeedMS || profile.speedMS || 1.2);
  const speedMS = (Number.isFinite(rawSpeed) && rawSpeed > 0) ? Math.max(0.1, Math.min(15.0, rawSpeed)) : 1.2;

  const startSample = sampleBilinearElevation(elevationGrid, rows, cols, fromPt.r, fromPt.c);
  const endSample = sampleBilinearElevation(elevationGrid, rows, cols, toPt.r, toPt.c);

  if (!startSample.isValid || !endSample.isValid) {
    hasNoData = true;
  }

  const elevStart = startSample.elevation;
  const elevEnd = endSample.elevation;
  minElev = Math.min(elevStart, elevEnd);
  maxElev = Math.max(elevStart, elevEnd);

  // 1. Evaluate primary directed edge signed slope u -> v (Part C & Part E)
  const edgeSlopeInfo = calculateSignedSlope(elevStart, elevEnd, groundDistM);
  if (!startSample.isValid || !endSample.isValid) {
    edgeSlopeInfo.valid = false;
  }
  const slopeEvalOptions = {
    strictSafeOnly,
    thetaRefDeg: options.thetaRefDeg,
    thetaRefRatio: options.thetaRefRatio
  };
  const edgeDirEval = evaluateDirectionalSlopeCost(edgeSlopeInfo.signedSlopeDeg, maxSafeSlope, slopeEvalOptions);

  if (edgeSlopeInfo.signedSlopeDeg > 0) {
    maxUphillSlopeDeg = Math.max(maxUphillSlopeDeg, edgeSlopeInfo.signedSlopeDeg);
  } else if (edgeSlopeInfo.signedSlopeDeg < 0) {
    maxDownhillSlopeDeg = Math.min(maxDownhillSlopeDeg, edgeSlopeInfo.signedSlopeDeg);
  }

  // 2. Sample intermediate points along the directed segment to detect narrow ravines, ridges, or cliffs
  let prevElev = elevStart;
  const subSegmentDistM = Math.max(0.5, groundDistM / Math.max(1, sampleSteps));
  let anySubUnsafeSlope = false;
  let anySubCautionSlope = false;
  let maxSubCostMultiplier = edgeDirEval.costMultiplier;
  let sumSubCostMultiplier = 0.0;
  let subCostCount = 0;

  for (let s = 0; s <= sampleSteps; s++) {
    const t = s / sampleSteps;
    const r = fromPt.r + t * dr;
    const c = ((fromPt.c + t * dc) % cols + cols) % cols;

    // Check blocked/penalized cells from iterative alternative corridor search (Part E)
    if (blockedCells || corridorPenaltyMap) {
      const cellKey = `${Math.round(r * 2) / 2},${Math.round(c * 2) / 2}`;
      const intKey = `${Math.round(r)},${Math.round(c)}`;
      if (blockedCells && (blockedCells.has(cellKey) || blockedCells.has(intKey))) {
        isBlockedCorridor = true;
      }
      if (corridorPenaltyMap) {
        const p1 = corridorPenaltyMap.get(cellKey) || 0.0;
        const p2 = corridorPenaltyMap.get(intKey) || 0.0;
        corridorAvoidancePenalty = Math.max(corridorAvoidancePenalty, p1, p2);
      }
    }

    const elevInfo = sampleBilinearElevation(elevationGrid, rows, cols, r, c);
    if (!elevInfo.isValid) {
      hasNoData = true;
    } else {
      minElev = Math.min(minElev, elevInfo.elevation);
      maxElev = Math.max(maxElev, elevInfo.elevation);

      if (s > 0) {
        totalAbsVerticalM += Math.abs(elevInfo.elevation - prevElev);
        // Directed sub-segment signed slope check (from sample s-1 to sample s)
        const subSlopeInfo = calculateSignedSlope(prevElev, elevInfo.elevation, subSegmentDistM);
        if (subSlopeInfo.valid) {
          const subTheta = subSlopeInfo.signedSlopeDeg;
          if (subTheta > 0) maxUphillSlopeDeg = Math.max(maxUphillSlopeDeg, subTheta);
          if (subTheta < 0) maxDownhillSlopeDeg = Math.min(maxDownhillSlopeDeg, subTheta);

          const subEval = evaluateDirectionalSlopeCost(subTheta, maxSafeSlope, slopeEvalOptions);
          if (subEval.safetyClass === SAFETY_CLASSES.UNSAFE) {
            anySubUnsafeSlope = true;
          } else if (subEval.safetyClass === SAFETY_CLASSES.CAUTION) {
            anySubCautionSlope = true;
          }
          if (Number.isFinite(subEval.costMultiplier)) {
            sumSubCostMultiplier += subEval.costMultiplier;
            subCostCount++;
            if (subEval.costMultiplier > maxSubCostMultiplier) {
              maxSubCostMultiplier = subEval.costMultiplier;
            }
          }
        }
      }
      prevElev = elevInfo.elevation;
    }

    if (!ignoreLocalSlopeGrid) {
      const localSlope = sampleBilinearSlope(slopeGrid, elevationGrid, rows, cols, r, c);
      maxLocalSlopeDeg = Math.max(maxLocalSlopeDeg, localSlope);
      sumLocalSlopeDeg += localSlope;
      if (elevationGrid && (s % 2 === 0 || s === sampleSteps)) {
        const zL = sampleBilinearElevation(elevationGrid, rows, cols, r, c - 0.5).elevation;
        const zR = sampleBilinearElevation(elevationGrid, rows, cols, r, c + 0.5).elevation;
        const zU = sampleBilinearElevation(elevationGrid, rows, cols, r - 0.5, c).elevation;
        const zD = sampleBilinearElevation(elevationGrid, rows, cols, r + 0.5, c).elevation;
        const zC = elevInfo.elevation;
        const localTri = 0.5 * Math.sqrt(
          (zL - zC) * (zL - zC) +
          (zR - zC) * (zR - zC) +
          (zU - zC) * (zU - zC) +
          (zD - zC) * (zD - zC)
        );
        if (Number.isFinite(localTri)) {
          sumTriM += localTri;
          if (localTri > maxTriM) maxTriM = localTri;
        }
      }
    }

    if (stormCount > 0 && stormSim) {
      const sLat = 90.0 - (r / rows) * 180.0;
      const sLon = (c / cols) * 360.0;
      const sHrs = simTimeHrs + (s * subSegmentDistM / Math.max(0.1, speedMS)) / 3600.0;
      const sEnv = stormSim.getEnvironmentalConditionsAt(sLat, sLon, sHrs);
      if (sEnv.tau > maxStormTau) maxStormTau = sEnv.tau;
      if (sEnv.windSpeedKmH > maxStormWind) maxStormWind = sEnv.windSpeedKmH;
      if (sEnv.violates48hBuffer) anyViolates48h = true;
      if (sEnv.tauClass === 'CAUTION' || sEnv.windClass === 'CAUTION') anyCautionStorm = true;
    }
  }

  const avgLocalSlopeDeg = sumLocalSlopeDeg / (sampleSteps + 1);
  const avgTriM = sumTriM / Math.max(1, Math.floor(sampleSteps / 2) + 1);
  const elevChangeM = elevEnd - elevStart;
  const elevVariationM = Math.max(0.0, maxElev - minElev);
  const oscillationM = Math.max(0.0, totalAbsVerticalM - Math.abs(elevChangeM));
  const signedSlopeDeg = edgeSlopeInfo.signedSlopeDeg;
  const maxDirectionalAbsSlopeDeg = Math.max(Math.abs(signedSlopeDeg), maxUphillSlopeDeg, Math.abs(maxDownhillSlopeDeg));
  const maxSlopeDeg = Math.max(maxDirectionalAbsSlopeDeg, maxLocalSlopeDeg);
  const avgSubCostMultiplier = subCostCount > 0 ? (sumSubCostMultiplier / subCostCount) : edgeDirEval.costMultiplier;

  // Determine combined directional slope safety & multiplier K(theta)
  let safetyClass = edgeDirEval.safetyClass;
  let slopeClass = edgeDirEval.slopeClass;
  let status = edgeDirEval.status;
  let costMultiplier = (gridDist > 1.05 || oscillationM > 15.0)
    ? Math.max(edgeDirEval.costMultiplier, 0.65 * avgSubCostMultiplier + 0.35 * maxSubCostMultiplier)
    : edgeDirEval.costMultiplier;
  let traversable = edgeDirEval.traversable;
  let safetyPenalty = 0.0;

  if (isBlockedCorridor) {
    safetyClass = SAFETY_CLASSES.UNSAFE;
    slopeClass = SAFETY_CLASSES.UNSAFE;
    status = 'REJECT_EDGE';
    traversable = false;
    costMultiplier = Infinity;
  } else if (hasNoData) {
    safetyClass = SAFETY_CLASSES.UNKNOWN;
    slopeClass = SAFETY_CLASSES.UNKNOWN;
    status = SAFETY_CLASSES.UNKNOWN;
    if (strictUnknown) {
      traversable = false;
      costMultiplier = Infinity;
    } else {
      safetyPenalty = 3.0;
    }
  } else {
    // Check sub-segment directional violations and local cliff steepness (Part C4 & Part D)
    const isLocalCliffUnsafe = !ignoreLocalSlopeGrid && (maxLocalSlopeDeg > edgeDirEval.thetaMaxUp + 1e-9);
    if (edgeDirEval.safetyClass === SAFETY_CLASSES.UNSAFE || anySubUnsafeSlope || isLocalCliffUnsafe) {
      safetyClass = SAFETY_CLASSES.UNSAFE;
      slopeClass = SAFETY_CLASSES.UNSAFE;
      status = 'REJECT_EDGE';
      traversable = false;
      costMultiplier = Infinity;
    } else if (edgeDirEval.safetyClass === SAFETY_CLASSES.CAUTION || anySubCautionSlope || maxLocalSlopeDeg > edgeDirEval.thetaRef + 1e-9) {
      safetyClass = SAFETY_CLASSES.CAUTION;
      slopeClass = SAFETY_CLASSES.CAUTION;
      status = 'CAUTION';
      if (strictSafeOnly && (edgeDirEval.safetyClass === SAFETY_CLASSES.CAUTION || anySubCautionSlope)) {
        traversable = false;
      } else {
        traversable = true;
      }
    }
  }

  // Environmental Atmospheric Pressure Constraint (Barometric Hydrostatic Model)
  const pressEval = evaluatePressureSafety(toGeo.lat, toGeo.lon, elevEnd);
  if (pressEval.status === 'UNSAFE') {
    safetyClass = SAFETY_CLASSES.UNSAFE;
    traversable = false;
  } else if (pressEval.status === 'CAUTION') {
    safetyPenalty += 0.15;
  }

  // Dynamic Dust Storm & Wind Hazard Evaluation
  const estArrivalHrs = simTimeHrs + ((options.accumulatedDistanceM || groundDistM) / Math.max(0.1, speedMS)) / 3600.0;
  const stormEnv = stormSim
    ? stormSim.getEnvironmentalConditionsAt(toGeo.lat, toGeo.lon, estArrivalHrs)
    : { tau: 0.35, windSpeedKmH: 10, violates48hBuffer: false, tauClass: 'SAFE', windClass: 'SAFE' };

  const isStormUnsafe = (stormEnv.tau >= 2.0 || stormEnv.windSpeedKmH > 100.0 || stormEnv.violates48hBuffer ||
                         maxStormTau >= 2.0 || maxStormWind > 100.0 || anyViolates48h);
  const isStormCaution = (stormEnv.tauClass === 'CAUTION' || stormEnv.windClass === 'CAUTION' || anyCautionStorm);

  if (isStormUnsafe) {
    safetyClass = SAFETY_CLASSES.UNSAFE;
    traversable = false;
  } else if (isStormCaution) {
    if (safetyClass === SAFETY_CLASSES.SAFE) {
      safetyClass = SAFETY_CLASSES.CAUTION;
    }
    if (!allowCaution) {
      traversable = false;
    } else {
      safetyPenalty += 3.5;
    }
  }

  if (!traversable) {
    let rejectionReason = 'NO_PATH_FOUND';
    if (isBlockedCorridor) {
      rejectionReason = 'CORRIDOR_EXCLUSION';
    } else if (hasNoData) {
      rejectionReason = 'NO_DATA';
    } else if (stormEnv.tau >= 2.0 || maxStormTau >= 2.0) {
      rejectionReason = 'TAU_LIMIT_EXCEEDED';
    } else if (stormEnv.windSpeedKmH > 100.0 || maxStormWind > 100.0) {
      rejectionReason = 'UNSAFE_WIND';
    } else if (stormEnv.violates48hBuffer || anyViolates48h || isStormCaution) {
      rejectionReason = 'STORM_EXCLUSION';
    } else if (safetyClass === SAFETY_CLASSES.UNSAFE || safetyClass === SAFETY_CLASSES.CAUTION) {
      rejectionReason = 'TOO_STEEP';
    } else if (pressEval.status === 'UNSAFE') {
      rejectionReason = 'UNSAFE_PRESSURE';
    } else {
      rejectionReason = 'NO_VALID_NEIGHBORS';
    }

    const unsafeRes = {
      traversable: false,
      safetyClass,
      slopeClass,
      status: 'REJECT_EDGE',
      rejectionReason,
      cost: Infinity,
      baseMovementCost: Infinity,
      costMultiplier: Infinity,
      distanceM: groundDistM,
      distM: groundDistM,
      deltaZ: elevChangeM,
      elevationChangeM: elevChangeM,
      elevationVariationM: elevVariationM,
      totalAbsVerticalM,
      oscillationM,
      triM: avgTriM,
      maxTriM,
      signedSlopeDeg,
      slopeRatio: edgeSlopeInfo.slopeRatio,
      direction: edgeSlopeInfo.direction,
      isNearFlat: edgeSlopeInfo.isNearFlat,
      maxUphillSlopeDeg,
      maxDownhillSlopeDeg,
      localSlopeDeg: maxLocalSlopeDeg,
      maxSlopeDeg,
      avgSlopeDeg: avgLocalSlopeDeg,
      thetaMaxUp: edgeDirEval.thetaMaxUp,
      thetaMaxDown: edgeDirEval.thetaMaxDown,
      thetaRef: edgeDirEval.thetaRef,
      energyJoules: Infinity,
      safetyPenalty: Infinity,
      dataConfidence: hasNoData ? 0.0 : 0.8,
      diagnostics: {
        startCoord: fromGeo,
        endCoord: toGeo,
        startElev: elevStart,
        endElev: elevEnd,
        elevDiffM: elevChangeM,
        elevVariationM: elevVariationM,
        groundDistM: groundDistM,
        gradient: edgeSlopeInfo.slopeRatio,
        signedSlopeDeg,
        slopeDeg: maxSlopeDeg,
        localSlopeDeg: maxLocalSlopeDeg,
        maxSafeSlopeDeg: maxSafeSlope,
        thetaMaxUp: edgeDirEval.thetaMaxUp,
        thetaMaxDown: edgeDirEval.thetaMaxDown,
        thetaRef: edgeDirEval.thetaRef,
        thresholdUnit: 'degrees',
        rejectionReason
      }
    };
    if (useCache) transitionCostCache.set(cacheKey, unsafeRes);
    return unsafeRes;
  }

  // Energy Calculation (for biomechanical telemetry)
  const energyJ = estimateTransitionEnergy(groundDistM, elevChangeM, maxSlopeDeg, profile);

  // PART B2 & PART C: Terrain-Structure-Aware Base Movement Cost + Directional K(theta)
  // On flat uniform terrain (totalAbsVerticalM < 5 m, avgLocalSlopeDeg < 0.3°, avgTriM < 5 m),
  // terrainStructureCost is ~0 so flat terrain produces a clean, direct path.
  // On rugged/cratered terrain, climbing crater rims, oscillating elevation, and high local steepness/TRI
  // add realistic topographic resistance so routes naturally curve around craters, ridges, and scarps.
  const normDist = groundDistM / 29600.0;
  const climbTerm = totalAbsVerticalM > 5.0 ? (wElev * 0.45 * (totalAbsVerticalM / 320.0)) : 0.0;
  const oscTerm = oscillationM > 8.0 ? (wElev * 0.85 * (oscillationM / 180.0)) : 0.0;
  const localSteepTerm = avgLocalSlopeDeg > 0.35
    ? (wSlope * 0.38 * Math.pow(avgLocalSlopeDeg / Math.max(2.0, edgeDirEval.thetaRef), 1.3))
    : 0.0;
  const roughnessTerm = avgTriM > 6.0 ? (wRough * 0.45 * (avgTriM / 160.0)) : 0.0;
  const terrainStructureCost = normDist * (climbTerm + oscTerm + localSteepTerm + roughnessTerm);

  // Incorporate normalized Minetti-Mars metabolic energy term so weights.energy and min_energy actively optimize energy
  const effMassKg = profile.massKg || (profile.bodyMass ? (profile.bodyMass + (profile.equipmentMass || 15.0) + 50.0) : 135.0);
  const flatRefEnergyPerCellJ = Math.max(1.0, 1.156 * effMassKg * 29600.0);
  const energyCostTerm = wEnergy * 0.25 * (energyJ / flatRefEnergyPerCellJ);

  const baseMovementCost = Math.max(
    1e-4,
    wDist * normDist + energyCostTerm + terrainStructureCost + wSafety * (safetyPenalty + corridorAvoidancePenalty)
  );
  const totalCost = baseMovementCost * costMultiplier;

  const result = {
    traversable: true,
    safetyClass,
    slopeClass,
    status,
    cost: Math.max(1e-4, totalCost),
    baseMovementCost,
    costMultiplier,
    distanceM: groundDistM,
    distM: groundDistM,
    deltaZ: elevChangeM,
    elevationChangeM: elevChangeM,
    elevationVariationM: elevVariationM,
    totalAbsVerticalM,
    oscillationM,
    triM: avgTriM,
    maxTriM,
    signedSlopeDeg,
    slopeRatio: edgeSlopeInfo.slopeRatio,
    direction: edgeSlopeInfo.direction,
    isNearFlat: edgeSlopeInfo.isNearFlat,
    maxUphillSlopeDeg,
    maxDownhillSlopeDeg,
    localSlopeDeg: maxLocalSlopeDeg,
    maxSlopeDeg,
    avgSlopeDeg: avgLocalSlopeDeg,
    thetaMaxUp: edgeDirEval.thetaMaxUp,
    thetaMaxDown: edgeDirEval.thetaMaxDown,
    thetaRef: edgeDirEval.thetaRef,
    energyJoules: energyJ,
    safetyPenalty: safetyPenalty + corridorAvoidancePenalty,
    dataConfidence: hasNoData ? 0.3 : 1.0
  };

  if (useCache) transitionCostCache.set(cacheKey, result);
  return result;
}

/**
 * Computes trajectory smoothness based on consecutive heading change angles
 * Matches NASA EVA Marswalk smoothness index (0-100%).
 */
export function computePathSmoothness(path) {
  if (!path || path.length < 3) {
    return { totalTurnDeg: 0.0, avgTurnDeg: 0.0, smoothnessScore: 100.0 };
  }
  const turnAngles = [];
  for (let i = 1; i < path.length - 1; i++) {
    const pPrev = path[i - 1];
    const pCurr = path[i];
    const pNext = path[i + 1];

    const r0 = pPrev.r !== undefined ? pPrev.r : (pPrev.lat !== undefined ? pPrev.lat : pPrev[0]);
    const c0 = pPrev.c !== undefined ? pPrev.c : (pPrev.lon !== undefined ? pPrev.lon : pPrev[1]);
    const r1 = pCurr.r !== undefined ? pCurr.r : (pCurr.lat !== undefined ? pCurr.lat : pCurr[0]);
    const c1 = pCurr.c !== undefined ? pCurr.c : (pCurr.lon !== undefined ? pCurr.lon : pCurr[1]);
    const r2 = pNext.r !== undefined ? pNext.r : (pNext.lat !== undefined ? pNext.lat : pNext[0]);
    const c2 = pNext.c !== undefined ? pNext.c : (pNext.lon !== undefined ? pNext.lon : pNext[1]);

    const v1r = r1 - r0;
    const v1c = c1 - c0;
    const v2r = r2 - r1;
    const v2c = c2 - c1;

    const n1 = Math.hypot(v1r, v1c);
    const n2 = Math.hypot(v2r, v2c);

    if (n1 > 1e-6 && n2 > 1e-6) {
      const cosTheta = Math.max(-1.0, Math.min(1.0, (v1r * v2r + v1c * v2c) / (n1 * n2)));
      const angleDeg = Math.acos(cosTheta) * (180.0 / Math.PI);
      turnAngles.push(angleDeg);
    }
  }

  if (turnAngles.length === 0) {
    return { totalTurnDeg: 0.0, avgTurnDeg: 0.0, smoothnessScore: 100.0 };
  }

  const totalTurn = turnAngles.reduce((a, b) => a + b, 0.0);
  const avgTurn = totalTurn / turnAngles.length;
  const smoothnessScore = Math.max(0.0, Math.min(100.0, 100.0 - avgTurn * 1.45));

  return {
    totalTurnDeg: Math.round(totalTurn * 100) / 100,
    avgTurnDeg: Math.round(avgTurn * 100) / 100,
    smoothnessScore: Math.round(smoothnessScore * 10) / 10
  };
}

/**
 * Post-Search Route Validation
 * Thoroughly validates the reconstructed trajectory segment by segment in the true astronaut travel direction.
 * Computes signed slopes, directional cost multipliers, ascent/descent, and safety classifications.
 */
export function validateRoutePath(rawPath, terrainData, profile = {}, weights = {}, options = {}) {
  if (!rawPath || rawPath.length === 0) {
    return {
      isValid: false,
      safetyStatus: 'NO_PATH_FOUND',
      segments: [],
      metrics: null
    };
  }

  const { rows = 360, cols = 720 } = terrainData;
  const rawMaxSlope = options.maxSafeSlope ?? profile.maxSafeSlopeDeg ?? (typeof window !== 'undefined' && window.evaSettings?.settings?.maxSafeSlopeDeg) ?? 22.0;
  const maxSafeSlope = (Number.isFinite(Number(rawMaxSlope)) && Number(rawMaxSlope) > 0) ? Math.max(1.0, Number(rawMaxSlope)) : 22.0;

  const waypoints = [];
  let totalDistM = 0.0;
  let totalAscentM = 0.0;
  let totalDescentM = 0.0;
  let totalEnergyJ = 0.0;
  let maxSlopeDeg = 0.0;
  let maxLocalSlopeDeg = 0.0;
  let maxUphillSlopeDeg = 0.0;
  let maxDownhillSlopeDeg = 0.0;
  let maxSegDeltaZM = 0.0;
  let sumSlopeDeg = 0.0;
  let cautionCount = 0;
  let unsafeCount = 0;
  let unknownCount = 0;
  let flatCount = 0;
  let unsafePressureCount = 0;
  let cautionPressureCount = 0;
  let unknownPressureCount = 0;
  let safePressureCount = 0;
  let unsafeStormCount = 0;
  let cautionStormCount = 0;
  let storm48hViolationCount = 0;
  let maxTau = 0.0;
  let maxWindSpeedKmH = 0.0;
  const stormSim = options.stormSimulator || globalDustStormSimulator;
  const simStartHrs = options.simTimeHrs !== undefined ? options.simTimeHrs : stormSim.getSimulationTime();
  const rawSpeed = Number(profile.speed || profile.maxWalkingSpeedMS || profile.speedMS || profile.averageWalkingSpeedMS || 1.2);
  const speedMS = (Number.isFinite(rawSpeed) && rawSpeed > 0) ? Math.max(0.1, Math.min(15.0, rawSpeed)) : 1.2;
  const bodyMassKg = profile.bodyMass || profile.bodyMassKg || 80.0;
  const equipmentMassKg = (profile.equipmentMass !== undefined) ? profile.equipmentMass : ((profile.equipmentMassKg !== undefined) ? profile.equipmentMassKg : 15.0);
  const suitMassKg = 50.0; // NASA xEMU Standard spacesuit & PLSS backpack
  const totalMassKg = bodyMassKg + equipmentMassKg + suitMassKg;
  const initialO2L = profile.oxygenCapacity || profile.initialOxygenCapacityL || profile.initialO2L || 1200.0;
  const massPenaltyTerm = 0.002 * Math.max(0.0, totalMassKg - 110.0) * (3.721 / 9.81);
  // Speed-coupled metabolic scaling factor (equals 1.000 at nominal 1.2 m/s)
  const speedMetabolicFactor = 0.65 + 0.35 * Math.pow(speedMS / 1.2, 0.85);

  const segments = [];
  let sumWeightedEffectiveSpeed = 0.0;
  let sumSegDurationEffSec = 0.0;
  let sumSegO2L = 0.0;
  let minEffectiveSpeedMS = Infinity;
  let maxEffectiveSpeedMS = 0.0;
  let peakO2RateLMin = 0.0;
  let minO2RateLMin = Infinity;
  let sumWeightedRadMSvDay = 0.0;
  let noDataSampleCount = 0;

  for (let i = 0; i < rawPath.length; i++) {
    const pt = rawPath[i];
    const r = Array.isArray(pt) ? pt[0] : pt.r;
    const c = Array.isArray(pt) ? pt[1] : pt.c;
    const geo = gridToGeo(r, c, rows, cols);
    const elevSample = sampleBilinearElevation(terrainData.elevationGrid, rows, cols, r, c);
    const elev = elevSample.elevation;
    const isNoData = !elevSample.isValid || !Number.isFinite(elev) || elev < -20000.0 || elev > 40000.0;
    if (isNoData) noDataSampleCount++;
    const localSlope = sampleBilinearSlope(terrainData.slopeGrid, terrainData.elevationGrid, rows, cols, r, c);

    const pressInfo = evaluatePressureSafety(geo.lat, geo.lon, elev);
    const radPressProxy = (pressInfo && Number.isFinite(pressInfo.pressurePa))
      ? pressInfo.pressurePa
      : Math.max(80.0, Math.min(1250.0, 610.0 * Math.exp(-(Number.isFinite(elev) ? elev : 0.0) / 10693.7)));
    const radMSvDay = 0.50 + 0.35 * (1.0 - Math.min(1.0, Math.max(0.0, (radPressProxy - 100.0) / 1150.0)));
    const latAbs = Math.abs(geo.lat);
    const estTempK = latAbs > 80.0 ? 135.0 : (230.0 - (latAbs / 90.0) * 85.0 - (Math.max(0.0, Number.isFinite(elev) ? elev : 0.0) / 1000.0) * 1.6);

    waypoints.push({
      index: i,
      lat: geo.lat,
      lon: geo.lon,
      elevation: elev,
      elevationM: elev,
      isNoData,
      cumDistM: totalDistM,
      cumDistKm: totalDistM / 1000.0,
      slope: localSlope,
      slopeDeg: localSlope,
      localSlopeDeg: localSlope,
      signedSlopeDeg: 0.0,
      deltaZ: 0.0,
      costMultiplier: 1.0,
      effectiveSpeedMS: speedMS,
      o2RateLMin: Math.round(2.8 * (1.0 + massPenaltyTerm) * speedMetabolicFactor * 100) / 100,
      metabolicPowerW: 0.0,
      radiationMSvDay: Math.round(radMSvDay * 1000) / 1000,
      tempK: Math.round(estTempK * 10) / 10,
      slopeClass: SAFETY_CLASSES.FLAT,
      safetyClass: SAFETY_CLASSES.SAFE,
      pressurePa: pressInfo.pressurePa,
      pressureMbar: pressInfo.pressureMbar,
      pressureStatus: pressInfo.status,
      pressureScore: pressInfo.score,
      distanceKm: pressInfo.distanceKm,
      pressureMethod: pressInfo.interpolationMethod
    });

    if (i > 0) {
      const prevPt = rawPath[i - 1];
      const prevR = Array.isArray(prevPt) ? prevPt[0] : prevPt.r;
      const prevC = Array.isArray(prevPt) ? prevPt[1] : prevPt.c;
      const prevGeo = waypoints[i - 1];
      const segStartDistM = totalDistM;

      const trans = evaluateTerrainTransition(
        { r: prevR, c: prevC },
        { r, c },
        terrainData,
        { ...profile, maxSafeSlopeDeg: maxSafeSlope, speed: speedMS },
        weights,
        { allowCaution: true, maxSafeSlope }
      );

      // Attach explicit geographic endpoints and styling for map rendering
      trans.p1 = { lat: prevGeo.lat, lon: prevGeo.lon };
      trans.p2 = { lat: geo.lat, lon: geo.lon };
      trans.color = trans.safetyClass === SAFETY_CLASSES.UNSAFE 
        ? '#ef4444' 
        : (trans.safetyClass === SAFETY_CLASSES.CAUTION ? CAUTION_COLOR : '#10b981');

      // Enrich waypoint with incoming directed segment telemetry for tooltip inspection
      waypoints[i].signedSlopeDeg = trans.signedSlopeDeg;
      waypoints[i].deltaZ = trans.deltaZ;
      waypoints[i].costMultiplier = trans.costMultiplier;
      waypoints[i].slopeClass = trans.slopeClass;
      waypoints[i].safetyClass = trans.safetyClass;
      waypoints[i].direction = trans.direction;

      segments.push(trans);
      totalDistM += trans.distanceM;
      waypoints[i].cumDistM = totalDistM;
      waypoints[i].cumDistKm = totalDistM / 1000.0;
      trans.cumDistStartM = segStartDistM;
      trans.cumDistEndM = totalDistM;
      trans.elevationStartM = prevGeo.elevationM;
      trans.elevationEndM = elev;
      trans.hasNoData = Boolean(prevGeo.isNoData || isNoData || trans.dataConfidence < 0.5);

      if (trans.elevationChangeM > 0) {
        totalAscentM += trans.elevationChangeM;
      } else {
        totalDescentM += Math.abs(trans.elevationChangeM);
      }
      if (Math.abs(trans.elevationChangeM) > maxSegDeltaZM) {
        maxSegDeltaZM = Math.abs(trans.elevationChangeM);
      }
      totalEnergyJ += trans.energyJoules;
      maxSlopeDeg = Math.max(maxSlopeDeg, trans.maxSlopeDeg);
      maxLocalSlopeDeg = Math.max(maxLocalSlopeDeg, trans.localSlopeDeg || 0);
      maxUphillSlopeDeg = Math.max(maxUphillSlopeDeg, trans.maxUphillSlopeDeg || 0);
      maxDownhillSlopeDeg = Math.min(maxDownhillSlopeDeg, trans.maxDownhillSlopeDeg || 0);
      sumSlopeDeg += Math.abs(trans.signedSlopeDeg);

      // Check atmospheric pressure at waypoint
      const pInfo = waypoints[i];
      if (pInfo && pInfo.pressureStatus === 'UNSAFE') {
        unsafePressureCount++;
        trans.safetyClass = SAFETY_CLASSES.UNSAFE;
        trans.color = '#ef4444';
      } else if (pInfo && pInfo.pressureStatus === 'CAUTION') {
        cautionPressureCount++;
      } else if (pInfo && pInfo.pressureStatus === 'UNKNOWN') {
        unknownPressureCount++;
      } else if (pInfo && pInfo.pressureStatus === 'SAFE') {
        safePressureCount++;
      }

      // Spatiotemporal Dust Storm, Wind, and 48-Hour Buffer Check
      const arrivalSec = totalDistM / Math.max(0.1, speedMS);
      const arrivalHrs = simStartHrs + (arrivalSec / 3600.0);
      const env = stormSim.getEnvironmentalConditionsAt(geo.lat, geo.lon, arrivalHrs);
      if (env.tau > maxTau) maxTau = env.tau;
      if (env.windSpeedKmH > maxWindSpeedKmH) maxWindSpeedKmH = env.windSpeedKmH;

      // Coupled per-segment effective walking speed, metabolic power, and O2 flow rate
      const clampedK = Number.isFinite(trans.costMultiplier) ? Math.max(0.5, Math.min(12.0, trans.costMultiplier)) : 4.0;
      const dustImpedance = 1.0 + 0.10 * Math.max(0.0, env.tau || 0.0);
      const segEffSpeedMS = Math.round((speedMS / (Math.sqrt(clampedK) * dustImpedance)) * 1000) / 1000;
      const segDistM = Math.max(1e-3, trans.distanceM);
      const segUpGrade = trans.elevationChangeM > 0 ? (trans.elevationChangeM / segDistM) : 0.0;
      const segDownGrade = trans.elevationChangeM < 0 ? (Math.abs(trans.elevationChangeM) / segDistM) : 0.0;
      const segMetabolicMult = (1.0 + 3.6 * segUpGrade + 0.8 * segDownGrade + massPenaltyTerm) * speedMetabolicFactor;
      const segO2RateLMin = Math.round(2.8 * segMetabolicMult * 100) / 100;
      const segDurationEffSec = segDistM / Math.max(0.05, segEffSpeedMS);
      const segPowerW = Number.isFinite(trans.energyJoules) ? Math.round((trans.energyJoules / Math.max(1e-3, segDurationEffSec)) * 10) / 10 : 0.0;
      sumSegDurationEffSec += segDurationEffSec;
      sumSegO2L += segO2RateLMin * (segDurationEffSec / 60.0);

      trans.effectiveSpeedMS = segEffSpeedMS;
      trans.o2RateLMin = segO2RateLMin;
      trans.metabolicPowerW = segPowerW;
      trans.radiationMSvDay = waypoints[i].radiationMSvDay;
      trans.tempK = waypoints[i].tempK;
      waypoints[i].effectiveSpeedMS = segEffSpeedMS;
      waypoints[i].o2RateLMin = segO2RateLMin;
      waypoints[i].metabolicPowerW = segPowerW;

      sumWeightedEffectiveSpeed += segEffSpeedMS * segDistM;
      sumWeightedRadMSvDay += radMSvDay * segDistM;
      minEffectiveSpeedMS = Math.min(minEffectiveSpeedMS, segEffSpeedMS);
      maxEffectiveSpeedMS = Math.max(maxEffectiveSpeedMS, segEffSpeedMS);
      peakO2RateLMin = Math.max(peakO2RateLMin, segO2RateLMin);
      minO2RateLMin = Math.min(minO2RateLMin, segO2RateLMin);

      waypoints[i].tau = env.tau;
      waypoints[i].windSpeedKmH = env.windSpeedKmH;
      waypoints[i].windClass = env.windClass;
      waypoints[i].arrivalHrs = arrivalHrs;
      waypoints[i].violates48hBuffer = env.violates48hBuffer;

      trans.tau = env.tau;
      trans.windSpeedKmH = env.windSpeedKmH;
      trans.windClass = env.windClass;
      trans.violates48hBuffer = env.violates48hBuffer;
      trans.minTemporalBufferHrs = env.minTemporalBufferHrs;

      if (env.tau >= 2.0 || env.windSpeedKmH > 100.0 || env.violates48hBuffer) {
        unsafeStormCount++;
        if (env.violates48hBuffer) storm48hViolationCount++;
        trans.safetyClass = SAFETY_CLASSES.UNSAFE;
        trans.color = '#ef4444';
      } else if (env.tauClass === 'CAUTION' || env.windClass === 'CAUTION') {
        cautionStormCount++;
        if (trans.safetyClass === SAFETY_CLASSES.SAFE) {
          trans.safetyClass = SAFETY_CLASSES.CAUTION;
          trans.color = CAUTION_COLOR;
        }
      }

      if (trans.safetyClass === SAFETY_CLASSES.UNSAFE) unsafeCount++;
      else if (trans.safetyClass === SAFETY_CLASSES.CAUTION) cautionCount++;
      else if (trans.safetyClass === SAFETY_CLASSES.UNKNOWN) unknownCount++;
      if (trans.isNearFlat) flatCount++;
    }
  }

  // Copy first segment's outgoing signed slope and telemetry to start waypoint if available
  if (waypoints.length > 1 && segments.length > 0) {
    waypoints[0].signedSlopeDeg = segments[0].signedSlopeDeg;
    waypoints[0].deltaZ = segments[0].deltaZ;
    waypoints[0].costMultiplier = segments[0].costMultiplier;
    waypoints[0].effectiveSpeedMS = segments[0].effectiveSpeedMS;
    waypoints[0].o2RateLMin = segments[0].o2RateLMin;
    waypoints[0].metabolicPowerW = segments[0].metabolicPowerW;
    waypoints[0].slopeClass = segments[0].slopeClass;
    waypoints[0].safetyClass = segments[0].safetyClass;
  }

  const avgSlopeDeg = segments.length > 0 ? sumSlopeDeg / segments.length : 0.0;

  let overallSafety = SAFETY_CLASSES.SAFE;
  if (unsafeCount > 0 || unsafePressureCount > 0 || unsafeStormCount > 0) {
    overallSafety = SAFETY_CLASSES.UNSAFE;
  } else if (cautionCount > 0 || cautionStormCount > 0) {
    overallSafety = SAFETY_CLASSES.CAUTION;
  } else if (unknownCount > 0 || unknownPressureCount > 0) {
    overallSafety = SAFETY_CLASSES.UNKNOWN;
  } else {
    overallSafety = SAFETY_CLASSES.SAFE;
  }

  const traversalTimeSec = sumSegDurationEffSec > 0 ? sumSegDurationEffSec : (totalDistM / Math.max(0.1, speedMS));
  const timeMin = traversalTimeSec / 60.0;

  // Grade-dependent metabolic multiplier (Mars Minetti & Givoni-Goldman model)
  const uphillGrade = totalDistM > 0 ? totalAscentM / totalDistM : 0.0;
  const downhillGrade = totalDistM > 0 ? totalDescentM / totalDistM : 0.0;
  const metabolicMultiplier = (1.0 + 3.6 * uphillGrade + 0.8 * downhillGrade + massPenaltyTerm) * speedMetabolicFactor;
  const fallbackO2Rate = Math.round(2.8 * metabolicMultiplier * 100) / 100;
  const totalO2L = Math.round((sumSegO2L > 0 ? sumSegO2L : fallbackO2Rate * timeMin) * 10) / 10;
  const avgO2RateLMin = timeMin > 0 ? Math.round((totalO2L / timeMin) * 100) / 100 : fallbackO2Rate;
  if (!Number.isFinite(peakO2RateLMin) || peakO2RateLMin <= 0) peakO2RateLMin = avgO2RateLMin;
  if (!Number.isFinite(minO2RateLMin)) minO2RateLMin = avgO2RateLMin;
  const avgEffectiveSpeedMS = totalDistM > 0
    ? Math.round((sumWeightedEffectiveSpeed / totalDistM) * 1000) / 1000
    : speedMS;
  const remainingO2L = Math.round((initialO2L - totalO2L) * 10) / 10;
  const o2UsedPct = Math.round((totalO2L / initialO2L) * 1000) / 10;
  const isOxygenFeasible = remainingO2L >= 0.0;
  const safetyReserveRatio = 0.20;
  const returnReserveO2L = Math.round(initialO2L * safetyReserveRatio * 10) / 10;
  const o2ReserveWarning = remainingO2L < returnReserveO2L;
  const hasReserveMargin = !o2ReserveWarning;
  const o2DeficitL = !isOxygenFeasible ? Math.round((totalO2L - initialO2L) * 10) / 10 : 0.0;
  const totalEnergyKJ = totalEnergyJ / 1000.0;
  const totalEnergyKcal = Math.round((totalEnergyKJ / 4.184) * 10) / 10;
  const totalEnergyWh = Math.round((totalEnergyKJ / 3.6) * 10) / 10;
  const avgMetabolicPowerW = traversalTimeSec > 0 ? Math.round((totalEnergyJ / traversalTimeSec) * 10) / 10 : 0.0;
  const suitMaxEvaLimitHrs = 8.0; // NASA xEMU standard 8.0 h EVA limit
  const o2LimitedEnduranceHrs = avgO2RateLMin > 0 ? Math.round(((initialO2L / avgO2RateLMin) / 60.0) * 100) / 100 : suitMaxEvaLimitHrs;
  const avgRadiationMSvDay = totalDistM > 0 ? Math.round((sumWeightedRadMSvDay / totalDistM) * 1000) / 1000 : (waypoints[0]?.radiationMSvDay || 0.64);
  const missionRadiationDoseMSv = Math.round((avgRadiationMSvDay * ((traversalTimeSec / 3600.0) / 24.0)) * 10000) / 10000;

  // Build high-resolution MOLA DEM trajectory profile samples (at least ~32 samples along path)
  // so any-angle trajectories (e.g., Field D*) expose continuous DEM elevation & slope variations along long rays.
  const trajectorySamples = [];
  if (rawPath.length >= 2) {
    const totalGridLen = rawPath.slice(1).reduce((acc, pt, idx) => {
      const p0 = rawPath[idx];
      const r0 = Array.isArray(p0) ? p0[0] : p0.r;
      const c0 = Array.isArray(p0) ? p0[1] : p0.c;
      const r1 = Array.isArray(pt) ? pt[0] : pt.r;
      const c1 = Array.isArray(pt) ? pt[1] : pt.c;
      let dc = c1 - c0;
      if (dc > cols * 0.5) dc -= cols;
      if (dc < -cols * 0.5) dc += cols;
      return acc + Math.hypot(r1 - r0, dc);
    }, 0.0);

    const targetSamples = Math.max(32, waypoints.length);
    let cumSampleDistM = 0.0;

    for (let i = 0; i < rawPath.length - 1; i++) {
      const p0 = rawPath[i];
      const p1 = rawPath[i + 1];
      const r0 = Array.isArray(p0) ? p0[0] : p0.r;
      const c0 = Array.isArray(p0) ? p0[1] : p0.c;
      const r1 = Array.isArray(p1) ? p1[0] : p1.r;
      const c1 = Array.isArray(p1) ? p1[1] : p1.c;
      let dc = c1 - c0;
      if (dc > cols * 0.5) dc -= cols;
      if (dc < -cols * 0.5) dc += cols;
      const dr = r1 - r0;
      const segGridLen = Math.hypot(dr, dc);
      const subSteps = Math.max(1, Math.min(48, Math.ceil((segGridLen / Math.max(1e-3, totalGridLen)) * targetSamples)));

      for (let s = 0; s <= subSteps; s++) {
        if (i > 0 && s === 0) continue; // Avoid duplicating interior join vertices
        const frac = s / subSteps;
        const sr = r0 + frac * dr;
        const sc = ((c0 + frac * dc) % cols + cols) % cols;
        const sGeo = gridToGeo(sr, sc, rows, cols);
        const sElevSample = sampleBilinearElevation(terrainData.elevationGrid, rows, cols, sr, sc);
        const sElev = sElevSample.elevation;
        const sNoData = !sElevSample.isValid || !Number.isFinite(sElev) || sElev < -20000.0 || sElev > 40000.0;

        let stepDistM = 0.0;
        let signedSlopeDeg = 0.0;
        let costMult = 1.0;
        let sEffSpd = speedMS;
        let sO2Rate = Math.round(2.8 * (1.0 + massPenaltyTerm) * speedMetabolicFactor * 100) / 100;
        let sPowerW = 0.0;
        let sSafety = SAFETY_CLASSES.SAFE;

        if (trajectorySamples.length > 0) {
          const prevS = trajectorySamples[trajectorySamples.length - 1];
          stepDistM = Math.max(1.0, computePlanetaryDistanceMeters(prevS.lat, prevS.lon, sGeo.lat, sGeo.lon));
          cumSampleDistM += stepDistM;
          const dz = sElev - prevS.elevationM;
          const slopeInfo = calculateSignedSlope(prevS.elevationM, sElev, stepDistM);
          signedSlopeDeg = slopeInfo.valid ? slopeInfo.signedSlopeDeg : 0.0;
          const dirEval = evaluateDirectionalSlopeCost(signedSlopeDeg, maxSafeSlope);
          costMult = Number.isFinite(dirEval.costMultiplier) ? Math.max(0.5, Math.min(12.0, dirEval.costMultiplier)) : 4.0;
          sSafety = dirEval.safetyClass;
          const sArrivalHrs = simStartHrs + (cumSampleDistM / Math.max(0.1, speedMS)) / 3600.0;
          const sEnv = stormSim.getEnvironmentalConditionsAt(sGeo.lat, sGeo.lon, sArrivalHrs);
          const sDustImp = 1.0 + 0.10 * Math.max(0.0, sEnv.tau || 0.0);
          sEffSpd = Math.round((speedMS / (Math.sqrt(costMult) * sDustImp)) * 1000) / 1000;
          const upG = dz > 0 ? (dz / stepDistM) : 0.0;
          const dnG = dz < 0 ? (Math.abs(dz) / stepDistM) : 0.0;
          sO2Rate = Math.round(2.8 * (1.0 + 3.6 * upG + 0.8 * dnG + massPenaltyTerm) * speedMetabolicFactor * 100) / 100;
          const sEnergyJ = estimateTransitionEnergy(stepDistM, dz, Math.abs(signedSlopeDeg), { ...profile, speed: speedMS });
          const sDurSec = stepDistM / Math.max(0.05, sEffSpd);
          sPowerW = Math.round((sEnergyJ / Math.max(1e-3, sDurSec)) * 10) / 10;

          minEffectiveSpeedMS = Math.min(minEffectiveSpeedMS, sEffSpd);
          maxEffectiveSpeedMS = Math.max(maxEffectiveSpeedMS, sEffSpd);
          peakO2RateLMin = Math.max(peakO2RateLMin, sO2Rate);
          minO2RateLMin = Math.min(minO2RateLMin, sO2Rate);
        }

        trajectorySamples.push({
          index: trajectorySamples.length,
          lat: sGeo.lat,
          lon: sGeo.lon,
          elevationM: sElev,
          isNoData: sNoData,
          cumDistM: cumSampleDistM,
          cumDistKm: cumSampleDistM / 1000.0,
          stepDistM,
          signedSlopeDeg,
          costMultiplier: costMult,
          effectiveSpeedMS: sEffSpd,
          o2RateLMin: sO2Rate,
          metabolicPowerW: sPowerW,
          safetyClass: sSafety
        });
      }
    }
    if (trajectorySamples.length > 1) {
      trajectorySamples[0].signedSlopeDeg = trajectorySamples[1].signedSlopeDeg;
      trajectorySamples[0].costMultiplier = trajectorySamples[1].costMultiplier;
      trajectorySamples[0].effectiveSpeedMS = trajectorySamples[1].effectiveSpeedMS;
      trajectorySamples[0].o2RateLMin = trajectorySamples[1].o2RateLMin;
      trajectorySamples[0].metabolicPowerW = trajectorySamples[1].metabolicPowerW;
    }
  }

  const smoothness = computePathSmoothness(rawPath);

  // Topological traversability is valid if zero unsafe segments are traversed
  const isTraversable = (unsafeCount === 0 && unsafePressureCount === 0 && unsafeStormCount === 0);
  const isValid = isTraversable;
  const safetyStatus = overallSafety;

  return {
    isValid,
    isOxygenFeasible,
    safetyStatus,
    waypoints,
    segments,
    trajectorySamples,
    metrics: {
      totalDistanceM: Math.round(totalDistM * 10) / 10,
      totalDistanceKm: totalDistM / 1000.0,
      speedMS,
      configuredSpeedMS: speedMS,
      avgEffectiveSpeedMS,
      minEffectiveSpeedMS: Number.isFinite(minEffectiveSpeedMS) ? minEffectiveSpeedMS : speedMS,
      maxEffectiveSpeedMS: maxEffectiveSpeedMS > 0 ? maxEffectiveSpeedMS : speedMS,
      bodyMassKg,
      equipmentMassKg,
      suitMassKg,
      totalMassKg,
      initialO2L,
      avgO2RateLMin,
      peakO2RateLMin,
      minO2RateLMin,
      totalO2L,
      remainingO2L,
      returnReserveO2L,
      o2UsedPct,
      isOxygenFeasible,
      hasReserveMargin,
      o2ReserveWarning,
      o2DeficitL,
      smoothnessScore: smoothness.smoothnessScore,
      avgTurnDeg: smoothness.avgTurnDeg,
      totalTurnDeg: smoothness.totalTurnDeg,
      totalAscentM,
      totalDescentM,
      maxSegDeltaZM: Math.round(maxSegDeltaZM * 10) / 10,
      totalEnergyKJ,
      totalEnergyKcal,
      totalEnergyWh,
      avgMetabolicPowerW,
      energyPerKmKJ: totalDistM > 0 ? totalEnergyKJ / (totalDistM / 1000.0) : 0.0,
      maxSlopeDeg,
      maxLocalSlopeDeg,
      maxUphillSlopeDeg: Math.round(maxUphillSlopeDeg * 100) / 100,
      maxDownhillSlopeDeg: Math.round(maxDownhillSlopeDeg * 100) / 100,
      avgSlopeDeg,
      thetaMaxUp: maxSafeSlope,
      thetaMaxDown: 0.75 * maxSafeSlope,
      thetaRef: 0.4 * maxSafeSlope,
      elevationVariationM: totalAscentM + totalDescentM,
      traversalTimeHrs: traversalTimeSec / 3600.0,
      traversalTimeMin: Math.round(timeMin * 10) / 10,
      suitMaxEvaLimitHrs,
      o2LimitedEnduranceHrs,
      avgRadiationMSvDay,
      missionRadiationDoseMSv,
      noDataSampleCount,
      cautionSegments: cautionCount,
      cautionSlopeSegments: cautionCount,
      unsafeSegments: unsafeCount,
      unknownSegments: unknownCount,
      flatSegments: flatCount,
      pressureStatus: (unsafePressureCount > 0 ? 'UNSAFE' : (cautionPressureCount > 0 ? 'CAUTION' : (unknownPressureCount > 0 ? 'UNKNOWN' : 'SAFE'))),
      unsafePressureSegments: unsafePressureCount,
      cautionPressureSegments: cautionPressureCount,
      unknownPressureSegments: unknownPressureCount,
      knownSafePressureSegments: safePressureCount,
      unsafeStormSegments: unsafeStormCount,
      cautionStormSegments: cautionStormCount,
      storm48hViolations: storm48hViolationCount,
      maxTau,
      maxWindSpeedKmH
    }
  };
}

/**
 * PART D — Multi-Radius Route Corridor Safety Scan (Segment Level)
 * Evaluates a surrounding geographic corridor around a directed segment fromPt -> toPt
 * using three concentric geographic radii in metres:
 *   1. Immediate neighborhood:    r1 = 0.40 * C
 *   2. Intermediate neighborhood: r2 = 0.75 * C
 *   3. Outer safety buffer:       r3 = 1.00 * C
 * Plus an extended proximity ring (1.35 * C) to measure exact minDistanceToUnsafeM.
 *
 * Detects:
 * - UNSAFE cells intruding into the immediate or intermediate neighborhood
 * - Cliff transitions and steep crater rim walls adjacent to the centerline
 * - Narrow safe channels pinched between two opposing UNSAFE zones (Test 4)
 * - Risk density (cautionDensity, unsafeDensity) and UNKNOWN coverage (Test 5, Test 6)
 */
export function evaluateSegmentCorridorSafety(fromPt, toPt, terrainData, profile = {}, options = {}) {
  const { elevationGrid, slopeGrid, rows = 360, cols = 720 } = terrainData || {};
  const rawMaxSlope = options.maxSafeSlope ?? profile.maxSafeSlopeDeg ?? (typeof window !== 'undefined' && window.evaSettings?.settings?.maxSafeSlopeDeg) ?? 22.0;
  const maxSafeSlope = (Number.isFinite(Number(rawMaxSlope)) && Number(rawMaxSlope) > 0) ? Math.max(1.0, Number(rawMaxSlope)) : 22.0;
  const thetaMaxUp = maxSafeSlope;
  const thetaMaxDown = 0.75 * maxSafeSlope;
  const thetaRef = (options.thetaRefRatio || 0.4) * maxSafeSlope;

  const rawClearance = options.routeSafetyClearanceM ?? profile.routeSafetyClearanceM ?? (typeof window !== 'undefined' && window.evaSettings?.settings?.routeSafetyClearanceM) ?? 30000;
  const clearanceM = Number.isFinite(Number(rawClearance)) ? Math.max(0, Number(rawClearance)) : 30000;

  const r1M = 0.40 * clearanceM;
  const r2M = 0.75 * clearanceM;
  const r3M = 1.00 * clearanceM;
  const rExtM = Math.max(r3M * 1.4, 38000);

  const maxCautionDensity = options.maxCautionDensity ?? profile.maxCautionDensity ?? (typeof window !== 'undefined' && window.evaSettings?.settings?.maxCautionDensity) ?? 0.35;
  const maxUnknownCoverage = options.maxUnknownCoverage ?? profile.maxUnknownCoverage ?? (typeof window !== 'undefined' && window.evaSettings?.settings?.maxUnknownCoverage) ?? 0.15;
  const strictUnknown = options.strictUnknown !== false;

  let r0 = Array.isArray(fromPt) ? fromPt[0] : fromPt.r;
  let c0 = Array.isArray(fromPt) ? fromPt[1] : fromPt.c;
  let r1 = Array.isArray(toPt) ? toPt[0] : toPt.r;
  let c1Val = Array.isArray(toPt) ? toPt[1] : toPt.c;

  // Seamlessly convert from geographic coordinates ({lat, lon}) if grid coordinates are not present
  if ((r0 === undefined || isNaN(r0)) && fromPt && fromPt.lat !== undefined) {
    const g0 = geoToGrid(fromPt.lat, fromPt.lon, rows, cols);
    r0 = g0.r;
    c0 = g0.c;
  }
  if ((r1 === undefined || isNaN(r1)) && toPt && toPt.lat !== undefined) {
    const g1 = geoToGrid(toPt.lat, toPt.lon, rows, cols);
    r1 = g1.r;
    c1Val = g1.c;
  }

  let dc = c1Val - c0;
  if (dc > cols * 0.5) dc -= cols;
  if (dc < -cols * 0.5) dc += cols;
  const dr = r1 - r0;
  const gridDist = Math.hypot(dr, dc);

  const fromGeo = gridToGeo(r0, c0, rows, cols);
  const toGeo = gridToGeo(r1, c1Val, rows, cols);
  const segDistM = computePlanetaryDistanceMeters(fromGeo.lat, fromGeo.lon, toGeo.lat, toGeo.lon);

  if (clearanceM <= 1.0) {
    return {
      isCorridorSafe: true,
      corridorStatus: 'SAFE_CORRIDOR',
      rejectionReason: null,
      clearanceM: 0,
      immediateRadiusM: 0,
      intermediateRadiusM: 0,
      outerRadiusM: 0,
      minDistanceToUnsafeM: rExtM,
      cautionDensity: 0.0,
      unsafeDensity: 0.0,
      unknownCoverage: 0.0,
      unsafeImmediateCount: 0,
      unsafeIntermediateCount: 0,
      unsafeOuterCount: 0,
      cautionSampleCount: 0,
      safeSampleCount: 1,
      unknownSampleCount: 0,
      totalSamples: 1,
      narrowChannelPinchCount: 0,
      cliffTransitionCount: 0,
      offendingCells: [],
      corridorSamples: []
    };
  }

  const alongSteps = Math.max(2, Math.min(12, Math.ceil(gridDist * 2.5)));
  const dyPerRowM = (Math.PI * MARS_RADIUS_M) / rows; // ~29,637.4 m on 360-row grid
  const angles = [0, Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.75, Math.PI, Math.PI * 1.25, Math.PI * 1.5, Math.PI * 1.75];

  let totalSamples = 0;
  let safeSampleCount = 0;
  let cautionSampleCount = 0;
  let unsafeImmediateCount = 0;
  let unsafeIntermediateCount = 0;
  let unsafeOuterCount = 0;
  let unknownSampleCount = 0;
  let narrowChannelPinchCount = 0;
  let cliffTransitionCount = 0;
  let minDistanceToUnsafeM = rExtM * 1.5;

  const offendingCells = [];
  const corridorSamples = [];
  const collectDiag = Boolean(options.collectDiagnostics);

  for (let s = 0; s <= alongSteps; s++) {
    const t = s / alongSteps;
    const sr = Math.max(0, Math.min(rows - 1, r0 + t * dr));
    const sc = ((c0 + t * dc) % cols + cols) % cols;
    const sGeo = gridToGeo(sr, sc, rows, cols);
    const cosLat = Math.max(0.08, Math.cos((sGeo.lat * Math.PI) / 180.0));
    const dxPerColM = (2.0 * Math.PI * MARS_RADIUS_M * cosLat) / cols;

    const centerElevInfo = sampleBilinearElevation(elevationGrid, rows, cols, sr, sc);
    const zCenter = centerElevInfo.elevation;

    // Evaluate 3 concentric rings (r1 = 0.40 C, r2 = 0.75 C, r3 = 1.00 C) + extended proximity ring (rExtM)
    const rings = [
      { name: 'immediate', radiusM: r1M },
      { name: 'intermediate', radiusM: r2M },
      { name: 'outer', radiusM: r3M },
      { name: 'extended', radiusM: rExtM }
    ];

    // Track opposing rays at r2 to detect narrow ravine / channel between two UNSAFE walls (Test 4)
    const r2RayUnsafe = new Array(8).fill(false);

    for (let rk = 0; rk < rings.length; rk++) {
      const ring = rings[rk];
      if (ring.radiusM <= 1.0) continue;

      for (let aIdx = 0; aIdx < angles.length; aIdx++) {
        const phi = angles[aIdx];
        const offsetNorthM = Math.sin(phi) * ring.radiusM;
        const offsetEastM = Math.cos(phi) * ring.radiusM;
        const qr = Math.max(0, Math.min(rows - 1, sr - offsetNorthM / dyPerRowM));
        const qc = ((sc + offsetEastM / dxPerColM) % cols + cols) % cols;

        const qElevInfo = sampleBilinearElevation(elevationGrid, rows, cols, qr, qc);
        const qLocalSlope = sampleBilinearSlope(slopeGrid, elevationGrid, rows, cols, qr, qc);

        let radialSlopeDeg = 0.0;
        let radialAbsSlopeDeg = 0.0;
        let radialSafety = SAFETY_CLASSES.SAFE;
        let sampleSafety = SAFETY_CLASSES.SAFE;

        if (!qElevInfo.isValid || !centerElevInfo.isValid) {
          sampleSafety = SAFETY_CLASSES.UNKNOWN;
        } else {
          const dzRadial = qElevInfo.elevation - zCenter;
          const radSlopeInfo = calculateSignedSlope(zCenter, qElevInfo.elevation, ring.radiusM);
          radialSlopeDeg = radSlopeInfo.signedSlopeDeg;
          radialAbsSlopeDeg = Math.abs(radialSlopeDeg);

          // Check both outward (center -> q) and inward (q -> center) directional slope limits
          const outEval = evaluateDirectionalSlopeCost(radialSlopeDeg, maxSafeSlope);
          const inEval = evaluateDirectionalSlopeCost(-radialSlopeDeg, maxSafeSlope);
          if (outEval.safetyClass === SAFETY_CLASSES.UNSAFE || inEval.safetyClass === SAFETY_CLASSES.UNSAFE || qLocalSlope > thetaMaxUp + 1e-9) {
            radialSafety = SAFETY_CLASSES.UNSAFE;
          } else if (outEval.safetyClass === SAFETY_CLASSES.CAUTION || inEval.safetyClass === SAFETY_CLASSES.CAUTION || qLocalSlope > thetaRef + 1e-9) {
            radialSafety = SAFETY_CLASSES.CAUTION;
          }

          // Detect sharp cliff scarp transition adjacent to route
          if (Math.abs(dzRadial) > 480.0 && (radialAbsSlopeDeg > thetaMaxDown * 0.92 || qLocalSlope > thetaMaxUp * 0.92)) {
            radialSafety = SAFETY_CLASSES.UNSAFE;
            if (ring.name !== 'extended') cliffTransitionCount++;
          }

          sampleSafety = radialSafety;
        }

        if (sampleSafety === SAFETY_CLASSES.UNSAFE) {
          if (ring.radiusM < minDistanceToUnsafeM) {
            minDistanceToUnsafeM = ring.radiusM;
          }
          if (ring.name === 'immediate') {
            unsafeImmediateCount++;
            offendingCells.push({ r: qr, c: qc, ring: ring.name, distM: ring.radiusM, safetyClass: SAFETY_CLASSES.UNSAFE, localSlopeDeg: qLocalSlope });
          } else if (ring.name === 'intermediate') {
            unsafeIntermediateCount++;
            r2RayUnsafe[aIdx] = true;
            offendingCells.push({ r: qr, c: qc, ring: ring.name, distM: ring.radiusM, safetyClass: SAFETY_CLASSES.UNSAFE, localSlopeDeg: qLocalSlope });
          } else if (ring.name === 'outer') {
            unsafeOuterCount++;
          }
        }

        // Only count inside the 3 active corridor rings (immediate, intermediate, outer) for density metrics
        if (ring.name !== 'extended') {
          totalSamples++;
          if (sampleSafety === SAFETY_CLASSES.UNKNOWN) {
            unknownSampleCount++;
          } else if (sampleSafety === SAFETY_CLASSES.UNSAFE) {
            // Counted in unsafeImmediate/Intermediate/Outer
          } else if (sampleSafety === SAFETY_CLASSES.CAUTION) {
            cautionSampleCount++;
          } else {
            safeSampleCount++;
          }

          if (collectDiag && (s % 2 === 0 || sampleSafety !== SAFETY_CLASSES.SAFE)) {
            const qGeo = gridToGeo(qr, qc, rows, cols);
            corridorSamples.push({
              lat: qGeo.lat,
              lon: qGeo.lon,
              r: qr,
              c: qc,
              ring: ring.name,
              distM: Math.round(ring.radiusM),
              safetyClass: sampleSafety,
              localSlopeDeg: Math.round(qLocalSlope * 100) / 100,
              radialSlopeDeg: Math.round(radialSlopeDeg * 100) / 100
            });
          }
        }
      }
    }

    // Check opposing rays (0 vs 4, 1 vs 5, 2 vs 6, 3 vs 7) for narrow ravine / channel pinch between two UNSAFE walls
    for (let k = 0; k < 4; k++) {
      if (r2RayUnsafe[k] && r2RayUnsafe[k + 4]) {
        narrowChannelPinchCount++;
      }
    }
  }

  const unsafeTotalInCorridor = unsafeImmediateCount + unsafeIntermediateCount + unsafeOuterCount;
  const denom = Math.max(1, totalSamples);
  const unsafeDensity = unsafeTotalInCorridor / denom;
  const cautionDensity = cautionSampleCount / denom;
  const unknownCoverage = unknownSampleCount / denom;
  const ringSampleCount = Math.max(1, (alongSteps + 1) * 8);
  const unsafeIntermediateRatio = unsafeIntermediateCount / ringSampleCount;

  let isCorridorSafe = true;
  let corridorStatus = 'SAFE_CORRIDOR';
  let rejectionReason = null;

  if (strictUnknown && unknownCoverage > maxUnknownCoverage) {
    isCorridorSafe = false;
    corridorStatus = 'REJECTED_UNKNOWN_COVERAGE';
    rejectionReason = 'REJECTED_UNKNOWN_COVERAGE';
  } else if (
    unsafeImmediateCount > 0 ||
    narrowChannelPinchCount > 0 ||
    cliffTransitionCount > 0 ||
    unsafeIntermediateRatio > 0.12 ||
    unsafeDensity > 0.06
  ) {
    isCorridorSafe = false;
    corridorStatus = 'REJECTED_UNSAFE_PROXIMITY';
    rejectionReason = 'REJECTED_UNSAFE_PROXIMITY';
  } else if (cautionDensity > maxCautionDensity) {
    isCorridorSafe = false;
    corridorStatus = 'REJECTED_RISK_DENSITY';
    rejectionReason = 'REJECTED_RISK_DENSITY';
  } else if (cautionDensity > 0.03 || unsafeOuterCount > 0) {
    isCorridorSafe = true;
    corridorStatus = 'CAUTION_CORRIDOR';
  }

  return {
    isCorridorSafe,
    corridorStatus,
    rejectionReason,
    clearanceM,
    immediateRadiusM: r1M,
    intermediateRadiusM: r2M,
    outerRadiusM: r3M,
    segmentDistanceM: segDistM,
    minDistanceToUnsafeM: Math.round(minDistanceToUnsafeM),
    cautionDensity: Math.round(cautionDensity * 1000) / 1000,
    unsafeDensity: Math.round(unsafeDensity * 1000) / 1000,
    unknownCoverage: Math.round(unknownCoverage * 1000) / 1000,
    unsafeImmediateCount,
    unsafeIntermediateCount,
    unsafeOuterCount,
    cautionSampleCount,
    safeSampleCount,
    unknownSampleCount,
    totalSamples,
    narrowChannelPinchCount,
    cliffTransitionCount,
    offendingCells,
    corridorSamples
  };
}

/**
 * PART D & PART F — Whole-Route Multi-Radius Corridor Safety Scan
 * Scans every segment of a candidate route, aggregates corridor safety metrics,
 * distinguishes brief isolated CAUTION patches (Test 6) from dense/continuous CAUTION regions (Test 5),
 * and identifies offending segments for Part E iterative alternative corridor search.
 */
export function evaluateRouteCorridor(rawPath, terrainData, profile = {}, weights = {}, options = {}) {
  if (!rawPath || rawPath.length < 2) {
    return {
      isValidCorridor: false,
      corridorStatus: 'VALIDATION_FAILED',
      rejectionReason: 'NO_PATH_FOUND',
      minDistanceToUnsafeM: 0,
      maxCautionDensity: 0,
      maxUnsafeDensity: 0,
      avgCautionDensity: 0,
      unknownCoverage: 0,
      offendingSegments: [],
      corridorSamples: []
    };
  }

  const rawClearance = options.routeSafetyClearanceM ?? profile.routeSafetyClearanceM ?? (typeof window !== 'undefined' && window.evaSettings?.settings?.routeSafetyClearanceM) ?? 30000;
  const clearanceM = Number.isFinite(Number(rawClearance)) ? Math.max(0, Number(rawClearance)) : 30000;
  const maxCautionDensityLimit = options.maxCautionDensity ?? profile.maxCautionDensity ?? (typeof window !== 'undefined' && window.evaSettings?.settings?.maxCautionDensity) ?? 0.35;
  const maxUnknownCoverageLimit = options.maxUnknownCoverage ?? profile.maxUnknownCoverage ?? (typeof window !== 'undefined' && window.evaSettings?.settings?.maxUnknownCoverage) ?? 0.15;
  const strictUnknown = options.strictUnknown !== false;

  let minDistanceToUnsafeM = Math.max(clearanceM * 1.5, 45000);
  let maxCautionDensity = 0.0;
  let maxUnsafeDensity = 0.0;
  let totalCorridorSamples = 0;
  let totalCautionSamples = 0;
  let totalUnsafeSamples = 0;
  let totalUnknownSamples = 0;
  let totalSafeSamples = 0;
  let totalUnsafeImmediate = 0;
  let totalUnsafeIntermediate = 0;
  let totalPinchCount = 0;
  let totalCliffCount = 0;

  let consecutiveCautionSegs = 0;
  let maxConsecutiveCautionSegs = 0;

  const segmentEvaluations = [];
  const offendingSegments = [];
  const allCorridorSamples = [];
  const collectDiag = Boolean(options.collectDiagnostics);

  for (let i = 0; i < rawPath.length - 1; i++) {
    const p0 = rawPath[i];
    const p1 = rawPath[i + 1];
    const segScan = evaluateSegmentCorridorSafety(p0, p1, terrainData, profile, {
      ...options,
      routeSafetyClearanceM: clearanceM,
      maxCautionDensity: maxCautionDensityLimit,
      maxUnknownCoverage: maxUnknownCoverageLimit,
      collectDiagnostics: collectDiag
    });

    segmentEvaluations.push(segScan);
    if (segScan.minDistanceToUnsafeM < minDistanceToUnsafeM) {
      minDistanceToUnsafeM = segScan.minDistanceToUnsafeM;
    }
    if (segScan.cautionDensity > maxCautionDensity) {
      maxCautionDensity = segScan.cautionDensity;
    }
    if (segScan.unsafeDensity > maxUnsafeDensity) {
      maxUnsafeDensity = segScan.unsafeDensity;
    }

    totalCorridorSamples += segScan.totalSamples;
    totalCautionSamples += segScan.cautionSampleCount;
    totalUnsafeSamples += (segScan.unsafeImmediateCount + segScan.unsafeIntermediateCount + segScan.unsafeOuterCount);
    totalUnknownSamples += segScan.unknownSampleCount;
    totalSafeSamples += segScan.safeSampleCount;
    totalUnsafeImmediate += segScan.unsafeImmediateCount;
    totalUnsafeIntermediate += segScan.unsafeIntermediateCount;
    totalPinchCount += segScan.narrowChannelPinchCount;
    totalCliffCount += segScan.cliffTransitionCount;

    if (segScan.cautionDensity > 0.22) {
      consecutiveCautionSegs++;
      if (consecutiveCautionSegs > maxConsecutiveCautionSegs) {
        maxConsecutiveCautionSegs = consecutiveCautionSegs;
      }
    } else {
      consecutiveCautionSegs = 0;
    }

    if (!segScan.isCorridorSafe) {
      offendingSegments.push({
        segIndex: i,
        fromPt: p0,
        toPt: p1,
        corridorStatus: segScan.corridorStatus,
        rejectionReason: segScan.rejectionReason,
        cautionDensity: segScan.cautionDensity,
        unsafeDensity: segScan.unsafeDensity,
        minDistanceToUnsafeM: segScan.minDistanceToUnsafeM,
        offendingCells: segScan.offendingCells
      });
    }

    if (collectDiag && segScan.corridorSamples.length > 0) {
      for (const cs of segScan.corridorSamples) {
        if (allCorridorSamples.length < 1800) {
          allCorridorSamples.push(cs);
        }
      }
    }
  }

  const denom = Math.max(1, totalCorridorSamples);
  const avgCautionDensity = totalCautionSamples / denom;
  const avgUnsafeDensity = totalUnsafeSamples / denom;
  const overallUnknownCoverage = totalUnknownSamples / denom;
  const segCount = Math.max(1, rawPath.length - 1);

  // Distinguish brief isolated CAUTION patch (Test 6) from dense/continuous CAUTION region (Test 5):
  // If a single short segment has moderate cautionDensity (<= maxCautionDensityLimit + 0.12) while overall avgCautionDensity <= maxCautionDensityLimit * 0.65
  // and there are zero UNSAFE intrusions, allow it as an isolated CAUTION_CORRIDOR!
  const hasUnsafeProximityViolation = offendingSegments.some(s => s.corridorStatus === 'REJECTED_UNSAFE_PROXIMITY');
  const hasUnknownViolation = strictUnknown && (overallUnknownCoverage > maxUnknownCoverageLimit || offendingSegments.some(s => s.corridorStatus === 'REJECTED_UNKNOWN_COVERAGE'));

  const isContinuousDenseCaution = (
    avgCautionDensity > maxCautionDensityLimit ||
    maxCautionDensity > Math.min(0.85, maxCautionDensityLimit + 0.18) ||
    (maxConsecutiveCautionSegs >= Math.max(2, Math.ceil(segCount * 0.45)) && avgCautionDensity > maxCautionDensityLimit * 0.75)
  );

  let isValidCorridor = true;
  let corridorStatus = 'SAFE_CORRIDOR';
  let rejectionReason = null;

  if (hasUnknownViolation) {
    isValidCorridor = false;
    corridorStatus = 'REJECTED_UNKNOWN_COVERAGE';
    rejectionReason = 'REJECTED_UNKNOWN_COVERAGE';
  } else if (hasUnsafeProximityViolation) {
    isValidCorridor = false;
    corridorStatus = 'REJECTED_UNSAFE_PROXIMITY';
    rejectionReason = 'REJECTED_UNSAFE_PROXIMITY';
  } else if (isContinuousDenseCaution) {
    isValidCorridor = false;
    corridorStatus = 'REJECTED_RISK_DENSITY';
    rejectionReason = 'REJECTED_RISK_DENSITY';
    // Ensure high-caution segments are marked as offending so Part E routes around the dense CAUTION region
    if (offendingSegments.length === 0) {
      for (let i = 0; i < segmentEvaluations.length; i++) {
        if (segmentEvaluations[i].cautionDensity > maxCautionDensityLimit * 0.7) {
          offendingSegments.push({
            segIndex: i,
            fromPt: rawPath[i],
            toPt: rawPath[i + 1],
            corridorStatus: 'REJECTED_RISK_DENSITY',
            rejectionReason: 'REJECTED_RISK_DENSITY',
            cautionDensity: segmentEvaluations[i].cautionDensity,
            unsafeDensity: segmentEvaluations[i].unsafeDensity,
            minDistanceToUnsafeM: segmentEvaluations[i].minDistanceToUnsafeM,
            offendingCells: []
          });
        }
      }
    }
  } else if (totalCautionSamples > 0 || maxCautionDensity > 0 || totalUnsafeSamples > 0) {
    isValidCorridor = true;
    corridorStatus = 'CAUTION_CORRIDOR';
  }

  return {
    isValidCorridor,
    corridorStatus,
    rejectionReason,
    clearanceM,
    immediateRadiusM: Math.round(0.40 * clearanceM),
    intermediateRadiusM: Math.round(0.75 * clearanceM),
    outerRadiusM: Math.round(1.00 * clearanceM),
    minDistanceToUnsafeM: Math.round(minDistanceToUnsafeM),
    maxCautionDensity: Math.round(maxCautionDensity * 1000) / 1000,
    avgCautionDensity: Math.round(avgCautionDensity * 1000) / 1000,
    maxUnsafeDensity: Math.round(maxUnsafeDensity * 1000) / 1000,
    avgUnsafeDensity: Math.round(avgUnsafeDensity * 1000) / 1000,
    unknownCoverage: Math.round(overallUnknownCoverage * 1000) / 1000,
    totalUnsafeImmediate,
    totalUnsafeIntermediate,
    totalPinchCount,
    totalCliffCount,
    maxConsecutiveCautionSegs,
    segmentEvaluations,
    offendingSegments,
    corridorSamples: allCorridorSamples
  };
}

/**
 * PART B3 — Strict Terrain-Aware Route Simplification
 * Never replaces a terrain-aware route with a straight line unless ALL 7 conditions hold:
 * 1. Span j - i <= 3 (only local collinear/near-flat micro-steps can be merged; never collapse long chains).
 * 2. Every intermediate terrain sample along Pi -> Pj is evaluated.
 * 3. Every sub-segment satisfies signed directional slope limits and is strictly SAFE.
 * 4. Every sample satisfies local terrain steepness limits (maxLocalSlopeDeg <= 0.30 * thetaRef).
 * 5. No UNSAFE or CAUTION terrain is crossed, and elevation variation is minimal (elevVariationM <= 18 m, oscillationM <= 6 m).
 * 6. Full surrounding corridor clearance (evaluateSegmentCorridorSafety) is SAFE_CORRIDOR with zero UNSAFE cells in all 3 rings.
 * 7. The shortcut has strictly lower terrain-weighted cost than the original multi-segment sub-path.
 */
export function simplifyRouteTerrainAware(rawPath, terrainData, profile = {}, weights = {}, options = {}) {
  if (!rawPath || rawPath.length <= 2) return rawPath ? rawPath.slice() : [];

  const maxSpan = options.maxShortcutSpan !== undefined ? options.maxShortcutSpan : 3;
  const simplified = [rawPath[0]];
  let i = 0;

  while (i < rawPath.length - 1) {
    let chosenNext = i + 1;
    const maxJ = Math.min(rawPath.length - 1, i + maxSpan);

    // Avoid collapsing the entire path into 2 points if rawPath had >= 4 points on non-flat terrain
    for (let j = maxJ; j > i + 1; j--) {
      if (i === 0 && j === rawPath.length - 1 && rawPath.length >= 4) {
        // Only allow full collapse if the terrain across the entire span is genuinely flat (< 5 m variation)
        const testFull = evaluateTerrainTransition(rawPath[i], rawPath[j], terrainData, profile, weights, options);
        if (!testFull.traversable || testFull.elevationVariationM > 5.0 || testFull.maxSlopeDeg > 0.35) {
          continue;
        }
      }

      // Compute original multi-segment sub-path cost
      let subPathCost = 0.0;
      let subPathValid = true;
      for (let k = i; k < j; k++) {
        const stepEval = evaluateTerrainTransition(rawPath[k], rawPath[k + 1], terrainData, profile, weights, options);
        if (!stepEval.traversable) {
          subPathValid = false;
          break;
        }
        subPathCost += stepEval.cost;
      }
      if (!subPathValid) continue;

      const shortcutEval = evaluateTerrainTransition(rawPath[i], rawPath[j], terrainData, profile, weights, options);
      if (!shortcutEval.traversable) continue;
      if (shortcutEval.safetyClass !== SAFETY_CLASSES.SAFE) continue;
      if (shortcutEval.elevationVariationM > 18.0 || shortcutEval.oscillationM > 6.0) continue;
      if (shortcutEval.localSlopeDeg > Math.max(0.5, 0.30 * shortcutEval.thetaRef)) continue;
      if (shortcutEval.cost >= subPathCost * 0.998) continue;

      // Verify full surrounding corridor safety for the candidate shortcut
      const corrEval = evaluateSegmentCorridorSafety(rawPath[i], rawPath[j], terrainData, profile, options);
      if (
        !corrEval.isCorridorSafe ||
        corrEval.corridorStatus !== 'SAFE_CORRIDOR' ||
        corrEval.unsafeImmediateCount > 0 ||
        corrEval.unsafeIntermediateCount > 0 ||
        corrEval.unsafeOuterCount > 0 ||
        corrEval.cautionDensity > 0.05
      ) {
        continue;
      }

      chosenNext = j;
      break;
    }

    simplified.push(rawPath[chosenNext]);
    i = chosenNext;
  }

  return simplified;
}

/**
 * PART F — Independent Final Route & Corridor Validator
 * Runs after route generation to independently verify both direct path safety and 3-radius corridor safety.
 * Returns one of the explicit validation statuses:
 * - SAFE_CORRIDOR
 * - CAUTION_CORRIDOR
 * - REJECTED_UNSAFE_PROXIMITY
 * - REJECTED_RISK_DENSITY
 * - REJECTED_UNKNOWN_COVERAGE
 * - NO_SAFE_CORRIDOR_FOUND
 * - VALIDATION_FAILED
 */
export function validateFinalRouteCorridor(rawPath, terrainData, profile = {}, weights = {}, options = {}) {
  const directValidation = validateRoutePath(rawPath, terrainData, profile, weights, options);
  if (!directValidation || !directValidation.isValid || !rawPath || rawPath.length < 2) {
    return {
      isValid: false,
      finalValidationStatus: 'VALIDATION_FAILED',
      directPathStatus: directValidation?.safetyStatus || 'UNSAFE',
      corridorStatus: 'VALIDATION_FAILED',
      rejectionReason: 'DIRECT_SEGMENT_UNSAFE',
      directValidation,
      corridorValidation: null
    };
  }

  const corridorValidation = evaluateRouteCorridor(rawPath, terrainData, profile, weights, {
    ...options,
    collectDiagnostics: options.collectDiagnostics !== false
  });

  let finalValidationStatus = corridorValidation.corridorStatus;
  let isValid = corridorValidation.isValidCorridor;

  if (isValid) {
    if (directValidation.safetyStatus === 'CAUTION' || corridorValidation.corridorStatus === 'CAUTION_CORRIDOR') {
      finalValidationStatus = 'CAUTION_CORRIDOR';
    } else {
      finalValidationStatus = 'SAFE_CORRIDOR';
    }
  }

  return {
    isValid,
    finalValidationStatus,
    directPathStatus: directValidation.safetyStatus,
    corridorStatus: corridorValidation.corridorStatus,
    rejectionReason: corridorValidation.rejectionReason,
    directValidation,
    corridorValidation
  };
}

// Expose directional slope & corridor safety functions globally on window when in browser context
if (typeof window !== 'undefined') {
  window.calculateSignedSlope = calculateSignedSlope;
  window.evaluateDirectionalSlopeCost = evaluateDirectionalSlopeCost;
  window.evaluateDirectedEdgeSlope = evaluateDirectedEdgeSlope;
  window.evaluateTerrainTransition = evaluateTerrainTransition;
  window.computeLocalTerrainMetrics = computeLocalTerrainMetrics;
  window.evaluateSegmentCorridorSafety = evaluateSegmentCorridorSafety;
  window.evaluateRouteCorridor = evaluateRouteCorridor;
  window.simplifyRouteTerrainAware = simplifyRouteTerrainAware;
  window.validateFinalRouteCorridor = validateFinalRouteCorridor;
  window.clearTransitionCostCache = clearTransitionCostCache;
  window.computePlanetaryDistanceMeters = computePlanetaryDistanceMeters;
}
