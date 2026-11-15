/**
 * NASA Mars Explorer - Dynamic Dust Storm Simulation & Environmental Hazard Model
 * 
 * Implements:
 * 1. Spatiotemporal dust optical depth: tau(d, t) = tau_base + Delta_tau_max * I(t) * exp(-(d/R)^2)
 *    Critical Safety Exclusion: tau >= 2.0 is strictly PROHIBITED (UNSAFE).
 * 
 * 2. Dynamic wind speed model: v(d, t) = v_base + Delta_v_max * I(t) * max(0, 1 - d/R)
 *    Thresholds:
 *    - 0 <= v <= 40 km/h: SAFE (40 is SAFE)
 *    - 40 < v <= 100 km/h: CAUTION (41 is CAUTION, 60 is CAUTION, 100 is CAUTION)
 *    - v > 100 km/h: UNSAFE (101 is UNSAFE, strictly prohibited)
 * 
 * 3. 48-Hour Spatiotemporal Separation:
 *    Astronaut arrival t_arr must be separated from storm exposure window [t_enter, t_exit]
 *    by at least 48 hours: t_arr < t_enter - 48h OR t_arr > t_exit + 48h.
 * 
 * 4. Geodesic Great-Circle Mars Spherical Calculations (R_Mars = 3,396.19 km).
 */

export const MARS_RADIUS_KM = 3396.19;

export const INTENSITY_PRESETS = {
  weak: {
    id: 'weak',
    label: 'Weak',
    deltaTauMax: 1.0,
    deltaVMax: 30.0,
    speedKmH: 15.0,
    radiusKm: 120.0,
    description: 'Minor regional dust veil, light winds'
  },
  moderate: {
    id: 'moderate',
    label: 'Moderate',
    deltaTauMax: 2.0,
    deltaVMax: 50.0,
    speedKmH: 25.0,
    radiusKm: 200.0,
    description: 'Moderate regional storm, core optical depth exceeds 2.0'
  },
  strong: {
    id: 'strong',
    label: 'Strong',
    deltaTauMax: 3.5,
    deltaVMax: 75.0,
    speedKmH: 40.0,
    radiusKm: 320.0,
    description: 'Sub-global severe dust storm with gale-force winds'
  },
  severe: {
    id: 'severe',
    label: 'Severe',
    deltaTauMax: 5.5,
    deltaVMax: 110.0,
    speedKmH: 55.0,
    radiusKm: 500.0,
    description: 'Planet-encircling dust storm event (PEDE), extreme hazard'
  }
};

/**
 * Wind speed safety classification (Prompt Section 5 & Acceptance Test F)
 * 0 - 40 km/h: SAFE
 * 40 - 60 km/h: CAUTION (conservative treatment)
 * 60 - 100 km/h: CAUTION
 * > 100 km/h: UNSAFE
 */
export function classifyWindSpeed(vKmH) {
  if (vKmH <= 40.0) return 'SAFE';
  if (vKmH <= 100.0) return 'CAUTION';
  return 'UNSAFE';
}

/**
 * Optical depth safety classification (Prompt Section 4.2 & Acceptance Test E)
 * tau < 1.5: SAFE
 * 1.5 <= tau < 2.0: CAUTION
 * tau >= 2.0: UNSAFE (Hard safety exclusion zone)
 */
export function classifyOpticalDepth(tau) {
  if (tau >= 2.0) return 'UNSAFE';
  if (tau >= 1.5) return 'CAUTION';
  return 'SAFE';
}

/**
 * Spherical Haversine distance on Mars sphere in kilometers
 */
export function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const phi1 = (lat1 * Math.PI) / 180.0;
  const phi2 = (lat2 * Math.PI) / 180.0;
  const dphi = ((lat2 - lat1) * Math.PI) / 180.0;
  const dlambda = ((((lon2 - lon1 + 540.0) % 360.0) - 180.0) * Math.PI) / 180.0;

  const a = Math.sin(dphi / 2.0) * Math.sin(dphi / 2.0) +
            Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2.0) * Math.sin(dlambda / 2.0);
  const c = 2.0 * Math.atan2(Math.sqrt(Math.max(0.0, Math.min(1.0, a))), Math.sqrt(Math.max(0.0, 1.0 - a)));
  return MARS_RADIUS_KM * c;
}

