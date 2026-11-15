/**
 * NASA Mars Explorer - Equirectangular 2D Tile Filename Parser & Coordinate Engine
 * Reference: NASA Planetary Data System (PDS) & USGS MGS MOLA Tile Index
 * 
 * Each tile covers a 30° latitude by 30° longitude grid cell.
 * Longitude increases Eastward (0° to 360°E).
 * Latitude is [-90°S to +90°N].
 */

/**
 * Formats a latitude value in human-readable aerospace format.
 * @param {number} lat - Latitude in degrees
 * @returns {string}
 */
export function formatLatitude(lat) {
  if (lat > 0) return `${lat.toFixed(lat % 1 === 0 ? 0 : 2)}°N`;
  if (lat < 0) return `${Math.abs(lat).toFixed(lat % 1 === 0 ? 0 : 2)}°S`;
  return (typeof window !== 'undefined' && window.evaTr) ? window.evaTr('0° (Equator)', '0° (Xích đạo)') : '0° (Equator)';
}

/**
 * Formats a longitude value in standard East longitude format.
 * @param {number} lon - East Longitude in degrees (0 to 360)
 * @returns {string}
 */
export function formatLongitude(lon) {
  let normLon = ((lon % 360) + 360) % 360;
  return `${normLon.toFixed(normLon % 1 === 0 ? 0 : 2)}°E`;
}

/**
 * Automatically parses a Mars 30°x30° tile filename.
 * Supports:
 *   - "N00_150.png"
 *   - "mola_color_N00_150.png"
 *   - "N-90_060.png"
 *   - "mola_color_N-90_060.png"
 *   - "N00_330.png"
 *   - "mola_color_N00_330.png"
 *   - Any tile with format [prefix]N[startLat]_[startLon].[ext]
 * 
 * Rules:
 *   1. 'N' is a fixed prefix.
 *   2. Minus sign after 'N' indicates southern latitude.
 *   3. First number identifies starting latitude boundary (latMin).
 *   4. Second number identifies starting longitude boundary (lonMin).
 *   5. Each tile covers 30° in latitude and 30° in longitude.
 *   6. latMax = latMin + 30.
 *   7. lonMax = lonMin + 30.
 * 
 * @param {string} filenameOrPath 
 * @returns {TileMetadata}
 */
export function parseMarsTileFilename(filenameOrPath) {
  if (!filenameOrPath || typeof filenameOrPath !== 'string') {
    throw new Error('Filename must be a valid non-empty string.');
  }

  // Extract base filename without path
  const filename = filenameOrPath.split(/[\\/]/).pop().trim();

  // Regex pattern matching: optional prefix ending with underscore or nothing,
  // 'N', signed integer latitude (-90 to 60), underscore, integer longitude (0 to 330), optional extension
  const pattern = /^(?:.*_)?N(-?\d{1,2})_(\d{1,3})(?:\.[a-zA-Z0-9]+)?$/i;
  const match = filename.match(pattern);

  if (!match) {
    throw new Error(`Invalid Mars tile filename: "${filename}". Expected format like "N00_150.png" or "mola_color_N-90_060.png".`);
  }

  const startLat = parseInt(match[1], 10);
  const startLon = parseInt(match[2], 10);

  // Validate latitude boundaries (-90 to +60 in steps of 30)
  const validLats = [-90, -60, -30, 0, 30, 60];
  if (!validLats.includes(startLat)) {
    throw new Error(`Invalid starting latitude ${startLat}° in "${filename}". Must be one of: ${validLats.join(', ')}.`);
  }

  // Validate longitude boundaries (0 to 330 in steps of 30)
  if (startLon < 0 || startLon > 330 || startLon % 30 !== 0) {
    throw new Error(`Invalid starting longitude ${startLon}° in "${filename}". Must be between 0° and 330° in steps of 30°.`);
  }

  const latMin = startLat;
  const latMax = startLat + 30;
  const lonMin = startLon;
  const lonMax = startLon + 30;

  // Normalized Equirectangular Map Coordinates (0 to 1)
  // u: 0 at 0°E, 1 at 360°E (Left to Right)
  // v: 0 at 90°N (Top), 0.5 at 0° (Equator), 1 at 90°S (Bottom)
  const uMin = lonMin / 360.0;
  const uMax = lonMax / 360.0;
  const vMin = (90.0 - latMax) / 180.0; // Northern edge is top (smaller v)
  const vMax = (90.0 - latMin) / 180.0; // Southern edge is bottom (larger v)

  return {
    filename,
    startLat,
    startLon,
    latMin,
    latMax,
    lonMin,
    lonMax,
    latSpan: 30,
    lonSpan: 30,
    uMin,
    uMax,
    vMin,
    vMax,
    isNorthern: startLat >= 0,
    isSouthern: startLat < 0,
    latRangeFormatted: `${formatLatitude(latMin)} to ${formatLatitude(latMax)}`,
    lonRangeFormatted: `${formatLongitude(lonMin)} to ${formatLongitude(lonMax)}`,
    orientationSummary: {
      top: `${formatLatitude(latMax)} (Northern edge)`,
      bottom: `${formatLatitude(latMin)} (Southern edge)`,
      left: `${formatLongitude(lonMin)} (Western edge)`,
      right: `${formatLongitude(lonMax)} (Eastern edge)`
    }
  };
}

