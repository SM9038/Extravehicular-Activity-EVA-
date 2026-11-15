/**
 * NASA Mars Explorer - Scientific Environmental Sampling & Astronaut Survival Engine
 * Reference: NASA Planetary Data System, MGS MOLA Shaded Relief Color Inversion, MRO MRO120G, NASA xEMU EVA Standard
 * 
 * Shared Unified Engine between 2D Map and 3D Globe Explorer
 */

import { areocentricToCartesian, surfaceDistanceKm } from './coordinates.js';
import { calculateElevationPressure, evaluatePressureSafety, ATMOSPHERIC_MODEL_CONFIG } from './atmospheric_pressure.js';

// Planetary Constants
export const MARS_RADIUS_KM = 3396.19;        // IAU 2000 / MOLA MEGDR equatorial reference sphere radius (km)
export const MARS_MEAN_RADIUS_KM = 3389.5;    // IAU volumetric mean radius (km)
export const MARS_DATUM_RADIUS_M = 3396000.0; // MRO120G / GMM-3 spherical harmonic reference sphere radius (m)
export const WATER_TRIPLE_POINT_PA = 611.65;  // Water triple-point pressure (Pa)

const _tr = (en, vi) => (typeof window !== 'undefined' && window.evaTr ? window.evaTr(en, vi) : en);

// Scientific Layer Definitions & Metadata
export const SCIENTIFIC_LAYERS = {
  main: {
    id: "main",
    get name() { return _tr("Main", "Bản đồ Chính"); },
    get shortName() { return _tr("Main", "Chính"); },
    unit: "RGB",
    minVal: 0,
    maxVal: 255,
    get minFormatted() { return _tr("0 (Low Albedo)", "0 (Suất phản chiếu thấp)"); },
    get midFormatted() { return _tr("128 (Normal Albedo)", "128 (Suất phản chiếu trung bình)"); },
    get maxFormatted() { return _tr("255 (High Albedo / Frost)", "255 (Suất phản chiếu cao / Băng)"); },
    gradient: "linear-gradient(to right, var(--bg-canvas) 0%, var(--bg-elevated) 25%, var(--border-strong) 50%, var(--text-secondary) 75%, var(--text-primary) 100%)",
    texturePath: "data/tex_main.png",
    get description() { return _tr("NASA Viking Orbiter MDIM 2.1 Colorized Global Surface Mosaic (232m/px)", "Bản đồ khảm màu toàn cầu NASA Viking Orbiter MDIM 2.1 (232m/px)"); },
    citation: "USGS Astrogeology Science Center, NASA Viking MDIM 2.1 Global Mosaic",
    provenance: "MEASURED_PDS_MOSAIC",
    hasScale: false
  },
  elevation: {
    id: "elevation",
    get name() { return _tr("MOLA Elevation", "Độ Cao MOLA"); },
    get shortName() { return _tr("Elevation", "Độ Cao"); },
    unit: "m",
    minVal: -8201.0,
    maxVal: 21241.0,
    minFormatted: "-8,201 m",
    get midFormatted() { return _tr("0 m (Datum)", "0 m (Mốc chuẩn)"); },
    maxFormatted: "+21,241 m",
    gradient: "linear-gradient(to right, var(--bg-canvas) 0%, var(--bg-elevated) 25%, var(--border-strong) 50%, var(--text-secondary) 75%, var(--text-primary) 100%)",
    texturePath: "data/tex_elevation.png",
    get description() { return _tr("NASA MGS MOLA Precision DEM Dataset (463m Global Grayscale Reference)", "Bộ dữ liệu độ cao số DEM chính xác NASA MGS MOLA (Tham chiếu xám toàn cầu 463m)"); },
    citation: "Smith et al., NASA Mars Global Surveyor Laser Altimeter DEM Mosaic (463m/px)",
    provenance: "MEASURED_PDS_DEM",
    hasScale: true
  },
  pressure: {
    id: "pressure",
    get name() { return _tr("Atmospheric Pressure (Modeled)", "Áp Suất Khí Quyển (Mô hình)"); },
    get shortName() { return _tr("Pressure (Modeled)", "Áp Suất (Mô hình)"); },
    unit: "Pa",
    minVal: 86.4,
    maxVal: 1253.7,
    minFormatted: "86.4 Pa (0.86 mbar)",
    get midFormatted() { return _tr("610.0 Pa (Datum 0 m)", "610.0 Pa (Mốc chuẩn 0 m)"); },
    maxFormatted: "1,253.7 Pa (12.54 mbar)",
    gradient: "linear-gradient(to right, var(--bg-canvas) 0%, var(--bg-elevated) 25%, var(--border-strong) 50%, var(--text-secondary) 75%, var(--text-primary) 100%)",
    texturePath: "data/tex_pressure.png",
    get description() { return _tr("Mars isothermal barometric pressure model: P(h) = P0 * exp(-M*g*(h - h0)/(R*T)) derived from MOLA elevation", "Mô hình áp suất khí quyển đẳng nhiệt Sao Hỏa: P(h) = P0 * exp(-M*g*(h - h0)/(R*T)) suy ra từ độ cao MOLA"); },
    citation: "Smith et al. (2001) / NASA Mars Atmospheric Model (P0 = 610 Pa at h0 = 0 m)",
    provenance: "MODELED_ESTIMATE",
    hasScale: true,
    isModeled: true
  },
  gravity_120g: {
    id: "gravity_120g",
    get name() { return _tr("Free-Air Gravity Anomaly", "Dị Thường Trọng Lực Không Khí Tự Do"); },
    get shortName() { return _tr("Gravity (120G)", "Trọng Lực (120G)"); },
    unit: "mGal",
    minVal: -870.12,
    maxVal: 3470.15,
    minFormatted: "-870.1 mGal",
    get midFormatted() { return _tr("0 mGal (Equilibrium)", "0 mGal (Cân bằng)"); },
    maxFormatted: "+3,470.2 mGal",
    gradient: "linear-gradient(to right, var(--bg-canvas) 0%, var(--border-subtle) 18%, var(--border-strong) 36%, var(--text-muted) 50%, var(--text-secondary) 68%, var(--text-primary) 100%)",
    texturePath: "data/tex_gravity_120g.png",
    get description() { return _tr("MRO120G degree-120 spherical harmonic gravity model (Free-Air anomaly from MRO orbit)", "Mô hình trọng lực điều hòa cầu MRO120G bậc 120 (Dị thường Free-Air từ quỹ đạo MRO)"); },
    citation: "Genova et al., Icarus 2016, NASA PDS Geosciences Node",
    provenance: "SPHERICAL_HARMONIC_SYNTHESIS"
  },
  slope: {
    id: "slope",
    get name() { return _tr("Terrain Slope", "Độ Dốc Địa Hình"); },
    get shortName() { return _tr("Slope", "Độ Dốc"); },
    get unit() { return _tr("deg (°)", "độ (°)"); },
    minVal: 0.0,
    maxVal: 25.0,
    minFormatted: "0.0°",
    midFormatted: "12.5°",
    maxFormatted: "25.0°+",
    gradient: "linear-gradient(to right, var(--bg-canvas) 0%, var(--bg-elevated) 20%, var(--border-strong) 40%, var(--text-muted) 60%, var(--text-secondary) 80%, var(--text-primary) 100%)",
    texturePath: "data/tex_slope.png",
    get description() { return _tr("Planetary topographic slope derived from reconstructed MOLA elevation raster (spherical central differences)", "Độ dốc địa hình hành tinh suy ra từ ma trận độ cao MOLA tái tạo (sai phân trung tâm cầu)"); },
    citation: "NASA Mars Geodesy / Planetary GIS Standards (R = 3,396,000 m)",
    provenance: "DERIVED_TERRAIN"
  },
  surface_g: {
    id: "surface_g",
    get name() { return _tr("Surface Gravitational Acceleration", "Gia Tốc Trọng Trường Bề Mặt"); },
    get shortName() { return _tr("Surface Gravity (g)", "Trọng Trường Bề Mặt (g)"); },
    unit: "m/s²",
    minVal: 3.7049,
    maxVal: 3.7483,
    minFormatted: "3.7049 m/s²",
    midFormatted: "3.7266 m/s²",
    maxFormatted: "3.7483 m/s²",
    gradient: "linear-gradient(to right, var(--bg-canvas) 0%, var(--bg-elevated) 25%, var(--border-strong) 50%, var(--text-secondary) 75%, var(--text-primary) 100%)",
    texturePath: "data/tex_surface_g.png",
    get description() { return _tr("Total surface gravity acceleration g = g₀ + Δg on reference ellipsoid", "Gia tốc trọng trường bề mặt toàn phần g = g₀ + Δg trên ellipsoid quy chiếu"); },
    citation: "IAU/IAG Working Group on Cartographic Coordinates",
    provenance: "SPHERICAL_HARMONIC_SYNTHESIS"
  },
  geoid_n: {
    id: "geoid_n",
    get name() { return _tr("Geoid / Areoid Undulation", "Độ Cao Mặt Geoid / Areoid"); },
    get shortName() { return _tr("Areoid Geoid", "Mặt Geoid Areoid"); },
    unit: "m",
    minVal: -6661.69,
    maxVal: 4922.95,
    minFormatted: "-6,661.7 m",
    midFormatted: "0 m",
    maxFormatted: "+4,923.0 m",
    gradient: "linear-gradient(to right, var(--bg-canvas) 0%, var(--bg-elevated) 25%, var(--border-strong) 50%, var(--text-secondary) 75%, var(--text-primary) 100%)",
    texturePath: "data/tex_geoid_n.png",
    get description() { return _tr("Equipotential gravitational datum equivalent to Mars nominal sea level (Bruns spherical harmonic synthesis N = R_ref * sum(P_lm * (C_lm cos m*lambda + S_lm sin m*lambda)), l=2..120)", "Mặt đẳng thế trọng trường tương đương mực nước biển danh định Sao Hỏa (Tổng hợp điều hòa cầu Bruns N, l=2..120)"); },
    citation: "Genova et al. (2016) MRO120G / Lemoine et al. (2001) JGR Planets MGS Gravity Solution",
    provenance: "SPHERICAL_HARMONIC_SYNTHESIS"
  },
  gravity_delta: {
    id: "gravity_delta",
    get name() { return _tr("Differential Gravity (120G - 120F)", "Vi Sai Trọng Lực (120G - 120F)"); },
    get shortName() { return _tr("Delta Gravity (Δg)", "Vi Sai Trọng Lực (Δg)"); },
    unit: "mGal",
    minVal: -208.26,
    maxVal: 125.71,
    minFormatted: "-208.3 mGal",
    get midFormatted() { return _tr("0 mGal (Zero Delta)", "0 mGal (Không chênh lệch)"); },
    maxFormatted: "+125.7 mGal",
    gradient: "linear-gradient(to right, var(--text-secondary) 0%, var(--border-strong) 35%, var(--text-primary) 50%, var(--border-strong) 65%, var(--text-secondary) 100%)",
    texturePath: "data/tex_gravity_delta.png",
    get description() { return _tr("Differential residual gravity between MRO120G and MRO120F spherical harmonic solutions (l=2..120)", "Chênh lệch trọng lực dư giữa hai nghiệm điều hòa cầu MRO120G và MRO120F (l=2..120)"); },
    citation: "NASA Goddard Space Flight Center Planetary Geodesy (Genova et al., 2016; Konopliv et al., 2020)",
    provenance: "SPHERICAL_HARMONIC_SYNTHESIS"
  }
};