/**
 * Spherical Forward Geodesic: Computes destination point given start point,
 * azimuth angle (degrees clockwise from North), and distance (km)
 */
export function forwardGeodesic(lat0, lon0, azimuthDeg, distKm) {
  const delta = distKm / MARS_RADIUS_KM;
  const theta = (azimuthDeg * Math.PI) / 180.0;
  const phi0 = (lat0 * Math.PI) / 180.0;
  const lambda0 = (lon0 * Math.PI) / 180.0;

  const sinPhi1 = Math.sin(phi0) * Math.cos(delta) + Math.cos(phi0) * Math.sin(delta) * Math.cos(theta);
  const phi1 = Math.asin(Math.max(-1.0, Math.min(1.0, sinPhi1)));

  const y = Math.sin(theta) * Math.sin(delta) * Math.cos(phi0);
  const x = Math.cos(delta) - Math.sin(phi0) * sinPhi1;
  const lambda1 = lambda0 + Math.atan2(y, x);

  const lat1 = (phi1 * 180.0) / Math.PI;
  const lon1 = (((lambda1 * 180.0) / Math.PI) % 360.0 + 360.0) % 360.0;
  return { lat: Math.max(-89.99, Math.min(89.99, lat1)), lon: lon1 };
}

/**
 * Primary Dust Storm Simulation Engine
 */