/**
 * Determines whether a geographic point (lon, lat) falls inside a tile.
 * @param {number} lon - East Longitude (0 to 360)
 * @param {number} lat - Latitude (-90 to +90)
 * @param {TileMetadata} tile 
 * @returns {boolean}
 */
export function isPointInTile(lon, lat, tile) {
  // Normalize lon to [0, 360)
  let normLon = ((lon % 360) + 360) % 360;
  if (lon === 360 && tile.lonMax === 360) {
    normLon = 360; // Allow 360°E boundary match
  }
  return (
    normLon >= tile.lonMin &&
    normLon <= tile.lonMax &&
    lat >= tile.latMin &&
    lat <= tile.latMax
  );
}

/**
 * Calculates exact integer pixel coordinates (px, py) within a tile's original PNG
 * for a given geographic coordinate (lon, lat).
 * 
 * Orientation Rules:
 *   - Top = latMax (northern boundary) -> row 0
 *   - Bottom = latMin (southern boundary) -> row H-1
 *   - Left = lonMin (starting longitude) -> col 0
 *   - Right = lonMax (ending longitude) -> col W-1
 * 
 * @param {number} lon 
 * @param {number} lat 
 * @param {TileMetadata} tile 
 * @param {number} imgWidth 
 * @param {number} imgHeight 
 * @returns {{px: number, py: number, rx: number, ry: number} | null}
 */
export function geographicToPixelCoords(lon, lat, tile, imgWidth, imgHeight) {
  if (!isPointInTile(lon, lat, tile)) {
    return null;
  }

  let normLon = ((lon % 360) + 360) % 360;
  if (lon === 360 && tile.lonMax === 360) {
    normLon = 360;
  }

  // Fractional position [0, 1]
  const rx = (normLon - tile.lonMin) / (tile.lonMax - tile.lonMin);
  const ry = (tile.latMax - lat) / (tile.latMax - tile.latMin);

  // Clamped pixel coordinates
  const px = Math.floor(Math.min(Math.max(rx * imgWidth, 0), imgWidth - 1));
  const py = Math.floor(Math.min(Math.max(ry * imgHeight, 0), imgHeight - 1));

  return { px, py, rx, ry };
}

/**
 * Calculates geographic coordinates from pixel position within a tile.
 * @param {number} px 
 * @param {number} py 
 * @param {TileMetadata} tile 
 * @param {number} imgWidth 
 * @param {number} imgHeight 
 * @returns {{lon: number, lat: number}}
 */
export function pixelToGeographicCoords(px, py, tile, imgWidth, imgHeight) {
  const rx = (px + 0.5) / imgWidth;
  const ry = (py + 0.5) / imgHeight;

  const lon = tile.lonMin + rx * (tile.lonMax - tile.lonMin);
  const lat = tile.latMax - ry * (tile.latMax - tile.latMin);

  return { lon, lat };
}

/**
 * Runs a browser-side automated test suite for the tile parser.
 * @returns {Array<{name: string, passed: boolean, message: string}>}
 */
