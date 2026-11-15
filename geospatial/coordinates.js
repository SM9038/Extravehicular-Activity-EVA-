/**
 * NASA Mars Explorer - Geospatial Coordinate Transformations
 * Reference Model: IAU 2011 / IAU 1991 Areocentric Coordinate System
 */

export const MARS_CONSTANTS = {
  R_REF_KM: 3396.19,            // IAU 2000 / MOLA MEGDR reference sphere radius (km) - unified across modules
  R_REF_M: 3396190.0,           // IAU 2000 / MOLA MEGDR reference sphere radius (m)
  R_GRAVITY_REF_KM: 3396.0,     // MRO120G / GMM-3 spherical harmonic reference sphere radius (km)
  R_GRAVITY_REF_M: 3396000.0,   // MRO120G / GMM-3 spherical harmonic reference sphere radius (m)
  R_MEAN_KM: 3389.5,            // IAU volumetric mean radius (km)
  R_EQUATORIAL_KM: 3396.19,
  R_POLAR_KM: 3376.20,
  FLATTENING: (3396.19 - 3376.20) / 3396.19, // ~0.005886007555525457
  GM: 42828.3750924, // km^3/s^2
  STANDARD_G0_MS2: 3.713606, // m/s^2
  STANDARD_G0_MGAL: 371360.6, // mGal
  EARTH_G_MS2: 9.80665 // m/s^2
};

/**
 * Convert Planetocentric Latitude and Longitude to Cartesian 3D Coordinates (X, Y, Z in km)
 * @param {number} latDeg - Planetocentric Latitude (-90 to +90)
 * @param {number} lonDeg - East Longitude (0 to 360)
 * @param {number} radiusKm - Absolute Planetary Radius in km (defaults to 3396.0)
 * @returns {{x: number, y: number, z: number}}
 */
export function areocentricToCartesian(latDeg, lonDeg, radiusKm = MARS_CONSTANTS.R_REF_KM) {
  const phi = (latDeg * Math.PI) / 180.0;
  const lambda = (lonDeg * Math.PI) / 180.0;
  
  // Standard planetary right-handed Cartesian frame:
  // X points to Prime Meridian (0 deg lon, 0 deg lat)
  // Y points to 90 deg East
  // Z points to North Pole (+90 deg lat)
  return {
    x: radiusKm * Math.cos(phi) * Math.cos(lambda),
    y: radiusKm * Math.cos(phi) * Math.sin(lambda),
    z: radiusKm * Math.sin(phi)
  };
}

/**
 * Convert Cartesian Coordinates back to Areocentric Latitude and Longitude
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {{lat: number, lonEast: number, lonWest: number, radiusKm: number}}
 */
export function cartesianToAreocentric(x, y, z) {
  const radiusKm = Math.hypot(x, y, z);
  if (radiusKm === 0) {
    return { lat: 0, lonEast: 0, lonWest: 0, radiusKm: 0 };
  }
  
  const latRad = Math.asin(Math.max(-1.0, Math.min(1.0, z / radiusKm)));
  let lonRad = Math.atan2(y, x);
  if (lonRad < 0) lonRad += 2 * Math.PI;
  
  const latDeg = (latRad * 180.0) / Math.PI;
  const lonEast = (lonRad * 180.0) / Math.PI;
  let lonWest = lonEast > 180.0 ? lonEast - 360.0 : lonEast;

  return {
    lat: latDeg,
    lonEast: lonEast,
    lonWest: lonWest,
    radiusKm: radiusKm
  };
}

/**
 * Convert Planetocentric Latitude to Planetographic Latitude
 * tan(phi_planetographic) = (a / b)^2 * tan(phi_planetocentric)
 * @param {number} latCentricDeg
 * @returns {number}
 */
export function planetocentricToPlanetographic(latCentricDeg) {
  if (Math.abs(latCentricDeg) >= 89.999) return latCentricDeg;
  const factor = Math.pow(MARS_CONSTANTS.R_EQUATORIAL_KM / MARS_CONSTANTS.R_POLAR_KM, 2);
  const phiRad = (latCentricDeg * Math.PI) / 180.0;
  return (Math.atan(factor * Math.tan(phiRad)) * 180.0) / Math.PI;
}

/**
 * Great circle distance between two points on Mars (in kilometers)
 * Uses unified IAU 2000 / MOLA MEGDR equatorial datum radius (3,396.19 km).
 */
export function surfaceDistanceKm(lat1, lon1, lat2, lon2, radiusKm = MARS_CONSTANTS.R_REF_KM) {
  const phi1 = (lat1 * Math.PI) / 180.0;
  const phi2 = (lat2 * Math.PI) / 180.0;
  const deltaPhi = phi2 - phi1;
  const deltaLambda = ((((lon2 - lon1 + 540.0) % 360.0) - 180.0) * Math.PI) / 180.0;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const clampedA = Math.max(0.0, Math.min(1.0, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1.0 - clampedA));
  return radiusKm * c;
}