export class DustStormSimulator {
  constructor(options = {}) {
    this.storms = new Map();
    this.nextStormId = 1;
    this.simTimeHrs = 0.0;
    this.isPlaying = false;
    this.simSpeedMultiplier = options.simSpeedMultiplier || 1.0; // 1 second real = 1 hour sim
    this.tauBase = options.tauBase !== undefined ? options.tauBase : 0.35;
    this.vBase = options.vBase !== undefined ? options.vBase : 10.0; // km/h
    this.listeners = new Set();
    this._animationTimer = null;
    this._lastClockTick = 0;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(eventType = 'change') {
    for (const fn of this.listeners) {
      try {
        fn(eventType, this);
      } catch (err) {
        console.error('DustStormSimulator listener error:', err);
      }
    }
  }

  /**
   * Add a new dust storm
   */
  addStorm(config = {}) {
    const id = config.id || ('storm_' + (this.nextStormId++));
    const intensity = config.intensity || (Number(config.deltaTauMax || config.intensityTau) >= 3.0 ? 'severe' : 'moderate');
    const preset = INTENSITY_PRESETS[intensity] || INTENSITY_PRESETS.moderate;

    const latVal = config.lat !== undefined ? Number(config.lat) : (config.centerLat !== undefined ? Number(config.centerLat) : 0.0);
    const lonVal = config.lon !== undefined ? ((Number(config.lon) % 360.0) + 360.0) % 360.0 : (config.centerLon !== undefined ? ((Number(config.centerLon) % 360.0) + 360.0) % 360.0 : 0.0);
    const speedVal = config.speedKmH !== undefined ? Math.max(0.0, Number(config.speedKmH)) : (config.driftSpeedKmH !== undefined ? Math.max(0.0, Number(config.driftSpeedKmH)) : preset.speedKmH);
    const dirVal = config.directionDeg !== undefined ? ((Number(config.directionDeg) % 360.0) + 360.0) % 360.0 : (config.driftDirectionDeg !== undefined ? ((Number(config.driftDirectionDeg) % 360.0) + 360.0) % 360.0 : 45.0);
    const tauVal = config.deltaTauMax !== undefined ? Math.max(0.0, Number(config.deltaTauMax)) : (config.intensityTau !== undefined ? Math.max(0.0, Number(config.intensityTau)) : preset.deltaTauMax);

    const storm = {
      id,
      name: config.name || ('Dust Storm ' + id),
      lat: latVal,
      lon: lonVal,
      centerLat: latVal,
      centerLon: lonVal,
      radiusKm: config.radiusKm !== undefined ? Math.max(10.0, Number(config.radiusKm)) : preset.radiusKm,
      directionDeg: dirVal,
      driftDirectionDeg: dirVal,
      speedKmH: speedVal,
      driftSpeedKmH: speedVal,
      intensity,
      deltaTauMax: tauVal,
      intensityTau: tauVal,
      deltaVMax: config.deltaVMax !== undefined ? Math.max(0.0, Number(config.deltaVMax)) : preset.deltaVMax,
      startTimeHrs: config.startTimeHrs !== undefined ? Number(config.startTimeHrs) : this.simTimeHrs,
      durationHrs: config.durationHrs !== undefined ? Number(config.durationHrs) : 120.0,
      active: config.active !== undefined ? Boolean(config.active) : true
    };

    this.storms.set(id, storm);
    this.notify('storm_added');
    return storm;
  }

  updateStorm(id, updates = {}) {
    const storm = this.storms.get(id);
    if (!storm) return null;

    if (updates.intensity && updates.intensity !== storm.intensity && INTENSITY_PRESETS[updates.intensity]) {
      const preset = INTENSITY_PRESETS[updates.intensity];
      storm.intensity = updates.intensity;
      if (updates.deltaTauMax === undefined && updates.intensityTau === undefined) storm.deltaTauMax = preset.deltaTauMax;
      if (updates.deltaVMax === undefined) storm.deltaVMax = preset.deltaVMax;
      if (updates.speedKmH === undefined && updates.driftSpeedKmH === undefined) storm.speedKmH = preset.speedKmH;
      if (updates.radiusKm === undefined) storm.radiusKm = preset.radiusKm;
    }

    if (updates.lat !== undefined || updates.centerLat !== undefined) {
      const newLat = Math.max(-89.99, Math.min(89.99, Number(updates.lat ?? updates.centerLat)));
      storm.lat = newLat;
      storm.centerLat = newLat;
    }
    if (updates.lon !== undefined || updates.centerLon !== undefined) {
      const newLon = ((Number(updates.lon ?? updates.centerLon) % 360.0) + 360.0) % 360.0;
      storm.lon = newLon;
      storm.centerLon = newLon;
    }
    if (updates.radiusKm !== undefined) storm.radiusKm = Math.max(10.0, Number(updates.radiusKm));
    if (updates.directionDeg !== undefined || updates.driftDirectionDeg !== undefined) {
      const newDir = ((Number(updates.directionDeg ?? updates.driftDirectionDeg) % 360.0) + 360.0) % 360.0;
      storm.directionDeg = newDir;
      storm.driftDirectionDeg = newDir;
    }
    if (updates.speedKmH !== undefined || updates.driftSpeedKmH !== undefined) {
      const newSpd = Math.max(0.0, Number(updates.speedKmH ?? updates.driftSpeedKmH));
      storm.speedKmH = newSpd;
      storm.driftSpeedKmH = newSpd;
    }
    if (updates.deltaTauMax !== undefined || updates.intensityTau !== undefined) {
      const newTau = Math.max(0.0, Number(updates.deltaTauMax ?? updates.intensityTau));
      storm.deltaTauMax = newTau;
      storm.intensityTau = newTau;
    }
    if (updates.deltaVMax !== undefined) storm.deltaVMax = Math.max(0.0, Number(updates.deltaVMax));
    if (updates.startTimeHrs !== undefined) storm.startTimeHrs = Number(updates.startTimeHrs);
    if (updates.durationHrs !== undefined) storm.durationHrs = Math.max(0.1, Number(updates.durationHrs));
    if (updates.active !== undefined) storm.active = Boolean(updates.active);

    this.notify('storm_updated');
    return storm;
  }

  removeStorm(id) {
    const existed = this.storms.delete(id);
    if (existed) this.notify('storm_removed');
    return existed;
  }

  clearAllStorms() {
    this.storms.clear();
    this.notify('storms_cleared');
  }

  getStorm(id) {
    return this.storms.get(id) || null;
  }

  getAllStorms() {
    return Array.from(this.storms.values());
  }

  getActiveStorms() {
    return Array.from(this.storms.values()).filter(s => s.active);
  }

  /**
   * Set simulation clock in hours
   */
  setSimulationTime(hours) {
    this.simTimeHrs = Math.max(0.0, Number(hours));
    this.notify('time_changed');
  }

  getSimulationTime() {
    return this.simTimeHrs;
  }

  startSimulation() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this._lastClockTick = performance.now();
    this._runClockLoop();
    this.notify('simulation_started');
  }