export function runAutomatedTileTests() {
  const results = [];

  function assert(name, condition, errorMsg = '') {
    results.push({
      name,
      passed: Boolean(condition),
      message: condition ? 'PASSED' : errorMsg
    });
  }

  try {
    // 1. Target Tile 1: N00_150
    const t1 = parseMarsTileFilename('N00_150.png');
    assert('Parse N00_150.png', t1.latMin === 0 && t1.latMax === 30 && t1.lonMin === 150 && t1.lonMax === 180,
      `Expected [0, 30] x [150, 180], got [${t1.latMin}, ${t1.latMax}] x [${t1.lonMin}, ${t1.lonMax}]`);

    // 2. Target Tile 2: N-90_060
    const t2 = parseMarsTileFilename('N-90_060.png');
    assert('Parse N-90_060.png', t2.latMin === -90 && t2.latMax === -60 && t2.lonMin === 60 && t2.lonMax === 90,
      `Expected [-90, -60] x [60, 90], got [${t2.latMin}, ${t2.latMax}] x [${t2.lonMin}, ${t2.lonMax}]`);

    // 3. Target Tile 3: N00_330
    const t3 = parseMarsTileFilename('N00_330.png');
    assert('Parse N00_330.png', t3.latMin === 0 && t3.latMax === 30 && t3.lonMin === 330 && t3.lonMax === 360,
      `Expected [0, 30] x [330, 360], got [${t3.latMin}, ${t3.latMax}] x [${t3.lonMin}, ${t3.lonMax}]`);

    // 4. mola_color prefix support
    const t1_prefix = parseMarsTileFilename('mola_color_N00_150.png');
    assert('Parse mola_color_N00_150.png', t1_prefix.latMin === 0 && t1_prefix.lonMin === 150,
      'Failed on mola_color_ prefix');

    const t2_prefix = parseMarsTileFilename('mola_color_N-90_060.png');
    assert('Parse mola_color_N-90_060.png', t2_prefix.latMin === -90 && t2_prefix.lonMin === 60,
      'Failed on mola_color_N-90_060 prefix');

    const t3_prefix = parseMarsTileFilename('mola_color_N00_330.png');
    assert('Parse mola_color_N00_330.png', t3_prefix.latMin === 0 && t3_prefix.lonMin === 330,
      'Failed on mola_color_N00_330 prefix');

    // 5. Easternmost boundary check (Tile 3 at extreme right edge)
    assert('Extreme Right Edge (uMax == 1.0)', Math.abs(t3.uMax - 1.0) < 1e-6,
      `Expected uMax = 1.0, got ${t3.uMax}`);

    // 6. South Pole boundary check (Tile 2 at bottom edge)
    assert('South Pole Edge (vMax == 1.0)', Math.abs(t2.vMax - 1.0) < 1e-6,
      `Expected vMax = 1.0, got ${t2.vMax}`);

    // 7. Geographic to Pixel Transformation Accuracy
    const pTopLeft = geographicToPixelCoords(150.0, 30.0, t1, 7680, 7680);
    assert('Pixel Coords Top-Left (150°E, 30°N) -> (0, 0)', pTopLeft && pTopLeft.px === 0 && pTopLeft.py === 0,
      `Expected (0, 0), got (${pTopLeft?.px}, ${pTopLeft?.py})`);

    const pBottomRight = geographicToPixelCoords(180.0, 0.0, t1, 7680, 7680);
    assert('Pixel Coords Bottom-Right (180°E, 0°N) -> (7679, 7679)', pBottomRight && pBottomRight.px === 7679 && pBottomRight.py === 7679,
      `Expected (7679, 7679), got (${pBottomRight?.px}, ${pBottomRight?.py})`);

    const pCenter = geographicToPixelCoords(165.0, 15.0, t1, 7680, 7680);
    assert('Pixel Coords Center (165°E, 15°N) -> (3840, 3840)', pCenter && Math.abs(pCenter.px - 3840) <= 1 && Math.abs(pCenter.py - 3840) <= 1,
      `Expected (3840, 3840), got (${pCenter?.px}, ${pCenter?.py})`);

    // 8. Uncovered Gap Verification (Separation preserved)
    const lonGap = t3.lonMin - t1.lonMax;
    assert('Separation Gap (Tile 1 to Tile 3 = 150°E gap)', lonGap === 150,
      `Expected 150° gap, got ${lonGap}°`);

    const latGap = t1.latMin - t2.latMax;
    assert('Separation Gap (Tile 2 to Tile 1 = 60° latitude gap)', latGap === 60,
      `Expected 60° gap, got ${latGap}°`);

    // 9. Outside Bounds Check
    const outsidePoint = geographicToPixelCoords(200.0, 10.0, t1, 7680, 7680);
    assert('Outside Coverage Detection returns null', outsidePoint === null,
      'Point (200°E, 10°N) should not be inside Tile 1');

  } catch (err) {
    results.push({
      name: 'Unexpected Test Runner Error',
      passed: false,
      message: err.message
    });
  }

  return results;
}
