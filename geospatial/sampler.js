/**
 * NASA Mars Explorer - Scientific Raster Sampler
 * Supports nearest-neighbor, bilinear interpolation, and NoData validation
 */

export class ScientificRasterSampler {
  /**
   * @param {Float32Array} buffer - Grid values
   * @param {number} width - 720
   * @param {number} height - 360
   * @param {number} minVal
   * @param {number} maxVal
   * @param {string} unit
   * @param {string} name
   */
  constructor(buffer, width, height, minVal, maxVal, unit, name) {
    this.buffer = buffer;
    this.width = width;
    this.height = height;
    this.minVal = minVal;
    this.maxVal = maxVal;
    this.unit = unit;
    this.name = name;
  }

  /**
   * Sample value at (lat, lon) with choice of nearest or bilinear
   * @param {number} lat - Latitude in degrees (-90 to +90)
   * @param {number} lon - East Longitude in degrees (0 to 360)
   * @param {boolean} interpolate - Use bilinear interpolation
   * @returns {{value: number, status: string, quality: string}}
   */
  sample(lat, lon, interpolate = true) {
    // Normalize coordinates
    let normLon = lon % 360.0;
    if (normLon < 0) normLon += 360.0;
    const clampLat = Math.max(-90.0, Math.min(90.0, lat));

    // Convert to continuous pixel coordinates
    // Lat: +90 at y=0, -90 at y=height
    const u = (normLon / 360.0) * this.width - 0.5;
    const v = ((90.0 - clampLat) / 180.0) * this.height - 0.5;

    if (!interpolate) {
      const col = ((Math.round(u) % this.width) + this.width) % this.width;
      const row = Math.max(0, Math.min(this.height - 1, Math.round(v)));
      const val = this.buffer[row * this.width + col];
      
      return {
        value: val,
        status: "Direct Sample (Source Cell)",
        quality: "Measured NASA Model Cell",
        isNoData: isNaN(val) || val === -9999
      };
    }

    // Bilinear Interpolation
    const x0 = Math.floor(u);
    const y0 = Math.floor(v);
    const x1 = x0 + 1;
    const y1 = y0 + 1;

    const fx = u - x0;
    const fy = v - y0;

    const c0 = ((x0 % this.width) + this.width) % this.width;
    const c1 = ((x1 % this.width) + this.width) % this.width;
    const r0 = Math.max(0, Math.min(this.height - 1, y0));
    const r1 = Math.max(0, Math.min(this.height - 1, y1));

    const v00 = this.buffer[r0 * this.width + c0];
    const v10 = this.buffer[r0 * this.width + c1];
    const v01 = this.buffer[r1 * this.width + c0];
    const v11 = this.buffer[r1 * this.width + c1];

    // Check NoData in neighbors
    if ([v00, v10, v01, v11].some(val => isNaN(val) || val === -9999)) {
      return {
        value: v00,
        status: "Direct Sample (NoData Boundary)",
        quality: "Border Cell",
        isNoData: isNaN(v00) || v00 === -9999
      };
    }

    const interpolatedVal = (1 - fx) * (1 - fy) * v00 +
                            fx * (1 - fy) * v10 +
                            (1 - fx) * fy * v01 +
                            fx * fy * v11;

    return {
      value: interpolatedVal,
      status: "Bilinear Interpolated",
      quality: "4-Point Continuous Synthesis",
      isNoData: false
    };
  }

  /**
   * Sample 1D cross-section profile between two points
   * @param {number} lat1
   * @param {number} lon1
   * @param {number} lat2
   * @param {number} lon2
   * @param {number} numSamples
   * @returns {Array<{lat: number, lon: number, distanceKm: number, value: number}>}
   */
  sampleProfile(lat1, lon1, lat2, lon2, numSamples = 50) {
    const results = [];
    // Compute total distance
    const totalDist = surfaceDistance(lat1, lon1, lat2, lon2);

    for (let i = 0; i < numSamples; i++) {
      const frac = i / (numSamples - 1);
      const lat = lat1 + frac * (lat2 - lat1);
      const lon = lon1 + frac * (lon2 - lon1);
      const s = this.sample(lat, lon, true);
      results.push({
        lat: lat,
        lon: lon,
        distanceKm: frac * totalDist,
        value: s.value
      });
    }
    return results;
  }
}

function surfaceDistance(lat1, lon1, lat2, lon2) {
  const phi1 = (lat1 * Math.PI) / 180.0;
  const phi2 = (lat2 * Math.PI) / 180.0;
  const deltaPhi = phi2 - phi1;
  const deltaLambda = ((((lon2 - lon1 + 540.0) % 360.0) - 180.0) * Math.PI) / 180.0;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const clampedA = Math.max(0.0, Math.min(1.0, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1.0 - clampedA));
  return 3396.19 * c;
}