  pauseSimulation() {
    this.isPlaying = false;
    if (this._animationTimer) {
      cancelAnimationFrame(this._animationTimer);
      this._animationTimer = null;
    }
    this.notify('simulation_paused');
  }

  resetSimulation() {
    this.pauseSimulation();
    this.simTimeHrs = 0.0;
    this.notify('simulation_reset');
  }

  stepSimulation(deltaHours = 1.0) {
    this.simTimeHrs = Math.max(0.0, this.simTimeHrs + deltaHours);
    this.notify('time_changed');
  }

  setSpeedMultiplier(multiplier) {
    this.simSpeedMultiplier = Math.max(0.1, Number(multiplier) || 1.0);
    this.notify('speed_changed');
  }

  getSpeedMultiplier() {
    return this.simSpeedMultiplier;
  }

  _runClockLoop() {
    if (!this.isPlaying) return;
    const now = performance.now();
    const dtMs = now - this._lastClockTick;
    this._lastClockTick = now;

    // Default: 1 real second = 1 sim hour * multiplier
    const deltaSimHrs = (dtMs / 1000.0) * this.simSpeedMultiplier;
    this.simTimeHrs += deltaSimHrs;
    this.notify('time_changed');

    this._animationTimer = requestAnimationFrame(() => this._runClockLoop());
  }

  /**
   * Computes the geographic center of a storm at simulation time t (hours)
   */
  getStormCenterAt(storm, timeHrs = this.simTimeHrs) {
    const elapsedHrs = Math.max(0.0, timeHrs - storm.startTimeHrs);
    const distTraveledKm = storm.speedKmH * elapsedHrs;
    if (distTraveledKm <= 1e-4) {
      return { lat: storm.lat, lon: storm.lon };
    }
    return forwardGeodesic(storm.lat, storm.lon, storm.directionDeg, distTraveledKm);
  }

  /**
   * Temporal intensity envelope I(t) for smooth physical evolution
   */
  getTemporalIntensity(storm, timeHrs = this.simTimeHrs) {
    const elapsed = timeHrs - storm.startTimeHrs;
    if (elapsed < 0.0) return 0.0;
    if (elapsed > storm.durationHrs) return 0.0;

    const fraction = elapsed / storm.durationHrs;
    if (fraction > 0.85) {
      // Linear dissipation towards end of storm life
      return Math.max(0.0, (1.0 - fraction) / 0.15);
    }
    return 1.0;
  }