// Recognized Martian Geological Features Catalog
export const MARS_LANDMARKS = [
  {
    id: "mcs_track_89123",
    name: "MRO MCS Orbit 89123 Track",
    type: "NASA Climate Sounder Track (Orbit 89123)",
    lat: 32.67,
    lon: 264.34,
    desc: "Authoritative MRO MCS atmospheric sounding ground track (Orbit 89123). Measured surface pressure 391.6 Pa (3.92 mbar), dust column opacity 0.007."
  },
  {
    id: "mcs_track_89124",
    name: "MRO MCS Orbit 89124 Track",
    type: "NASA Climate Sounder Track (Orbit 89124)",
    lat: 44.15,
    lon: 353.90,
    desc: "Authoritative MRO MCS atmospheric sounding ground track (Orbit 89124). Measured surface pressure 604.9 Pa (6.05 mbar), lower atmospheric temperature 182.4 K."
  },
  {
    id: "mcs_track_89125",
    name: "MRO MCS Orbit 89125 Track",
    type: "NASA Climate Sounder Track (Orbit 89125)",
    lat: 64.34,
    lon: 237.72,
    desc: "Authoritative MRO MCS atmospheric sounding northern track (Orbit 89125). Measured surface pressure 563.4 Pa (5.63 mbar), water ice column 0.015."
  },
  {
    id: "olympus",
    name: "Olympus Mons",
    type: "Shield Volcano",
    lat: 18.65,
    lon: 226.2,
    desc: "Largest shield volcano in the Solar System (summit 21.3 km above datum, 600 km diameter). Summit pressure ~90 Pa, record positive gravity anomaly +3,121 mGal."
  },
  {
    id: "ascraeus",
    name: "Ascraeus Mons",
    type: "Tharsis Montes Volcano",
    lat: 11.9,
    lon: 255.5,
    desc: "Northernmost volcano of the Tharsis Montes chain, summit at 18.2 km, gravity anomaly +2,738 mGal."
  },
  {
    id: "pavonis",
    name: "Pavonis Mons",
    type: "Tharsis Montes Volcano (Equatorial)",
    lat: 0.8,
    lon: 247.0,
    desc: "Equatorial shield volcano standing at 14.1 km with a gravity anomaly reaching +1,963 mGal."
  },
  {
    id: "arsia",
    name: "Arsia Mons",
    type: "Tharsis Montes Volcano (Southern)",
    lat: -8.4,
    lon: 238.9,
    desc: "Southern Tharsis volcano with an expansive 110-km caldera and gravity anomaly exceeding +2,103 mGal."
  },
  {
    id: "valles",
    name: "Valles Marineris",
    type: "Canyon System (Grand Chasm)",
    lat: -13.9,
    lon: 300.8,
    desc: "Tectonic canyon system over 4,000 km long, up to 7 km deep, with steep cliffs (>25°) posing severe operational hazards."
  },
  {
    id: "hellas",
    name: "Hellas Planitia",
    type: "Impact Basin (Deep Basin)",
    lat: -42.4,
    lon: 70.5,
    desc: "Giant impact basin (floor at -7.3 km, highest surface pressure on Mars ~1,150 Pa, exceeding water triple point)."
  },
  {
    id: "argyre",
    name: "Argyre Planitia",
    type: "Impact Basin (Southern Hemisphere)",
    lat: -49.7,
    lon: 316.0,
    desc: "Major southern impact basin (800 km diameter, depth -5.2 km) with distinctive negative gravity anomaly ring."
  },
  {
    id: "isidis",
    name: "Isidis Planitia",
    type: "Mascon Basin (Mass Concentration)",
    lat: 12.9,
    lon: 87.0,
    desc: "Classic mascon structure: positive gravity anomaly (+705 mGal) within lowland plain and flat terrain."
  },
  {
    id: "utopia",
    name: "Utopia Planitia",
    type: "Impact Basin (Northern Hemisphere)",
    lat: 22.3,
    lon: 130.0,
    desc: "Vast northern plain and landing region of NASA Viking 2 and China's Zhurong rover."
  },
  {
    id: "elysium",
    name: "Elysium Mons",
    type: "Shield Volcano (Elysium Province)",
    lat: 25.0,
    lon: 147.2,
    desc: "Isolated 12.6-km volcanic construct rising above northern lowlands, creating +1,331 mGal gravity anomaly."
  },
  {
    id: "jezero",
    name: "Jezero Crater (Perseverance)",
    type: "Rover Landing Site",
    lat: 18.38,
    lon: 77.58,
    desc: "NASA Perseverance rover landing site along the Isidis margin; gentle slope, nominal EVA parameters."
  },
  {
    id: "gale",
    name: "Gale Crater (Curiosity)",
    type: "Rover Landing Site",
    lat: -5.4,
    lon: 137.8,
    desc: "NASA Curiosity rover landing site; lakebed floor is nominal, slopes steepen along Mount Sharp flanks."
  },
  {
    id: "gusev",
    name: "Gusev Crater (Spirit)",
    type: "Rover Landing Site",
    lat: -14.57,
    lon: 175.47,
    desc: "NASA Spirit rover landing region in a large impact crater near the Martian equator."
  },
  {
    id: "meridiani",
    name: "Meridiani Planum (Opportunity)",
    type: "Rover Landing Site",
    lat: -1.95,
    lon: 354.47,
    desc: "NASA Opportunity rover landing region on the hematite-bearing Meridiani Planum."
  },
  {
    id: "north_pole",
    name: "Planum Boreum (North Pole)",
    type: "Polar Ice Cap",
    lat: 87.5,
    lon: 0.0,
    desc: "North polar ice cap with extreme winter cryogenic temperatures (<130 K), risk of joint lubricant freezing and battery depletion."
  },
  {
    id: "south_pole",
    name: "Planum Australe (South Pole)",
    type: "Polar Ice Cap",
    lat: -87.5,
    lon: 0.0,
    desc: "Perennial south polar cap; cryogenic temperatures and extended darkness challenge life support systems."
  }
];

