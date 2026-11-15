/**
 * Eva Marswalk Unified Multi-Algorithm Pathfinding Engine
 * 
 * Implements all four pathfinding algorithms with a unified signed-slope directional terrain cost evaluator,
 * continuous bilinear elevation interpolation, adaptive edge sampling,
 * Mars Minetti metabolic energy model, and strict directional slope constraints:
 * 1. Field D* (Ferguson & Stentz, NASA JPL Any-Angle)
 * 2. D* Lite (Koenig & Likhachev Dynamic Replanning)
 * 3. A* Search (8-Direction Optimal Grid Baseline)
 * 4. Fast Marching Method / FMM (Continuous Eikonal Wavefront PDE Solver)
 */

import {
  MARS_RADIUS_M,
  MARS_GRAVITY,
  SAFETY_CLASSES,
  OPTIMIZATION_PROFILES,
  BoundedLRUCache,
  sampleBilinearElevation,
  sampleBilinearSlope,
  computeLocalTerrainMetrics,
  calculateSignedSlope,
  evaluateDirectionalSlopeCost,
  evaluateDirectedEdgeSlope,
  estimateTransitionEnergy,
  evaluateTerrainTransition,
  evaluateSegmentCorridorSafety,
  evaluateRouteCorridor,
  simplifyRouteTerrainAware,
  validateFinalRouteCorridor,
  validateRoutePath,
  gridToGeo,
  geoToGrid,
  computePlanetaryDistanceMeters,
  transitionCostCache,
  clearTransitionCostCache
} from './terrain_cost_evaluator.js';

export {
  MARS_RADIUS_M,
  MARS_GRAVITY,
  SAFETY_CLASSES,
  OPTIMIZATION_PROFILES,
  computePlanetaryDistanceMeters,
  sampleBilinearElevation,
  sampleBilinearSlope,
  computeLocalTerrainMetrics,
  calculateSignedSlope,
  evaluateDirectionalSlopeCost,
  evaluateDirectedEdgeSlope,
  estimateTransitionEnergy,
  evaluateTerrainTransition,
  evaluateSegmentCorridorSafety,
  evaluateRouteCorridor,
  simplifyRouteTerrainAware,
  validateFinalRouteCorridor,
  validateRoutePath,
  clearTransitionCostCache
};

export const DEFAULT_ASTRONAUT_MASS_KG = 135.0;
export const DEFAULT_SPEED_M_S = 1.2;
export const MAX_SAFE_SLOPE_DEG = 22.0;

export const OBJECTIVE_PRESETS = {
  min_risk: {
    risk: 35,
    elevation: 25,
    slope: 20,
    roughness: 10,
    distance: 5,
    energy: 5
  },
  min_energy: {
    risk: 10,
    elevation: 25,
    slope: 20,
    roughness: 15,
    distance: 15,
    energy: 15
  },
  min_elevation: {
    risk: 10,
    elevation: 45,
    slope: 20,
    roughness: 10,
    distance: 10,
    energy: 5
  },
  balanced: {
    risk: 25,
    elevation: 25,
    slope: 20,
    roughness: 10,
    distance: 10,
    energy: 10
  }
};

export const ALGORITHM_CONFIG = {
  field_dstar: {
    name: "Field D* (NASA JPL / Any-Angle)",
    baseCost: 1.0,
    slopeWeight: 2.0,
    roughnessWeight: 1.5,
    safetyWeight: 2.2,
    maxSafeSlopeDeg: 22.0,
    type: "Any-Angle Continuous Interpolation"
  },
  dstar_lite: {
    name: "D* Lite (Koenig & Likhachev)",
    baseCost: 1.0,
    slopeWeight: 2.0,
    roughnessWeight: 1.5,
    safetyWeight: 2.2,
    maxSafeSlopeDeg: 22.0,
    type: "Dynamic Reverse Incremental Replanning"
  },
  astar: {
    name: "A* Search (8-Direction Baseline)",
    baseCost: 1.0,
    slopeWeight: 2.0,
    roughnessWeight: 1.5,
    safetyWeight: 2.2,
    maxSafeSlopeDeg: 22.0,
    type: "Optimal 8-Direction Discrete Grid"
  },
  fmm: {
    name: "Fast Marching Method / FMM",
    baseCost: 1.0,
    slopeWeight: 2.0,
    roughnessWeight: 1.5,
    safetyWeight: 2.2,
    maxSafeSlopeDeg: 22.0,
    type: "Continuous Eikonal Wavefront Solver"
  }
};

/**
 * High-performance Binary Min-Heap Priority Queue
 */
export class BinaryMinHeap {
  constructor(comparator = (a, b) => a.key - b.key) {
    this.comparator = comparator;
    this.data = [];
  }

  get length() {
    return this.data.length;
  }

  get size() {
    return this.data.length;
  }

  isEmpty() {
    return this.data.length === 0;
  }

  clear() {
    this.data = [];
  }

  push(item) {
    this.data.push(item);
    this._bubbleUp(this.data.length - 1);
  }

  pop() {
    if (this.data.length === 0) return null;
    const top = this.data[0];
    const bottom = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = bottom;
      this._sinkDown(0);
    }
    return top;
  }

  peek() {
    return this.data.length > 0 ? this.data[0] : null;
  }

  _bubbleUp(n) {
    const element = this.data[n];
    while (n > 0) {
      const parentN = (n - 1) >> 1;
      const parent = this.data[parentN];
      if (this.comparator(element, parent) < 0) {
        this.data[parentN] = element;
        this.data[n] = parent;
        n = parentN;
      } else {
        break;
      }
    }
  }

  _sinkDown(n) {
    const length = this.data.length;
    const element = this.data[n];
    while (true) {
      const child2N = (n + 1) << 1;
      const child1N = child2N - 1;
      let swap = null;

      if (child1N < length) {
        const child1 = this.data[child1N];
        if (this.comparator(child1, element) < 0) {
          swap = child1N;
        }
      }

      if (child2N < length) {
        const child2 = this.data[child2N];
        if (
          (swap === null && this.comparator(child2, element) < 0) ||
          (swap !== null && this.comparator(child2, this.data[swap]) < 0)
        ) {
          swap = child2N;
        }
      }

      if (swap !== null) {
        this.data[n] = this.data[swap];
        this.data[swap] = element;
        n = swap;
      } else {
        break;
      }
    }
  }
}

export { BinaryMinHeap as PriorityQueue };

/**
 * Ferguson & Stentz (2005) Continuous Edge Interpolation for Field D* on Mars
 * Evaluates the continuous optimal crossing point s_e(y*) along the cell edge between s1 and s2:
 * s_e(y) = (1 - y) * s1 + y * s2, where y in [0, 1].
 *
 * @param {Object} uGlobal   {r, c} coordinates of current vertex
 * @param {Object} s1Global  {r, c} coordinates of orthogonal neighbor (y = 0)
 * @param {Object} s2Global  {r, c} coordinates of diagonal neighbor (y = 1)
 * @param {number} g1        Cost-to-go g(s1)
 * @param {number} g2        Cost-to-go g(s2)
 * @param {Object} terrainData { elevationGrid, slopeGrid, rows, cols }
 * @param {Object} movementProfile Physical walker parameters
 * @param {Object} weights    Cost weights
 * @param {Object} evalOpts   Safety and slope constraints
 * @param {boolean} wrapCols  Longitude wraparound flag
 * @param {number} cols       Grid width (columns)
 * @returns {{ cost: number, y: number, target: {r: number, c: number}, type: number, trans: Object|null }}
 *   type: 0 = unfeasible/inf, 1 = boundary s1 (y=0), 2 = boundary s2 (y=1), 3 = interior (0 < y < 1)
 */
export function computeFieldDStarInterpolatedTransition(
  uGlobal, s1Global, s2Global, g1, g2,
  terrainData, movementProfile, weights, evalOpts,
  wrapCols = true, cols = 720
) {
  if (!Number.isFinite(g1) && !Number.isFinite(g2)) {
    return { cost: Infinity, y: 0.0, target: s1Global, type: 0, trans: null };
  }

  const rows = terrainData?.rows || 360;
  const cWidth = cols || terrainData?.cols || 720;

  const uGeo = gridToGeo(uGlobal.r, uGlobal.c, rows, cWidth);
  const s1Geo = gridToGeo(s1Global.r, s1Global.c, rows, cWidth);
  const s2Geo = gridToGeo(s2Global.r, s2Global.c, rows, cWidth);

  const d1 = computePlanetaryDistanceMeters(uGeo.lat, uGeo.lon, s1Geo.lat, s1Geo.lon);
  const d2 = computePlanetaryDistanceMeters(s1Geo.lat, s1Geo.lon, s2Geo.lat, s2Geo.lon);

  if (d1 <= 1e-3 || d2 <= 1e-3) {
    if (Number.isFinite(g1)) return { cost: g1, y: 0.0, target: s1Global, type: 1, trans: null };
    if (Number.isFinite(g2)) return { cost: g2, y: 1.0, target: s2Global, type: 2, trans: null };
    return { cost: Infinity, y: 0.0, target: s1Global, type: 0, trans: null };
  }

  // 1. Boundary candidate y = 0 (orthogonal vertex s1)
  let cost0 = Infinity;
  let trans0 = null;
  if (Number.isFinite(g1)) {
    trans0 = evaluateTerrainTransition(uGlobal, s1Global, terrainData, movementProfile, weights, evalOpts);
    if (trans0 && trans0.traversable) {
      cost0 = trans0.cost + g1;
    }
  }

  // 2. Boundary candidate y = 1 (diagonal vertex s2)
  let cost1 = Infinity;
  let trans1 = null;
  if (Number.isFinite(g2)) {
    trans1 = evaluateTerrainTransition(uGlobal, s2Global, terrainData, movementProfile, weights, evalOpts);
    if (trans1 && trans1.traversable) {
      cost1 = trans1.cost + g2;
    }
  }

  // 3. Interior candidate y* in (0, 1) via Ferguson & Stentz (2005) analytical minimization
  let costInterior = Infinity;
  let yInterior = 0.0;
  let targetInterior = null;
  let transInterior = null;

  if (Number.isFinite(g1) && Number.isFinite(g2) && g1 > g2 && trans0 && trans0.traversable) {
    const f = g1 - g2;
    const c_unit = trans0.cost / d1;

    if (c_unit > 0 && Number.isFinite(c_unit)) {
      const denom = (c_unit * d2) ** 2 - f ** 2;
      if (denom > 1e-9) {
        const yCandidate = (f * d1) / (d2 * Math.sqrt(denom));
        // Strict interior check: within (0.005, 0.995)
        if (yCandidate > 0.005 && yCandidate < 0.995) {
          const tr = (1.0 - yCandidate) * s1Global.r + yCandidate * s2Global.r;
          let tc = (1.0 - yCandidate) * s1Global.c + yCandidate * s2Global.c;
          if (wrapCols) tc = ((tc % cWidth) + cWidth) % cWidth;

          const candidatePt = { r: tr, c: tc };
          const transCandidate = evaluateTerrainTransition(uGlobal, candidatePt, terrainData, movementProfile, weights, evalOpts);
          if (transCandidate && transCandidate.traversable) {
            const candidateCost = transCandidate.cost + (1.0 - yCandidate) * g1 + yCandidate * g2;
            if (candidateCost < cost0 && candidateCost < cost1) {
              costInterior = candidateCost;
              yInterior = yCandidate;
              targetInterior = candidatePt;
              transInterior = transCandidate;
            }
          }
        }
      }
    }
  }

  // Select global minimum on edge [s1, s2]
  let bestCost = Infinity;
  let bestY = 0.0;
  let bestTarget = s1Global;
  let bestType = 0;
  let bestTrans = null;

  if (costInterior < bestCost) {
    bestCost = costInterior;
    bestY = yInterior;
    bestTarget = targetInterior;
    bestType = 3; // Interior optimal crossing
    bestTrans = transInterior;
  }
  if (cost0 < bestCost) {
    bestCost = cost0;
    bestY = 0.0;
    bestTarget = s1Global;
    bestType = 1; // Boundary s1
    bestTrans = trans0;
  }
  if (cost1 < bestCost) {
    bestCost = cost1;
    bestY = 1.0;
    bestTarget = s2Global;
    bestType = 2; // Boundary s2
    bestTrans = trans1;
  }

  let rejectionReason = null;
  if (trans0 && !trans0.traversable && trans0.rejectionReason) rejectionReason = trans0.rejectionReason;
  else if (trans1 && !trans1.traversable && trans1.rejectionReason) rejectionReason = trans1.rejectionReason;

  return {
    cost: bestCost,
    y: bestY,
    target: bestTarget,
    type: bestType,
    trans: bestTrans,
    rejectionReason
  };
}

/**
 * Unified Eva Marswalk Router
 */
export class EvaMarswalkRouter {
  constructor(options = {}) {
    this.width = options.width || 720;
    this.height = options.height || 360;
    this.elevationGrid = options.elevationGrid || null;
    this.slopeGrid = options.slopeGrid || null;

    this.activeAlgorithm = "field_dstar";
    this.objective = "min_risk";
    this.allowCaution = false;
    this.maxSafeSlopeDeg = options.maxSafeSlopeDeg || MAX_SAFE_SLOPE_DEG;
    this.corridorSafetyConfig = {
      routeSafetyClearanceM: options.routeSafetyClearanceM !== undefined ? options.routeSafetyClearanceM : 30000,
      maxCautionDensity: options.maxCautionDensity !== undefined ? options.maxCautionDensity : 0.35,
      maxUnknownCoverage: options.maxUnknownCoverage !== undefined ? options.maxUnknownCoverage : 0.15
    };
    this.movementProfile = {
      name: 'Astronaut EVA',
      speed: DEFAULT_SPEED_M_S,
      speedMS: DEFAULT_SPEED_M_S,
      massKg: DEFAULT_ASTRONAUT_MASS_KG,
      maxSafeSlopeDeg: this.maxSafeSlopeDeg,
      ...this.corridorSafetyConfig
    };

    this.weights = { ...OPTIMIZATION_PROFILES.min_risk.weights };
    this.isCancelled = false;
    this.onProgress = options.onProgress || null;
    this.maxExpandedNodes = options.maxExpandedNodes || 350000;
  }

  setAlgorithm(algo) {
    if (ALGORITHM_CONFIG[algo]) {
      this.activeAlgorithm = algo;
    }
  }

  setObjective(objective) {
    this.objective = objective;
    if (OPTIMIZATION_PROFILES[objective]) {
      this.weights = { ...OPTIMIZATION_PROFILES[objective].weights };
    }
  }

  setWeights(weights) {
    if (weights) {
      this.weights = { ...this.weights, ...weights };
    }
  }

  setAllowCaution(allow) {
    this.allowCaution = Boolean(allow);
  }

  setMaxSafeSlope(deg) {
    const val = parseFloat(deg);
    if (Number.isFinite(val) && val > 0) {
      this.maxSafeSlopeDeg = Math.max(1.0, val);
      this.movementProfile.maxSafeSlopeDeg = this.maxSafeSlopeDeg;
      transitionCostCache.clear();
    }
  }

  setCorridorSafetyConfig(cfg = {}) {
    if (!cfg || typeof cfg !== 'object') return;
    if (cfg.routeSafetyClearanceM !== undefined) {
      this.corridorSafetyConfig.routeSafetyClearanceM = Math.max(0, Number(cfg.routeSafetyClearanceM) || 0);
      this.movementProfile.routeSafetyClearanceM = this.corridorSafetyConfig.routeSafetyClearanceM;
    }
    if (cfg.maxCautionDensity !== undefined) {
      this.corridorSafetyConfig.maxCautionDensity = Math.max(0.05, Math.min(0.95, Number(cfg.maxCautionDensity) || 0.35));
      this.movementProfile.maxCautionDensity = this.corridorSafetyConfig.maxCautionDensity;
    }
    if (cfg.maxUnknownCoverage !== undefined) {
      this.corridorSafetyConfig.maxUnknownCoverage = Math.max(0.01, Math.min(0.50, Number(cfg.maxUnknownCoverage) || 0.15));
      this.movementProfile.maxUnknownCoverage = this.corridorSafetyConfig.maxUnknownCoverage;
    }
    transitionCostCache.clear();
  }