  /**
   * Computes the storm's exposure window [t_enter, t_exit] over a target location
   * Returns: { hasExposure, enterTimeHrs, exitTimeHrs, minDistanceKm, closestTimeHrs }
   */
  getStormExposureWindow(storm, lat, lon, maxForecastHrs = 120.0) {
    const searchStepHrs = 0.5;
    let minDistanceKm = Infinity;
    let closestTimeHrs = 0.0;
    let enterTimeHrs = null;
    let exitTimeHrs = null;

    const tStart = Math.max(0.0, storm.startTimeHrs);
    const tEnd = Math.min(storm.startTimeHrs + storm.durationHrs, maxForecastHrs);
    if (tEnd < tStart) {
      return { hasExposure: false, enterTimeHrs: null, exitTimeHrs: null, minDistanceKm: Infinity, closestTimeHrs: 0.0 };
    }

    const absSpeedKmH = Math.abs(Number(storm.speedKmH) || 0.0);
    const cStart = this.getStormCenterAt(storm, tStart);
    const dStart = haversineDistanceKm(lat, lon, cStart.lat, cStart.lon);

    // Exact O(1) fast path for stationary storms (constant center over [tStart, tEnd])
    if (absSpeedKmH < 1e-6) {
      const steps = Math.floor((tEnd - tStart) / searchStepHrs);
      const lastT = tStart + steps * searchStepHrs;
      const hit = dStart <= storm.radiusKm;
      return {
        hasExposure: hit,
        enterTimeHrs: hit ? tStart : null,
        exitTimeHrs: hit ? lastT : null,
        minDistanceKm: dStart,
        closestTimeHrs: tStart
      };
    }

    // Exact triangle-inequality spatial exclusion bound for moving storms
    const durationWindowHrs = tEnd - tStart;
    const maxTravelKm = absSpeedKmH * durationWindowHrs;
    if (dStart - maxTravelKm > storm.radiusKm + 1e-3) {
      const cEnd = this.getStormCenterAt(storm, tEnd);
      const dEnd = haversineDistanceKm(lat, lon, cEnd.lat, cEnd.lon);
      return {
        hasExposure: false,
        enterTimeHrs: null,
        exitTimeHrs: null,
        minDistanceKm: Math.min(dStart, dEnd),
        closestTimeHrs: dEnd < dStart ? tEnd : tStart
      };
    }

    // Narrow [tStart, tEnd] analytically to feasible window where storm can enter R
    const cEnd = this.getStormCenterAt(storm, tEnd);
    const dEnd = haversineDistanceKm(lat, lon, cEnd.lat, cEnd.lon);
    const minNeededStartHrs = Math.max(0.0, (dStart - storm.radiusKm - 1.0) / absSpeedKmH);
    const minNeededEndHrs = Math.max(0.0, (dEnd - storm.radiusKm - 1.0) / absSpeedKmH);
    const kLo = Math.floor(minNeededStartHrs / searchStepHrs);
    const tLo = tStart + kLo * searchStepHrs;
    const tHi = Math.min(tEnd, tEnd - minNeededEndHrs + searchStepHrs);

    if (tLo > tHi) {
      return {
        hasExposure: false,
        enterTimeHrs: null,
        exitTimeHrs: null,
        minDistanceKm: Math.min(dStart, dEnd),
        closestTimeHrs: dEnd < dStart ? tEnd : tStart
      };
    }

    for (let t = tLo; t <= tHi; t += searchStepHrs) {
      const center = this.getStormCenterAt(storm, t);
      const dist = haversineDistanceKm(lat, lon, center.lat, center.lon);

      if (dist < minDistanceKm) {
        minDistanceKm = dist;
        closestTimeHrs = t;
      }

      if (dist <= storm.radiusKm) {
        if (enterTimeHrs === null) enterTimeHrs = t;
        exitTimeHrs = t;
      }
    }

    const hasExposure = enterTimeHrs !== null;
    if (!Number.isFinite(minDistanceKm)) {
      minDistanceKm = Math.min(dStart, dEnd);
      closestTimeHrs = dEnd < dStart ? tEnd : tStart;
    }
    return {
      hasExposure,
      enterTimeHrs,
      exitTimeHrs,
      minDistanceKm,
      closestTimeHrs
    };
  }