/**
 * Finds the nearest landmark to given coordinates within maxDistanceKm.
 */
export function findNearestLandmark(lat, lon, maxDistanceKm = 350) {
  let nearest = null;
  let minDist = Infinity;

  for (const lm of MARS_LANDMARKS) {
    const d = surfaceDistanceKm(lat, lon, lm.lat, lm.lon, MARS_RADIUS_KM);
    if (d < minDist && d <= maxDistanceKm) {
      minDist = d;
      nearest = { ...lm, distanceKm: Math.round(d) };
    }
  }

  return nearest;
}

// Cached 720x360 Float32 spherical harmonic grids (synthesized from NASA PDS jgmro_120g_sha.txt & jgmro_120f_sha.txt)
let cachedGeoidNGrid = null;
let cachedGravityDeltaGrid = null;
let cachedThermalInertiaGrid = null;
let sphericalGridsInitPromise = null;

// Embedded 72x36 (5°x5°) spherical-harmonic sub-grids derived from data/geoid_n.bin and data/gravity_delta.bin
// Used as a synchronous fallback when sampleScientificGrid() is called before asynchronous binary fetch completes.
const FALLBACK_GEOID_N_B64 = "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3wHsARkCZQLRAoADaASBBXkG6AYQB5QHGwhtCGgIIAjfB30H7QZkBtIFRAW2BCEErANBAwsD0wKoApsCngKaAqYC1wIPA0sDIwZlBqwG9AZEB4kHxAf7BzAIXQiECK0IuwjACNIIuQiGCH0IiQiCCGIIMAj7B9UHmAc1B9MG5QYTB/8GPga8BVIF+QSxBH8EaARwBJUE2ARgBRYGAgdBCEUKeAutCq0KGwtRCy8L9wq5CjgKnAkNCWoI0gdZB9IGVQboBZcFXAUxBREFEwUTBT4FcAWdBd8FSwiRCNkIKAl1CboJ9QkqCl0KigqyCtQK5ArpCuAKpgrFCugKqApuCksKGArpCcEJkAk9CfAI5gjnCKUIIgjEB1gHBwfHBqIGlgacBsEGHwenB08IKgl9ClwNeQ9pDR4NbA2QDY8Nnw0bDYQM5gtgC5gKAAqOCRAJjQgOCLwHfQc7ByQHMAdEB3AHlgfIBwYI/QlJCpMK4QorC3cLpQvWCwcMMAxdDHkMhgyTDIYMWgzHDAQNaQz7C+ILvQuZC2kLMAvlCpsKcQo5CuUJkAlBCdwIlghoCE4IRwhbCIYI+QhzCfoJvQraC0gNWQ6TDuoONg9aDx0QihAaD3YOxA0oDWAMvgtKC8YKQwrLCVkJBQm8CLoIzgjuCBgJRAl0CbQJIgtvC7sLCgxUDJkMyQz9DCUNUA13DZENpw3EDawNeA1+DbENPg0LDQYN6gzADIsMRQz+C7cLgAs1C9wKjgpCCvQJvAmUCXwJbgmKCcEJLAqmCi0L+gvPDMsN0Q59DzoQmBDWEJERWxF+EL4P/Q5aDokN6AxnDN8Lagv7CocKKQrYCcIJ4QkCCisKXwqUCtoKpwvyC0UMlgzkDCQNWQ2GDbIN3w0BDhgOMA5ADjgOIQ7wDdANvQ29DZ0Nbg1IDR8N1AyPDFQMIwzdC4cLKAvVCpUKeApDCiYKFQoyCm0K2ApnC+sLmwxfDTwOTQ8TEOYQhxFXEggSrBEmEWoQow/sDikOkQ32DHEM+wuMCx0LwwprCkAKWQp/CqwK6wohC2gLqgv2C0IMkAzpDCwNXQ2HDakN2w0BDg8OJw4vDiwOIA4gDgYO7Q3YDa0NcA03DRUN4AycDFMMFgzgC6ILUAv5CrIKjQptClcKTgpZCn0K1QpRC7QLaAwjDf0N7g7ZD9gQ5RFPEtERexEKEU0QhA/eDg8OTA3kDDoM7wuHCxALxApoCj4KSAqACrYK8AokC2ULHwtoC7MLAwxVDJEMxwzrDBcNPw1gDXENhA2PDYcNeg18DXINWQ1BDR4N6QyvDH4MVgwSDL8LbAsqC+wKrwp2CjUK/QkACvUJ4AnXCe0JIQqACusKfgtNDCUNBg4FD+EQgREPEfAQxxA+EFAPwA4GDhYNHgztC6sLYAvWCjoKBwqSCY8Jtwn1CSwKaAqXCtoKBQpSCp0K6gonC2YLmgvAC+sLDwwlDC0MNAxBDDwMQAxQDEgMNwwXDPgLyguUC2ILLgvwCqoKZQohCuMJmQlWCRgJ5wjPCL8IugjDCNEI9ghYCccJTQoBC8cLkQyQDTQPYQ8/D2sPVg/QDjcOqQ0BDUIMMgukClgK9Al7Cd0IugisCL0I0QjwCBoJSwl+Cb8JdQi9CAMJPwlzCaUJ0An1CRwKPQpRCl4KYwpuCnEKeAqGCo0KhgpfCkgKKwrqCbcJhAlHCQEJvwh8CD8I/ge5B3gHSwcyByoHMgc0BzwHYAezBxYIkggrCdEJfApACyYMmgzCDAIN6QyQDCcMlwsRC5MKAQqHCQYJbAjbB2IHVwdiB1IHVwdjB30HqwflBy0IaQamBuMGDQc4B2AHjAevB84H6Qf+Bw4IFAgZCCAINgg8CEAISQgzCCgIJAjfB5kHZwcwB+oGrQZmBh8G2QWbBW4FSgUyBR4FGgUkBT0FXwWeBe0FUQbOBlEH5Ad4CB0JpQnMCegJBwrECXMJCQmgCDQIxAdZB+wGcgbtBakFfwVeBUMFRQVXBXQFnQXdBSUG8QMlBFMEewSaBL4E3gQBBSAFOAVEBUEFQwVDBUwFaQV7BYYFmgWGBYMFZgU/BRUF5gS2BHQENQTsA6QDXwMnAwID4wLFArECrgLAAtsC/QIrA2ADqAMKBHME7ARuBesFZgaVBqkG7Qa4Bm8GHwbFBWcFDgWsBDwEwANcAyMD/gLdAscC1wLrAg0DPwN7A7gDFQFCAWkBjQG1AdcB7AEFAiICKgIOAgUCEgIsAjoCQAJXAn0CqwKiAoUCeAJaAjMCCwLhAagBbQEiAeAAowBxAEcAIwAIAPb/7v/8/xMANABVAHUAqgD4AFIBswElApEC6QIcAzcDfQNpAx0D3gKYAlQC7QGDASYBzwCEAE8AMwAaABUAHQAwAFkAhQC6AOsA+P0h/kf+av6T/rP+xf7Y/uH+xP60/sb+5P4C/xn/Gv8Y/yT/Pf8+/1T/UP80/xL/8P7O/p/+aP4r/ur9sP2F/V79Pv0f/QD98/zx/Pj8Ev0t/VD9f/25/QX+Uf6q/vz+Rf9v/3T/m/+2/5r/Z/8p/8v+d/40/vX9tf1v/UD9HP0K/RP9Hv05/V79gv2t/dL9wPrm+g37LvtU+2/7e/uK+477Zvtm+3X7ivur+8n71PvU+8r7zPvi+wD8//vx+9j7ufuf+4L7Wfsb+9L6nPp4+lz6QPok+gb67fnn+ez57fn9+Sf6Tvp6+q/66Poj+2L7kfus+7D7pvu0+7P7jPtc+y77BfvL+ov6WPoh+vv54fnd+eX5+fkQ+ir6VPp5+pv6e/ee98T34/cD+BT4KPg2+Db4F/gd+Cf4NPhL+GX4dvhz+Gb4dfia+Lb4u/iu+JT4efhd+D34IPjk97P3gvdb90D3LPcT9/P23fbT9s320Pbl9v72G/c491z3iPev99D36vf79wP4Afj199/30fe996T3hvdS9yD37vbS9s/20Pa29q/2w/bf9v72IPdD91z3UPRr9Ij0p/TE9N306/Tw9Pb08/T49Pr06fT29Bv1I/Ut9UL1YfV09Xv1dfVm9U71NPUV9fz03/TC9Kb0hvRk9ET0J/QE9OHzyPO8873zwfPI89bz5PPz8wz0L/RC9FT0YPRj9HD0fvR49GP0UPQr9Br0BvTn88jzp/OV86bzrvOV84LznPO689Xz9PMQ9DT0SPFg8XrxkvGr8b3xyPHX8eLx9PEM8iLyMfIb8iDyKvJA8lLyXfJj8lXyWfJR8kLyJ/IK8u/x2/HG8bbxofGD8WPxQPEg8QLx6vDc8Nzw2/DW8Njw2fDi8O7w/vAL8RbxG/Ec8STxLfEk8RXxBvHv8NbwxfC28KPwkfCC8HnwhfCR8KPwr/DE8OHwAfEa8TTxf+6S7qbuu+7O7t/u8u4D7xLvJ+857z/vSO9O71DvWu9p73Tvee9473Pvbe9o713vSO817xrvB+/77uzu1+667p7uhO5s7lbuQ+417ifuG+4R7gnuC+4Q7hruJO4p7i/uNO417jbuNe4u7iXuGO4H7vft6u3c7dHtxe2/7cDtyO3W7eHt+O0X7jXuRe5W7mvuCuwa7CjsNuxG7Ffsaux67Ivsluya7Jrsoeyq7LXsv+zO7NHs1+zZ7NTszOzB7LLsoeyS7ITsd+xq7FzsTew87CfsE+wC7PHr3evO673rsOuo66frquus67DrtOu067Lrseuw67Drruuq66Lrm+uV64zrgut763Lrbeto62Trb+uB64/ro+u568zr2+vq6/rr+OkI6hPqG+oj6i7qPupP6lrqYOpq6nbqg+qN6pTqmeqc6p7qoOqi6qDqmOqM6n7qdepq6mPqYOpZ6lDqReo26ibqFeoG6vjp6enc6dHpxum/6b7pu+m26bHpsemx6a7pqemm6aPpoemd6Zvpl+mM6YHpg+mB6X3pfOl96YDpiOmU6aHprum76cjp1eng6enpb+h56IHohOiG6I7oluie6KfosOi66MToyujQ6Nbo2+je6OHo5ejm6OTo3+ja6NXo0ejO6M/ozujJ6MLouuix6Knon+iS6Ifofuh16G7oZuhd6FboS+hC6D7oOug16DDoLOgp6CjoJugj6CHoIege6BjoFOgR6A3oCugM6A/oFOgb6CPoKugz6D7oSuhW6GPoa+d1533ng+eH54nni+eN54/nkeeU55nnoOel56rnruey57Xnt+e457nnuOe357bntee057Lnr+es56nnpueh55vnleeP54nng+d+53nnc+ds52XnYOdb51XnUOdM50nnRudD50HnQOc/5z3nO+c45zbnM+cx5zDnMecy5zLnNOc25zrnP+dD50nnT+dX52DnBecI5wrnDecP5xHnE+cV5xfnGOca5xvnHOcd5x7nH+cf5x/nHuce5x3nHecc5xznHOcb5xrnGOcW5xPnEecO5wvnCOcF5wPnAOf+5vzm+ub45vfm9eb05vLm8ebv5u3m7Obq5urm6ebp5urm6ubr5uzm7ebt5u3m7ebt5u3m7ubv5vHm9Ob25vnm/Ob/5gLn";
const FALLBACK_GDELTA_B64 = "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";

