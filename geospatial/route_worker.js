/**
 * Mars Pedestrian Route Calculation Web Worker
 * Offloads Multi-Algorithm Pathfinding & Biomechanical Calculations from main UI thread.
 * 
 * Supported Migrated Algorithms:
 * 1. Field D* (Ferguson & Stentz, NASA JPL Any-Angle)
 * 2. D* Lite (Koenig & Likhachev Dynamic Replanning)
 * 3. A* Search (Optimal 8-Direction Grid Baseline)
 * 4. Fast Marching Method / FMM (Eikonal PDE Wavefront Solver)
 */

import { FieldDStar, clearTransitionCostCache } from './field_d_star.js';
import { globalDustStormSimulator } from './dust_storm_simulator.js';

let planner = null;
let isInitialized = false;
let currentCalculationId = null;
let pendingMaxSafeSlopeDeg = 22.0;
let pendingCorridorConfig = {
  routeSafetyClearanceM: 30000,
  maxCautionDensity: 0.35,
  maxUnknownCoverage: 0.15
};

// Pre-load binary datasets (MOLA elevation & terrain slope)
async function initPlanner() {
  if (isInitialized) return;
  try {
    const [elevRes, slopeRes] = await Promise.all([
      fetch('../data/elevation.bin'),
      fetch('../data/slope.bin')
    ]);

    const elevBuf = await elevRes.arrayBuffer();
    const slopeBuf = await slopeRes.arrayBuffer();

    const elevationGrid = new Float32Array(elevBuf);
    const slopeGrid = new Float32Array(slopeBuf);

    planner = new FieldDStar({
      width: 720,
      height: 360,
      elevationGrid,
      slopeGrid,
      maxSafeSlopeDeg: pendingMaxSafeSlopeDeg,
      ...pendingCorridorConfig
    });

    isInitialized = true;
    self.postMessage({ type: 'WORKER_READY' });
  } catch (err) {
    self.postMessage({ type: 'WORKER_ERROR', error: err.message });
  }
}

// Trigger initialization
initPlanner();

self.onmessage = async function(e) {
  const { id, type, start, dest, objective, config, algorithm, maxSafeSlopeDeg, routeSafetyClearanceM, maxCautionDensity, maxUnknownCoverage, isWalkingReplan, searchTimeoutMs } = e.data;

  if (type === 'SET_MAX_SLOPE') {
    if (Number.isFinite(Number(maxSafeSlopeDeg)) && Number(maxSafeSlopeDeg) > 0) {
      pendingMaxSafeSlopeDeg = Math.max(1.0, Number(maxSafeSlopeDeg));
      if (planner) {
        planner.setMaxSafeSlope(pendingMaxSafeSlopeDeg);
      }
    }
    if (routeSafetyClearanceM !== undefined) pendingCorridorConfig.routeSafetyClearanceM = Number(routeSafetyClearanceM);
    if (maxCautionDensity !== undefined) pendingCorridorConfig.maxCautionDensity = Number(maxCautionDensity);
    if (maxUnknownCoverage !== undefined) pendingCorridorConfig.maxUnknownCoverage = Number(maxUnknownCoverage);
    if (planner && typeof planner.setCorridorSafetyConfig === 'function') {
      planner.setCorridorSafetyConfig(pendingCorridorConfig);
    }
    clearTransitionCostCache();
    return;
  }

  if (type === 'CANCEL_ROUTE') {
    if (planner) {
      planner.cancel();
    }
    self.postMessage({
      id: currentCalculationId || id,
      type: 'ROUTE_RESULT',
      isWalkingReplan: Boolean(isWalkingReplan),
      success: false,
      status: 'CANCELLED',
      message: 'Route calculation was cancelled.'
    });
    return;
  }

  if (type === 'CALCULATE_ROUTE') {
    currentCalculationId = id;
    if (!isInitialized) {
      await initPlanner();
    }

    if (!planner) {
      self.postMessage({
        id,
        type: 'ROUTE_RESULT',
        isWalkingReplan: Boolean(isWalkingReplan),
        success: false,
        error: 'PLANNER_NOT_INITIALIZED',
        message: 'Terrain elevation and slope grids are not yet loaded.'
      });
      return;
    }

    // Attach real-time progress callback
    planner.onProgress = (progress) => {
      self.postMessage({
        id,
        type: 'ROUTE_PROGRESS',
        isWalkingReplan: Boolean(isWalkingReplan),
        expandedNodes: progress.expandedNodes || 0,
        algorithm: progress.algorithm,
        stage: progress.stage || 1,
        stageName: progress.stageName || 'LOCAL_DETOUR',
        status: progress.status || 'SEARCH_CONTINUING'
      });
    };

    const effectiveMaxSlope = config?.maxSafeSlopeDeg ?? config?.profile?.maxSafeSlopeDeg ?? config?.walker?.maxSafeSlopeDeg ?? pendingMaxSafeSlopeDeg;
    if (Number.isFinite(Number(effectiveMaxSlope)) && Number(effectiveMaxSlope) > 0) {
      pendingMaxSafeSlopeDeg = Math.max(1.0, Number(effectiveMaxSlope));
      planner.setMaxSafeSlope(pendingMaxSafeSlopeDeg);
    }

    const mergedConfig = {
      ...config,
      searchTimeoutMs: searchTimeoutMs || config?.searchTimeoutMs || 30000,
      maxExpandedNodes: config?.maxExpandedNodes || 350000,
      maxSafeSlopeDeg: pendingMaxSafeSlopeDeg,
      objective: objective || config?.objective || 'min_risk',
      algorithm: algorithm || config?.algorithm || 'field_dstar'
    };

    if (config?.storms) {
      globalDustStormSimulator.clearAllStorms();
      for (const s of config.storms) {
        globalDustStormSimulator.addStorm(s);
      }
    }
    if (config?.simTimeHrs !== undefined) {
      globalDustStormSimulator.setSimulationTime(config.simTimeHrs);
    }

    try {
      const result = planner.findRoute(start, dest, mergedConfig);
      self.postMessage({
        id,
        type: 'ROUTE_RESULT',
        isWalkingReplan: Boolean(isWalkingReplan),
        ...result
      });
    } catch (err) {
      self.postMessage({
        id,
        type: 'ROUTE_RESULT',
        isWalkingReplan: Boolean(isWalkingReplan),
        success: false,
        error: 'EXECUTION_ERROR',
        message: err.message
      });
    }
  }
};