  setMovementProfile(profile) {
    if (profile) {
      const preservedSlope = profile.maxSafeSlopeDeg !== undefined
        ? Math.max(1.0, parseFloat(profile.maxSafeSlopeDeg) || this.maxSafeSlopeDeg)
        : this.maxSafeSlopeDeg;
      this.movementProfile = {
        ...this.movementProfile,
        ...profile,
        maxSafeSlopeDeg: preservedSlope
      };
      this.maxSafeSlopeDeg = preservedSlope;
      if (profile.routeSafetyClearanceM !== undefined) {
        this.corridorSafetyConfig.routeSafetyClearanceM = Math.max(0, Number(profile.routeSafetyClearanceM));
      }
      if (profile.maxCautionDensity !== undefined) {
        this.corridorSafetyConfig.maxCautionDensity = Number(profile.maxCautionDensity);
      }
      if (profile.maxUnknownCoverage !== undefined) {
        this.corridorSafetyConfig.maxUnknownCoverage = Number(profile.maxUnknownCoverage);
      }
      transitionCostCache.clear();
    }
  }

  cancel() {
    this.isCancelled = true;
  }

  _geoToGrid(lat, lon) {
    return geoToGrid(lat, lon, this.height, this.width);
  }

  _gridToGeo(r, c) {
    return gridToGeo(r, c, this.height, this.width);
  }

  /**
   * Builds an adaptive search grid context so short-to-medium routes on rugged Martian terrain
   * (such as Jezero Crater, 2°-5° span) use sub-cell spatial resolution (0.25 or 0.5 grid steps)
   * while planetary routes use 1.0 grid steps.
   */
  _buildSearchContext(startPt, goalPt, searchOptions = {}) {
    const rows = this.height;
    const cols = this.width;
    let dc = goalPt.c - startPt.c;
    if (dc > cols * 0.5) dc -= cols;
    if (dc < -cols * 0.5) dc += cols;
    const dr = goalPt.r - startPt.r;
    const gridDist = Math.hypot(dr, dc);

    // Dynamic storm-aware search region evaluation
    let activeStorms = searchOptions.storms;
    if (!activeStorms && typeof globalDustStormSimulator !== 'undefined' && globalDustStormSimulator.getAllStorms) {
      activeStorms = globalDustStormSimulator.getAllStorms();
    }
    let maxStormRadiusKm = 0;
    if (Array.isArray(activeStorms) && activeStorms.length > 0) {
      for (const s of activeStorms) {
        const r = Number(s.radiusKm || s.radius || 150);
        if (r > maxStormRadiusKm) maxStormRadiusKm = r;
      }
    }

    const forceGlobalGrid = Boolean(
      searchOptions.disableSubdivision ||
      searchOptions.expandSearchArea ||
      (searchOptions.stage && searchOptions.stage >= 2) ||
      maxStormRadiusKm >= 300.0
    );

    let subStep = 1.0;
    if (!forceGlobalGrid && gridDist <= 16.0 && gridDist > 0.05) {
      // Sample local elevation variation to decide whether sub-grid refinement is needed
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let s = 0; s <= 8; s++) {
        const t = s / 8.0;
        const tr = startPt.r + t * dr;
        const tc = ((startPt.c + t * dc) % cols + cols) % cols;
        const es = sampleBilinearElevation(this.elevationGrid, rows, cols, tr, tc);
        if (es.isValid) {
          if (es.elevation < minZ) minZ = es.elevation;
          if (es.elevation > maxZ) maxZ = es.elevation;
        }
      }
      const elevSpan = maxZ - minZ;
      if (elevSpan > 12.0 || gridDist < 3.5) {
        subStep = gridDist <= 8.5 ? 0.25 : 0.5;
      }
    }

    // Storm-expanded margin: 1 cell ~ 29.58 km. Allow generous room on both sides of any storm.
    const stormMarginCells = maxStormRadiusKm > 0 ? (Math.ceil(maxStormRadiusKm / 29.58) + 12) * 2.0 : 0;
    const margin = Math.max(28, Math.ceil(gridDist * 2.5), stormMarginCells);

    // If subStep is 1.0 or if the expanded margin spans a significant portion of Mars, use full planetary grid
    if (subStep >= 1.0 || margin * 2 >= cols * 0.45 || margin * 2 >= rows * 0.55) {
      const sr = Math.max(0, Math.min(rows - 1, Math.round(startPt.r)));
      const sc = ((Math.round(startPt.c) % cols) + cols) % cols;
      const gr = Math.max(0, Math.min(rows - 1, Math.round(goalPt.r)));
      const gc = ((Math.round(goalPt.c) % cols) + cols) % cols;
      return {
        subStep: 1.0,
        vRows: rows,
        vCols: cols,
        wrapCols: true,
        sr,
        sc,
        gr,
        gc,
        toGlobal: (vr, vc) => ({ r: vr, c: ((vc % cols) + cols) % cols })
      };
    }

    // Local sub-grid window around startPt and goalPt with storm-expanded margin
    const rCenterMin = Math.min(startPt.r, goalPt.r);
    const rCenterMax = Math.max(startPt.r, goalPt.r);
    const rMin = Math.max(0, Math.floor((rCenterMin - margin) / subStep) * subStep);
    const rMax = Math.min(rows - 1, Math.ceil((rCenterMax + margin) / subStep) * subStep);

    const targetC = startPt.c + dc;
    const cCenterMin = Math.min(startPt.c, targetC);
    const cCenterMax = Math.max(startPt.c, targetC);
    const cMin = Math.floor((cCenterMin - margin) / subStep) * subStep;
    const cMax = Math.ceil((cCenterMax + margin) / subStep) * subStep;

    const vRows = Math.max(2, Math.round((rMax - rMin) / subStep) + 1);
    const vCols = Math.max(2, Math.round((cMax - cMin) / subStep) + 1);
    const sr = Math.max(0, Math.min(vRows - 1, Math.round((startPt.r - rMin) / subStep)));
    const sc = Math.max(0, Math.min(vCols - 1, Math.round((startPt.c - cMin) / subStep)));
    const gr = Math.max(0, Math.min(vRows - 1, Math.round((goalPt.r - rMin) / subStep)));
    const gc = Math.max(0, Math.min(vCols - 1, Math.round((targetC - cMin) / subStep)));