let decodedFallbackGeoid = null;
let decodedFallbackGDelta = null;

function _decodeInt16Base64(b64Str) {
  let bytes;
  if (typeof atob === 'function') {
    const binStr = atob(b64Str);
    bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
  } else if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(b64Str, 'base64');
    bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  } else {
    return null;
  }
  return new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
}

function _sampleFallbackSubgrid(grid, lat, lon, scale = 1.0) {
  if (!grid || grid.length !== 2592) return 0.0;
  const W = 72, H = 36;
  const u = (lon / 360.0) * W - 0.5;
  const v = ((90.0 - lat) / 180.0) * H - 0.5;
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = u - x0;
  const fy = v - y0;
  const c0 = ((x0 % W) + W) % W;
  const c1 = (((x0 + 1) % W) + W) % W;
  const r0 = Math.max(0, Math.min(H - 1, y0));
  const r1 = Math.max(0, Math.min(H - 1, y0 + 1));
  const val = (1 - fx) * (1 - fy) * grid[r0 * W + c0] +
              fx * (1 - fy) * grid[r0 * W + c1] +
              (1 - fx) * fy * grid[r1 * W + c0] +
              fx * fy * grid[r1 * W + c1];
  return val * scale;
}

/**
 * Asynchronously loads the full-resolution 720x360 Float32 spherical harmonic grids
 * (data/geoid_n.bin, data/gravity_delta.bin, data/thermal_inertia.bin).
 */
export async function initSphericalHarmonicGrids(basePath = 'data') {
  if (cachedGeoidNGrid && cachedGravityDeltaGrid) {
    return {
      geoidNGrid: cachedGeoidNGrid,
      gravityDeltaGrid: cachedGravityDeltaGrid,
      thermalInertiaGrid: cachedThermalInertiaGrid
    };
  }
  if (sphericalGridsInitPromise) return sphericalGridsInitPromise;
  if (typeof fetch !== 'function') return null;

  sphericalGridsInitPromise = (async () => {
    try {
      const [geoidRes, gdeltaRes, tiRes] = await Promise.all([
        fetch(`${basePath}/geoid_n.bin`).catch(() => null),
        fetch(`${basePath}/gravity_delta.bin`).catch(() => null),
        fetch(`${basePath}/thermal_inertia.bin`).catch(() => null)
      ]);
      if (geoidRes && geoidRes.ok) {
        const buf = await geoidRes.arrayBuffer();
        if (buf.byteLength === 720 * 360 * 4) {
          cachedGeoidNGrid = new Float32Array(buf);
          if (typeof window !== 'undefined') window.marsGeoidNGrid = cachedGeoidNGrid;
        }
      }
      if (gdeltaRes && gdeltaRes.ok) {
        const buf = await gdeltaRes.arrayBuffer();
        if (buf.byteLength === 720 * 360 * 4) {
          cachedGravityDeltaGrid = new Float32Array(buf);
          if (typeof window !== 'undefined') window.marsGravityDeltaGrid = cachedGravityDeltaGrid;
        }
      }
      if (tiRes && tiRes.ok) {
        const buf = await tiRes.arrayBuffer();
        if (buf.byteLength === 720 * 360 * 4) {
          cachedThermalInertiaGrid = new Float32Array(buf);
          if (typeof window !== 'undefined') window.marsThermalInertiaGrid = cachedThermalInertiaGrid;
        }
      }
    } catch (_) {}
    return {
      geoidNGrid: cachedGeoidNGrid,
      gravityDeltaGrid: cachedGravityDeltaGrid,
      thermalInertiaGrid: cachedThermalInertiaGrid
    };
  })();

  return sphericalGridsInitPromise;
}

if (typeof window !== 'undefined' && typeof fetch === 'function') {
  initSphericalHarmonicGrids('data');
}

function _bilerpFloat32Grid(grid, x0, y0, x1, y1, fx, fy) {
  const c0 = ((x0 % 720) + 720) % 720;
  const c1 = ((x1 % 720) + 720) % 720;
  const r0 = Math.max(0, Math.min(359, y0));
  const r1 = Math.max(0, Math.min(359, y1));
  const v00 = grid[r0 * 720 + c0];
  const v10 = grid[r0 * 720 + c1];
  const v01 = grid[r1 * 720 + c0];
  const v11 = grid[r1 * 720 + c1];
  return (1 - fx) * (1 - fy) * v00 +
         fx * (1 - fy) * v10 +
         (1 - fx) * fy * v01 +
         fx * fy * v11;
}