  /**
   * Evaluates environmental conditions at (lat, lon) at a specific time t
   * Includes 48-Hour Spatiotemporal Separation Check (Prompt Part III)
   */
  getEnvironmentalConditionsAt(lat, lon, timeHrs = this.simTimeHrs) {
    let tauAccum = 0.0;
    let maxWindStorm = 0.0;
    let inStormFootprint = false;
    let violates48hBuffer = false;
    let minTemporalBufferHrs = Infinity;
    let mostThreateningStorm = null;

    const activeStorms = this.getActiveStorms();

    for (const storm of activeStorms) {
      const center = this.getStormCenterAt(storm, timeHrs);
      const dist = haversineDistanceKm(lat, lon, center.lat, center.lon);
      const intensity = this.getTemporalIntensity(storm, timeHrs);
      const R = storm.radiusKm;

      if (dist <= R) {
        inStormFootprint = true;
      }

      // 1. Spatiotemporal Optical Depth Model: Delta_tau_max * I(t) * exp(-(d/R)^2)
      if (dist <= R * 2.5 && intensity > 0.0) {
        const dOverR = dist / R;
        const stormTau = storm.deltaTauMax * intensity * Math.exp(-(dOverR * dOverR));
        tauAccum += stormTau;
      }

      // 2. Wind Speed Influence Function: Delta_v_max * I(t) * max(0, 1 - d/R)
      if (dist <= R && intensity > 0.0) {
        const stormV = storm.deltaVMax * intensity * Math.max(0.0, 1.0 - dist / R);
        if (stormV > maxWindStorm) {
          maxWindStorm = stormV;
        }
      }

      // 3. 48-Hour Spatiotemporal Temporal Buffer Evaluation (Prompt Part III Section 7.1)
      const exposure = this.getStormExposureWindow(storm, lat, lon, storm.startTimeHrs + storm.durationHrs);
      if (exposure.hasExposure) {
        // Storm is predicted to cover this location during [enterTime, exitTime]
        const tEnter = exposure.enterTimeHrs;
        const tExit = exposure.exitTimeHrs;

        // Separation condition: arrival time must be < (tEnter - 48h) OR > (tExit + 48h)
        const dtBefore = tEnter - timeHrs;
        const dtAfter = timeHrs - tExit;

        if (dtBefore > 0.0) {
          // Astronaut arrives before storm reaches here
          if (dtBefore < minTemporalBufferHrs) minTemporalBufferHrs = dtBefore;
          if (dtBefore < 48.0) {
            violates48hBuffer = true;
            mostThreateningStorm = storm;
          }
        } else if (dtAfter > 0.0) {
          // Astronaut arrives after storm has departed
          if (dtAfter < minTemporalBufferHrs) minTemporalBufferHrs = dtAfter;
          if (dtAfter < 48.0) {
            violates48hBuffer = true;
            mostThreateningStorm = storm;
          }
        } else {
          // Astronaut arrives DURING active storm passage!
          violates48hBuffer = true;
          minTemporalBufferHrs = 0.0;
          mostThreateningStorm = storm;
        }
      }
    }

    const totalTau = Math.max(0.0, this.tauBase + tauAccum);
    const totalWindSpeed = Math.max(0.0, this.vBase + maxWindStorm);

    const tauClass = classifyOpticalDepth(totalTau);
    const windClass = classifyWindSpeed(totalWindSpeed);

    // Multi-criteria overall safety synthesis
    let overallSafety = 'SAFE';
    if (tauClass === 'UNSAFE' || windClass === 'UNSAFE' || violates48hBuffer) {
      overallSafety = 'UNSAFE';
    } else if (tauClass === 'CAUTION' || windClass === 'CAUTION') {
      overallSafety = 'CAUTION';
    }

    return {
      tau: Number(totalTau.toFixed(3)),
      tauBase: this.tauBase,
      tauStorm: Number(tauAccum.toFixed(3)),
      tauClass,
      windSpeedKmH: Number(totalWindSpeed.toFixed(1)),
      windBaseKmH: this.vBase,
      windStormKmH: Number(maxWindStorm.toFixed(1)),
      windClass,
      overallSafety,
      inStormFootprint,
      violates48hBuffer,
      minTemporalBufferHrs: minTemporalBufferHrs === Infinity ? 999.0 : Number(minTemporalBufferHrs.toFixed(1)),
      threateningStormId: mostThreateningStorm ? mostThreateningStorm.id : null,
      activeStormCount: activeStorms.length,
      isSimulated: true
    };
  }

  /**
   * Generates a geodesic circle polygon (array of {lat, lon}) for map rendering
   */
  getStormGeodesicPolygon(storm, timeHrs = this.simTimeHrs, numPoints = 40) {
    const center = this.getStormCenterAt(storm, timeHrs);
    const R = storm.radiusKm;
    const points = [];

    for (let i = 0; i < numPoints; i++) {
      const az = (i * 360.0) / numPoints;
      const pt = forwardGeodesic(center.lat, center.lon, az, R);
      points.push(pt);
    }
    return { center, radiusKm: R, points };
  }

  /**
   * Generates predicted forecast trajectory waypoints for visualizing propagation vector
   */
  predictTrajectory(storm, forecastHours = 72.0, stepHours = 6.0) {
    const trajectory = [];
    const t0 = this.simTimeHrs;

    for (let t = t0; t <= t0 + forecastHours; t += stepHours) {
      const center = this.getStormCenterAt(storm, t);
      const intensity = this.getTemporalIntensity(storm, t);
      trajectory.push({
        timeHrs: t,
        relativeHrs: t - t0,
        lat: center.lat,
        lon: center.lon,
        radiusKm: storm.radiusKm,
        speedKmH: storm.speedKmH,
        intensity
      });
    }
    return trajectory;
  }
}

// Global simulator singleton for map and route integration
export const globalDustStormSimulator = new DustStormSimulator();