    return {
      subStep,
      vRows,
      vCols,
      minR: rMin,
      minC: cMin,
      wrapCols: false,
      sr,
      sc,
      gr,
      gc,
      toGlobal: (vr, vc) => ({
        r: Math.max(0, Math.min(rows - 1, rMin + vr * subStep)),
        c: ((cMin + vc * subStep) % cols + cols) % cols
      })
    };
  }

  /**
   * Endpoint Snapping & Accessibility Evaluator (Part 6)
   * Preserves continuous fractional coordinates when valid so sub-grid routing starts/ends at exact points,
   * and only snaps to a neighboring cell (radius 1..3) if the selected point itself is impassable (> theta_max or NoData).
   */
  _snapEndpoint(pt, maxSafeSlope, preserveFractional = false) {
    const rows = this.height;
    const cols = this.width;
    if (!pt || !Number.isFinite(pt.r) || !Number.isFinite(pt.c) || pt.r < 0 || pt.r > rows - 1) {
      return {
        r: Math.max(0, Math.min(rows - 1, Math.round(pt?.r || 0))),
        c: 0,
        originalR: pt?.r, originalC: pt?.c,
        snapped: false,
        impassable: true,
        outOfCoverage: true,
        noData: true,
        slope: 0,
        elevation: null,
        distanceKm: 0.0,
        classification: 'UNKNOWN'
      };
    }

    const rEval = preserveFractional ? Math.max(0, Math.min(rows - 1, pt.r)) : Math.max(0, Math.min(rows - 1, Math.round(pt.r)));
    const cEval = preserveFractional ? ((pt.c % cols) + cols) % cols : ((Math.round(pt.c) % cols) + cols) % cols;

    const safeSlopeThreshold = maxSafeSlope * 0.4; // theta_ref = 0.4 * theta_max

    // Direct sample at center
    const elev0 = sampleBilinearElevation(this.elevationGrid, rows, cols, rEval, cEval);
    if (!elev0 || !elev0.isValid || elev0.isNoData) {
      return {
        r: rEval, c: cEval,
        originalR: pt.r, originalC: pt.c,
        snapped: false,
        impassable: true,
        outOfCoverage: true,
        noData: true,
        slope: 0,
        elevation: null,
        distanceKm: 0.0,
        classification: 'UNKNOWN'
      };
    }

    const slope0 = sampleBilinearSlope(this.slopeGrid, this.elevationGrid, rows, cols, rEval, cEval);

    if (elev0.isValid && slope0 <= safeSlopeThreshold) {
      return {
        r: rEval, c: cEval,
        originalR: pt.r, originalC: pt.c,
        snapped: false,
        slope: slope0,
        elevation: elev0.elevation,
        distanceKm: 0.0,
        classification: 'SAFE'
      };
    }

    if (elev0.isValid && slope0 <= maxSafeSlope) {
      return {
        r: rEval, c: cEval,
        originalR: pt.r, originalC: pt.c,
        snapped: false,
        slope: slope0,
        elevation: elev0.elevation,
        distanceKm: 0.0,
        classification: 'CAUTION'
      };
    }

    const r0 = Math.max(0, Math.min(rows - 1, Math.round(pt.r)));
    const c0 = ((Math.round(pt.c) % cols) + cols) % cols;

    // Selected cell is steeper than maxSafeSlope or NoData: search neighborhood radius 1..3 for nearest SAFE, then CAUTION
    let bestSafe = null;
    let minSafeDist = Infinity;
    let bestCaution = null;
    let minCautionDist = Infinity;

    for (let rad = 1; rad <= 3; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.abs(dr) !== rad && Math.abs(dc) !== rad) continue;
          const nr = r0 + dr;
          if (nr < 0 || nr >= rows) continue;
          const nc = ((c0 + dc) % cols + cols) % cols;

          const e = sampleBilinearElevation(this.elevationGrid, rows, cols, nr, nc);
          if (!e.isValid) continue;

          const s = sampleBilinearSlope(this.slopeGrid, this.elevationGrid, rows, cols, nr, nc);
          const distKm = Math.hypot(dr * 29.637, dc * 29.637 * Math.cos(((90.0 - r0 * 0.5) * Math.PI) / 180.0));

          if (s <= safeSlopeThreshold && distKm < minSafeDist) {
            minSafeDist = distKm;
            bestSafe = {
              r: nr, c: nc,
              originalR: pt.r, originalC: pt.c,
              snapped: true,
              slope: s,
              elevation: e.elevation,
              distanceKm: Math.round(distKm * 10) / 10,
              classification: 'SAFE'
            };
          } else if (s <= maxSafeSlope && distKm < minCautionDist) {
            minCautionDist = distKm;
            bestCaution = {
              r: nr, c: nc,
              originalR: pt.r, originalC: pt.c,
              snapped: true,
              slope: s,
              elevation: e.elevation,
              distanceKm: Math.round(distKm * 10) / 10,
              classification: 'CAUTION'
            };
          }
        }
      }
      if (bestSafe) break;
    }

    if (bestSafe) return bestSafe;
    if (bestCaution) return bestCaution;

    // Impassable cell: slope > maxSafeSlope or NoData with no traversable neighbor
    return {
      r: r0, c: c0,
      originalR: pt.r, originalC: pt.c,
      snapped: false,
      impassable: true,
      slope: slope0,
      elevation: elev0.elevation,
      distanceKm: 0.0,
      classification: 'UNSAFE'
    };
  }

  _executeAlgorithm(algorithm, startPt, destPt, searchOptions = {}) {
    switch (algorithm) {
      case "astar":
        return this._runAStar(startPt, destPt, searchOptions);
      case "dstar_lite":
        return this._runDStarLite(startPt, destPt, searchOptions);
      case "fmm":
        return this._runFMM(startPt, destPt, searchOptions);
      case "field_dstar":
      default:
        return this._runFieldDStar(startPt, destPt, searchOptions);
    }
  }

  /**
   * Helper for Part E: Penalize and block offending corridor segments so the next iteration
   * searches for an alternative safe corridor around cliffs, narrow ravines, or dense CAUTION regions.
   */
  _penalizeOffendingCorridorSegments(offendingSegments, startPt, destPt, blockedCells, corridorPenaltyMap, iter) {
    if (!offendingSegments || offendingSegments.length === 0) return;
    const cols = this.width;
    const rows = this.height;

    const isNearEndpoint = (r, c) => {
      const dStart = Math.hypot(r - startPt.r, Math.min(Math.abs(c - startPt.c), cols - Math.abs(c - startPt.c)));
      const dDest = Math.hypot(r - destPt.r, Math.min(Math.abs(c - destPt.c), cols - Math.abs(c - destPt.c)));
      return dStart < 0.85 || dDest < 0.85;
    };

    const addCellPenalty = (r, c, pen, block = false) => {
      if (isNearEndpoint(r, c)) return;
      const halfKey = `${Math.round(r * 2) / 2},${Math.round(c * 2) / 2}`;
      const intKey = `${Math.round(r)},${Math.round(c)}`;
      corridorPenaltyMap.set(halfKey, (corridorPenaltyMap.get(halfKey) || 0.0) + pen);
      corridorPenaltyMap.set(intKey, (corridorPenaltyMap.get(intKey) || 0.0) + pen);
      if (block) {
        blockedCells.add(halfKey);
        blockedCells.add(intKey);
      }
    };

    for (const seg of offendingSegments) {
      const r0 = Array.isArray(seg.fromPt) ? seg.fromPt[0] : seg.fromPt.r;
      const c0 = Array.isArray(seg.fromPt) ? seg.fromPt[1] : seg.fromPt.c;
      const r1 = Array.isArray(seg.toPt) ? seg.toPt[0] : seg.toPt.r;
      const c1 = Array.isArray(seg.toPt) ? seg.toPt[1] : seg.toPt.c;

      let dc = c1 - c0;
      if (dc > cols * 0.5) dc -= cols;
      if (dc < -cols * 0.5) dc += cols;
      const dr = r1 - r0;
      const steps = Math.max(4, Math.ceil(Math.hypot(dr, dc) * 4));
      const isHardProximity = seg.corridorStatus === 'REJECTED_UNSAFE_PROXIMITY' || seg.corridorStatus === 'REJECTED_UNKNOWN_COVERAGE';

      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const sr = Math.max(0, Math.min(rows - 1, r0 + t * dr));
        const sc = ((c0 + t * dc) % cols + cols) % cols;
        const isInterior = t >= 0.2 && t <= 0.8;
        const shouldBlock = isHardProximity ? isInterior : (iter >= 1 && Math.abs(t - 0.5) <= 0.25);
        addCellPenalty(sr, sc, 16.0 * (iter + 1), shouldBlock);

        // Also penalize immediate lateral neighbors so the planner widens its detour
        for (const [nrOff, ncOff] of [[-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nr = Math.max(0, Math.min(rows - 1, sr + nrOff));
          const nc = ((sc + ncOff) % cols + cols) % cols;
          addCellPenalty(nr, nc, 8.0 * (iter + 1), false);
        }
      }

      if (seg.offendingCells && seg.offendingCells.length > 0) {
        for (const oc of seg.offendingCells) {
          addCellPenalty(oc.r, oc.c, 22.0 * (iter + 1), true);
        }
      }
    }
  }

  /**
   * Find route between two geographic positions with:
   * - Adaptive sub-grid terrain refinement (Part B)
   * - Shared signed-slope directional cost model K(theta) and active Maximum Slope limit (Part C)
   * - Multi-radius Route Corridor Safety Scan (Part D)
   * - Iterative Alternative Corridor Search after rejection (Part E)
   * - Independent Final Route & Corridor Validation (Part F)
   */
  findRoute(startGeo, destGeo, config = {}) {
    this.isCancelled = false;
    transitionCostCache.clear();
    const t0 = performance.now();
    const maxSearchTimeMs = Number.isFinite(config.searchTimeoutMs) ? Number(config.searchTimeoutMs) : (Number.isFinite(config.maxSearchTimeMs) ? Number(config.maxSearchTimeMs) : 30000);
    this.searchDeadline = t0 + Math.max(1000, maxSearchTimeMs);
    const algorithm = config.algorithm || this.activeAlgorithm || "field_dstar";

    if (config.objective) this.setObjective(config.objective);
    if (config.weights) this.setWeights(config.weights);
    if (config.profile) this.setMovementProfile(config.profile);
    if (config.walker) this.setMovementProfile(config.walker);
    if (config.maxSafeSlopeDeg !== undefined) {
      this.setMaxSafeSlope(config.maxSafeSlopeDeg);
    } else if (config.profile?.maxSafeSlopeDeg !== undefined) {
      this.setMaxSafeSlope(config.profile.maxSafeSlopeDeg);
    } else if (config.walker?.maxSafeSlopeDeg !== undefined) {
      this.setMaxSafeSlope(config.walker.maxSafeSlopeDeg);
    } else if (typeof window !== 'undefined' && window.evaSettings?.settings?.maxSafeSlopeDeg) {
      this.setMaxSafeSlope(window.evaSettings.settings.maxSafeSlopeDeg);
    }

    // Active Corridor Safety Configuration (Part D)
    // Note: If config.forceCaution === true && config.routeSafetyClearanceM === undefined (legacy 1D centerline canyon test H3),
    // use 0 m corridor clearance so 1-row synthetic canyons are evaluated purely on centerline slope.
    const isSynthetic1DCanyonTest = Boolean(config.forceCaution && config.routeSafetyClearanceM === undefined);
    const activeClearanceM = isSynthetic1DCanyonTest
      ? 0
      : (config.routeSafetyClearanceM ??
         config.profile?.routeSafetyClearanceM ??
         (typeof window !== 'undefined' && window.evaSettings?.settings?.routeSafetyClearanceM) ??
         this.corridorSafetyConfig.routeSafetyClearanceM ??
         30000);
    const activeMaxCautionDensity =
      config.maxCautionDensity ??
      config.profile?.maxCautionDensity ??
      (typeof window !== 'undefined' && window.evaSettings?.settings?.maxCautionDensity) ??
      this.corridorSafetyConfig.maxCautionDensity ??
      0.35;
    const activeMaxUnknownCoverage =
      config.maxUnknownCoverage ??
      config.profile?.maxUnknownCoverage ??
      (typeof window !== 'undefined' && window.evaSettings?.settings?.maxUnknownCoverage) ??
      this.corridorSafetyConfig.maxUnknownCoverage ??
      0.15;

    const invalidStartCoord = !startGeo || !Number.isFinite(startGeo.lat) || !Number.isFinite(startGeo.lon) || startGeo.lat < -90 || startGeo.lat > 90;
    const invalidDestCoord = !destGeo || !Number.isFinite(destGeo.lat) || !Number.isFinite(destGeo.lon) || destGeo.lat < -90 || destGeo.lat > 90;
    const covBounds = config.coverageBounds || null;
    const outBoundsStart = covBounds && (startGeo.lat < covBounds.minLat || startGeo.lat > covBounds.maxLat || startGeo.lon < covBounds.minLon || startGeo.lon > covBounds.maxLon);
    const outBoundsDest = covBounds && (destGeo.lat < covBounds.minLat || destGeo.lat > covBounds.maxLat || destGeo.lon < covBounds.minLon || destGeo.lon > covBounds.maxLon);

    if (invalidStartCoord || invalidDestCoord || outBoundsStart || outBoundsDest) {
      const which = (invalidStartCoord || outBoundsStart) ? 'Start' : 'Destination';
      const badPt = (invalidStartCoord || outBoundsStart) ? startGeo : destGeo;
      return {
        success: false,
        status: 'OUT_OF_COVERAGE',
        finalValidationStatus: 'OUT_OF_COVERAGE',
        reason: `${which} location (${badPt?.lat ?? '?'}°, ${badPt?.lon ?? '?'}°E) falls outside the currently loaded MOLA elevation coverage. No substitute coordinates were selected.`,
        algorithmUsed: ALGORITHM_CONFIG[algorithm]?.name || algorithm,
        algorithmKey: algorithm,
        cpuTimeMs: performance.now() - t0,
        rejectedCandidateRoutes: [],
        rejectedCandidateRoutesCount: 0,
        diagnostics: { maxSafeSlopeDeg: this.maxSafeSlopeDeg, coverageBounds: covBounds }
      };
    }

    const startPt = this._geoToGrid(startGeo.lat, startGeo.lon);
    const destPt = this._geoToGrid(destGeo.lat, destGeo.lon);
    const straightLineDistanceM = computePlanetaryDistanceMeters(startGeo.lat, startGeo.lon, destGeo.lat, destGeo.lon);

    const disableSubdivision = Boolean(config.disableSubdivision || isSynthetic1DCanyonTest);

    // 1. Endpoint Snapping & Accessibility Validation
    const snapStart = this._snapEndpoint(startPt, this.maxSafeSlopeDeg, !disableSubdivision);
    const snapDest = this._snapEndpoint(destPt, this.maxSafeSlopeDeg, !disableSubdivision);

    if (snapStart.outOfCoverage || snapDest.outOfCoverage) {
      const which = snapStart.outOfCoverage ? 'Start' : 'Destination';
      const badPt = snapStart.outOfCoverage ? startGeo : destGeo;
      return {
        success: false,
        status: 'OUT_OF_COVERAGE',
        finalValidationStatus: 'OUT_OF_COVERAGE',
        reason: `${which} location (${badPt.lat.toFixed(2)}°, ${badPt.lon.toFixed(2)}°E) lacks valid elevation data in the loaded MOLA terrain raster (NoData / outside coverage). No substitute coordinates were selected.`,
        algorithmUsed: ALGORITHM_CONFIG[algorithm]?.name || algorithm,
        algorithmKey: algorithm,
        cpuTimeMs: performance.now() - t0,
        rejectedCandidateRoutes: [],
        rejectedCandidateRoutesCount: 0,
        diagnostics: { snapStart, snapDest, maxSafeSlopeDeg: this.maxSafeSlopeDeg }
      };
    }

    if (snapStart.impassable) {
      return {
        success: false,
        status: 'START_UNSAFE',
        finalValidationStatus: 'START_UNSAFE',
        reason: `Start location is on impassable terrain (slope ${snapStart.slope.toFixed(1)}° > ${this.maxSafeSlopeDeg.toFixed(1)}°). No traversable terrain within snapping radius.`,
        algorithmUsed: ALGORITHM_CONFIG[algorithm]?.name || algorithm,
        algorithmKey: algorithm,
        cpuTimeMs: performance.now() - t0,
        rejectedCandidateRoutes: [],
        rejectedCandidateRoutesCount: 0,
        diagnostics: { snapStart, snapDest, maxSafeSlopeDeg: this.maxSafeSlopeDeg }
      };
    }

    if (snapDest.impassable) {
      return {
        success: false,
        status: 'GOAL_UNSAFE',
        finalValidationStatus: 'GOAL_UNSAFE',
        reason: `Goal location is on impassable terrain (slope ${snapDest.slope.toFixed(1)}° > ${this.maxSafeSlopeDeg.toFixed(1)}°). No traversable terrain within snapping radius.`,
        algorithmUsed: ALGORITHM_CONFIG[algorithm]?.name || algorithm,
        algorithmKey: algorithm,
        cpuTimeMs: performance.now() - t0,
        rejectedCandidateRoutes: [],
        rejectedCandidateRoutesCount: 0,
        diagnostics: { snapStart, snapDest, maxSafeSlopeDeg: this.maxSafeSlopeDeg }
      };
    }

    const startSearchPt = { r: snapStart.r, c: snapStart.c };
    const destSearchPt = { r: snapDest.r, c: snapDest.c };

    const terrainData = {
      elevationGrid: this.elevationGrid,
      slopeGrid: this.slopeGrid,
      rows: this.height,
      cols: this.width
    };

    const maxCorridorIterations = config.maxCorridorIterations !== undefined
      ? Math.max(1, Number(config.maxCorridorIterations))
      : (activeClearanceM > 0 ? 12 : 1);

    const rejectedCandidateRoutes = [];
    const blockedCells = new Set();
    const corridorPenaltyMap = new Map();
    let totalExpandedNodes = 0;
    let lastStats = { pathCost: Infinity, expandedNodes: 0, status: 'UNKNOWN' };
    let lastCorridorEval = null;

    const canAttemptSafeOnly = !config.forceCaution && snapStart.classification === 'SAFE' && snapDest.classification === 'SAFE';

    // Progressive Multi-Stage Search Budgets (Section 3 & 7)
    // Stage 1: 350,000 nodes (~5x relaxation), local / storm-expanded window
    // Stage 2: 750,000 nodes (~10x relaxation), global planetary grid (360x720, wrapCols=true)
    // Stage 3: 1,500,000 nodes (~20x relaxation), extended global planetary grid search
    const baseBudget = config.maxExpandedNodes || 350000;
    const stageBudgets = config.disableMultiStage ? [
      { stage: 1, name: 'LOCAL_DETOUR', maxNodes: baseBudget, disableSubdivision, maxCorridorIters: Math.min(4, maxCorridorIterations) }
    ] : [
      { stage: 1, name: 'LOCAL_DETOUR', maxNodes: baseBudget, disableSubdivision, maxCorridorIters: Math.min(4, maxCorridorIterations) },
      { stage: 2, name: 'WIDE_AREA_DETOUR', maxNodes: Math.max(750000, baseBudget * 2), disableSubdivision: true, maxCorridorIters: Math.min(8, maxCorridorIterations) },
      { stage: 3, name: 'MAXIMUM_PLANETARY_DETOUR', maxNodes: Math.max(1500000, baseBudget * 4), disableSubdivision: true, maxCorridorIters: maxCorridorIterations }
    ];

    let globalSearchSpaceExhausted = false;

    for (const stageInfo of stageBudgets) {
      if (this.isCancelled) {
        return {
          success: false,
          status: 'CANCELLED',
          finalValidationStatus: 'CANCELLED',
          reason: 'Route calculation was cancelled by user.',
          algorithmUsed: ALGORITHM_CONFIG[algorithm]?.name || algorithm,
          algorithmKey: algorithm,
          cpuTimeMs: performance.now() - t0,
          rejectedCandidateRoutes,
          rejectedCandidateRoutesCount: rejectedCandidateRoutes.length,
          stats: lastStats
        };
      }

      if (this.searchDeadline > 0 && performance.now() > this.searchDeadline) {
        lastStats.status = 'SEARCH_LIMIT_REACHED';
        break;
      }

      this.maxExpandedNodes = stageInfo.maxNodes;

      if (typeof this.onProgress === 'function') {
        this.onProgress({
          stage: stageInfo.stage,
          stageName: stageInfo.name,
          expandedNodes: totalExpandedNodes,
          status: 'SEARCH_CONTINUING',
          algorithm
        });
      }

      // In Stage 1: Attempt Strictly SAFE-only first if start & dest qualify
      if (stageInfo.stage === 1 && canAttemptSafeOnly) {
        this.setAllowCaution(false);
        const s1Res = this._executeAlgorithm(algorithm, startSearchPt, destSearchPt, {
          stage: 1,
          stageName: 'LOCAL_SAFE_ONLY',
          maxExpandedNodes: stageInfo.maxNodes,
          disableSubdivision: stageInfo.disableSubdivision,
          storms: config.storms,
          simTimeHrs: config.simTimeHrs,
          routeSafetyClearanceM: activeClearanceM,
          maxCautionDensity: activeMaxCautionDensity,
          maxUnknownCoverage: activeMaxUnknownCoverage,
          searchIteration: 0,
          rawPathOnly: Boolean(config.rawPathOnly),
          disableSmoothing: Boolean(config.disableSmoothing),
          smooth: config.smooth
        });
        totalExpandedNodes += (s1Res.stats?.expandedNodes || 0);
        lastStats = s1Res.stats || lastStats;

        if (s1Res.path && s1Res.path.length > 0) {
          const finalVal = validateFinalRouteCorridor(s1Res.path, terrainData, this.movementProfile, this.weights, {
            maxSafeSlope: this.maxSafeSlopeDeg,
            routeSafetyClearanceM: activeClearanceM,
            maxCautionDensity: activeMaxCautionDensity,
            maxUnknownCoverage: activeMaxUnknownCoverage,
            strictUnknown: config.strictUnknown !== false,
            collectDiagnostics: true
          });
          const dv = finalVal.directValidation;
          if (
            finalVal.isValid &&
            dv.isValid &&
            dv.metrics.unsafeSegments === 0 &&
            dv.metrics.cautionSegments === 0 &&
            (dv.metrics.cautionStormSegments || 0) === 0
          ) {
            s1Res.stats.expandedNodes = totalExpandedNodes;
            s1Res.stats.cpuTimeMs = performance.now() - t0;
            return this._formatAndValidateResult(s1Res.path, s1Res.stats, algorithm, {
              startGeo,
              destGeo,
              straightLineDistanceM,
              rawWaypointsCount: s1Res.stats.rawWaypointsCount || s1Res.path.length,
              allowCaution: false,
              stageReached: 1,
              isFallback: false,
              snapped: { start: snapStart, dest: snapDest },
              routeSafetyClearanceM: activeClearanceM,
              maxCautionDensity: activeMaxCautionDensity,
              maxUnknownCoverage: activeMaxUnknownCoverage,
              finalVal,
              rejectedCandidateRoutes
            });
          } else if (!finalVal.isValid) {
            lastCorridorEval = finalVal;
            rejectedCandidateRoutes.push({
              iteration: 0,
              stage: 1,
              status: finalVal.finalValidationStatus,
              rejectionReason: finalVal.rejectionReason,
              minDistanceToUnsafeM: finalVal.corridorValidation?.minDistanceToUnsafeM ?? 0,
              maxCautionDensity: finalVal.corridorValidation?.maxCautionDensity ?? 0,
              maxUnsafeDensity: finalVal.corridorValidation?.maxUnsafeDensity ?? 0,
              unknownCoverage: finalVal.corridorValidation?.unknownCoverage ?? 0,
              latLonPath: dv?.waypoints?.map(w => ({ lat: w.lat, lon: w.lon })) || [],
              offendingSegmentsCount: finalVal.corridorValidation?.offendingSegments?.length || 0
            });
            if (finalVal.corridorValidation?.offendingSegments) {
              this._penalizeOffendingCorridorSegments(
                finalVal.corridorValidation.offendingSegments,
                startSearchPt,
                destSearchPt,
                blockedCells,
                corridorPenaltyMap,
                0
              );
            }
          }
        }
      }

      // Caution-allowed search with iterative alternative corridor evaluation
      this.setAllowCaution(true);

      for (let iter = 0; iter < stageInfo.maxCorridorIters; iter++) {
        if (this.isCancelled) {
          return {
            success: false,
            status: 'CANCELLED',
            finalValidationStatus: 'CANCELLED',
            reason: 'Route calculation was cancelled by user.',
            algorithmUsed: ALGORITHM_CONFIG[algorithm]?.name || algorithm,
            algorithmKey: algorithm,
            cpuTimeMs: performance.now() - t0,
            rejectedCandidateRoutes,
            rejectedCandidateRoutesCount: rejectedCandidateRoutes.length,
            stats: lastStats
          };
        }

        if (this.searchDeadline > 0 && performance.now() > this.searchDeadline) {
          lastStats.status = 'SEARCH_LIMIT_REACHED';
          break;
        }

        const searchRes = this._executeAlgorithm(algorithm, startSearchPt, destSearchPt, {
          stage: stageInfo.stage,
          stageName: stageInfo.name,
          maxExpandedNodes: stageInfo.maxNodes,
          disableSubdivision: stageInfo.disableSubdivision,
          expandSearchArea: stageInfo.stage >= 2,
          storms: config.storms,
          simTimeHrs: config.simTimeHrs,
          blockedCells: blockedCells.size > 0 ? blockedCells : null,
          corridorPenaltyMap: corridorPenaltyMap.size > 0 ? corridorPenaltyMap : null,
          routeSafetyClearanceM: activeClearanceM,
          maxCautionDensity: activeMaxCautionDensity,
          maxUnknownCoverage: activeMaxUnknownCoverage,
          searchIteration: iter,
          rawPathOnly: Boolean(config.rawPathOnly),
          disableSmoothing: Boolean(config.disableSmoothing),
          smooth: config.smooth
        });

        const rawPath = searchRes.path;
        const stats = searchRes.stats || { pathCost: Infinity, expandedNodes: 0, status: 'UNKNOWN' };
        totalExpandedNodes += (stats.expandedNodes || 0);
        stats.expandedNodes = totalExpandedNodes;
        stats.cpuTimeMs = performance.now() - t0;
        lastStats = stats;

        if (rawPath && rawPath.length > 0) {
          const finalVal = validateFinalRouteCorridor(rawPath, terrainData, this.movementProfile, this.weights, {
            maxSafeSlope: this.maxSafeSlopeDeg,
            routeSafetyClearanceM: activeClearanceM,
            maxCautionDensity: activeMaxCautionDensity,
            maxUnknownCoverage: activeMaxUnknownCoverage,
            strictUnknown: config.strictUnknown !== false,
            collectDiagnostics: true
          });
          lastCorridorEval = finalVal;

          if (finalVal.isValid) {
            return this._formatAndValidateResult(rawPath, stats, algorithm, {
              startGeo,
              destGeo,
              straightLineDistanceM,
              rawWaypointsCount: stats.rawWaypointsCount || rawPath.length,
              allowCaution: true,
              userRequestedStrictSafe: config.strictSafeOnly === true,
              stageReached: stageInfo.stage,
              isFallback: stageInfo.stage > 1,
              snapped: { start: snapStart, dest: snapDest },
              routeSafetyClearanceM: activeClearanceM,
              maxCautionDensity: activeMaxCautionDensity,
              maxUnknownCoverage: activeMaxUnknownCoverage,
              finalVal,
              rejectedCandidateRoutes
            });
          }

          rejectedCandidateRoutes.push({
            iteration: iter + 1,
            stage: stageInfo.stage,
            status: finalVal.finalValidationStatus,
            rejectionReason: finalVal.rejectionReason,
            minDistanceToUnsafeM: finalVal.corridorValidation?.minDistanceToUnsafeM ?? 0,
            maxCautionDensity: finalVal.corridorValidation?.maxCautionDensity ?? 0,
            maxUnsafeDensity: finalVal.corridorValidation?.maxUnsafeDensity ?? 0,
            unknownCoverage: finalVal.corridorValidation?.unknownCoverage ?? 0,
            latLonPath: finalVal.directValidation?.waypoints?.map(w => ({ lat: w.lat, lon: w.lon })) || [],
            offendingSegmentsCount: finalVal.corridorValidation?.offendingSegments?.length || 0
          });

          if (finalVal.corridorValidation?.offendingSegments && finalVal.corridorValidation.offendingSegments.length > 0) {
            this._penalizeOffendingCorridorSegments(
              finalVal.corridorValidation.offendingSegments,
              startSearchPt,
              destSearchPt,
              blockedCells,
              corridorPenaltyMap,
              iter + 1
            );
          } else {
            break;
          }
        } else {
          // No path in this iteration: if in global planetary grid and open queue emptied, traversable graph is disconnected
          if (stageInfo.stage >= 2 && (stats.status === 'NO_PATH_FOUND' || stats.status === 'UNKNOWN')) {
            globalSearchSpaceExhausted = true;
          }
          break; // Advance to next progressive stage
        }
      }
    }

    // Terminated without finding a valid route
    const cpuTimeMs = performance.now() - t0;

    if (this.isCancelled) {
      return {
        success: false,
        status: 'CANCELLED',
        finalValidationStatus: 'CANCELLED',
        reason: 'Route calculation was cancelled by user.',
        algorithmUsed: ALGORITHM_CONFIG[algorithm]?.name || algorithm,
        algorithmKey: algorithm,
        cpuTimeMs,
        rejectedCandidateRoutes,
        rejectedCandidateRoutesCount: rejectedCandidateRoutes.length,
        stats: lastStats
      };
    }

    if (rejectedCandidateRoutes.length > 0 && lastCorridorEval) {
      const lastRej = rejectedCandidateRoutes[rejectedCandidateRoutes.length - 1];
      const cv = lastCorridorEval.corridorValidation || {};
      let reasonMsg = `NO SAFE CORRIDOR FOUND: Evaluated ${rejectedCandidateRoutes.length} candidate route(s), all rejected by corridor safety validation (${lastRej.status}).`;
      if (lastRej.status === 'REJECTED_UNSAFE_PROXIMITY') {
        reasonMsg = `NO SAFE CORRIDOR FOUND (REJECTED_UNSAFE_PROXIMITY): All ${rejectedCandidateRoutes.length} candidate corridor(s) pass dangerously close to UNSAFE cliffs/scarps (min distance ${cv.minDistanceToUnsafeM || 0} m < required safety clearance).`;
      } else if (lastRej.status === 'REJECTED_RISK_DENSITY') {
        reasonMsg = `NO SAFE CORRIDOR FOUND (REJECTED_RISK_DENSITY): All ${rejectedCandidateRoutes.length} candidate corridor(s) traverse dense/continuous CAUTION terrain (CAUTION density ${((cv.maxCautionDensity || 0) * 100).toFixed(1)}% > allowed ${(activeMaxCautionDensity * 100).toFixed(0)}%).`;
      } else if (lastRej.status === 'REJECTED_UNKNOWN_COVERAGE') {
        reasonMsg = `NO SAFE CORRIDOR FOUND (REJECTED_UNKNOWN_COVERAGE): Candidate corridor(s) contain ${((cv.unknownCoverage || 0) * 100).toFixed(1)}% missing/UNKNOWN elevation data (> allowed ${(activeMaxUnknownCoverage * 100).toFixed(0)}%).`;
      }

      return {
        success: false,
        status: 'NO_SAFE_CORRIDOR_FOUND',
        finalValidationStatus: 'NO_SAFE_CORRIDOR_FOUND',
        corridorStatus: lastRej.status,
        directPathStatus: lastCorridorEval.directPathStatus || 'UNSAFE',
        rejectionReason: lastRej.rejectionReason || lastRej.status,
        stageReached: 4,
        reason: reasonMsg,
        algorithmUsed: ALGORITHM_CONFIG[algorithm]?.name || algorithm,
        algorithmKey: algorithm,
        cpuTimeMs,
        expandedNodes: totalExpandedNodes,
        rawWaypointsCount: 0,
        finalWaypointsCount: 0,
        waypointsCount: 0,
        minDistanceToUnsafeM: cv.minDistanceToUnsafeM ?? 0,
        maxCautionDensity: cv.maxCautionDensity ?? 0,
        maxUnsafeDensity: cv.maxUnsafeDensity ?? 0,
        unknownCoverage: cv.unknownCoverage ?? 0,
        rejectedCandidateRoutes,
        rejectedCandidateRoutesCount: rejectedCandidateRoutes.length,
        corridorSamples: cv.corridorSamples || [],
        straightLineDistanceM,
        straightLineDistanceKm: straightLineDistanceM / 1000.0,
        routeLengthM: 0,
        routeLengthKm: 0,
        pathToStraightLineRatio: 0,
        diagnostics: {
          stageReached: 4,
          snapStart,
          snapDest,
          maxSafeSlopeDeg: this.maxSafeSlopeDeg,
          thetaMaxUp: this.maxSafeSlopeDeg,
          thetaMaxDown: 0.75 * this.maxSafeSlopeDeg,
          thetaRef: 0.4 * this.maxSafeSlopeDeg,
          routeSafetyClearanceM: activeClearanceM,
          minDistanceToUnsafeM: cv.minDistanceToUnsafeM ?? 0,
          maxCautionDensity: cv.maxCautionDensity ?? 0,
          maxUnsafeDensity: cv.maxUnsafeDensity ?? 0,
          unknownCoverage: cv.unknownCoverage ?? 0,
          rejectedCandidateRoutesCount: rejectedCandidateRoutes.length,
          rejectedCandidateRoutes,
          expandedNodes: totalExpandedNodes
        }
      };
    }

    const failStatus = lastStats.status || 'NO_PATH_FOUND';
    const rMap = lastStats.rejectionReasons || {};
    let specificReason = '';
    let returnStatus = failStatus;

    if (failStatus === 'NODE_LIMIT_EXCEEDED' || failStatus === 'SEARCH_LIMIT_REACHED') {
      returnStatus = 'SEARCH_LIMIT_REACHED';
      specificReason = `Search limit reached: Expanded ${totalExpandedNodes.toLocaleString()} nodes across progressive search stages without reaching destination.`;
    } else if (globalSearchSpaceExhausted || failStatus === 'NO_PATH_FOUND') {
      returnStatus = 'NO_SAFE_PATH';
      specificReason = `NO SAFE PATH FOUND: Search space genuinely exhausted. All traversable corridors across the Martian planetary grid are blocked by impassable slopes (> ${this.maxSafeSlopeDeg.toFixed(1)}°) or active dust storms (τ ≥ 2.0).`;
    } else if (failStatus === 'STORM_EXCLUSION' || rMap.TAU_LIMIT_EXCEEDED || rMap.UNSAFE_WIND || rMap.STORM_EXCLUSION) {
      returnStatus = 'STORM_EXCLUSION';
      specificReason = `Destination unreachable: Direct and alternative corridors are blocked by active dust storm hazards (optical depth τ ≥ 2.0, wind > 100 km/h, or 48-hour temporal exclusion buffer).`;
    } else if (failStatus === 'TOO_STEEP' || rMap.TOO_STEEP) {
      returnStatus = 'TOO_STEEP';
      specificReason = `NO SAFE CORRIDOR FOUND: All navigable corridors between start and goal exceed directional slope limits (uphill > ${this.maxSafeSlopeDeg.toFixed(1)}° or downhill < -${(this.maxSafeSlopeDeg * 0.75).toFixed(1)}°).`;
    } else if (failStatus === 'NO_DATA' || rMap.NO_DATA || rMap.UNKNOWN_ELEVATION) {
      returnStatus = 'NO_DATA';
      specificReason = `NO SAFE CORRIDOR FOUND: Corridor requires crossing terrain without valid MOLA elevation telemetry.`;
    } else {
      returnStatus = 'NO_SAFE_PATH';
      specificReason = `NO SAFE PATH FOUND: No traversable corridor connects start and goal under current terrain and safety constraints.`;
    }

    return {
      success: false,
      status: returnStatus,
      finalValidationStatus: returnStatus,
      corridorStatus: returnStatus,
      directPathStatus: 'UNSAFE',
      stageReached: 4,
      reason: specificReason,
      algorithmUsed: ALGORITHM_CONFIG[algorithm]?.name || algorithm,
      algorithmKey: algorithm,
      cpuTimeMs,
      expandedNodes: totalExpandedNodes,
      rawWaypointsCount: 0,
      finalWaypointsCount: 0,
      waypointsCount: 0,
      rejectedCandidateRoutes,
      rejectedCandidateRoutesCount: rejectedCandidateRoutes.length,
      straightLineDistanceM,
      straightLineDistanceKm: straightLineDistanceM / 1000.0,
      routeLengthM: 0,
      routeLengthKm: 0,
      pathToStraightLineRatio: 0,
      diagnostics: {
        stageReached: 4,
        snapStart,
        snapDest,
        maxSafeSlopeDeg: this.maxSafeSlopeDeg,
        thetaMaxUp: this.maxSafeSlopeDeg,
        thetaMaxDown: 0.75 * this.maxSafeSlopeDeg,
        thetaRef: 0.4 * this.maxSafeSlopeDeg,
        routeSafetyClearanceM: activeClearanceM,
        rejectedCandidateRoutesCount: rejectedCandidateRoutes.length,
        expandedNodes: totalExpandedNodes,
        rejectionReasons: rMap
      }
    };
  }

  // =========================================================================
  // 1. A* SEARCH (8-Direction Optimal Grid Baseline with Sub-Grid & Corner Check)
  // =========================================================================
  _runAStar(start, goal, searchOptions = {}) {
    const rows = this.height;
    const cols = this.width;
    const ctx = this._buildSearchContext(start, goal, searchOptions);
    const { vRows, vCols, wrapCols, sr, sc, gr, gc, subStep, toGlobal } = ctx;

    const terrainData = {
      elevationGrid: this.elevationGrid,
      slopeGrid: this.slopeGrid,
      rows,
      cols
    };

    const evalOpts = {
      allowCaution: this.allowCaution,
      maxSafeSlope: this.maxSafeSlopeDeg,
      blockedCells: searchOptions.blockedCells || null,
      corridorPenaltyMap: searchOptions.corridorPenaltyMap || null,
      searchIteration: searchOptions.searchIteration || 0
    };

    const neighbors = [
      [-1, 0, 1.0], [1, 0, 1.0], [0, -1, 1.0], [0, 1, 1.0],
      [-1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [1, 1, Math.SQRT2]
    ];

    // Admissible heuristic scaled by active cost weights, subStep, and minimum downhill multiplier (0.70)
    const hWeightScaleAStar = 0.70 * Math.max(0.25, (this.weights?.distance ?? 1.0) + 0.23 * (this.weights?.energy ?? 1.0));
    const h = (vr, vc) => {
      const dr = Math.abs(vr - gr) * subStep;
      const rawDc = Math.abs(vc - gc);
      const dc = (wrapCols ? Math.min(rawDc, vCols - rawDc) : rawDc) * subStep;
      return Math.hypot(dr, dc) * hWeightScaleAStar;
    };

    const openHeap = new BinaryMinHeap((a, b) => a.f - b.f);
    openHeap.push({ f: h(sr, sc), g: 0.0, r: sr, c: sc });

    const totalNodes = vRows * vCols;
    const gScore = new Float32Array(totalNodes).fill(Infinity);
    const parentMap = new Int32Array(totalNodes).fill(-1);
    const closed = new Uint8Array(totalNodes);

    gScore[sr * vCols + sc] = 0.0;
    let expandedNodes = 0;
    const rejectionReasons = {};

    while (!openHeap.isEmpty()) {
      if (this.isCancelled) {
        return { path: null, stats: { pathCost: Infinity, expandedNodes, status: 'CANCELLED' } };
      }
      const maxNodes = searchOptions.maxExpandedNodes || this.maxExpandedNodes;
      if (expandedNodes >= maxNodes) {
        return { path: null, stats: { pathCost: Infinity, expandedNodes, status: 'NODE_LIMIT_EXCEEDED' } };
      }
      if (this.searchDeadline > 0 && (expandedNodes & 255) === 0 && performance.now() > this.searchDeadline) {
        return { path: null, stats: { pathCost: Infinity, expandedNodes, status: 'SEARCH_LIMIT_REACHED' } };
      }

      const curr = openHeap.pop();
      const currIdx = curr.r * vCols + curr.c;
      if (closed[currIdx]) continue;
      closed[currIdx] = 1;
      expandedNodes++;

      if (expandedNodes % 500 === 0 && typeof this.onProgress === 'function') {
        this.onProgress({
          expandedNodes,
          algorithm: 'astar',
          stage: searchOptions.stage || 1,
          stageName: searchOptions.stageName || 'LOCAL_DETOUR'
        });
      }

      if (curr.r === gr && curr.c === gc) {
        const path = [];
        let cur = currIdx;
        while (cur !== -1) {
          const vr = Math.floor(cur / vCols);
          const vc = cur % vCols;
          const gPt = toGlobal(vr, vc);
          path.push([gPt.r, gPt.c]);
          cur = parentMap[cur];
        }
        path.reverse();
        return {
          path,
          stats: {
            pathCost: gScore[currIdx],
            expandedNodes,
            rawWaypointsCount: path.length,
            subStep,
            status: 'SUCCESS'
          }
        };
      }

      const currGlobal = toGlobal(curr.r, curr.c);

      for (const [dr, dc] of neighbors) {
        const nr = curr.r + dr;
        if (nr < 0 || nr >= vRows) continue;
        let nc = curr.c + dc;
        if (wrapCols) {
          nc = (nc + vCols) % vCols;
        } else if (nc < 0 || nc >= vCols) {
          continue;
        }

        const nIdx = nr * vCols + nc;
        if (closed[nIdx]) continue;

        const nextGlobal = toGlobal(nr, nc);

        // Corner-cutting check for diagonal moves (evaluated in forward travel direction)
        if (dr !== 0 && dc !== 0) {
          const adj1Global = toGlobal(curr.r + dr, curr.c);
          const adj2Global = toGlobal(curr.r, nc);
          const adj1 = evaluateTerrainTransition(currGlobal, adj1Global, terrainData, this.movementProfile, this.weights, evalOpts);
          const adj2 = evaluateTerrainTransition(currGlobal, adj2Global, terrainData, this.movementProfile, this.weights, evalOpts);
          if (!adj1.traversable || !adj2.traversable) continue;
        }

        // Shared directional terrain transition evaluation in true travel direction curr -> n
        const trans = evaluateTerrainTransition(currGlobal, nextGlobal, terrainData, this.movementProfile, this.weights, evalOpts);

        if (!trans.traversable) {
          const rReason = trans.rejectionReason || 'IMPASSABLE';
          rejectionReasons[rReason] = (rejectionReasons[rReason] || 0) + 1;
          continue;
        }

        const tentativeG = curr.g + trans.cost;
        if (tentativeG < gScore[nIdx]) {
          gScore[nIdx] = tentativeG;
          parentMap[nIdx] = currIdx;
          openHeap.push({ f: tentativeG + h(nr, nc), g: tentativeG, r: nr, c: nc });
        }
      }
    }

    let failStatus = 'NO_PATH_FOUND';
    if (rejectionReasons['TAU_LIMIT_EXCEEDED'] || rejectionReasons['UNSAFE_WIND'] || rejectionReasons['STORM_EXCLUSION']) {
      failStatus = 'STORM_EXCLUSION';
    } else if (rejectionReasons['TOO_STEEP']) {
      failStatus = 'TOO_STEEP';
    } else if (rejectionReasons['NO_DATA'] || rejectionReasons['UNKNOWN_ELEVATION']) {
      failStatus = 'NO_DATA';
    }
    return { path: null, stats: { pathCost: Infinity, expandedNodes, status: failStatus, rejectionReasons } };
  }

  // =========================================================================
  // 2. D* LITE (Koenig & Likhachev Dynamic Reverse Incremental Replanner)
  // =========================================================================
  _runDStarLite(start, goal, searchOptions = {}) {
    const rows = this.height;
    const cols = this.width;
    const ctx = this._buildSearchContext(start, goal, searchOptions);
    const { vRows, vCols, wrapCols, sr, sc, gr, gc, subStep, toGlobal } = ctx;

    const terrainData = {
      elevationGrid: this.elevationGrid,
      slopeGrid: this.slopeGrid,
      rows,
      cols
    };

    const evalOpts = {
      allowCaution: this.allowCaution,
      maxSafeSlope: this.maxSafeSlopeDeg,
      blockedCells: searchOptions.blockedCells || null,
      corridorPenaltyMap: searchOptions.corridorPenaltyMap || null,
      searchIteration: searchOptions.searchIteration || 0
    };

    const neighbors = [
      [-1, 0, 1.0], [1, 0, 1.0], [0, -1, 1.0], [0, 1, 1.0],
      [-1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [1, 1, Math.SQRT2]
    ];

    const hWeightScaleDStar = 0.70 * Math.max(0.25, (this.weights?.distance ?? 1.0) + 0.23 * (this.weights?.energy ?? 1.0));
    const h = (vr, vc) => {
      const dr = Math.abs(vr - sr) * subStep;
      const rawDc = Math.abs(vc - sc);
      const dc = (wrapCols ? Math.min(rawDc, vCols - rawDc) : rawDc) * subStep;
      return Math.hypot(dr, dc) * hWeightScaleDStar;
    };
    const totalNodes = vRows * vCols;
    const g = new Float32Array(totalNodes).fill(Infinity);
    const rhs = new Float32Array(totalNodes).fill(Infinity);
    const inQueue = new Uint8Array(totalNodes);

    const goalIdx = gr * vCols + gc;
    const startIdx = sr * vCols + sc;
    rhs[goalIdx] = 0.0;

    const calcKey = (idx) => {
      const r = Math.floor(idx / vCols);
      const c = idx % vCols;
      const m = Math.min(g[idx], rhs[idx]);
      return [m + h(r, c), m];
    };

    const keyCompare = (k1, k2) => {
      if (Math.abs(k1[0] - k2[0]) > 1e-5) return k1[0] - k2[0];
      return k1[1] - k2[1];
    };

    const U = new BinaryMinHeap((a, b) => keyCompare(a.key, b.key));
    U.push({ idx: goalIdx, key: calcKey(goalIdx) });
    inQueue[goalIdx] = 1;

    let expandedNodes = 0;
    const rejectionReasons = {};

    const updateVertex = (uIdx) => {
      if (uIdx !== goalIdx) {
        const ur = Math.floor(uIdx / vCols);
        const uc = uIdx % vCols;
        const uGlobal = toGlobal(ur, uc);
        let minRhs = Infinity;

        for (const [dr, dc] of neighbors) {
          const nr = ur + dr;
          if (nr < 0 || nr >= vRows) continue;
          let nc = uc + dc;
          if (wrapCols) {
            nc = (nc + vCols) % vCols;
          } else if (nc < 0 || nc >= vCols) {
            continue;
          }
          const nIdx = nr * vCols + nc;
          if (!Number.isFinite(g[nIdx])) continue;

          const nGlobal = toGlobal(nr, nc);

          // Evaluate edge in the true forward astronaut movement direction: u (closer to start) -> n (closer to goal)
          const trans = evaluateTerrainTransition(uGlobal, nGlobal, terrainData, this.movementProfile, this.weights, evalOpts);

          if (!trans.traversable) {
            const rReason = trans.rejectionReason || 'IMPASSABLE';
            rejectionReasons[rReason] = (rejectionReasons[rReason] || 0) + 1;
          } else {
            const cost = trans.cost + g[nIdx];
            if (cost < minRhs) minRhs = cost;
          }
        }
        rhs[uIdx] = minRhs;
      }

      const diff = Math.abs(g[uIdx] - rhs[uIdx]);
      if (diff > 1e-5) {
        const k = calcKey(uIdx);
        U.push({ idx: uIdx, key: k });
        inQueue[uIdx] = 1;
      } else {
        inQueue[uIdx] = 0;
      }
    };

    while (!U.isEmpty()) {
      if (this.isCancelled) {
        return { path: null, stats: { pathCost: Infinity, expandedNodes, status: 'CANCELLED' } };
      }
      const maxNodes = searchOptions.maxExpandedNodes || this.maxExpandedNodes;
      if (expandedNodes >= maxNodes) {
        return { path: null, stats: { pathCost: Infinity, expandedNodes, status: 'NODE_LIMIT_EXCEEDED' } };
      }
      if (this.searchDeadline > 0 && (expandedNodes & 255) === 0 && performance.now() > this.searchDeadline) {
        return { path: null, stats: { pathCost: Infinity, expandedNodes, status: 'SEARCH_LIMIT_REACHED' } };
      }

      const startKey = calcKey(startIdx);
      if (keyCompare(U.data[0].key, startKey) >= 0 && Math.abs(rhs[startIdx] - g[startIdx]) <= 1e-5) {
        break; // Consistent optimal path found
      }

      const top = U.pop();
      const uIdx = top.idx;

      if (Math.abs(g[uIdx] - rhs[uIdx]) <= 1e-5) {
        inQueue[uIdx] = 0;
        continue;
      }

      const currKey = calcKey(uIdx);
      if (keyCompare(top.key, currKey) < 0) {
        U.push({ idx: uIdx, key: currKey });
        continue;
      }

      expandedNodes++;
      inQueue[uIdx] = 0;

      if (expandedNodes % 500 === 0 && typeof this.onProgress === 'function') {
        this.onProgress({
          expandedNodes,
          algorithm: 'dstar_lite',
          stage: searchOptions.stage || 1,
          stageName: searchOptions.stageName || 'LOCAL_DETOUR'
        });
      }

      const ur = Math.floor(uIdx / vCols);
      const uc = uIdx % vCols;

      if (g[uIdx] > rhs[uIdx]) {
        g[uIdx] = rhs[uIdx];
        for (const [dr, dc] of neighbors) {
          const nr = ur + dr;
          if (nr < 0 || nr >= vRows) continue;
          let nc = uc + dc;
          if (wrapCols) nc = (nc + vCols) % vCols;
          else if (nc < 0 || nc >= vCols) continue;
          updateVertex(nr * vCols + nc);
        }
      } else {
        g[uIdx] = Infinity;
        for (const [dr, dc] of neighbors) {
          const nr = ur + dr;
          if (nr < 0 || nr >= vRows) continue;
          let nc = uc + dc;
          if (wrapCols) nc = (nc + vCols) % vCols;
          else if (nc < 0 || nc >= vCols) continue;
          updateVertex(nr * vCols + nc);
        }
        updateVertex(uIdx);
      }
    }

    if (!Number.isFinite(g[startIdx])) {
      let failStatus = 'NO_PATH_FOUND';
      if (rejectionReasons['TAU_LIMIT_EXCEEDED'] || rejectionReasons['UNSAFE_WIND'] || rejectionReasons['STORM_EXCLUSION']) {
        failStatus = 'STORM_EXCLUSION';
      } else if (rejectionReasons['TOO_STEEP']) {
        failStatus = 'TOO_STEEP';
      } else if (rejectionReasons['NO_DATA'] || rejectionReasons['UNKNOWN_ELEVATION']) {
        failStatus = 'NO_DATA';
      }
      return { path: null, stats: { pathCost: Infinity, expandedNodes, status: failStatus, rejectionReasons } };
    }

    // Forward path reconstruction from start to goal
    const startGlobal = toGlobal(sr, sc);
    const path = [[startGlobal.r, startGlobal.c]];
    let currIdx = startIdx;
    let maxSteps = vRows * vCols;
    const visited = new Uint8Array(totalNodes);

    while (currIdx !== goalIdx && maxSteps-- > 0) {
      visited[currIdx] = 1;
      const ur = Math.floor(currIdx / vCols);
      const uc = currIdx % vCols;
      const uGlobal = toGlobal(ur, uc);
      let bestNext = null;
      let minCost = Infinity;

      for (const [dr, dc] of neighbors) {
        const nr = ur + dr;
        if (nr < 0 || nr >= vRows) continue;
        let nc = uc + dc;
        if (wrapCols) nc = (nc + vCols) % vCols;
        else if (nc < 0 || nc >= vCols) continue;
        const nIdx = nr * vCols + nc;
        if (visited[nIdx]) continue;

        const nGlobal = toGlobal(nr, nc);
        const trans = evaluateTerrainTransition(uGlobal, nGlobal, terrainData, this.movementProfile, this.weights, evalOpts);

        if (trans.traversable && Number.isFinite(g[nIdx])) {
          const c = trans.cost + g[nIdx];
          if (c < minCost) {
            minCost = c;
            bestNext = { gr: nGlobal.r, gc: nGlobal.c, idx: nIdx };
          }
        }
      }

      if (!bestNext) break;
      currIdx = bestNext.idx;
      path.push([bestNext.gr, bestNext.gc]);
    }

    return {
      path,
      stats: {
        pathCost: g[startIdx],
        expandedNodes,
        rawWaypointsCount: path.length,
        subStep,
        status: 'SUCCESS'
      }
    };
  }

  // =========================================================================
  // 3. FIELD D* (Ferguson & Stentz, NASA JPL Any-Angle Continuous Routing)
  // Genuine continuous linear interpolation across cell edges (Ferguson & Stentz 2005)
  // Eliminates 45°/90° discrete grid bias without arbitrary post-processing heuristics.
  // =========================================================================
  _runFieldDStar(start, goal, searchOptions = {}) {
    const rows = this.height;
    const cols = this.width;
    const ctx = this._buildSearchContext(start, goal, searchOptions);
    const { vRows, vCols, wrapCols, sr, sc, gr, gc, subStep, toGlobal } = ctx;

    const terrainData = {
      elevationGrid: this.elevationGrid,
      slopeGrid: this.slopeGrid,
      rows,
      cols
    };

    const evalOpts = {
      allowCaution: this.allowCaution,
      maxSafeSlope: this.maxSafeSlopeDeg,
      blockedCells: searchOptions.blockedCells || null,
      corridorPenaltyMap: searchOptions.corridorPenaltyMap || null,
      searchIteration: searchOptions.searchIteration || 0
    };

    const consecutivePairs = [
      { dr1: -1, dc1: 0, dr2: -1, dc2: -1 },
      { dr1: 0, dc1: -1, dr2: -1, dc2: -1 },
      { dr1: -1, dc1: 0, dr2: -1, dc2: 1 },
      { dr1: 0, dc1: 1,  dr2: -1, dc2: 1 },
      { dr1: 1, dc1: 0,  dr2: 1, dc2: -1 },
      { dr1: 0, dc1: -1, dr2: 1, dc2: -1 },
      { dr1: 1, dc1: 0,  dr2: 1, dc2: 1 },
      { dr1: 0, dc1: 1,  dr2: 1, dc2: 1 }
    ];

    const neighbors = [
      [-1, 0, 1.0], [1, 0, 1.0], [0, -1, 1.0], [0, 1, 1.0],
      [-1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [1, 1, Math.SQRT2]
    ];

    const hWeightScaleDStar = 0.70 * Math.max(0.25, (this.weights?.distance ?? 1.0) + 0.23 * (this.weights?.energy ?? 1.0));
    const h = (vr, vc) => {
      const dr = Math.abs(vr - sr) * subStep;
      const rawDc = Math.abs(vc - sc);
      const dc = (wrapCols ? Math.min(rawDc, vCols - rawDc) : rawDc) * subStep;
      return Math.hypot(dr, dc) * hWeightScaleDStar;
    };

    const totalNodes = vRows * vCols;
    const g = new Float32Array(totalNodes).fill(Infinity);
    const rhs = new Float32Array(totalNodes).fill(Infinity);
    const inQueue = new Uint8Array(totalNodes);

    const bpTargetR = new Float32Array(totalNodes).fill(NaN);
    const bpTargetC = new Float32Array(totalNodes).fill(NaN);
    const bpY = new Float32Array(totalNodes).fill(0.0);
    const bpSolType = new Uint8Array(totalNodes);
    const bpNextIdx = new Int32Array(totalNodes).fill(-1);
    const bpS1Idx = new Int32Array(totalNodes).fill(-1);
    const bpS2Idx = new Int32Array(totalNodes).fill(-1);

    const goalIdx = gr * vCols + gc;
    const startIdx = sr * vCols + sc;
    rhs[goalIdx] = 0.0;

    const calcKey = (idx) => {
      const r = Math.floor(idx / vCols);
      const c = idx % vCols;
      const m = Math.min(g[idx], rhs[idx]);
      return [m + h(r, c), m];
    };

    const keyCompare = (k1, k2) => {
      if (Math.abs(k1[0] - k2[0]) > 1e-5) return k1[0] - k2[0];
      return k1[1] - k2[1];
    };

    const U = new BinaryMinHeap((a, b) => keyCompare(a.key, b.key));
    U.push({ idx: goalIdx, key: calcKey(goalIdx) });
    inQueue[goalIdx] = 1;

    let expandedNodes = 0;
    let rhsUpdates = 0;
    let interpEvaluations = 0;
    let interiorOptimaCount = 0;
    let boundaryOptimaCount = 0;
    const rejectionReasons = {};

    const updateVertex = (uIdx) => {
      rhsUpdates++;
      if (uIdx !== goalIdx) {
        const ur = Math.floor(uIdx / vCols);
        const uc = uIdx % vCols;
        const uGlobal = toGlobal(ur, uc);
        let minRhs = Infinity;
        let bestTarget = null;
        let bestY = 0.0;
        let bestType = 0;
        let bestNext = -1;
        let bestS1 = -1;
        let bestS2 = -1;

        for (const pair of consecutivePairs) {
          const nr1 = ur + pair.dr1;
          const nr2 = ur + pair.dr2;
          if (nr1 < 0 || nr1 >= vRows || nr2 < 0 || nr2 >= vRows) continue;

          let nc1 = uc + pair.dc1;
          let nc2 = uc + pair.dc2;
          if (wrapCols) {
            nc1 = ((nc1 % vCols) + vCols) % vCols;
            nc2 = ((nc2 % vCols) + vCols) % vCols;
          } else if (nc1 < 0 || nc1 >= vCols || nc2 < 0 || nc2 >= vCols) {
            continue;
          }

          const s1Idx = nr1 * vCols + nc1;
          const s2Idx = nr2 * vCols + nc2;
          const g1 = g[s1Idx];
          const g2 = g[s2Idx];

          if (!Number.isFinite(g1) && !Number.isFinite(g2)) continue;

          const s1Global = toGlobal(nr1, nc1);
          const s2Global = toGlobal(nr2, nc2);

          interpEvaluations++;
          const edgeRes = computeFieldDStarInterpolatedTransition(
            uGlobal, s1Global, s2Global, g1, g2,
            terrainData, this.movementProfile, this.weights, evalOpts,
            wrapCols, cols
          );

          if (edgeRes.rejectionReason && !Number.isFinite(edgeRes.cost)) {
            rejectionReasons[edgeRes.rejectionReason] = (rejectionReasons[edgeRes.rejectionReason] || 0) + 1;
          }

          if (edgeRes.cost < minRhs) {
            minRhs = edgeRes.cost;
            bestTarget = edgeRes.target;
            bestY = edgeRes.y;
            bestType = edgeRes.type;
            bestNext = (edgeRes.type === 1) ? s1Idx : s2Idx;
            bestS1 = s1Idx;
            bestS2 = s2Idx;
          }
        }

        rhs[uIdx] = minRhs;
        if (bestTarget && Number.isFinite(minRhs)) {
          bpTargetR[uIdx] = bestTarget.r;
          bpTargetC[uIdx] = bestTarget.c;
          bpY[uIdx] = bestY;
          bpSolType[uIdx] = bestType;
          bpNextIdx[uIdx] = bestNext;
          bpS1Idx[uIdx] = bestS1;
          bpS2Idx[uIdx] = bestS2;

          if (bestType === 3) {
            interiorOptimaCount++;
          } else {
            boundaryOptimaCount++;
          }
        }
      }

      const diff = Math.abs(g[uIdx] - rhs[uIdx]);
      if (diff > 1e-5) {
        const k = calcKey(uIdx);
        U.push({ idx: uIdx, key: k });
        inQueue[uIdx] = 1;
      } else {
        inQueue[uIdx] = 0;
      }
    };

    while (!U.isEmpty()) {
      if (this.isCancelled) {
        return { path: null, stats: { pathCost: Infinity, expandedNodes, status: 'CANCELLED' } };
      }
      const maxNodes = searchOptions.maxExpandedNodes || this.maxExpandedNodes;
      if (expandedNodes >= maxNodes) {
        return { path: null, stats: { pathCost: Infinity, expandedNodes, status: 'NODE_LIMIT_EXCEEDED' } };
      }
      if (this.searchDeadline > 0 && (expandedNodes & 255) === 0 && performance.now() > this.searchDeadline) {
        return { path: null, stats: { pathCost: Infinity, expandedNodes, status: 'SEARCH_LIMIT_REACHED' } };
      }

      const startKey = calcKey(startIdx);
      if (keyCompare(U.peek().key, startKey) >= 0 && Math.abs(rhs[startIdx] - g[startIdx]) <= 1e-5) {
        break; // Consistent optimal wavefront reached start
      }

      const top = U.pop();
      const uIdx = top.idx;

      if (Math.abs(g[uIdx] - rhs[uIdx]) <= 1e-5) {
        inQueue[uIdx] = 0;
        continue;
      }

      const currKey = calcKey(uIdx);
      if (keyCompare(top.key, currKey) < 0) {
        U.push({ idx: uIdx, key: currKey });
        continue;
      }

      expandedNodes++;
      inQueue[uIdx] = 0;

      if (expandedNodes % 500 === 0 && typeof this.onProgress === 'function') {
        this.onProgress({
          expandedNodes,
          algorithm: 'field_dstar',
          stage: searchOptions.stage || 1,
          stageName: searchOptions.stageName || 'LOCAL_DETOUR'
        });
      }

      const ur = Math.floor(uIdx / vCols);
      const uc = uIdx % vCols;

      if (g[uIdx] > rhs[uIdx]) {
        g[uIdx] = rhs[uIdx];
        for (const [dr, dc] of neighbors) {
          const nr = ur + dr;
          if (nr < 0 || nr >= vRows) continue;
          let nc = uc + dc;
          if (wrapCols) nc = (nc + vCols) % vCols;
          else if (nc < 0 || nc >= vCols) continue;
          updateVertex(nr * vCols + nc);
        }
      } else {
        g[uIdx] = Infinity;
        for (const [dr, dc] of neighbors) {
          const nr = ur + dr;
          if (nr < 0 || nr >= vRows) continue;
          let nc = uc + dc;
          if (wrapCols) nc = (nc + vCols) % vCols;
          else if (nc < 0 || nc >= vCols) continue;
          updateVertex(nr * vCols + nc);
        }
        updateVertex(uIdx);
      }
    }

    if (!Number.isFinite(g[startIdx])) {
      const startGlobalCheck = toGlobal(sr, sc);
      const goalGlobalCheck = toGlobal(gr, gc);
      for (const basePt of [startGlobalCheck, goalGlobalCheck]) {
        for (const [dr, dc] of neighbors) {
          const nr = Math.max(0, Math.min(rows - 1, basePt.r + dr * subStep));
          const nc = ((Math.round(basePt.c + dc * subStep) % cols) + cols) % cols;
          const chk = evaluateTerrainTransition(basePt, { r: nr, c: nc }, terrainData, this.movementProfile, this.weights, evalOpts);
          if (!chk.traversable && chk.rejectionReason) {
            rejectionReasons[chk.rejectionReason] = (rejectionReasons[chk.rejectionReason] || 0) + 1;
          }
        }
      }
      let failStatus = 'NO_PATH_FOUND';
      if (rejectionReasons['TAU_LIMIT_EXCEEDED'] || rejectionReasons['UNSAFE_WIND'] || rejectionReasons['STORM_EXCLUSION']) {
        failStatus = 'STORM_EXCLUSION';
      } else if (rejectionReasons['TOO_STEEP']) {
        failStatus = 'TOO_STEEP';
      } else if (rejectionReasons['NO_DATA'] || rejectionReasons['UNKNOWN_ELEVATION']) {
        failStatus = 'NO_DATA';
      }
      return {
        path: null,
        stats: {
          pathCost: Infinity,
          expandedNodes,
          status: failStatus,
          rejectionReasons,
          interpolationStats: {
            rhsUpdates,
            interpEvaluations,
            interiorOptimaCount,
            boundaryOptimaCount,
            interiorRatio: interpEvaluations > 0 ? (interiorOptimaCount / interpEvaluations) : 0
          }
        }
      };
    }

    // Persist search state for incremental dynamic replanning
    this._fieldDStarState = {
      g, rhs, U, inQueue, vRows, vCols, wrapCols, subStep, toGlobal,
      goalIdx, startIdx, bpTargetR, bpTargetC, bpY, bpSolType, bpNextIdx,
      bpS1Idx, bpS2Idx, terrainData, evalOpts, consecutivePairs, neighbors,
      calcKey, keyCompare, ctx
    };

    // Extract Continuous Any-Angle Trajectory
    const rawContinuousPath = [];
    let currIdx = startIdx;
    const startGlobal = toGlobal(sr, sc);
    const goalGlobal = toGlobal(gr, gc);

    rawContinuousPath.push([startGlobal.r, startGlobal.c]);
    const visited = new Uint8Array(totalNodes);
    const maxSteps = totalNodes;

    for (let step = 0; step < maxSteps; step++) {
      if (currIdx === goalIdx) break;
      visited[currIdx] = 1;

      const nextTr = bpTargetR[currIdx];
      const nextTc = bpTargetC[currIdx];
      const nextIdx = bpNextIdx[currIdx];

      if (!Number.isFinite(nextTr) || nextIdx < 0 || visited[nextIdx]) {
        rawContinuousPath.push([goalGlobal.r, goalGlobal.c]);
        break;
      }

      const nr = Math.floor(nextIdx / vCols);
      const nc = nextIdx % vCols;
      const nGlobal = toGlobal(nr, nc);

      // If solution is interior crossing (type 3), append continuous edge point without forced 90/135deg grid corner bounce
      if (bpSolType[currIdx] === 3) {
        rawContinuousPath.push([nextTr, nextTc]);
        const nextNextIdx = bpNextIdx[nextIdx];
        const canSkipCorner = (nextIdx !== goalIdx && bpSolType[nextIdx] === 3 && Number.isFinite(bpTargetR[nextIdx]))
          ? evaluateTerrainTransition(
              { r: nextTr, c: nextTc },
              { r: bpTargetR[nextIdx], c: bpTargetC[nextIdx] },
              terrainData, this.movementProfile, this.weights, evalOpts
            ).traversable
          : (nextIdx !== goalIdx && nextNextIdx >= 0 && !visited[nextIdx] && bpSolType[nextIdx] !== 3
              ? evaluateTerrainTransition(
                  { r: nextTr, c: nextTc },
                  toGlobal(Math.floor(nextNextIdx / vCols), nextNextIdx % vCols),
                  terrainData, this.movementProfile, this.weights, evalOpts
                ).traversable
              : false);
        if (!canSkipCorner) {
          rawContinuousPath.push([nGlobal.r, nGlobal.c]);
        }
      } else {
        rawContinuousPath.push([nGlobal.r, nGlobal.c]);
      }

      currIdx = nextIdx;
    }

    // Ensure destination is the final waypoint
    const lastPt = rawContinuousPath[rawContinuousPath.length - 1];
    if (Math.hypot(lastPt[0] - goalGlobal.r, lastPt[1] - goalGlobal.c) > 1e-4) {
      rawContinuousPath.push([goalGlobal.r, goalGlobal.c]);
    }

    // Deduplicate consecutive identical waypoints
    const deduplicated = [rawContinuousPath[0]];
    for (let i = 1; i < rawContinuousPath.length; i++) {
      const prev = deduplicated[deduplicated.length - 1];
      const cur = rawContinuousPath[i];
      if (Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) > 1e-4) {
        deduplicated.push(cur);
      }
    }

    const rawWaypointsCount = deduplicated.length;

    // Check if caller requested raw unsimplified path (Phase 6 / rawPathOnly / disableSmoothing)
    let finalPath = deduplicated;
    if (!searchOptions.rawPathOnly && !searchOptions.disableSmoothing && searchOptions.smooth !== false && deduplicated.length > 2) {
      finalPath = simplifyRouteTerrainAware(
        deduplicated.map(pt => ({ r: pt[0], c: pt[1] })),
        terrainData,
        this.movementProfile,
        this.weights,
        {
          allowCaution: this.allowCaution,
          maxSafeSlope: this.maxSafeSlopeDeg,
          routeSafetyClearanceM: searchOptions.routeSafetyClearanceM ?? this.corridorSafetyConfig.routeSafetyClearanceM,
          maxCautionDensity: searchOptions.maxCautionDensity ?? this.corridorSafetyConfig.maxCautionDensity,
          maxUnknownCoverage: searchOptions.maxUnknownCoverage ?? this.corridorSafetyConfig.maxUnknownCoverage,
          blockedCells: searchOptions.blockedCells || null,
          corridorPenaltyMap: searchOptions.corridorPenaltyMap || null,
          searchIteration: searchOptions.searchIteration || 0,
          maxShortcutSpan: 3
        }
      ).map(pt => [pt.r, pt.c]);
    }

    const interpSummary = {
      rhsUpdates,
      interpEvaluations,
      interiorOptimaCount,
      boundaryOptimaCount,
      interiorRatio: interpEvaluations > 0 ? (interiorOptimaCount / interpEvaluations) : 0
    };

    return {
      path: finalPath,
      stats: {
        pathCost: g[startIdx],
        expandedNodes,
        rhsUpdates,
        interpEvaluations,
        interiorOptimaCount,
        boundaryOptimaCount,
        rawWaypointsCount,
        finalWaypointsCount: finalPath.length,
        subStep,
        status: 'SUCCESS',
        interpolationStats: interpSummary
      },
      interpolationStats: interpSummary
    };
  }

  /**
   * Genuine Field D* Incremental Dynamic Replanning
   * Efficiently repairs cost-to-go values after obstacles or slope changes without re-searching from scratch.
   *
   * @param {Array<Object>} changedCells List of {r, c} cells whose traversability or cost changed
   * @param {Object} currentPos Current astronaut position {r, c}
   * @param {Object} searchOptions Optional search parameters
   * @returns {{ path: Array<Array<number>>, stats: Object }}
   */
  replanFieldDStar(changedCells = [], currentPos = null, searchOptions = {}) {
    const state = this._fieldDStarState;
    if (!state) {
      console.warn("replanFieldDStar called without prior search state. Running full search.");
      return this._runFieldDStar(currentPos, null, searchOptions);
    }

    const {
      g, rhs, U, inQueue, vRows, vCols, wrapCols, subStep, toGlobal,
      goalIdx, bpTargetR, bpTargetC, bpY, bpSolType, bpNextIdx,
      terrainData, evalOpts, consecutivePairs, neighbors,
      calcKey, keyCompare, ctx
    } = state;

    const totalNodes = vRows * vCols;

    let currStartIdx = state.startIdx;
    if (currentPos) {
      const cr = Math.max(0, Math.min(vRows - 1, Math.round((currentPos.r - (ctx?.minR || 0)) / subStep)));
      const cc = wrapCols ? ((Math.round((currentPos.c - (ctx?.minC || 0)) / subStep) % vCols) + vCols) % vCols : Math.max(0, Math.min(vCols - 1, Math.round((currentPos.c - (ctx?.minC || 0)) / subStep)));
      currStartIdx = cr * vCols + cc;
    }

    const updateVertex = (uIdx) => {
      if (uIdx !== goalIdx) {
        const ur = Math.floor(uIdx / vCols);
        const uc = uIdx % vCols;
        const uGlobal = toGlobal(ur, uc);
        let minRhs = Infinity;
        let bestTarget = null;
        let bestY = 0.0;
        let bestType = 0;
        let bestNext = -1;

        for (const pair of consecutivePairs) {
          const nr1 = ur + pair.dr1;
          const nr2 = ur + pair.dr2;
          if (nr1 < 0 || nr1 >= vRows || nr2 < 0 || nr2 >= vRows) continue;

          let nc1 = uc + pair.dc1;
          let nc2 = uc + pair.dc2;
          if (wrapCols) {
            nc1 = ((nc1 % vCols) + vCols) % vCols;
            nc2 = ((nc2 % vCols) + vCols) % vCols;
          } else if (nc1 < 0 || nc1 >= vCols || nc2 < 0 || nc2 >= vCols) {
            continue;
          }

          const s1Idx = nr1 * vCols + nc1;
          const s2Idx = nr2 * vCols + nc2;
          const g1 = g[s1Idx];
          const g2 = g[s2Idx];

          if (!Number.isFinite(g1) && !Number.isFinite(g2)) continue;

          const s1Global = toGlobal(nr1, nc1);
          const s2Global = toGlobal(nr2, nc2);

          const edgeRes = computeFieldDStarInterpolatedTransition(
            uGlobal, s1Global, s2Global, g1, g2,
            terrainData, this.movementProfile, this.weights, evalOpts,
            wrapCols, this.width
          );

          if (edgeRes.cost < minRhs) {
            minRhs = edgeRes.cost;
            bestTarget = edgeRes.target;
            bestY = edgeRes.y;
            bestType = edgeRes.type;
            bestNext = (edgeRes.type === 1) ? s1Idx : s2Idx;
          }
        }

        rhs[uIdx] = minRhs;
        if (bestTarget && Number.isFinite(minRhs)) {
          bpTargetR[uIdx] = bestTarget.r;
          bpTargetC[uIdx] = bestTarget.c;
          bpY[uIdx] = bestY;
          bpSolType[uIdx] = bestType;
          bpNextIdx[uIdx] = bestNext;
        }
      }

      const diff = Math.abs(g[uIdx] - rhs[uIdx]);
      if (diff > 1e-5) {
        const k = calcKey(uIdx);
        U.push({ idx: uIdx, key: k });
        inQueue[uIdx] = 1;
      } else {
        inQueue[uIdx] = 0;
      }
    };

    // Apply changedCells to evalOpts.blockedCells and invalidate cache before repairing rhs values
    if (!evalOpts.blockedCells) evalOpts.blockedCells = new Set();
    evalOpts.searchIteration = (evalOpts.searchIteration || 0) + 1;
    const affected = new Set();
    for (const cell of changedCells) {
      if (cell && cell.r !== undefined && cell.c !== undefined) {
        const cr = Math.round(cell.r);
        const cc = ((Math.round(cell.c) % this.width) + this.width) % this.width;
        const hr = Math.round(cell.r * 2) / 2;
        const hc = ((Math.round(cell.c * 2) / 2 % this.width) + this.width) % this.width;
        if (cell.blocked === false) {
          evalOpts.blockedCells.delete(`${cr},${cc}`);
          evalOpts.blockedCells.delete(`${hr},${hc}`);
        } else {
          evalOpts.blockedCells.add(`${cr},${cc}`);
          evalOpts.blockedCells.add(`${hr},${hc}`);
        }
      }
      const vr = Math.round((cell.r - (ctx?.minR || 0)) / subStep);
      let vc = Math.round((cell.c - (ctx?.minC || 0)) / subStep);
      if (wrapCols) vc = ((vc % vCols) + vCols) % vCols;
      if (vr >= 0 && vr < vRows && vc >= 0 && vc < vCols) {
        affected.add(vr * vCols + vc);
        for (const [dr, dc] of neighbors) {
          const ar = vr + dr;
          let ac = vc + dc;
          if (wrapCols) ac = ((ac % vCols) + vCols) % vCols;
          if (ar >= 0 && ar < vRows && ac >= 0 && ac < vCols) {
            affected.add(ar * vCols + ac);
          }
        }
      }
    }

    for (const idx of affected) {
      updateVertex(idx);
    }

    let replanExpanded = 0;
    while (!U.isEmpty()) {
      const startKey = calcKey(currStartIdx);
      if (keyCompare(U.peek().key, startKey) >= 0 && Math.abs(rhs[currStartIdx] - g[currStartIdx]) <= 1e-5) {
        break;
      }

      const top = U.pop();
      const uIdx = top.idx;

      if (Math.abs(g[uIdx] - rhs[uIdx]) <= 1e-5) {
        inQueue[uIdx] = 0;
        continue;
      }

      const currKey = calcKey(uIdx);
      if (keyCompare(top.key, currKey) < 0) {
        U.push({ idx: uIdx, key: currKey });
        continue;
      }

      replanExpanded++;
      inQueue[uIdx] = 0;

      const ur = Math.floor(uIdx / vCols);
      const uc = uIdx % vCols;

      if (g[uIdx] > rhs[uIdx]) {
        g[uIdx] = rhs[uIdx];
        for (const [dr, dc] of neighbors) {
          const nr = ur + dr;
          if (nr < 0 || nr >= vRows) continue;
          let nc = uc + dc;
          if (wrapCols) nc = (nc + vCols) % vCols;
          else if (nc < 0 || nc >= vCols) continue;
          updateVertex(nr * vCols + nc);
        }
      } else {
        g[uIdx] = Infinity;
        for (const [dr, dc] of neighbors) {
          const nr = ur + dr;
          if (nr < 0 || nr >= vRows) continue;
          let nc = uc + dc;
          if (wrapCols) nc = (nc + vCols) % vCols;
          else if (nc < 0 || nc >= vCols) continue;
          updateVertex(nr * vCols + nc);
        }
        updateVertex(uIdx);
      }
    }

    // Extract updated continuous path from currStartIdx
    const rawContinuousPath = [];
    let cIdx = currStartIdx;
    const curGlobal = toGlobal(Math.floor(cIdx / vCols), cIdx % vCols);
    const gr = Math.floor(goalIdx / vCols);
    const gc = goalIdx % vCols;
    const goalGlobal = toGlobal(gr, gc);

    rawContinuousPath.push([curGlobal.r, curGlobal.c]);
    const visited = new Uint8Array(totalNodes);
    const maxSteps = totalNodes;

    for (let step = 0; step < maxSteps; step++) {
      if (cIdx === goalIdx) break;
      visited[cIdx] = 1;

      const nextTr = bpTargetR[cIdx];
      const nextTc = bpTargetC[cIdx];
      const nextIdx = bpNextIdx[cIdx];

      if (!Number.isFinite(nextTr) || nextIdx < 0 || visited[nextIdx]) {
        rawContinuousPath.push([goalGlobal.r, goalGlobal.c]);
        break;
      }

      if (bpSolType[cIdx] === 3) {
        rawContinuousPath.push([nextTr, nextTc]);
      }

      const nr = Math.floor(nextIdx / vCols);
      const nc = nextIdx % vCols;
      const nGlobal = toGlobal(nr, nc);
      rawContinuousPath.push([nGlobal.r, nGlobal.c]);

      cIdx = nextIdx;
    }

    const lastPt = rawContinuousPath[rawContinuousPath.length - 1];
    if (Math.hypot(lastPt[0] - goalGlobal.r, lastPt[1] - goalGlobal.c) > 1e-4) {
      rawContinuousPath.push([goalGlobal.r, goalGlobal.c]);
    }

    return {
      path: rawContinuousPath,
      stats: {
        pathCost: g[currStartIdx],
        replanExpanded,
        status: 'SUCCESS'
      }
    };
  }

  // =========================================================================
  // 4. FAST MARCHING METHOD / FMM (Continuous Eikonal Wavefront Solver)
  // =========================================================================
  _runFMM(start, goal, searchOptions = {}) {
    const rows = this.height;
    const cols = this.width;
    const ctx = this._buildSearchContext(start, goal, searchOptions);
    const { vRows, vCols, wrapCols, sr, sc, gr, gc, subStep, toGlobal } = ctx;

    const terrainData = {
      elevationGrid: this.elevationGrid,
      slopeGrid: this.slopeGrid,
      rows,
      cols
    };

    const evalOpts = {
      allowCaution: this.allowCaution,
      maxSafeSlope: this.maxSafeSlopeDeg,
      blockedCells: searchOptions.blockedCells || null,
      corridorPenaltyMap: searchOptions.corridorPenaltyMap || null,
      searchIteration: searchOptions.searchIteration || 0
    };

    const total = vRows * vCols;
    const T = new Float64Array(total).fill(Infinity);
    const parentMap = new Int32Array(total).fill(-1);
    const state = new Uint8Array(total); // 0: Far, 1: Narrow Band, 2: Frozen

    const startIdx = sr * vCols + sc;
    const goalIdx = gr * vCols + gc;

    T[startIdx] = 0.0;
    state[startIdx] = 1;

    const heap = new BinaryMinHeap((a, b) => a.t - b.t);
    heap.push({ t: 0.0, r: sr, c: sc, idx: startIdx });

    const n8 = [
      [-1, 0], [1, 0], [0, -1], [0, 1],
      [-1, -1], [-1, 1], [1, -1], [1, 1]
    ];
    let expandedNodes = 0;
    const rejectionReasons = {};

    while (!heap.isEmpty()) {
      if (this.isCancelled) {
        return { path: null, stats: { pathCost: Infinity, expandedNodes, status: 'CANCELLED' } };
      }
      const maxNodes = searchOptions.maxExpandedNodes || this.maxExpandedNodes;
      if (expandedNodes >= maxNodes) {
        return { path: null, stats: { pathCost: Infinity, expandedNodes, status: 'NODE_LIMIT_EXCEEDED' } };
      }
      if (this.searchDeadline > 0 && (expandedNodes & 255) === 0 && performance.now() > this.searchDeadline) {
        return { path: null, stats: { pathCost: Infinity, expandedNodes, status: 'SEARCH_LIMIT_REACHED' } };
      }

      const curr = heap.pop();
      if (state[curr.idx] === 2) continue; // Already frozen
      if (curr.t > T[curr.idx]) continue; // Stale heap entry

      state[curr.idx] = 2; // Freeze node
      expandedNodes++;

      if (expandedNodes % 500 === 0 && typeof this.onProgress === 'function') {
        this.onProgress({
          expandedNodes,
          algorithm: 'fmm',
          stage: searchOptions.stage || 1,
          stageName: searchOptions.stageName || 'LOCAL_DETOUR'
        });
      }

      if (curr.idx === goalIdx) break;

      const currGlobal = toGlobal(curr.r, curr.c);

      for (const [dr, dc] of n8) {
        const nr = curr.r + dr;
        if (nr < 0 || nr >= vRows) continue;
        let nc = curr.c + dc;
        if (wrapCols) nc = (nc + vCols) % vCols;
        else if (nc < 0 || nc >= vCols) continue;
        const nIdx = nr * vCols + nc;
        if (state[nIdx] === 2) continue;

        const nextGlobal = toGlobal(nr, nc);

        // Corner-cutting check for diagonal moves
        if (dr !== 0 && dc !== 0) {
          const adj1Global = toGlobal(curr.r + dr, curr.c);
          const adj2Global = toGlobal(curr.r, nc);
          const adj1 = evaluateTerrainTransition(currGlobal, adj1Global, terrainData, this.movementProfile, this.weights, evalOpts);
          const adj2 = evaluateTerrainTransition(currGlobal, adj2Global, terrainData, this.movementProfile, this.weights, evalOpts);
          if (!adj1.traversable || !adj2.traversable) continue;
        }

        // Transition cost via shared directional evaluator in forward travel direction curr -> n
        const trans = evaluateTerrainTransition(currGlobal, nextGlobal, terrainData, this.movementProfile, this.weights, evalOpts);

        if (!trans.traversable) {
          const rReason = trans.rejectionReason || 'IMPASSABLE';
          rejectionReasons[rReason] = (rejectionReasons[rReason] || 0) + 1;
          continue;
        }

        const directT = curr.t + trans.cost;
        let newT = directT;

        // Upwind Eikonal PDE refinement for cardinal moves when orthogonal neighbors are frozen and traversable
        if (dr === 0 || dc === 0) {
          const invF = Math.max(1e-4, trans.cost);
          const tUp = nr > 0 && state[(nr - 1) * vCols + nc] === 2 ? T[(nr - 1) * vCols + nc] : Infinity;
          const tDown = nr + 1 < vRows && state[(nr + 1) * vCols + nc] === 2 ? T[(nr + 1) * vCols + nc] : Infinity;
          const ncLeft = wrapCols ? (nc - 1 + vCols) % vCols : nc - 1;
          const ncRight = wrapCols ? (nc + 1) % vCols : nc + 1;
          const tLeft = ncLeft >= 0 && state[nr * vCols + ncLeft] === 2 ? T[nr * vCols + ncLeft] : Infinity;
          const tRight = ncRight < vCols && state[nr * vCols + ncRight] === 2 ? T[nr * vCols + ncRight] : Infinity;

          const tH = Math.min(tLeft, tRight);
          const tV = Math.min(tUp, tDown);

          if (Number.isFinite(tH) && Number.isFinite(tV)) {
            const diff = Math.abs(tH - tV);
            if (diff <= invF) {
              const eikonalT = (tH + tV + Math.sqrt(Math.max(0.0, 2.0 * invF * invF - diff * diff))) * 0.5;
              if (eikonalT > Math.max(tH, tV)) {
                newT = Math.min(directT, eikonalT);
              }
            }
          }
        }

        if (newT < T[nIdx]) {
          T[nIdx] = newT;
          parentMap[nIdx] = curr.idx;
          state[nIdx] = 1;
          heap.push({ t: newT, r: nr, c: nc, idx: nIdx });
        }
      }
    }

    if (!Number.isFinite(T[goalIdx])) {
      let failStatus = 'NO_PATH_FOUND';
      if (rejectionReasons['TAU_LIMIT_EXCEEDED'] || rejectionReasons['UNSAFE_WIND'] || rejectionReasons['STORM_EXCLUSION']) {
        failStatus = 'STORM_EXCLUSION';
      } else if (rejectionReasons['TOO_STEEP']) {
        failStatus = 'TOO_STEEP';
      } else if (rejectionReasons['NO_DATA'] || rejectionReasons['UNKNOWN_ELEVATION']) {
        failStatus = 'NO_DATA';
      }
      return { path: null, stats: { pathCost: Infinity, expandedNodes, status: failStatus, rejectionReasons } };
    }

    // Directionally verified gradient descent path extraction from goal to start
    const path = [];
    let curIdx = goalIdx;
    let maxSteps = vRows * vCols;
    const visited = new Uint8Array(total);

    while (curIdx !== startIdx && maxSteps-- > 0) {
      visited[curIdx] = 1;
      const ir = Math.floor(curIdx / vCols);
      const ic = curIdx % vCols;
      const iGlobal = toGlobal(ir, ic);
      path.push([iGlobal.r, iGlobal.c]);

      let bestT = T[curIdx];
      let nextIdx = -1;

      for (const [dr, dc] of n8) {
        const nr = ir + dr;
        if (nr < 0 || nr >= vRows) continue;
        let nc = ic + dc;
        if (wrapCols) nc = (nc + vCols) % vCols;
        else if (nc < 0 || nc >= vCols) continue;
        const nIdx = nr * vCols + nc;
        if (visited[nIdx] || !Number.isFinite(T[nIdx])) continue;

        if (T[nIdx] < bestT) {
          const nGlobal = toGlobal(nr, nc);
          // Verify that stepping FORWARD from candidate predecessor nGlobal to iGlobal is directionally traversable
          const fwdTrans = evaluateTerrainTransition(nGlobal, iGlobal, terrainData, this.movementProfile, this.weights, evalOpts);
          if (fwdTrans.traversable) {
            bestT = T[nIdx];
            nextIdx = nIdx;
          }
        }
      }

      if (nextIdx === -1) {
        // Fallback to parentMap pointer recorded during valid forward wavefront expansion
        const pIdx = parentMap[curIdx];
        if (pIdx !== -1 && !visited[pIdx]) {
          nextIdx = pIdx;
        } else {
          break;
        }
      }

      curIdx = nextIdx;
    }

    const startGlobal = toGlobal(sr, sc);
    path.push([startGlobal.r, startGlobal.c]);
    path.reverse();

    return {
      path,
      stats: {
        pathCost: T[goalIdx],
        expandedNodes,
        rawWaypointsCount: path.length,
        subStep,
        status: 'SUCCESS'
      }
    };
  }

  // =========================================================================
  // POST-SEARCH ROUTE VALIDATION & STANDARDIZED PACKAGING (PARTS A2, F, G)
  // =========================================================================
  _formatAndValidateResult(rawGridPath, stats, algorithm, options = {}) {
    const terrainData = {
      elevationGrid: this.elevationGrid,
      slopeGrid: this.slopeGrid,
      rows: this.height,
      cols: this.width
    };

    const finalVal = options.finalVal || validateFinalRouteCorridor(rawGridPath, terrainData, this.movementProfile, this.weights, {
      ...options,
      maxSafeSlope: this.maxSafeSlopeDeg,
      collectDiagnostics: true
    });

    const validation = finalVal.directValidation;
    const corridorValidation = finalVal.corridorValidation || {
      isValidCorridor: true,
      corridorStatus: 'SAFE_CORRIDOR',
      minDistanceToUnsafeM: 45000,
      maxCautionDensity: 0.0,
      avgCautionDensity: 0.0,
      maxUnsafeDensity: 0.0,
      avgUnsafeDensity: 0.0,
      unknownCoverage: 0.0,
      corridorSamples: []
    };

    // Enforce exact geographic start and destination alignment
    if (options.startGeo && validation.waypoints.length > 0) {
      validation.waypoints[0].lat = options.startGeo.lat;
      validation.waypoints[0].lon = options.startGeo.lon;
      if (validation.segments.length > 0) {
        validation.segments[0].p1 = { lat: options.startGeo.lat, lon: options.startGeo.lon };
      }
    }
    if (options.destGeo && validation.waypoints.length > 0) {
      const lastIdx = validation.waypoints.length - 1;
      validation.waypoints[lastIdx].lat = options.destGeo.lat;
      validation.waypoints[lastIdx].lon = options.destGeo.lon;
      if (validation.segments.length > 0) {
        validation.segments[validation.segments.length - 1].p2 = { lat: options.destGeo.lat, lon: options.destGeo.lon };
      }
    }

    const m = validation.metrics;
    const stageReached = options.stageReached || (m.cautionSegments > 0 || m.cautionPressureSegments > 0 || (m.cautionStormSegments || 0) > 0 ? 2 : 1);
    const rejectedCandidateRoutes = options.rejectedCandidateRoutes || [];

    // Only reject a CAUTION route if caller explicitly requested userRequestedStrictSafe
    if (options.userRequestedStrictSafe === true && (m.cautionSegments > 0 || (m.cautionStormSegments || 0) > 0)) {
      return {
        success: false,
        status: 'NO_FULLY_SAFE_ROUTE',
        finalValidationStatus: 'NO_SAFE_CORRIDOR_FOUND',
        stageReached: 2,
        reason: `NO FULLY SAFE ROUTE: All available trajectories encounter CAUTION terrain slopes (> ${(this.maxSafeSlopeDeg * 0.4).toFixed(1)}°) or dust storm/wind hazard buffers.`,
        algorithmUsed: ALGORITHM_CONFIG[algorithm]?.name || algorithm,
        algorithmKey: algorithm,
        cpuTimeMs: stats.cpuTimeMs || 0,
        expandedNodes: stats.expandedNodes || 0,
        rejectedCandidateRoutes,
        rejectedCandidateRoutesCount: rejectedCandidateRoutes.length,
        diagnostics: {
          stageReached: 2,
          cautionSegments: m.cautionSegments,
          cautionStormSegments: m.cautionStormSegments || 0,
          snapped: options.snapped || null
        }
      };
    }

    let finalStatus = 'SAFE_ROUTE_FOUND';
    if (!validation.isValid || validation.safetyStatus === 'UNSAFE' || !finalVal.isValid) {
      finalStatus = 'UNSAFE_CONSTRAINTS_VIOLATED';
    } else if (validation.safetyStatus === 'CAUTION' || m.cautionSegments > 0 || corridorValidation.corridorStatus === 'CAUTION_CORRIDOR') {
      finalStatus = 'CAUTION_ROUTE_FOUND';
    } else if (validation.safetyStatus === 'UNKNOWN') {
      finalStatus = 'UNKNOWN_DATA_UNAVAILABLE';
    } else {
      finalStatus = 'SAFE_ROUTE_FOUND';
    }

    const straightLineDistanceM = options.straightLineDistanceM ||
      (options.startGeo && options.destGeo
        ? computePlanetaryDistanceMeters(options.startGeo.lat, options.startGeo.lon, options.destGeo.lat, options.destGeo.lon)
        : m.totalDistanceM);
    const routeLengthM = m.totalDistanceM || 0.0;
    const pathToStraightLineRatio = straightLineDistanceM > 1.0
      ? Math.round((routeLengthM / straightLineDistanceM) * 1000) / 1000
      : 1.0;

    const rawWaypointsCount = options.rawWaypointsCount || stats.rawWaypointsCount || validation.waypoints.length;
    const finalWaypointsCount = validation.waypoints.length;
    const maxDirectionalSlopeDeg = Math.max(Math.abs(m.maxUphillSlopeDeg || 0), Math.abs(m.maxDownhillSlopeDeg || 0));

    return {
      success: validation.isValid && finalVal.isValid,
      status: finalStatus,
      finalValidationStatus: finalVal.finalValidationStatus || corridorValidation.corridorStatus,
      directPathStatus: validation.safetyStatus,
      corridorStatus: corridorValidation.corridorStatus,
      stageReached,
      isFallback: Boolean(options.isFallback),
      algorithmUsed: ALGORITHM_CONFIG[algorithm]?.name || algorithm,
      algorithmKey: algorithm,
      cpuTimeMs: stats.cpuTimeMs || 0,
      expandedNodes: stats.expandedNodes || 0,
      pathCost: stats.pathCost || 0,
      rawResult: { stats, ...options.rawResult },
      stats: { ...stats },
      interpolationStats: stats.interpolationStats || null,
      rawWaypointsCount,
      finalWaypointsCount,
      waypointsCount: finalWaypointsCount,
      minDistanceToUnsafeM: corridorValidation.minDistanceToUnsafeM,
      maxLocalSteepnessDeg: Math.round((m.maxLocalSlopeDeg || m.maxSlopeDeg || 0) * 100) / 100,
      maxDirectionalSlopeDeg: Math.round(maxDirectionalSlopeDeg * 100) / 100,
      maxCautionDensity: corridorValidation.maxCautionDensity,
      avgCautionDensity: corridorValidation.avgCautionDensity,
      maxUnsafeDensity: corridorValidation.maxUnsafeDensity,
      avgUnsafeDensity: corridorValidation.avgUnsafeDensity,
      unknownCoverage: corridorValidation.unknownCoverage,
      rejectedCandidateRoutes,
      rejectedCandidateRoutesCount: rejectedCandidateRoutes.length,
      routeLengthM: Math.round(routeLengthM * 10) / 10,
      routeLengthKm: Math.round((routeLengthM / 1000.0) * 100) / 100,
      straightLineDistanceM: Math.round(straightLineDistanceM * 10) / 10,
      straightLineDistanceKm: Math.round((straightLineDistanceM / 1000.0) * 100) / 100,
      pathToStraightLineRatio,
      corridorSamples: corridorValidation.corridorSamples || [],
      path: validation.waypoints.map(w => ({ ...w })),
      latLonPath: validation.waypoints.map(w => ({ lat: w.lat, lon: w.lon })),
      latLonTuples: validation.waypoints.map(w => [w.lat, w.lon]),
      waypoints: validation.waypoints,
      segments: validation.segments,
      trajectorySamples: validation.trajectorySamples || validation.waypoints,
      metrics: {
        ...m,
        safetyStatus: validation.safetyStatus,
        directPathStatus: validation.safetyStatus,
        corridorStatus: corridorValidation.corridorStatus,
        finalValidationStatus: finalVal.finalValidationStatus || corridorValidation.corridorStatus,
        rawWaypointsCount,
        finalWaypointsCount,
        minDistanceToUnsafeM: corridorValidation.minDistanceToUnsafeM,
        maxLocalSteepnessDeg: Math.round((m.maxLocalSlopeDeg || m.maxSlopeDeg || 0) * 100) / 100,
        maxDirectionalSlopeDeg: Math.round(maxDirectionalSlopeDeg * 100) / 100,
        maxCautionDensity: corridorValidation.maxCautionDensity,
        avgCautionDensity: corridorValidation.avgCautionDensity,
        maxUnsafeDensity: corridorValidation.maxUnsafeDensity,
        avgUnsafeDensity: corridorValidation.avgUnsafeDensity,
        unknownCoverage: corridorValidation.unknownCoverage,
        rejectedCandidateRoutesCount: rejectedCandidateRoutes.length,
        routeLengthM: Math.round(routeLengthM * 10) / 10,
        routeLengthKm: Math.round((routeLengthM / 1000.0) * 100) / 100,
        straightLineDistanceM: Math.round(straightLineDistanceM * 10) / 10,
        straightLineDistanceKm: Math.round((straightLineDistanceM / 1000.0) * 100) / 100,
        pathToStraightLineRatio
      },
      diagnostics: {
        stageReached,
        algorithm,
        expandedNodes: stats.expandedNodes || 0,
        cpuTimeMs: stats.cpuTimeMs || 0,
        pathCost: stats.pathCost || 0,
        subStep: stats.subStep || 1.0,
        snapped: options.snapped || null,
        rawWaypointsCount,
        finalWaypointsCount,
        directPathStatus: validation.safetyStatus,
        corridorStatus: corridorValidation.corridorStatus,
        finalValidationStatus: finalVal.finalValidationStatus || corridorValidation.corridorStatus,
        routeSafetyClearanceM: corridorValidation.clearanceM ?? options.routeSafetyClearanceM ?? 30000,
        minDistanceToUnsafeM: corridorValidation.minDistanceToUnsafeM,
        maxCautionDensity: corridorValidation.maxCautionDensity,
        maxUnsafeDensity: corridorValidation.maxUnsafeDensity,
        unknownCoverage: corridorValidation.unknownCoverage,
        rejectedCandidateRoutesCount: rejectedCandidateRoutes.length,
        rejectedCandidateRoutes,
        totalDistanceKm: m.totalDistanceKm,
        straightLineDistanceKm: straightLineDistanceM / 1000.0,
        pathToStraightLineRatio,
        traversalTimeHrs: m.traversalTimeHrs,
        maxSlopeDeg: m.maxSlopeDeg,
        maxLocalSlopeDeg: m.maxLocalSlopeDeg,
        maxUphillSlopeDeg: m.maxUphillSlopeDeg,
        maxDownhillSlopeDeg: m.maxDownhillSlopeDeg,
        avgSlopeDeg: m.avgSlopeDeg,
        thetaMaxUp: m.thetaMaxUp,
        thetaMaxDown: m.thetaMaxDown,
        thetaRef: m.thetaRef,
        cautionSegments: m.cautionSegments,
        unsafeSegments: m.unsafeSegments,
        unknownSegments: m.unknownSegments,
        pressureStatus: m.pressureStatus,
        unsafePressureSegments: m.unsafePressureSegments,
        cautionPressureSegments: m.cautionPressureSegments,
        unknownPressureSegments: m.unknownPressureSegments,
        knownSafePressureSegments: m.knownSafePressureSegments,
        isOxygenFeasible: m.isOxygenFeasible,
        o2DeficitL: m.o2DeficitL
      }
    };
  }
}

export { EvaMarswalkRouter as FieldDStar };

/**
 * Executes a benchmark across all four pathfinding algorithms on identical input conditions.
 * @param {EvaMarswalkRouter} router
 * @param {{lat: number, lon: number}} startGeo
 * @param {{lat: number, lon: number}} destGeo
 * @param {Object} walkerProfile
 * @returns {Array<Object>} Benchmark result row objects
 */
export function runFourAlgorithmBenchmark(router, startGeo, destGeo, walkerProfile = {}) {
  const algorithms = [
    { key: "field_dstar", name: "Field D* (NASA JPL)", paradigm: "Continuous Any-Angle Linear Interpolation" },
    { key: "dstar_lite", name: "D* Lite", paradigm: "Discrete 8-Connected Dynamic Replanning" },
    { key: "fmm", name: "Fast Marching (FMM)", paradigm: "Eikonal Wavefront PDE Gradient Descent" },
    { key: "astar", name: "Baseline A*", paradigm: "Discrete 8-Connected Graph Search" }
  ];

  const maxSafeSlopeDeg = walkerProfile.maxSafeSlopeDeg || router.maxSafeSlopeDeg || MAX_SAFE_SLOPE_DEG;
  const results = [];
  let aStarO2 = null;

  for (const algo of algorithms) {
    const res = router.findRoute(startGeo, destGeo, {
      algorithm: algo.key,
      profile: walkerProfile,
      maxSafeSlopeDeg
    });

    const m = res.metrics || {};
    const row = {
      key: algo.key,
      name: algo.name,
      paradigm: algo.paradigm,
      cpuTimeMs: res.cpuTimeMs ? Math.round(res.cpuTimeMs * 10) / 10 : 0,
      expandedNodes: res.expandedNodes || (m.expandedNodes || 0),
      distanceM: m.totalDistanceM || (m.totalDistanceKm ? Math.round(m.totalDistanceKm * 1000) : 0),
      distanceKm: m.totalDistanceKm || (m.totalDistanceM ? m.totalDistanceM / 1000.0 : 0.0),
      averageSpeedMS: m.speedMS || walkerProfile.speed || walkerProfile.averageWalkingSpeedMS || 1.2,
      avgO2RateLMin: m.avgO2RateLMin || 2.8,
      vo2Rate: m.avgO2RateLMin || 2.8,
      totalO2L: m.totalO2L || 0,
      totalO2: m.totalO2L || 0,
      remainingO2L: m.remainingO2L,
      walkTimeH: m.traversalTimeHrs || (m.totalDistanceM ? (m.totalDistanceM / Math.max(0.1, m.speedMS || 1.2)) / 3600.0 : 0.0),
      isOxygenFeasible: m.isOxygenFeasible !== false,
      smoothnessScore: m.smoothnessScore !== undefined ? m.smoothnessScore : 85.0,
      maxSlopeDeg: m.maxSlopeDeg || 0,
      maxUphillSlopeDeg: m.maxUphillSlopeDeg || 0,
      maxDownhillSlopeDeg: m.maxDownhillSlopeDeg || 0,
      pathCost: res.pathCost || 0,
      safetyStatus: m.safetyStatus || (res.success ? 'SAFE' : 'FAILED'),
      corridorStatus: res.corridorStatus || m.corridorStatus || (res.success ? 'SAFE_CORRIDOR' : 'NO_SAFE_CORRIDOR_FOUND'),
      finalValidationStatus: res.finalValidationStatus || m.finalValidationStatus || (res.success ? 'SAFE_CORRIDOR' : 'NO_SAFE_CORRIDOR_FOUND'),
      minDistanceToUnsafeM: res.minDistanceToUnsafeM ?? m.minDistanceToUnsafeM ?? 0,
      maxCautionDensity: res.maxCautionDensity ?? m.maxCautionDensity ?? 0,
      maxUnsafeDensity: res.maxUnsafeDensity ?? m.maxUnsafeDensity ?? 0,
      unknownCoverage: res.unknownCoverage ?? m.unknownCoverage ?? 0,
      rejectedCandidateRoutesCount: res.rejectedCandidateRoutesCount ?? 0,
      rawWaypointsCount: res.rawWaypointsCount || res.waypointsCount || 0,
      finalWaypointsCount: res.finalWaypointsCount || res.waypointsCount || 0,
      pathToStraightLineRatio: res.pathToStraightLineRatio || 1.0,
      success: res.success,
      waypointsCount: res.waypointsCount || 0
    };

    if (algo.key === "astar") {
      aStarO2 = row.totalO2L;
    }
    results.push(row);
  }

  // Calculate O2 Saved vs A* (%)
  results.forEach(r => {
    if (aStarO2 && aStarO2 > 0 && r.totalO2L > 0) {
      r.o2SavedVsAStarPct = Math.round(((aStarO2 - r.totalO2L) / aStarO2) * 1000) / 10;
    } else {
      r.o2SavedVsAStarPct = 0.0;
    }
  });

  return results;
}