/**
 * Samples scientific environmental variables at (lat, lon) using the 16-bit packed data grid
 * and the synthesized spherical harmonic grids (geoid_n.bin, gravity_delta.bin).
 * Formula matches 3D Globe Bilinear Interpolation exactly.
 * 
 * @param {number} lat - Latitude in degrees (-90 to +90)
 * @param {number} lon - East Longitude in degrees (0 to 360)
 * @param {Uint8ClampedArray|Uint8Array} samplePixels - 720x360 RGBA array
 * @param {Object} meta - Metadata object with elevation and gravity_120g min/max and optional Float32Array grids
 * @returns {Object|null}
 */
export function sampleScientificGrid(lat, lon, samplePixels, meta = null) {
  if (!samplePixels) return null;

  const elevMin = (meta && meta.elevation) ? meta.elevation.min : -8201.0;
  const elevMax = (meta && meta.elevation) ? meta.elevation.max : 21241.0;
  const gravMin = (meta && meta.gravity_120g) ? meta.gravity_120g.min : -870.12;
  const gravMax = (meta && meta.gravity_120g) ? meta.gravity_120g.max : 3470.15;

  let normLon = ((lon % 360.0) + 360.0) % 360.0;
  const clampLat = Math.max(-89.99, Math.min(89.99, lat));

  const u = (normLon / 360.0) * 720.0 - 0.5;
  const v = ((90.0 - clampLat) / 180.0) * 360.0 - 0.5;

  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const fx = u - x0;
  const fy = v - y0;

  function getSample(col, row) {
    const c = ((col % 720) + 720) % 720;
    const r = Math.max(0, Math.min(359, row));
    const idx = (r * 720 + c) * 4;
    const rVal = samplePixels[idx];
    const gVal = samplePixels[idx + 1];
    const bVal = samplePixels[idx + 2];
    const aVal = samplePixels[idx + 3];

    const normE = ((rVal << 8) | gVal) / 65535.0;
    const normG = ((bVal << 8) | aVal) / 65535.0;

    const elev = elevMin + normE * (elevMax - elevMin);
    const dg = gravMin + normG * (gravMax - gravMin);
    return { elev, dg };
  }

  const s00 = getSample(x0, y0);
  const s10 = getSample(x1, y0);
  const s01 = getSample(x0, y1);
  const s11 = getSample(x1, y1);

  const elev = (1 - fx) * (1 - fy) * s00.elev +
                fx * (1 - fy) * s10.elev +
                (1 - fx) * fy * s01.elev +
                fx * fy * s11.elev;

  const dg = (1 - fx) * (1 - fy) * s00.dg +
             fx * (1 - fy) * s10.dg +
             (1 - fx) * fy * s01.dg +
             fx * fy * s11.dg;

  // Local slope via Horn / spherical central difference formula
  const sEast = getSample(x0 + 1, y0);
  const sWest = getSample(x0 - 1, y0);
  const sNorth = getSample(x0, y0 - 1);
  const sSouth = getSample(x0, y0 + 1);

  const dxMeters = (2.0 * Math.PI * MARS_DATUM_RADIUS_M * Math.cos((clampLat * Math.PI) / 180.0)) / 720.0;
  const dyMeters = (Math.PI * MARS_DATUM_RADIUS_M) / 360.0;
  const dh_dx = (sEast.elev - sWest.elev) / (2.0 * Math.max(100.0, dxMeters));
  const dh_dy = (sNorth.elev - sSouth.elev) / (2.0 * dyMeters);
  const slopeDeg = Math.atan(Math.hypot(dh_dx, dh_dy)) * (180.0 / Math.PI);

  const surfaceG = 3.713606 + dg * 1e-5;

  // Spherical harmonic Areoid geoid undulation N (m) and Differential Gravity MRO120G - MRO120F (mGal)
  const geoidGrid = (meta && meta.geoidNGrid instanceof Float32Array)
    ? meta.geoidNGrid
    : (cachedGeoidNGrid || (typeof window !== 'undefined' && window.marsGeoidNGrid instanceof Float32Array ? window.marsGeoidNGrid : null));
  const gdeltaGrid = (meta && meta.gravityDeltaGrid instanceof Float32Array)
    ? meta.gravityDeltaGrid
    : (cachedGravityDeltaGrid || (typeof window !== 'undefined' && window.marsGravityDeltaGrid instanceof Float32Array ? window.marsGravityDeltaGrid : null));

  let geoidN;
  let geoidSource;
  if (geoidGrid && geoidGrid.length === 259200) {
    geoidN = _bilerpFloat32Grid(geoidGrid, x0, y0, x1, y1, fx, fy);
    geoidSource = "MRO120G_SPHERICAL_HARMONIC_GRID_720x360";
  } else {
    if (!decodedFallbackGeoid) decodedFallbackGeoid = _decodeInt16Base64(FALLBACK_GEOID_N_B64);
    geoidN = _sampleFallbackSubgrid(decodedFallbackGeoid, clampLat, normLon, 1.0);
    geoidSource = "MRO120G_SPHERICAL_HARMONIC_SUBGRID_72x36";
  }

  let deltaGravity;
  if (gdeltaGrid && gdeltaGrid.length === 259200) {
    deltaGravity = _bilerpFloat32Grid(gdeltaGrid, x0, y0, x1, y1, fx, fy);
  } else {
    if (!decodedFallbackGDelta) decodedFallbackGDelta = _decodeInt16Base64(FALLBACK_GDELTA_B64);
    deltaGravity = _sampleFallbackSubgrid(decodedFallbackGDelta, clampLat, normLon, 0.01);
  }

  const radiusMeters = MARS_DATUM_RADIUS_M + geoidN + elev;

  return {
    elevation: elev,
    gravityAnomaly: dg,
    slope: slopeDeg,
    surfaceG: surfaceG,
    radiusKm: radiusMeters / 1000.0,
    geoidN: geoidN,
    deltaGravity: deltaGravity,
    geoidSource: geoidSource
  };
}

/**
 * NASA xEMU ASTRONAUT SUIT SURVIVAL EVALUATION ENGINE
 * 100% Identical formula to 3D Globe Explorer
 * 
 * @param {number} lat - Latitude in degrees
 * @param {number} lon - East Longitude in degrees
 * @param {Object} sampleData - Output from sampleScientificGrid
 * @returns {Object}
 */
/**
 * Exact piecewise scoring formula from Part 2.5:
 * Case 1: Inside perfect region -> S = 100
 * Case 2: 0 <= p < 0.85 -> S = 100 - (p / 0.85) * 15
 * Case 3: 0.85 <= p < 0.95 -> S = 80 - ((p - 0.85) / 0.10) * 30
 * Case 4: 0.95 <= p < 1.0 -> S = 50 - ((p - 0.95) / 0.05) * 50
 * Case 5: p >= 1.0 -> S = 0 (Mandatory immediate zero)
 */
export function calculatePiecewiseScore(p) {
  if (p === null || p === undefined || isNaN(p) || p < 0) return null;
  if (p === 0.0) return 100.0;
  if (p < 0.85) return 100.0 - (p / 0.85) * 15.0;
  if (p < 0.95) return 80.0 - ((p - 0.85) / 0.10) * 30.0;
  if (p < 1.0) return 50.0 - ((p - 0.95) / 0.05) * 50.0;
  return 0.0; // Mandatory: p >= 1.0 => S = 0
}

/**
 * Criterion status strictly derived from score S (Part 2.6):
 * S >= 80 -> SAFE (exact 80 is SAFE)
 * 50 <= S < 80 -> CAUTION (exact 50 is CAUTION)
 * 0 <= S < 50 -> UNSAFE (exact 0 is UNSAFE)
 * Invalid / unavailable -> UNKNOWN
 */
export function getCriterionStatus(score) {
  if (score === null || score === undefined || isNaN(score)) return "UNKNOWN";
  if (score >= 80.0) return "SAFE";
  if (score >= 50.0) return "CAUTION";
  return "UNSAFE";
}

/**
 * Proximity coefficient p calculation (Part 2.4):
 * p = |X - X_perfect| / |X_limit - X_perfect|
 */
export function calculateCriterionProximity(val, pMin, pMax, limitLower, limitUpper) {
  if (val === null || val === undefined || isNaN(val)) {
    return { p: null, score: null, status: "UNKNOWN", applicableLimit: null, perfectRef: [pMin, pMax], direction: "invalid" };
  }

  // Inside perfect region: S = 100, p = 0
  if (val >= pMin && val <= pMax) {
    return {
      p: 0.0,
      score: 100.0,
      status: "SAFE",
      applicableLimit: null,
      perfectRef: [pMin, pMax],
      direction: "inside"
    };
  }

  let p = null;
  let applicableLimit = null;
  let direction = "inside";

  if (val < pMin) {
    direction = "below";
    applicableLimit = limitLower;
    if (limitLower === null || limitLower === undefined || isNaN(limitLower)) {
      return { p: null, score: null, status: "UNKNOWN", applicableLimit: null, perfectRef: pMin, direction };
    }
    const denom = Math.abs(limitLower - pMin);
    if (denom <= 1e-9) {
      return { p: null, score: null, status: "UNKNOWN", applicableLimit: limitLower, perfectRef: pMin, direction };
    }
    p = Math.abs(val - pMin) / denom;
  } else {
    direction = "above";
    applicableLimit = limitUpper;
    if (limitUpper === null || limitUpper === undefined || isNaN(limitUpper)) {
      return { p: null, score: null, status: "UNKNOWN", applicableLimit: null, perfectRef: pMax, direction };
    }
    const denom = Math.abs(limitUpper - pMax);
    if (denom <= 1e-9) {
      return { p: null, score: null, status: "UNKNOWN", applicableLimit: limitUpper, perfectRef: pMax, direction };
    }
    p = Math.abs(val - pMax) / denom;
  }

  const score = calculatePiecewiseScore(p);
  const status = getCriterionStatus(score);

  return {
    p,
    score,
    status,
    applicableLimit,
    perfectRef: direction === "below" ? pMin : pMax,
    direction
  };
}

/**
 * Completely replaced astronaut safety scoring evaluation (Part 2):
 * - Atmospheric pressure removed completely from scoring criteria.
 * - Remaining criteria: Temperature, Slope, Dust, Radiation.
 * - Exact piecewise scoring and proximity coefficient formulas.
 * - S_total is internal only; S_overall calculated via Rules A, B, C.
 * - Strict severity hierarchy: UNSAFE > CAUTION > UNKNOWN > SAFE.
 */
export function evaluateAstronautSurvival(lat, lon, sampleData) {
  // Support both (lat, lon, sampleData) and single object ({ lat, lon, elevation, ... })
  if (typeof lat === 'object' && lat !== null && lon === undefined && sampleData === undefined) {
    sampleData = lat;
    lon = (lat.lon !== undefined) ? lat.lon : 0.0;
    lat = (lat.lat !== undefined) ? lat.lat : 0.0;
  }
  // 0. Insufficient Telemetry Check
  if (!sampleData || typeof sampleData.elevation !== 'number' || isNaN(sampleData.elevation)) {
    return {
      overall: "UNKNOWN",
      score: null,
      S_overall: null,
      S_total: null, // Internal intermediate value
      classificationLabel: "UNKNOWN",
      isModelBasedIndex: true,
      tempK: 210.0,
      tempC: -63.15,
      dust: 0.02,
      slope: 0.0,
      radiation: 0.70,
      evaHours: 0.0,
      tempStatus: "UNKNOWN",
      pressStatus: "UNKNOWN",
      slopeStatus: "UNKNOWN",
      dustStatus: "UNKNOWN",
      radiationStatus: "UNKNOWN",
      pressPa: 610.0,
      pressMbar: 6.10,
      criteria: {
        temperature: { name: _tr("Ambient Temperature", "Nhiệt độ môi trường"), currentValue: null, unit: "K", p: null, status: "UNKNOWN", safetyScore: null, explanation: _tr("Telemetry unavailable.", "Chưa có dữ liệu viễn thám.") },
        pressure: { name: _tr("Atmospheric Pressure", "Áp suất khí quyển"), currentValue: null, unit: "Pa", p: null, status: "UNKNOWN", safetyScore: null, explanation: _tr("Telemetry unavailable.", "Chưa có dữ liệu viễn thám.") },
        slope: { name: _tr("Terrain Slope & Mobility", "Độ dốc & Di chuyển"), currentValue: null, unit: "deg (°)", p: null, status: "UNKNOWN", safetyScore: null, explanation: _tr("Telemetry unavailable.", "Chưa có dữ liệu viễn thám.") },
        dust: { name: _tr("Airborne Dust (τ)", "Độ dày quang học bụi (τ)"), currentValue: null, unit: "optical depth", p: null, status: "UNKNOWN", safetyScore: null, explanation: _tr("Telemetry unavailable.", "Chưa có dữ liệu viễn thám.") },
        radiation: { name: _tr("Solar & GCR Radiation", "Bức xạ Mặt Trời & GCR"), currentValue: null, unit: "mSv/day", p: null, status: "UNKNOWN", safetyScore: null, explanation: _tr("Telemetry unavailable.", "Chưa có dữ liệu viễn thám.") },
        dataIntegrity: { name: _tr("Sensor Telemetry", "Dữ liệu cảm biến"), status: "UNKNOWN", explanation: _tr("Awaiting valid geographic coordinates and scientific raster telemetry.", "Đang chờ tọa độ địa lý và dữ liệu raster khoa học hợp lệ.") }
      },
      warnings: [_tr("Awaiting scientific raster telemetry to assess astronaut safety.", "Đang chờ dữ liệu viễn thám khoa học để đánh giá an toàn phi hành gia.")],
      sampleData: null
    };
  }

  const latAbs = Math.abs(lat);
  const elev = sampleData.elevation;
  const slope = Math.max(0.0, sampleData.slope || 0.0);

  // 1. Physical Environmental Parameter Calculations
  // Diurnal / Seasonal Ambient Temperature Model (MGS TES / MRO MCS)
  let estTempK = 230.0 - (latAbs / 90.0) * 85.0 - (Math.max(0, elev) / 1000.0) * 1.6;
  if (latAbs > 80.0) estTempK = 135.0; // Polar ice cap cryogenic chill

  // Dust Optical Depth: Regional baseline ~0.02, higher in low depressions
  let estDust = 0.02 + (elev < -3000 ? 0.03 : 0.0);

  // Physics-based Elevation-Derived Atmospheric Pressure Model: P(h) = P0 * exp(-M*g*(h-h0)/(R*T))
  const modeledPress = calculateElevationPressure(elev);
  let estPressPa = modeledPress.dataValid ? modeledPress.pressurePa : null;

  // Atmospheric Column density for Radiation Attenuation (MSL RAD model proxy)
  const radPressProxy = modeledPress.dataValid ? modeledPress.pressurePa : Math.max(80.0, Math.min(1250.0, 610.0 * Math.exp(-elev / 10693.7)));
  let estRadiation = 0.50 + 0.35 * (1.0 - Math.min(1.0, Math.max(0.0, (radPressProxy - 100.0) / 1150.0)));

  // Criterion 1: Ambient Temperature (xEMU TMG insulation envelope)
  const evalTemp = calculateCriterionProximity(estTempK, 180.0, 290.0, 130.0, 330.0);

  // Criterion 2: Atmospheric Pressure & SWME Sublimation (Modeled from MOLA Elevation)
  let evalPress = null;
  if (modeledPress.dataValid && modeledPress.pressurePa !== null) {
    evalPress = calculateCriterionProximity(modeledPress.pressurePa, 400.0, 611.65, 180.0, 1150.0);
    evalPress.isModeled = true;
    evalPress.source = "Barometric Model P(h)";
  } else {
    // Missing elevation: Honestly report UNKNOWN
    evalPress = {
      p: null,
      score: null,
      status: "UNKNOWN",
      applicableLimit: null,
      perfectRef: [400.0, 611.65],
      direction: "unavailable",
      isModeled: true,
      source: "Elevation Unavailable"
    };
  }

  // Criterion 3: Terrain Slope & Mobility Hazard
  // Perfect Range: [0.0, 8.0] deg (nominal walking gait, < 250 W metabolic load)
  // Applicable Limits: Upper = 20.0 deg (structural walking limit & fall hazard)
  const evalSlope = calculateCriterionProximity(slope, 0.0, 8.0, null, 20.0);

  // Criterion 4: Airborne Dust Optical Depth (τ)
  // Perfect Range: [0.0, 0.05] (clear Martian sky)
  // Applicable Limits: Upper = 0.30 (severe regional storm & filter clogging)
  const evalDust = calculateCriterionProximity(estDust, 0.0, 0.05, null, 0.30);

  // Criterion 5: Solar & GCR Radiation (ALARA Standard)
  // Perfect Range: [0.0, 0.72] mSv/day (nominal column shielding baseline)
  // Applicable Limits: Upper = 1.10 mSv/day (unattenuated high-altitude cosmic rays)
  const evalRad = calculateCriterionProximity(estRadiation, 0.0, 0.72, null, 1.10);

  const criteriaResults = [
    { id: "temperature", eval: evalTemp },
    { id: "pressure", eval: evalPress },
    { id: "slope", eval: evalSlope },
    { id: "dust", eval: evalDust },
    { id: "radiation", eval: evalRad }
  ];

  // 3. Status Counts
  const validScores = criteriaResults
    .map(c => c.eval.score)
    .filter(s => s !== null && s !== undefined && !isNaN(s));
  const statuses = criteriaResults.map(c => c.eval.status);

  const nUnsafe = statuses.filter(s => s === "UNSAFE").length;
  const nCaution = statuses.filter(s => s === "CAUTION").length;
  const nUnknown = statuses.filter(s => s === "UNKNOWN").length;
  const nSafe = statuses.filter(s => s === "SAFE").length;

  // 4. Categorical Overall Status (Part 2.9)
  let overallStatus = "SAFE";
  if (nUnsafe > 0) {
    overallStatus = "UNSAFE";
  } else if (nCaution > 0) {
    overallStatus = "CAUTION";
  } else if (nUnknown > 0) {
    overallStatus = "UNKNOWN";
  } else {
    overallStatus = "SAFE";
  }

  // 5. Internal Arithmetic Mean: S_total = sum(S_i) / n (Part 2.7)
  // S_total is an internal intermediate value and is NEVER displayed in the UI.
  let sTotal = null;
  if (validScores.length > 0) {
    sTotal = validScores.reduce((acc, v) => acc + v, 0.0) / validScores.length;
  }

  // 6. Displayed Overall Score: S_overall (Part 2.8)
  let sOverall = null;
  if (sTotal !== null) {
    if (nUnsafe > 0 || nCaution >= 2) {
      // Rule C: Multiple CAUTION criteria OR at least one UNSAFE criterion -> multiply by 0.5
      sOverall = sTotal * 0.5;
    } else if (nCaution === 1 && nUnsafe === 0) {
      // Rule B: Exactly one CAUTION, no UNSAFE criteria -> multiply by 0.8
      sOverall = sTotal * 0.8;
    } else if (nUnknown > 0 && nUnsafe === 0 && nCaution === 0) {
      // UNKNOWN only or UNKNOWN + SAFE -> incomplete assessment
      sOverall = null;
    } else {
      // Rule A: All criteria SAFE -> no penalty
      sOverall = sTotal;
    }
  }

  // Concise explanations & warnings
  const warnings = [];
  if (evalTemp.status === "UNSAFE") {
    warnings.push(_tr(
      `Critical thermal hazard (${estTempK.toFixed(1)} K): Ambient temperature exceeds spacesuit survival margins.`,
      `Nguy hiểm nhiệt độ nghiêm trọng (${estTempK.toFixed(1)} K): Nhiệt độ môi trường vượt ngưỡng sinh tồn của bộ đồ vũ trụ.`
    ));
  } else if (evalTemp.status === "CAUTION") {
    warnings.push(_tr(
      `Thermal caution (${estTempK.toFixed(1)} K): Elevated suit power heater draw or sublimator load.`,
      `Cảnh báo nhiệt độ (${estTempK.toFixed(1)} K): Tăng tải sưởi điện hoặc tải thăng hoa làm mát bộ đồ.`
    ));
  }

  if (evalPress.status === "UNSAFE") {
    warnings.push(_tr(
      `Critical pressure hazard (${estPressPa.toFixed(1)} Pa): Ambient pressure violates spacesuit envelope (sublimation failure or barotrauma).`,
      `Nguy hiểm áp suất nghiêm trọng (${estPressPa.toFixed(1)} Pa): Áp suất môi trường vi phạm dải hoạt động của bộ đồ (lỗi thăng hoa hoặc chấn thương áp suất).`
    ));
  } else if (evalPress.status === "CAUTION") {
    warnings.push(_tr(
      `Pressure advisory (${estPressPa.toFixed(1)} Pa): Ambient pressure outside nominal SWME direct-sublimation envelope; activate Mini-ME counterpressure.`,
      `Khuyến nghị áp suất (${estPressPa.toFixed(1)} Pa): Áp suất nằm ngoài dải thăng hoa trực tiếp SWME; kích hoạt van đối áp Mini-ME.`
    ));
  }

  if (evalSlope.status === "UNSAFE") {
    warnings.push(_tr(
      `Severe terrain slope hazard (${slope.toFixed(1)}°): Exceeds 20° walking limit; extreme fall and puncture risk.`,
      `Nguy hiểm độ dốc địa hình nghiêm trọng (${slope.toFixed(1)}°): Vượt giới hạn bộ hành 20°; nguy cơ trượt ngã và rách vỏ áp suất cực cao.`
    ));
  } else if (evalSlope.status === "CAUTION") {
    warnings.push(_tr(
      `Slope advisory (${slope.toFixed(1)}°): Elevated metabolic oxygen consumption rate, regolith slipping.`,
      `Cảnh báo độ dốc (${slope.toFixed(1)}°): Tăng tốc độ tiêu hao oxy trao đổi chất, dễ trượt lớp đất đá regolith.`
    ));
  }

  if (evalDust.status === "UNSAFE") {
    warnings.push(_tr(
      `Severe dust storm hazard (τ = ${estDust.toFixed(4)}): Silicate dust risks clogging RCA scrubbers.`,
      `Nguy hiểm bão bụi nghiêm trọng (τ = ${estDust.toFixed(4)}): Bụi silicate mịn có nguy cơ làm tắc bộ lọc RCA.`
    ));
  } else if (evalDust.status === "CAUTION") {
    warnings.push(_tr(
      `Suspended airborne dust advisory (τ = ${estDust.toFixed(4)}): Radiator thermal emissivity degradation.`,
      `Cảnh báo bụi lơ lửng (τ = ${estDust.toFixed(4)}): Suy giảm hệ số bức xạ nhiệt của màng tản nhiệt.`
    ));
  }

  if (evalRad.status === "UNSAFE") {
    warnings.push(_tr(
      `Critical radiation hazard (${estRadiation.toFixed(2)} mSv/day): Thin atmosphere fails to attenuate GCR particles.`,
      `Nguy hiểm bức xạ nghiêm trọng (${estRadiation.toFixed(2)} mSv/ngày): Khí quyển loãng không đủ suy giảm các hạt bức xạ vũ trụ GCR.`
    ));
  } else if (evalRad.status === "CAUTION") {
    warnings.push(_tr(
      `Radiation advisory (${estRadiation.toFixed(2)} mSv/day): Elevated GCR exposure requiring ALARA dosimeter tracking.`,
      `Cảnh báo bức xạ (${estRadiation.toFixed(2)} mSv/ngày): Phơi nhiễm GCR tăng cao, yêu cầu giám sát liều kế ALARA.`
    ));
  }

  if (nUnknown > 0) {
    warnings.push(_tr(
      "Incomplete telemetry: Some environmental parameters could not be sampled.",
      "Dữ liệu viễn thám chưa đầy đủ: Một số tham số môi trường không thể lấy mẫu."
    ));
  }
  if (warnings.length === 0) {
    warnings.push(_tr(
      "Nominal Martian surface environment: All parameters within safe reference envelopes.",
      "Môi trường bề mặt Sao Hỏa danh định: Tất cả các tham số đều nằm trong ngưỡng tham chiếu an toàn."
    ));
  }

  // Safe EVA operational window
  let evaHours = 8.0;
  if (nUnsafe > 0) {
    evaHours = 0.0;
  } else if (nCaution > 0) {
    evaHours = Math.max(1.5, 8.0 - nCaution * 2.2);
  }
  evaHours = Number(evaHours.toFixed(1));

  // Explanations for individual criteria
  function formatExplanation(name, valStr, status, p, pFormatted, refStr, limStr) {
    if (status === "SAFE") {
      return _tr(
        `${name} within nominal reference envelope (${refStr}). Proximity p = ${pFormatted}.`,
        `${name} nằm trong ngưỡng tham chiếu danh định (${refStr}). Hệ số tiệm cận p = ${pFormatted}.`
      );
    }
    if (status === "CAUTION") {
      return _tr(
        `${name} approaching safety limit (${limStr}). Proximity p = ${pFormatted} (Score: ${Math.round(calculatePiecewiseScore(p))}).`,
        `${name} tiệm cận giới hạn an toàn (${limStr}). Hệ số tiệm cận p = ${pFormatted} (Điểm: ${Math.round(calculatePiecewiseScore(p))}).`
      );
    }
    if (status === "UNSAFE") {
      return _tr(
        `${name} violates safety limit (${limStr})! Proximity p = ${pFormatted} >= 1.0 (Immediate score 0).`,
        `${name} vi phạm giới hạn an toàn (${limStr})! Hệ số tiệm cận p = ${pFormatted} >= 1.0 (Điểm về 0 tức thì).`
      );
    }
    return _tr("Environmental telemetry missing or invalid.", "Thiếu dữ liệu viễn thám môi trường hoặc không hợp lệ.");
  }

  const pTempStr = evalTemp.p !== null ? evalTemp.p.toFixed(3) : "N/A";
  const pPressStr = evalPress.p !== null ? evalPress.p.toFixed(3) : "N/A";
  const pSlopeStr = evalSlope.p !== null ? evalSlope.p.toFixed(3) : "N/A";
  const pDustStr = evalDust.p !== null ? evalDust.p.toFixed(3) : "N/A";
  const pRadStr = evalRad.p !== null ? evalRad.p.toFixed(3) : "N/A";

  const roundedOverall = sOverall !== null ? Math.round(sOverall) : null;

  return {
    overall: overallStatus,
    score: roundedOverall,           // Displayed overall score S_overall (integer for UI)
    S_overall: sOverall,             // Raw high-precision S_overall
    S_total: sTotal,                 // Internal intermediate S_total (DO NOT display in UI)
    classificationLabel: overallStatus,
    isModelBasedIndex: true,
    tempK: estTempK,
    tempC: estTempK - 273.15,
    pressPa: estPressPa,
    pressMbar: estPressPa / 100.0,
    dust: estDust,
    slope: slope,
    radiation: estRadiation,
    evaHours: evaHours,
    tempStatus: evalTemp.status,
    pressStatus: evalPress.status,
    slopeStatus: evalSlope.status,
    dustStatus: evalDust.status,
    radiationStatus: evalRad.status,
    criteria: {
      temperature: {
        name: _tr("Ambient Temperature", "Nhiệt độ môi trường"),
        currentValue: estTempK,
        unit: "K",
        valueFormatted: `${estTempK.toFixed(1)} K (${(estTempK - 273.15).toFixed(1)}°C)`,
        perfectRef: [180.0, 290.0],
        perfectRefFormatted: _tr("180.0–290.0 K (-93°C to +17°C)", "180.0–290.0 K (-93°C đến +17°C)"),
        applicableLimit: evalTemp.applicableLimit,
        applicableLimitFormatted: evalTemp.applicableLimit !== null ? `${evalTemp.applicableLimit.toFixed(1)} K (${evalTemp.direction === "below" ? _tr("Lower limit", "Giới hạn dưới") : _tr("Upper limit", "Giới hạn trên")})` : _tr("Nominal", "Danh định"),
        p: evalTemp.p,
        pFormatted: pTempStr,
        safetyScore: evalTemp.score !== null ? Math.round(evalTemp.score) : null,
        status: evalTemp.status,
        explanation: formatExplanation(_tr("Ambient Temperature", "Nhiệt độ môi trường"), `${estTempK.toFixed(1)} K`, evalTemp.status, evalTemp.p, pTempStr, "180–290 K", "130 K / 330 K")
      },
      pressure: {
        name: _tr("Atmospheric Pressure (Modeled)", "Áp suất khí quyển (Mô hình)"),
        currentValue: estPressPa,
        unit: "Pa",
        valueFormatted: (modeledPress && modeledPress.dataValid) ? `${estPressPa.toFixed(1)} Pa (${modeledPress.pressureMbar.toFixed(2)} mbar)` : _tr("PRESSURE UNKNOWN — ELEVATION DATA UNAVAILABLE", "CHƯA RÕ ÁP SUẤT — THIẾU DỮ LIỆU ĐỘ CAO"),
        source: _tr("Barometric Model P(h)", "Mô hình khí áp P(h)"),
        sourceFile: "Barometric Model P(h)",
        modelType: _tr("Mars Isothermal Barometric Model", "Mô hình khí áp đẳng nhiệt Sao Hỏa"),
        perfectRef: [400.0, 611.65],
        perfectRefFormatted: _tr("400.0–611.65 Pa (Nominal SWME)", "400.0–611.65 Pa (SWME danh định)"),
        applicableLimit: evalPress.applicableLimit,
        applicableLimitFormatted: evalPress.applicableLimit !== null ? `${evalPress.applicableLimit.toFixed(1)} Pa (${evalPress.direction === "below" ? _tr("Lower limit", "Giới hạn dưới") : _tr("Upper limit", "Giới hạn trên")})` : _tr("Nominal", "Danh định"),
        p: evalPress.p,
        pFormatted: pPressStr,
        safetyScore: evalPress.score !== null ? Math.round(evalPress.score) : null,
        status: evalPress.status,
        explanation: modeledPress.dataValid 
          ? formatExplanation(_tr("Atmospheric Pressure", "Áp suất khí quyển"), `${estPressPa.toFixed(1)} Pa`, evalPress.status, evalPress.p, pPressStr, "400.0–611.65 Pa", "180.0 Pa / 1150.0 Pa")
          : modeledPress.missingDataReason
      },
      slope: {
        name: _tr("Terrain Slope & Mobility", "Độ dốc & Di chuyển"),
        currentValue: slope,
        unit: _tr("deg (°)", "độ (°)"),
        valueFormatted: `${slope.toFixed(2)}°`,
        perfectRef: [0.0, 8.0],
        perfectRefFormatted: _tr("0.0°–8.0° (Nominal gait, <250 W)", "0.0°–8.0° (Bước đi danh định, <250 W)"),
        applicableLimit: 20.0,
        applicableLimitFormatted: _tr("20.0° (Upper walking limit)", "20.0° (Giới hạn bộ hành tối đa)"),
        p: evalSlope.p,
        pFormatted: pSlopeStr,
        safetyScore: evalSlope.score !== null ? Math.round(evalSlope.score) : null,
        status: evalSlope.status,
        explanation: formatExplanation(_tr("Terrain Slope", "Độ dốc địa hình"), `${slope.toFixed(2)}°`, evalSlope.status, evalSlope.p, pSlopeStr, "0–8°", "20°")
      },
      dust: {
        name: _tr("Airborne Dust (τ)", "Độ dày quang học bụi (τ)"),
        currentValue: estDust,
        unit: "tau",
        valueFormatted: `${estDust.toFixed(4)}`,
        perfectRef: [0.0, 0.05],
        perfectRefFormatted: _tr("0.00–0.05 (Clear Martian sky)", "0.00–0.05 (Trời quang đãng)"),
        applicableLimit: 0.30,
        applicableLimitFormatted: _tr("0.30 (Severe dust storm limit)", "0.30 (Giới hạn bão bụi nghiêm trọng)"),
        p: evalDust.p,
        pFormatted: pDustStr,
        safetyScore: evalDust.score !== null ? Math.round(evalDust.score) : null,
        status: evalDust.status,
        explanation: formatExplanation(_tr("Airborne Dust", "Mật độ bụi khí quyển"), `${estDust.toFixed(4)}`, evalDust.status, evalDust.p, pDustStr, "0.0–0.05", "0.30")
      },
      radiation: {
        name: _tr("Solar & GCR Radiation", "Bức xạ Mặt Trời & GCR"),
        currentValue: estRadiation,
        unit: _tr("mSv/day", "mSv/ngày"),
        valueFormatted: `${estRadiation.toFixed(3)} ${_tr("mSv/day", "mSv/ngày")}`,
        perfectRef: [0.0, 0.72],
        perfectRefFormatted: _tr("≤ 0.72 mSv/day (ALARA standard)", "≤ 0.72 mSv/ngày (Chuẩn ALARA)"),
        applicableLimit: 1.10,
        applicableLimitFormatted: _tr("1.10 mSv/day (Upper ceiling)", "1.10 mSv/ngày (Trần giới hạn)"),
        p: evalRad.p,
        pFormatted: pRadStr,
        safetyScore: evalRad.score !== null ? Math.round(evalRad.score) : null,
        status: evalRad.status,
        explanation: formatExplanation(_tr("Radiation Dose", "Liều bức xạ"), `${estRadiation.toFixed(3)} mSv/day`, evalRad.status, evalRad.p, pRadStr, "≤ 0.72 mSv/day", "1.10 mSv/day")
      }
    },
    warnings,
    sampleData
  };
}

export { calculateElevationPressure, evaluatePressureSafety };
