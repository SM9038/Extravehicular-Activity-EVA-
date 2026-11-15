/**
 * NASA Mars Explorer - High Performance Planetary 2D Map Engine
 * Reference: IAU 2011 Areocentric Equirectangular Coordinate Frame (Plate Carrée, 0°–360°E, -90° to +90°)
 * 
 * Performance Architecture:
 *   - Immediate cursor-anchored transform response (60 FPS zoom & pan without waiting for I/O)
 *   - Off-thread asynchronous image decoding via createImageBitmap()
 *   - Dynamic Screen-Space Error Level of Detail (LOD) selection
 *   - Unified Multi-Tier LRU Cache with GPU memory reclamation (bitmap.close())
 *   - In-flight request deduplication and AbortController cancellation for out-of-view tiles
 *   - Viewport frustum culling and O(1) spatial grid lookup
 *   - Progressive tile rendering (smooth visual continuity, zero flickering or blank tiles)
 *   - Interactive Minimap / Global Locator with real-time camera footprint
 */

import {
  parseMarsTileFilename,
  isPointInTile,
  geographicToPixelCoords,
  formatLatitude,
  formatLongitude
} from './tile_parser.js';
import {
  SCIENTIFIC_LAYERS,
  MARS_LANDMARKS,
  findNearestLandmark,
  sampleScientificGrid,
  initSphericalHarmonicGrids,
  evaluateAstronautSurvival
} from './survivability.js';
import {
  areocentricToCartesian,
  planetocentricToPlanetographic,
  surfaceDistanceKm
} from './coordinates.js';
import {
  calculateElevationPressure,
  evaluatePressureSafety,
  getAtmosphericModelConfig,
  setAtmosphericModelConfig
} from './atmospheric_pressure.js';
import { globalDustStormSimulator } from './dust_storm_simulator.js';

const _tr = (en, vi) => (typeof window !== 'undefined' && window.evaTr ? window.evaTr(en, vi) : en);
const getCssVar = (style, name, fallback) => (style ? style.getPropertyValue(name).trim() || fallback : fallback);
const MAP_UI_THEME = {
  canvas: '#1f1e24',
  panel: 'rgba(38, 37, 45, 0.88)',
  elevated: '#2f2d38',
  borderStrong: '#55525f',
  borderSubtleRgb: '61, 59, 71',
  textPrimary: '#e0def4',
  textPrimaryRgb: '224, 222, 244',
  textSecondary: '#9a96b0',
  textSecondaryRgb: '154, 150, 176',
  accent: '#e2b878',
  accentRgb: '226, 184, 120',
  telemetry: '#d68585',
  telemetryRgb: '214, 133, 133'
};
function refreshMapUiTheme() {
  if (typeof document === 'undefined') return MAP_UI_THEME;
  const s = getComputedStyle(document.documentElement);
  MAP_UI_THEME.canvas = getCssVar(s, '--bg-canvas', MAP_UI_THEME.canvas);
  MAP_UI_THEME.panel = getCssVar(s, '--bg-panel', MAP_UI_THEME.panel);
  MAP_UI_THEME.elevated = getCssVar(s, '--bg-elevated', MAP_UI_THEME.elevated);
  MAP_UI_THEME.borderStrong = getCssVar(s, '--border-strong', MAP_UI_THEME.borderStrong);
  MAP_UI_THEME.borderSubtleRgb = getCssVar(s, '--border-subtle-rgb', MAP_UI_THEME.borderSubtleRgb);
  MAP_UI_THEME.textPrimary = getCssVar(s, '--text-primary', MAP_UI_THEME.textPrimary);
  MAP_UI_THEME.textPrimaryRgb = getCssVar(s, '--text-primary-rgb', MAP_UI_THEME.textPrimaryRgb);
  MAP_UI_THEME.textSecondary = getCssVar(s, '--text-secondary', MAP_UI_THEME.textSecondary);
  MAP_UI_THEME.textSecondaryRgb = getCssVar(s, '--text-secondary-rgb', MAP_UI_THEME.textSecondaryRgb);
  MAP_UI_THEME.accent = getCssVar(s, '--accent-primary', MAP_UI_THEME.accent);
  MAP_UI_THEME.accentRgb = getCssVar(s, '--accent-rgb', MAP_UI_THEME.accentRgb);
  MAP_UI_THEME.telemetry = getCssVar(s, '--accent-telemetry', MAP_UI_THEME.telemetry);
  MAP_UI_THEME.telemetryRgb = getCssVar(s, '--accent-telemetry-rgb', MAP_UI_THEME.telemetryRgb);
  return MAP_UI_THEME;
}
refreshMapUiTheme();
const themeRgba = (rgb, alpha) => `rgba(${rgb}, ${alpha})`;
const telemetryRgba = alpha => themeRgba(MAP_UI_THEME.telemetryRgb, alpha);

export class Mars2DEquirectangularMap {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} options
   */
  constructor(canvas, options = {}) {
    // Layer A Canvas & Primary Context (Base Map, Tiles, Coordinate Grid, Outer Border)
    this.canvasA = canvas;
    this.canvas = canvas; // backward compatibility
    this.ctxA = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.ctx = this.ctxA; // backward compatibility

    // Layer B Canvas (Static Route & Mission Start/Dest Markers)
    this.canvasB = document.getElementById('marsRouteCanvas');
    if (!this.canvasB && canvas.parentElement) {
      this.canvasB = document.createElement('canvas');
      this.canvasB.id = 'marsRouteCanvas';
      this.canvasB.className = 'absolute inset-0 w-full h-full block pointer-events-none';
      canvas.parentElement.insertBefore(this.canvasB, canvas.nextSibling);
    }
    this.ctxB = this.canvasB ? this.canvasB.getContext('2d') : null;

    // Layer C Canvas (Dynamic Simulation: Storms, Walker, Trail)
    this.canvasC = document.getElementById('marsSimCanvas');
    if (!this.canvasC && canvas.parentElement) {
      this.canvasC = document.createElement('canvas');
      this.canvasC.id = 'marsSimCanvas';
      this.canvasC.className = 'absolute inset-0 w-full h-full block pointer-events-none';
      canvas.parentElement.insertBefore(this.canvasC, (this.canvasB || canvas).nextSibling);
    }
    this.ctxC = this.canvasC ? this.canvasC.getContext('2d') : null;

    // Layer D Canvas (Interaction & Locator: Minimap, Inspected Marker, Selection Mode)
    this.canvasD = document.getElementById('marsInteractionCanvas');
    if (!this.canvasD && canvas.parentElement) {
      this.canvasD = document.createElement('canvas');
      this.canvasD.id = 'marsInteractionCanvas';
      this.canvasD.className = 'absolute inset-0 w-full h-full block pointer-events-none';
      canvas.parentElement.insertBefore(this.canvasD, (this.canvasC || this.canvasB || canvas).nextSibling);
    }
    this.ctxD = this.canvasD ? this.canvasD.getContext('2d') : null;

    // Layer Dirty Flags
    this.isLayerADirty = true;
    this.isLayerBDirty = true;
    this.isLayerCDirty = true;
    this.isLayerDDirty = true;

    // Telemetry Instrumentation counters for verification
    this.layerARenderCount = 0;
    this.layerBRenderCount = 0;
    this.layerCRenderCount = 0;
    this.layerDRenderCount = 0;

    // Minimap Offscreen Background Cache
    this.minimapBgCanvas = document.createElement('canvas');
    this.minimapBgCanvas.width = 190;
    this.minimapBgCanvas.height = 95;
    this.minimapBgCtx = this.minimapBgCanvas.getContext('2d');
    this.isMinimapBgDirty = true;

    // Performance Configuration
    this.options = Object.assign({
      minZoom: 1.0,
      maxZoom: 250.0,
      zoomStep: 1.25,
      showGrid: true,
      showBoundaries: false,
      showFilenames: false,
      showPlaceNames: true,
      showNoDataOverlay: true,
      showMinimap: true,
      maxCachedBitmaps: 64,      // Max decoded ImageBitmaps in memory (~300 MB safe target)
      maxFullresBitmaps: 6,      // Max 7680x7680 full-res tiles
      maxConcurrentRequests: 6,  // Concurrency aligned with browser connection pool
      activeLayerId: 'elevation',// Default scientific layer
      onHover: null,
      onClick: null,
      onViewChange: null,
      onTileLoad: null,
      onLayerChange: null,
      onPointSelected: null
    }, options);

    // Generation tracking to prevent stale asynchronous tile race conditions
    this.renderGeneration = 0;

    // Field D* Pedestrian Navigation State
    this.routePath = null;
    this.routeSegments = null;
    this.routeVisible = true;
    this.routeHoverInspection = null;
    this.startPoint = null;
    this.destPoint = null;
    this.simulatedWalker = null;
    this.pointSelectionMode = null; // 'start' | 'dest' | null
    this.thermalInertiaGrid = null; // 720x360 Float32Array
    this.geoidNGrid = null;         // 720x360 Float32Array (MRO120G spherical harmonic Areoid undulation)
    this.gravityDeltaGrid = null;   // 720x360 Float32Array (MRO120G - MRO120F spherical harmonic residual)

    // Dataset Registry & Spatial Index
    this.manifest = null;
    this.tiles = [];                // Array of 72 TileMetadata
    this.mainTiles = [];            // Array of 72 Main Map Tiles
    this.mainOverviewCache = new Map(); // Cache for Main overview bitmaps
    this.spatialGrid = new Map();   // Key: "row_col" -> TileMetadata for O(1) lookup
    this.tileByName = new Map();    // Key: filename -> TileMetadata

    // Multi-Tier Memory-Aware Cache
    this.overviewCache = new Map(); // Key: filename -> ImageBitmap (Level 0, kept permanently)
    this.lruCache = new Map();      // Key: "${layerId}::${filename}::L${lod}" -> { bitmap, lastAccess, level, sizeBytes, layerId, filename }
    this.inFlightRequests = new Map(); // Key: "${layerId}::${filename}::L${lod}" -> AbortController
    this.activeRequestCount = 0;

    // Camera Transform & Matrix State
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.targetZoom = 1.0;
    this.targetPanX = 0;
    this.targetPanY = 0;

    // Viewport & Base Map Metrics
    this.viewportWidth = canvas.clientWidth || 1200;
    this.viewportHeight = canvas.clientHeight || 600;
    this.baseMapWidth = 1000;
    this.baseMapHeight = 500;

    // Minimap Inset Coordinates
    this.minimapWidth = 190;
    this.minimapHeight = 95;
    this.minimapX = 20;
    this.minimapY = 20;
    this.isDraggingMinimap = false;

    // Pointer & Interaction State
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.lastPanX = 0;
    this.lastPanY = 0;
    this.hasMovedDuringDrag = false;

    // Telemetry & Inspection
    this.inspectedPoint = null;
    this.hoverPoint = null;
    this.lastTelemetryUpdate = 0;

    // Render Loop & Performance Instrumentation
    this.animFrameId = null;
    this.isDirty = true;
    this.fpsCounter = { frames: 0, lastTime: performance.now(), currentFps: 60 };
    this.activeLODName = 'Level 0 (Overview)';

    // Scientific Environmental Layers & Unified Sampling State
    this.activeLayerId = this.options.activeLayerId || 'elevation';
    this.layerTextures = new Map();   // key: layerId -> HTMLImageElement
    this.samplePixels = null;         // 720x360 RGBA array for bilinear interpolation
    this.datasetsMeta = null;         // Datasets numerical bounds
    this.isScientificDataReady = false;

    // Procedural Deep Space Hatch Pattern
    this._createNoDataPattern();

    // Initialize Canvas & Event Listeners
    this._setupCanvas();
    this._attachEventHandlers();
    this._initScientificData();
    this.resetView();
    this._startRenderLoop();

    if (typeof window !== 'undefined' && window.onEvaLangChange) {
      window.onEvaLangChange(() => {
        this.isLayerADirty = true;
        this.isLayerBDirty = true;
        this.isLayerCDirty = true;
        this.isLayerDDirty = true;
        this.isDirty = true;
        this.requestRender();
      });
    }

    if (typeof window !== 'undefined' && window.onEvaThemeChange) {
      window.onEvaThemeChange(() => {
        refreshMapUiTheme();
        if (this.ctx) {
          this._createNoDataPattern();
        }
        this.isLayerADirty = true;
        this.isLayerBDirty = true;
        this.isLayerCDirty = true;
        this.isLayerDDirty = true;
        this.isDirty = true;
        this.requestRender();
      });
    }
  }

  /**
   * Generates procedural aerospace diagonal hatch pattern for No-Data space background.
   */
  _createNoDataPattern() {
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = 32;
    patternCanvas.height = 32;
    const pctx = patternCanvas.getContext('2d');

    pctx.fillStyle = MAP_UI_THEME.panel;
    pctx.fillRect(0, 0, 32, 32);

    pctx.strokeStyle = themeRgba(MAP_UI_THEME.borderSubtleRgb, 0.45);
    pctx.lineWidth = 1;
    pctx.beginPath();
    pctx.moveTo(0, 32);
    pctx.lineTo(32, 0);
    pctx.moveTo(-16, 16);
    pctx.lineTo(16, -16);
    pctx.moveTo(16, 48);
    pctx.lineTo(48, 16);
    pctx.stroke();

    pctx.fillStyle = themeRgba(MAP_UI_THEME.textSecondaryRgb, 0.08);
    pctx.fillRect(0, 0, 1, 1);
    pctx.fillRect(16, 16, 1, 1);

    this.noDataPattern = this.ctx.createPattern(patternCanvas, 'repeat');
  }

  /**
   * Synchronizes canvas dimensions and pixel ratio.
   */
  _setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvasA.getBoundingClientRect();
    this.viewportWidth = rect.width || window.innerWidth;
    this.viewportHeight = rect.height || window.innerHeight;

    const wPx = Math.round(this.viewportWidth * dpr);
    const hPx = Math.round(this.viewportHeight * dpr);

    const layers = [
      { c: this.canvasA, ctx: this.ctxA },
      { c: this.canvasB, ctx: this.ctxB },
      { c: this.canvasC, ctx: this.ctxC },
      { c: this.canvasD, ctx: this.ctxD }
    ];

    for (const item of layers) {
      if (item.c && item.ctx) {
        item.c.width = wPx;
        item.c.height = hPx;
        item.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }

    const margin = 40;
    const availW = Math.max(100, this.viewportWidth - margin * 2);
    const availH = Math.max(50, this.viewportHeight - margin * 2);

    if (availW / 2.0 <= availH) {
      this.baseMapWidth = availW;
      this.baseMapHeight = availW / 2.0;
    } else {
      this.baseMapHeight = availH;
      this.baseMapWidth = availH * 2.0;
    }

    this.minimapX = 20;
    this.minimapY = this.viewportHeight - this.minimapHeight - 20;

    this.isLayerADirty = true;
    this.isLayerBDirty = true;
    this.isLayerCDirty = true;
    this.isLayerDDirty = true;
    this.isMinimapBgDirty = true;
    this.isDirty = true;
  }

  /**
   * Resets map view to center Mars on screen.
   */
  resetView() {
    this._setupCanvas();
    this.zoom = 1.0;
    this.panX = (this.viewportWidth - this.baseMapWidth * this.zoom) / 2.0;
    this.panY = (this.viewportHeight - this.baseMapHeight * this.zoom) / 2.0;
    this.requestRender();

    if (this.options.onViewChange) {
      this.options.onViewChange({ zoom: this.zoom, panX: this.panX, panY: this.panY, fps: this.fpsCounter.currentFps });
    }
  }

  /**
   * Initializes scientific raster textures, numerical bounds, and the 16-bit packed data grid.
   */
  async _initScientificData() {
    try {
      // 1. Fetch Datasets Metadata
      try {
        const metaRes = await fetch('data/datasets_meta.json');
        if (metaRes.ok) {
          this.datasetsMeta = await metaRes.json();
        }
      } catch (e) {
        // Fallback default numerical ranges
        this.datasetsMeta = {
          elevation: { min: -9000.0, max: 21575.0, unit: "m" },
          gravity_120g: { min: -870.12, max: 3470.15, unit: "mGal" },
          slope: { min: 0.0, max: 25.0, unit: "deg" },
          surface_g: { min: 3.7049, max: 3.7483, unit: "m/s^2" },
          geoid_n: { min: -6661.69, max: 4922.95, unit: "m" },
          gravity_delta: { min: -208.26, max: 125.71, unit: "mGal" },
          main: { min: 0, max: 255, unit: "RGB" }
        };

      }


      // 1b. Load synthesized 720x360 Float32 spherical harmonic & thermal inertia grids
      initSphericalHarmonicGrids('data').then((grids) => {
        if (grids) {
          if (grids.geoidNGrid) this.geoidNGrid = grids.geoidNGrid;
          if (grids.gravityDeltaGrid) this.gravityDeltaGrid = grids.gravityDeltaGrid;
          if (grids.thermalInertiaGrid) this.thermalInertiaGrid = grids.thermalInertiaGrid;
          if (this.inspectedPoint) {
            this.inspectPointAtGeo(this.inspectedPoint.lon, this.inspectedPoint.lat);
          }
        }
      }).catch(() => {});

      // 2. Preload 16-bit Packed Scientific Grid (tex_packed_data.png)
      const packedImg = new Image();
      packedImg.crossOrigin = 'anonymous';
      packedImg.onload = () => {
        const pCanvas = document.createElement('canvas');
        pCanvas.width = 720;
        pCanvas.height = 360;
        const pctx = pCanvas.getContext('2d', { willReadFrequently: true });
        pctx.drawImage(packedImg, 0, 0, 720, 360);
        this.samplePixels = pctx.getImageData(0, 0, 720, 360).data;
        this.isScientificDataReady = true;
        this.isDirty = true;
        if (this.inspectedPoint) {
          this.inspectPointAtGeo(this.inspectedPoint.lon, this.inspectedPoint.lat);
        }
      };

      packedImg.onerror = async () => {
        try {
          const bundleRes = await fetch('data/textures_bundle.json');
          if (bundleRes.ok) {
            const bundle = await bundleRes.json();
            if (bundle && bundle.tex_packed_data) {
              packedImg.src = 'data:image/png;base64,' + bundle.tex_packed_data;
            }
          }
        } catch (_) {}
      };
      packedImg.src = 'data/tex_packed_data.png';

      // 3. Preload Scientific Layer Overlays
      const layerKeys = Object.keys(SCIENTIFIC_LAYERS);
      for (const k of layerKeys) {
        const layerInfo = SCIENTIFIC_LAYERS[k];
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          this.layerTextures.set(k, img);
          if (this.activeLayerId === k || k === 'elevation' || k === 'main') {
            this.isMinimapBgDirty = true;
            this.isLayerDDirty = true;
            this.isDirty = true;
          }
        };
        img.onerror = async () => {
          try {
            const bundleRes = await fetch('data/textures_bundle.json');
            if (bundleRes.ok) {
              const bundle = await bundleRes.json();
              const bKey = `tex_${k}`;
              if (bundle && bundle[bKey]) {
                img.src = 'data:image/png;base64,' + bundle[bKey];
              }
            }
          } catch (_) {}
        };
        img.src = layerInfo.texturePath;
      }
    } catch (err) {
      console.warn('Scientific data initialization notice:', err);
    }
  }

  /**
   * Switches the active scientific visualization layer.
   * @param {string} layerId - 'elevation' | 'gravity_120g' | 'slope' | 'surface_g' | 'geoid_n' | 'gravity_delta'
   */
  setLayer(layerId) {
    if (!SCIENTIFIC_LAYERS[layerId]) {
      console.warn(`Layer ${layerId} not defined in SCIENTIFIC_LAYERS`);
      return;
    }
    if (this.activeLayerId === layerId) return;

    // Invalidate in-flight asynchronous decodes by incrementing generation
    this.renderGeneration++;

    // Immediately cancel and clear in-flight requests for previous layer
    for (const [key, controller] of this.inFlightRequests.entries()) {
      try {
        controller.abort();
      } catch (_) {}
    }
    this.inFlightRequests.clear();
    this.activeRequestCount = 0;

    this.activeLayerId = layerId;
    this.isMinimapBgDirty = true;
    this.isLayerADirty = true;
    this.isLayerDDirty = true;
    this.isDirty = true;

    if (this.inspectedPoint) {
      this.inspectPointAtGeo(this.inspectedPoint.lon, this.inspectedPoint.lat);
    }

    if (this.options.onLayerChange) {
      this.options.onLayerChange(layerId, SCIENTIFIC_LAYERS[layerId]);
    }
  }

  /**
   * Loads the dataset manifest containing all 72 tile entries and starts preloading overview tiles.
   * @param {Object|string} manifestOrUrl 
   */
  async loadManifest(manifestOrUrl) {
    let data = manifestOrUrl;
    if (typeof manifestOrUrl === 'string') {
      const res = await fetch(manifestOrUrl);
      if (!res.ok) throw new Error(`Failed to load manifest from ${manifestOrUrl}`);
      data = await res.json();
    }

    this.manifest = data;
    this.tiles = [];
    this.spatialGrid.clear();
    this.tileByName.clear();

    if (data.tiles && Array.isArray(data.tiles)) {
      for (const t of data.tiles) {
        const entry = {
          id: t.filename,
          filename: t.filename,
          path: t.path,
          latMin: t.lat_min,
          latMax: t.lat_max,
          lonMin: t.lon_min,
          lonMax: t.lon_max,
          uMin: t.u_min,
          uMax: t.u_max,
          vMin: t.v_min,
          vMax: t.v_max,
          rowIdx: t.row_idx,
          colIdx: t.col_idx,
          width: t.width || 7680,
          height: t.height || 7680,
          fileSizeBytes: t.file_size_bytes,
          mode: t.mode || 'RGB',
          sphericalAreaKm2: t.spherical_area_km2,
          overviewUrl: t.overview_url || `data/processed/overview/${t.filename.replace(/\.png$/i, '.jpg')}`,
          level0Url: t.level_0_url || `data/processed/pyramids/level_0/${t.filename.replace(/\.png$/i, '.jpg')}`,
          level1Url: t.level_1_url || `data/processed/pyramids/level_1/${t.filename.replace(/\.png$/i, '.jpg')}`,
          level2Url: t.level_2_url || `data/processed/pyramids/level_2/${t.filename.replace(/\.png$/i, '.jpg')}`,
          level3Url: t.level_3_url || `data/processed/pyramids/level_3/${t.filename.replace(/\.png$/i, '.jpg')}`,
          fullresUrl: t.level_3_url || t.fullres_url || `data/processed/pyramids/level_3/${t.filename.replace(/\.png$/i, '.jpg')}`,
          meta: {
            filename: t.filename,
            latMin: t.lat_min,
            latMax: t.lat_max,
            lonMin: t.lon_min,
            lonMax: t.lon_max,
            uMin: t.u_min,
            uMax: t.u_max,
            vMin: t.v_min,
            vMax: t.v_max,
            latRangeFormatted: `${formatLatitude(t.lat_min)} to ${formatLatitude(t.lat_max)}`,
            lonRangeFormatted: `${formatLongitude(t.lon_min)} to ${formatLongitude(t.lon_max)}`
          }
        };

        this.tiles.push(entry);
        this.tileByName.set(entry.filename, entry);
        this.spatialGrid.set(`${entry.rowIdx}_${entry.colIdx}`, entry);
      }
    }

    // Load Main Map Manifest asynchronously
    try {
      const mainRes = await fetch('data/main_manifest.json');
      if (mainRes.ok) {
        const mainData = await mainRes.json();
        if (mainData && Array.isArray(mainData.tiles)) {
          this.mainTiles = mainData.tiles.map(t => ({
            id: t.filename,
            filename: t.filename,
            latMin: t.lat_min,
            latMax: t.lat_max,
            lonMin: t.lon_min,
            lonMax: t.lon_max,
            uMin: t.u_min,
            uMax: t.u_max,
            vMin: t.v_min,
            vMax: t.v_max,
            rowIdx: t.row_idx,
            colIdx: t.col_idx,
            r: t.r,
            c: t.c,
            width: t.width || 7680,
            height: t.height || 7680,
            overviewUrl: t.overview_url || `data/processed/main_pyramids/level_0/${t.filename}`,
            level0Url: t.level_0_url || `data/processed/main_pyramids/level_0/${t.filename}`,
            level1Url: t.level_1_url || `data/processed/main_pyramids/level_1/${t.filename}`,
            level2Url: t.level_2_url || `data/processed/main_pyramids/level_2/${t.filename}`,
            fullresUrl: t.fullres_url || `/main-tiles/${t.filename}`
          }));
          this._preloadMainOverviewTiles();
        }
      }
    } catch (e) {
      console.warn('Notice: main_manifest.json load deferred:', e);
    }

    // Preload Overview Level 0 tiles asynchronously in background
    this._preloadOverviewTiles();
    this.isDirty = true;
    return this.manifest;
  }

  /**
   * Preloads all 72 Level 0 overview tiles using createImageBitmap for background decoding.
   */
  /**
   * Preloads all 72 Main Map Level 0 overview tiles asynchronously in background.
   */
  async _preloadMainOverviewTiles() {
    for (const tile of this.mainTiles) {
      if (this.mainOverviewCache.has(tile.filename)) continue;
      this._fetchAndDecodeBitmap(tile.overviewUrl).then((bitmap) => {
        if (bitmap) {
          this.mainOverviewCache.set(tile.filename, bitmap);
          this.isMinimapBgDirty = true;
          this.isLayerDDirty = true;
          this.isDirty = true;
        }
      }).catch(() => {});
    }
  }

  /**
   * Asynchronously requests Main map tile at a specific pyramid LOD (1: 1024px, 2: 2048px, 3: 7680px).
   */
  _requestMainTileLOD(tile, targetLevel) {
    const key = `main::${tile.filename}::L${targetLevel}`;
    if (this.lruCache.has(key) || this.inFlightRequests.has(key)) return;
    if (this.activeRequestCount >= this.options.maxConcurrentRequests) return;

    let url = tile.overviewUrl;
    if (targetLevel === 1) url = tile.level1Url;
    else if (targetLevel === 2) url = tile.level2Url;
    else if (targetLevel === 3) url = tile.level3Url || tile.fullresUrl;

    const currentGeneration = this.renderGeneration;
    const controller = new AbortController();
    this.inFlightRequests.set(key, controller);
    this.activeRequestCount++;

    this._fetchAndDecodeBitmap(url, controller.signal).then((bitmap) => {
      this.inFlightRequests.delete(key);
      this.activeRequestCount = Math.max(0, this.activeRequestCount - 1);

      if (this.renderGeneration !== currentGeneration || this.activeLayerId !== 'main') {
        if (bitmap) { try { bitmap.close(); } catch (_) {} }
        return;
      }

      if (bitmap) {
        this._evictLRUIfNeeded(targetLevel);
        this.lruCache.set(key, {
          bitmap,
          lastAccess: performance.now(),
          level: targetLevel,
          sizeBytes: bitmap.width * bitmap.height * 4,
          layerId: 'main',
          filename: tile.filename
        });
        this.isLayerADirty = true;
        if (targetLevel === 0) {
          this.isMinimapBgDirty = true;
          this.isLayerDDirty = true;
        }
        this.isDirty = true;
      }
    }).catch(() => {
      this.inFlightRequests.delete(key);
      this.activeRequestCount = Math.max(0, this.activeRequestCount - 1);
    });
  }

  /**
   * Releases higher-resolution decoded bitmaps when user zooms out.
   */
  _evictHigherLODs(layerId, currentTargetLOD) {
    for (const [key, item] of this.lruCache.entries()) {
      if (item.layerId === layerId && item.level > currentTargetLOD) {
        try {
          if (item.bitmap && typeof item.bitmap.close === 'function') {
            item.bitmap.close();
          }
        } catch (_) {}
        this.lruCache.delete(key);
      }
    }
  }

  async _preloadOverviewTiles() {
    for (const tile of this.tiles) {
      if (this.overviewCache.has(tile.filename)) continue;
      this._fetchAndDecodeBitmap(tile.overviewUrl).then((bitmap) => {
        if (bitmap) {
          this.overviewCache.set(tile.filename, bitmap);
          this.isMinimapBgDirty = true;
          this.isLayerDDirty = true;
          this.isDirty = true;
        }
      }).catch(() => {});
    }
  }

  /**
   * Asynchronously fetches and decodes an image blob into an ImageBitmap off the main thread.
   */
  async _fetchAndDecodeBitmap(url, abortSignal = null) {
    try {
      const resp = await fetch(url, { signal: abortSignal });
      if (!resp.ok) return null;
      const blob = await resp.blob();
      const bitmap = await createImageBitmap(blob);
      return bitmap;
    } catch (e) {
      if (e.name === 'AbortError') return null; // Expected when request cancelled
      return null;
    }
  }

  /**
   * Registers a tile image manually (e.g., from local file picker or drag-drop).
   */
  addTile(filename, imageElement) {
    const meta = parseMarsTileFilename(filename);
    const width = imageElement.naturalWidth || imageElement.width || 7680;
    const height = imageElement.naturalHeight || imageElement.height || 7680;

    let entry = this.tileByName.get(meta.filename);
    if (!entry) {
      entry = {
        id: meta.filename,
        filename: meta.filename,
        latMin: meta.latMin,
        latMax: meta.latMax,
        lonMin: meta.lonMin,
        lonMax: meta.lonMax,
        uMin: meta.uMin,
        uMax: meta.uMax,
        vMin: meta.vMin,
        vMax: meta.vMax,
        rowIdx: Math.floor((60 - meta.latMin) / 30),
        colIdx: Math.floor(meta.lonMin / 30),
        width,
        height,
        meta
      };
      this.tiles.push(entry);
      this.tileByName.set(meta.filename, entry);
      this.spatialGrid.set(`${entry.rowIdx}_${entry.colIdx}`, entry);
    }

    createImageBitmap(imageElement).then((bitmap) => {
      this.lruCache.set(`${this.activeLayerId}::${meta.filename}::L3`, {
        bitmap,
        lastAccess: performance.now(),
        level: 3,
        sizeBytes: width * height * 4,
        layerId: this.activeLayerId,
        filename: meta.filename
      });
      this.isDirty = true;
    }).catch(() => {});

    return entry;
  }

  /**
   * Immediate cursor-anchored zoom with zero main-thread hitching.
   */
  zoomAtPoint(deltaZoomFactor, screenX = null, screenY = null) {
    if (screenX === null || isNaN(screenX)) screenX = this.viewportWidth / 2.0;
    if (screenY === null || isNaN(screenY)) screenY = this.viewportHeight / 2.0;

    const prevZoom = this.zoom;
    const nextZoom = Math.max(this.options.minZoom, Math.min(this.options.maxZoom, this.zoom * deltaZoomFactor));

    if (Math.abs(nextZoom - prevZoom) < 0.0001) return;

    // Mathematical Anchor: (screen - pan) / prevZoom == (screen - newPan) / newZoom
    const worldX = (screenX - this.panX) / (this.baseMapWidth * prevZoom);
    const worldY = (screenY - this.panY) / (this.baseMapHeight * prevZoom);

    this.zoom = nextZoom;
    this.panX = screenX - worldX * (this.baseMapWidth * this.zoom);
    this.panY = screenY - worldY * (this.baseMapHeight * this.zoom);

    this.requestRender();

    if (this.options.onViewChange) {
      this.options.onViewChange({
        zoom: this.zoom,
        panX: this.panX,
        panY: this.panY,
        fps: this.fpsCounter.currentFps,
        lod: this.activeLODName
      });
    }
  }

  /**
   * Smoothly pans and zooms camera to target coordinates.
   */
  flyTo(lon, lat, targetZoom = null) {
    const startZoom = this.zoom;
    const endZoom = targetZoom !== null 
      ? Math.max(this.options.minZoom, Math.min(this.options.maxZoom, targetZoom)) 
      : Math.max(this.zoom, 2.5);

    const normLon = ((lon % 360) + 360) % 360;
    const clampLat = Math.max(-90, Math.min(90, lat));

    const u = normLon / 360.0;
    const v = (90.0 - clampLat) / 180.0;

    const startPanX = this.panX;
    const startPanY = this.panY;
    const endPanX = this.viewportWidth / 2.0 - u * (this.baseMapWidth * endZoom);
    const endPanY = this.viewportHeight / 2.0 - v * (this.baseMapHeight * endZoom);

    const startTime = performance.now();
    const duration = 500; // ms

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1.0, elapsed / duration);
      const ease = 1.0 - Math.pow(1.0 - progress, 3);

      this.zoom = startZoom + (endZoom - startZoom) * ease;
      this.panX = startPanX + (endPanX - startPanX) * ease;
      this.panY = startPanY + (endPanY - startPanY) * ease;
      this.requestRender();

      if (progress < 1.0) {
        requestAnimationFrame(animate);
      } else {
        this.inspectPointAtGeo(normLon, clampLat);
        if (this.options.onViewChange) {
          this.options.onViewChange({ zoom: this.zoom, panX: this.panX, panY: this.panY, fps: this.fpsCounter.currentFps });
        }
      }
    };

    requestAnimationFrame(animate);
  }

  /**
   * Converts screen (X, Y) to normalized UV and (lon, lat).
   */
  screenToGeo(screenX, screenY) {
    const mapW = this.baseMapWidth * this.zoom;
    const mapH = this.baseMapHeight * this.zoom;

    const u = (screenX - this.panX) / mapW;
    const v = (screenY - this.panY) / mapH;

    const lon = u * 360.0;
    const lat = 90.0 - v * 180.0;

    return { u, v, lon, lat, isInsidePlanetaryMap: u >= 0 && u <= 1 && v >= 0 && v <= 1 };
  }

  /**
   * Converts geographic (lon, lat) to screen (X, Y).
   */
  geoToScreen(lon, lat) {
    let normLon = ((lon % 360) + 360) % 360;
    if (lon === 360) normLon = 360;

    const u = normLon / 360.0;
    const v = (90.0 - lat) / 180.0;

    const mapW = this.baseMapWidth * this.zoom;
    const mapH = this.baseMapHeight * this.zoom;

    return {
      x: this.panX + u * mapW,
      y: this.panY + v * mapH
    };
  }

  _buildSampleMeta() {
    if (!this.datasetsMeta) {
      return {
        thermalInertiaGrid: this.thermalInertiaGrid,
        geoidNGrid: this.geoidNGrid,
        gravityDeltaGrid: this.gravityDeltaGrid
      };
    }
    return {
      ...this.datasetsMeta,
      thermalInertiaGrid: this.thermalInertiaGrid,
      geoidNGrid: this.geoidNGrid,
      gravityDeltaGrid: this.gravityDeltaGrid
    };
  }

  /**
   * O(1) Constant-time spatial coordinate inspection.
   */
  sampleAtCoordinates(lat, lon) {
    const clampLat = Math.max(-90, Math.min(90, lat));
    let normLon = ((lon % 360) + 360) % 360;
    if (lon === 360) normLon = 360;
    const sampleMeta = this._buildSampleMeta();
    return sampleScientificGrid(clampLat, normLon, this.samplePixels, sampleMeta);
  }

  inspectPointAtGeo(lon, lat, screenX = null, screenY = null) {
    let normLon = ((lon % 360) + 360) % 360;
    if (lon === 360) normLon = 360;
    const clampLat = Math.max(-90, Math.min(90, lat));

    if (screenX === null || screenY === null) {
      const scr = this.geoToScreen(normLon, clampLat);
      screenX = scr.x;
      screenY = scr.y;
    }

    // O(1) Spatial Grid Lookup
    const col = Math.min(11, Math.max(0, Math.floor(normLon / 30.0)));
    const row = Math.min(5, Math.max(0, Math.floor((90.0 - clampLat) / 30.0)));
    const hitTile = this.spatialGrid.get(`${row}_${col}`) || null;

    let pixelCoords = null;
    if (hitTile) {
      pixelCoords = geographicToPixelCoords(normLon, clampLat, hitTile.meta, hitTile.width, hitTile.height);
    }

    // Bilinear Environmental Sampling (Unified Formula across 2D Map & 3D Globe)
    const sampleMeta = this._buildSampleMeta();
    const sampleData = sampleScientificGrid(clampLat, normLon, this.samplePixels, sampleMeta);

    // Astronaut Survival Suit Evaluation (100% Identical Logic to 3D Globe)
    const survival = evaluateAstronautSurvival(clampLat, normLon, sampleData);

    // Nearest Martian Landmark Discovery
    const landmark = findNearestLandmark(clampLat, normLon, 350);

    // Active Layer Value Computation & Formatting
    const activeLayerMeta = SCIENTIFIC_LAYERS[this.activeLayerId] || SCIENTIFIC_LAYERS.elevation;
    let activeMeasurement = 'Calculating...';
    let rawActiveValue = 0;

    if (sampleData) {
      if (this.activeLayerId === 'elevation') {
        rawActiveValue = sampleData.elevation;
        activeMeasurement = `${sampleData.elevation >= 0 ? '+' : ''}${Math.round(sampleData.elevation).toLocaleString()} m`;
      } else if (this.activeLayerId === 'gravity_120g') {
        rawActiveValue = sampleData.gravityAnomaly;
        activeMeasurement = `${sampleData.gravityAnomaly >= 0 ? '+' : ''}${sampleData.gravityAnomaly.toFixed(1)} mGal`;
      } else if (this.activeLayerId === 'slope') {
        rawActiveValue = sampleData.slope;
        activeMeasurement = `${sampleData.slope.toFixed(2)}°`;
      } else if (this.activeLayerId === 'surface_g') {
        rawActiveValue = sampleData.surfaceG;
        activeMeasurement = `${sampleData.surfaceG.toFixed(4)} m/s²`;
      } else if (this.activeLayerId === 'geoid_n') {
        rawActiveValue = sampleData.geoidN;
        activeMeasurement = `${sampleData.geoidN >= 0 ? '+' : ''}${Math.round(sampleData.geoidN)} m`;
      } else if (this.activeLayerId === 'gravity_delta') {
        rawActiveValue = sampleData.deltaGravity;
        activeMeasurement = `${sampleData.deltaGravity >= 0 ? '+' : ''}${sampleData.deltaGravity.toFixed(1)} mGal`;
      } else if (this.activeLayerId === 'main') {
        rawActiveValue = null;
        activeMeasurement = 'Viking MDIM 2.1 Color';
      } else if (this.activeLayerId === 'pressure') {
        const pressRes = calculateElevationPressure(sampleData ? sampleData.elevation : null);
        if (pressRes.dataValid) {
          rawActiveValue = pressRes.pressurePa;
          activeMeasurement = `${pressRes.pressurePa.toFixed(1)} Pa (${pressRes.pressureMbar.toFixed(2)} mbar)`;
        } else {
          rawActiveValue = null;
          activeMeasurement = 'PRESSURE UNKNOWN — ELEVATION DATA UNAVAILABLE';
        }
      }
    }

    // Cartographic Geodesy Coordinates
    const latGraph = planetocentricToPlanetographic(clampLat);
    const lonWest = normLon > 180.0 ? normLon - 360.0 : normLon;
    const cartesian = areocentricToCartesian(clampLat, normLon, sampleData ? sampleData.radiusKm : 3396.19);


    const info = {
      lon: normLon,
      lat: clampLat,
      screenX,
      screenY,
      hasData: Boolean(hitTile),
      tile: hitTile,
      filename: hitTile ? hitTile.filename : 'No Data (Uncovered Region)',
      resolution: hitTile ? `${hitTile.width} × ${hitTile.height} px` : 'N/A',
      pixelCoords: pixelCoords ? { px: pixelCoords.px, py: pixelCoords.py } : null,
      sphericalAreaKm2: hitTile ? hitTile.sphericalAreaKm2 : 0,
      currentLOD: this.activeLODName,
      latStr: formatLatitude(clampLat),
      lonStr: formatLongitude(normLon),
      latGraphStr: `${Math.abs(latGraph).toFixed(2)}° ${latGraph >= 0 ? 'N' : 'S'}`,
      lonWestStr: `${Math.abs(lonWest).toFixed(2)}° ${lonWest >= 0 ? 'E' : 'W'}`,
      cartesian,
      sampleData,
      survival,
      landmark,
      activeLayerId: this.activeLayerId,
      activeLayerMeta,
      activeMeasurement,
      rawActiveValue
    };

    this.inspectedPoint = info;
    this.isLayerDDirty = true;
    this.isDirty = true;

    if (this.options.onClick) {
      this.options.onClick(info);
    }

    return info;
  }

  /**
   * Starts requestAnimationFrame continuous rendering loop with FPS metering.
   */
  _startRenderLoop() {
    const loop = (timestamp) => {
      // Calculate real-time FPS
      this.fpsCounter.frames++;
      if (timestamp - this.fpsCounter.lastTime >= 1000) {
        this.fpsCounter.currentFps = Math.round((this.fpsCounter.frames * 1000) / (timestamp - this.fpsCounter.lastTime));
        this.fpsCounter.frames = 0;
        this.fpsCounter.lastTime = timestamp;
      }

      try {
        // Consolidated frame render: only dirty layers are updated
        if (this.isLayerADirty || this.isLayerBDirty || this.isLayerCDirty || this.isLayerDDirty || this.isDirty) {
          this.render();
        }
      } catch (renderErr) {
        console.error('Non-fatal render error caught in render loop:', renderErr);
      } finally {
        this.animFrameId = requestAnimationFrame(loop);
      }
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  /**
   * Request render on next frame across all layers (camera pan, zoom, resize, or layer change).
   */
  requestRender() {
    this.isLayerADirty = true;
    this.isLayerBDirty = true;
    this.isLayerCDirty = true;
    this.isLayerDDirty = true;
    this.isDirty = true;
  }

  /**
   * Request dynamic simulation layer render (Layer C: moving storm, walker).
   */
  requestSimRender() {
    this.isLayerCDirty = true;
  }

  /**
   * Request navigation and route layer render (Layer B: route, start/dest markers).
   */
  requestRouteRender() {
    this.isLayerBDirty = true;
  }

  /**
   * Request interaction and locator layer render (Layer D: minimap, crosshair, badges).
   */
  requestInteractionRender() {
    this.isLayerDDirty = true;
  }

  /**
   * Requests a specific pyramid level for a tile with AbortController cancellation and LRU caching.
   */
  _requestTileLOD(tile, targetLevel) {
    const layerId = this.activeLayerId;
    const key = `${layerId}::${tile.filename}::L${targetLevel}`;
    if (this.lruCache.has(key) || this.inFlightRequests.has(key)) return;

    if (this.activeRequestCount >= this.options.maxConcurrentRequests) return;

    let url = tile.overviewUrl;
    if (targetLevel === 1) url = tile.level1Url;
    else if (targetLevel === 2) url = tile.level2Url;
    else if (targetLevel === 3) url = tile.level3Url || tile.fullresUrl;

    const currentGeneration = this.renderGeneration;
    const controller = new AbortController();
    this.inFlightRequests.set(key, controller);
    this.activeRequestCount++;

    this._fetchAndDecodeBitmap(url, controller.signal).then((bitmap) => {
      this.inFlightRequests.delete(key);
      this.activeRequestCount = Math.max(0, this.activeRequestCount - 1);

      // Verify that request is still valid for current generation and layer
      if (this.renderGeneration !== currentGeneration || this.activeLayerId !== layerId) {
        if (bitmap) {
          try { bitmap.close(); } catch (_) {}
        }
        return;
      }

      if (bitmap) {
        this._evictLRUIfNeeded(targetLevel);
        const estBytes = bitmap.width * bitmap.height * 4;
        this.lruCache.set(key, {
          bitmap,
          lastAccess: performance.now(),
          level: targetLevel,
          sizeBytes: estBytes,
          layerId: layerId,
          filename: tile.filename
        });
        this.isLayerADirty = true;
        if (targetLevel === 0) {
          this.isMinimapBgDirty = true;
          this.isLayerDDirty = true;
        }
        if (this.options.onTileLoad) {
          this.options.onTileLoad({ tile, level: targetLevel, width: bitmap.width, height: bitmap.height, layerId });
        }
      }
    }).catch(() => {
      this.inFlightRequests.delete(key);
      this.activeRequestCount = Math.max(0, this.activeRequestCount - 1);
    });
  }

  /**
   * Memory management: evicts least recently used bitmaps when limits are exceeded.
   */
  _evictLRUIfNeeded(targetLevel) {
    if (targetLevel === 3) {
      let fullresCount = 0;
      let oldestKey = null;
      let oldestTime = Infinity;

      for (const [k, v] of this.lruCache.entries()) {
        if (v.level === 3) {
          fullresCount++;
          if (v.lastAccess < oldestTime) {
            oldestTime = v.lastAccess;
            oldestKey = k;
          }
        }
      }

      if (fullresCount >= this.options.maxFullresBitmaps && oldestKey) {
        const item = this.lruCache.get(oldestKey);
        if (item && item.bitmap) {
          try { item.bitmap.close(); } catch (_) {}
        }
        this.lruCache.delete(oldestKey);
      }
    }

    if (this.lruCache.size >= this.options.maxCachedBitmaps) {
      let oldestKey = null;
      let oldestTime = Infinity;

      for (const [k, v] of this.lruCache.entries()) {
        if (v.lastAccess < oldestTime) {
          oldestTime = v.lastAccess;
          oldestKey = k;
        }
      }

      if (oldestKey) {
        const item = this.lruCache.get(oldestKey);
        if (item && item.bitmap) {
          try { item.bitmap.close(); } catch (_) {}
        }
        this.lruCache.delete(oldestKey);
      }
    }
  }

  /**
   * Cancels in-flight requests that are outside the visible viewport.
   */
  _cancelOutOfViewRequests(visibleTileKeys) {
    for (const [key, controller] of this.inFlightRequests.entries()) {
      const parts = key.split('::');
      const filename = parts.length >= 2 ? parts[1] : key.split('_L')[0];
      if (!visibleTileKeys.has(filename)) {
        try { controller.abort(); } catch (_) {}
        this.inFlightRequests.delete(key);
        this.activeRequestCount = Math.max(0, this.activeRequestCount - 1);
      }
    }
  }

  /**
   * Master Rendering Routine with 4-Layer Separation.
   * Only layers with active updates are redrawn, eliminating buffer tearing and flicker.
   */
  render(forceAll = false) {
    if (forceAll || this.isDirty) {
      this.isLayerADirty = true;
      this.isLayerBDirty = true;
      this.isLayerCDirty = true;
      this.isLayerDDirty = true;
    }
    this.isDirty = false;

    const w = this.viewportWidth;
    const h = this.viewportHeight;
    const mapW = this.baseMapWidth * this.zoom;
    const mapH = this.baseMapHeight * this.zoom;
    const mapX = this.panX;
    const mapY = this.panY;

    // Single-canvas fallback mode
    if (!this.canvasB) {
      this.renderLayerA(w, h, mapX, mapY, mapW, mapH);
      this.renderLayerB(w, h, mapX, mapY, mapW, mapH);
      this.renderLayerC(w, h, mapX, mapY, mapW, mapH);
      this.renderLayerD(w, h, mapX, mapY, mapW, mapH);
      this.isLayerADirty = false;
      this.isLayerBDirty = false;
      this.isLayerCDirty = false;
      this.isLayerDDirty = false;
      return;
    }

    // Layer A: Static Planetary Base, Terrain Tiles & Coordinate Grid
    if (this.isLayerADirty) {
      this.renderLayerA(w, h, mapX, mapY, mapW, mapH);
      this.isLayerADirty = false;
      this.layerARenderCount++;
    }

    // Layer B: Route Polyline, Direction Chevrons, Mission START & DESTINATION Markers
    if (this.isLayerBDirty) {
      this.renderLayerB(w, h, mapX, mapY, mapW, mapH);
      this.isLayerBDirty = false;
      this.layerBRenderCount++;
    }

    // Layer C: Dynamic Simulation (Storm Hazards, Moving Walker Avatar, History Trail)
    if (this.isLayerCDirty) {
      this.renderLayerC(w, h, mapX, mapY, mapW, mapH);
      this.isLayerCDirty = false;
      this.layerCRenderCount++;
    }

    // Layer D: Interaction & Locator (Global Locator Minimap, Inspection Pin, Tooltips, Selection Banner)
    if (this.isLayerDDirty) {
      this.renderLayerD(w, h, mapX, mapY, mapW, mapH);
      this.isLayerDDirty = false;
      this.layerDRenderCount++;
    }
  }

  /**
   * LAYER A: Static Map Layer.
   * Base Mars imagery, elevation/terrain tiles, latitude/longitude grid lines, static labels and border.
   * Only redraws on camera pan/zoom/resize or layer switch.
   */
  renderLayerA(w, h, mapX, mapY, mapW, mapH) {
    const ctx = this.ctxA;
    if (!ctx) return;

    // 1. Clear background
    ctx.fillStyle = MAP_UI_THEME.canvas;
    ctx.fillRect(0, 0, w, h);

    // 2. Base layer / Planetary Rendering
    ctx.save();
    if (this.activeLayerId === 'elevation') {
      if (this.options.showNoDataOverlay) {
        ctx.fillStyle = this.noDataPattern || MAP_UI_THEME.panel;
        ctx.fillRect(mapX, mapY, mapW, mapH);
      } else {
        ctx.fillStyle = MAP_UI_THEME.canvas;
        ctx.fillRect(mapX, mapY, mapW, mapH);
      }

      // Pre-render global elevation texture foundation to guarantee zero visual flicker
      const baseElev = this.layerTextures.get('elevation');
      if (baseElev && baseElev.complete && baseElev.naturalWidth > 0) {
        ctx.drawImage(baseElev, mapX, mapY, mapW, mapH);
      }

      // 3. Screen-Space Error LOD calculation
      const tileScreenWidth = mapW / 12.0;

      let targetLOD = 0;
      if (tileScreenWidth >= 2500) {
        targetLOD = 3; // High-res MOLA DEM pyramid (2048x2048)
        this.activeLODName = 'Level 3 (2048px MOLA DEM)';
      } else if (tileScreenWidth >= 1200) {
        targetLOD = 2; // High detail (1536x1536)
        this.activeLODName = 'Level 2 (1536px Detail)';
      } else if (tileScreenWidth >= 550) {
        targetLOD = 1; // Regional (1024x1024)
        this.activeLODName = 'Level 1 (1024px Regional)';
      } else {
        targetLOD = 0; // Overview (512x512)
        this.activeLODName = 'Level 0 (512px Overview)';
      }

      // Evict higher LODs when zooming out
      this._evictHigherLODs('elevation', targetLOD);

      const now = performance.now();
      const visibleTileKeys = new Set();

      // 4. Render visible tiles with Viewport Frustum Culling
      for (const tile of this.tiles) {
        const tileX = mapX + tile.uMin * mapW;
        const tileY = mapY + tile.vMin * mapH;
        const tileW = (tile.uMax - tile.uMin) * mapW;
        const tileH = (tile.vMax - tile.vMin) * mapH;

        // Viewport Frustum Culling
        if (tileX + tileW < 0 || tileX > w || tileY + tileH < 0 || tileY > h) {
          continue;
        }

        visibleTileKeys.add(tile.filename);

        let bestBitmap = null;
        const layerId = this.activeLayerId;
        const k3 = `${layerId}::${tile.filename}::L3`;
        const k2 = `${layerId}::${tile.filename}::L2`;
        const k1 = `${layerId}::${tile.filename}::L1`;

        if (targetLOD >= 3 && this.lruCache.has(k3)) {
          const item = this.lruCache.get(k3);
          item.lastAccess = now;
          bestBitmap = item.bitmap;
        } else if (targetLOD >= 2 && this.lruCache.has(k2)) {
          const item = this.lruCache.get(k2);
          item.lastAccess = now;
          bestBitmap = item.bitmap;
        } else if (targetLOD >= 1 && this.lruCache.has(k1)) {
          const item = this.lruCache.get(k1);
          item.lastAccess = now;
          bestBitmap = item.bitmap;
        }

        if (!bestBitmap && this.overviewCache.has(tile.filename)) {
          bestBitmap = this.overviewCache.get(tile.filename);
        }

        if (bestBitmap) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(bestBitmap, tileX, tileY, tileW, tileH);
        }

        const targetKey = `${layerId}::${tile.filename}::L${targetLOD}`;
        if (targetLOD > 0 && !this.lruCache.has(targetKey)) {
          this._requestTileLOD(tile, targetLOD);
        }

        // 5. Tile Boundaries Overlay
        if (this.options.showBoundaries) {
          ctx.strokeStyle = MAP_UI_THEME.borderStrong;
          ctx.lineWidth = 1.2;
          ctx.strokeRect(tileX, tileY, tileW, tileH);

          const cornerLen = Math.min(14, tileW * 0.12);
          ctx.strokeStyle = MAP_UI_THEME.borderStrong;
          ctx.lineWidth = 2.0;

          ctx.beginPath();
          ctx.moveTo(tileX, tileY + cornerLen);
          ctx.lineTo(tileX, tileY);
          ctx.lineTo(tileX + cornerLen, tileY);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(tileX + tileW - cornerLen, tileY + tileH);
          ctx.lineTo(tileX + tileW, tileY + tileH);
          ctx.lineTo(tileX + tileW, tileY + tileH - cornerLen);
          ctx.stroke();

          if (this.zoom >= 1.4) {
            ctx.font = '10px "JetBrains Mono", monospace';
            ctx.fillStyle = MAP_UI_THEME.textSecondary;
            ctx.fillText(`${formatLongitude(tile.lonMin)}, ${formatLatitude(tile.latMax)}`, tileX + 6, tileY + 14);
          }
        }

        // 6. Filename Badge
        if (this.options.showFilenames && this.zoom >= 1.1) {
          const badge = `${tile.filename} (30°×30°)`;
          ctx.font = 'bold 10px "JetBrains Mono", monospace';
          const tw = ctx.measureText(badge).width;
          ctx.fillStyle = MAP_UI_THEME.panel;
          ctx.strokeStyle = themeRgba(MAP_UI_THEME.borderSubtleRgb, 0.65);
          ctx.lineWidth = 1;
          ctx.fillRect(tileX + 6, tileY + 10, tw + 8, 16);
          ctx.strokeRect(tileX + 6, tileY + 10, tw + 8, 16);
          ctx.fillStyle = MAP_UI_THEME.textSecondary;
          ctx.fillText(badge, tileX + 10, tileY + 22);
        }
      }

      this._cancelOutOfViewRequests(visibleTileKeys);
    } else if (this.activeLayerId === 'main') {
      ctx.fillStyle = MAP_UI_THEME.canvas;
      ctx.fillRect(mapX, mapY, mapW, mapH);

      const baseMain = this.layerTextures.get('main');
      if (baseMain && baseMain.complete && baseMain.naturalWidth > 0) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(baseMain, mapX, mapY, mapW, mapH);
      }

      const tileScreenWidth = mapW / 12.0;
      let targetLOD = 0;
      if (tileScreenWidth >= 2200) {
        targetLOD = 3;
        this.activeLODName = 'Main Level 3 (7680px Full-Res)';
      } else if (tileScreenWidth >= 1000) {
        targetLOD = 2;
        this.activeLODName = 'Main Level 2 (2048px Detail)';
      } else if (tileScreenWidth >= 480) {
        targetLOD = 1;
        this.activeLODName = 'Main Level 1 (1024px Regional)';
      } else {
        targetLOD = 0;
        this.activeLODName = 'Main Level 0 (512px Overview)';
      }

      this._evictHigherLODs('main', targetLOD);

      const now = performance.now();
      const visibleTileKeys = new Set();

      for (const tile of this.mainTiles) {
        const tileX = mapX + tile.uMin * mapW;
        const tileY = mapY + tile.vMin * mapH;
        const tileW = (tile.uMax - tile.uMin) * mapW;
        const tileH = (tile.vMax - tile.vMin) * mapH;

        if (tileX + tileW < 0 || tileX > w || tileY + tileH < 0 || tileY > h) {
          continue;
        }

        visibleTileKeys.add(tile.filename);

        let bestBitmap = null;
        const k3 = `main::${tile.filename}::L3`;
        const k2 = `main::${tile.filename}::L2`;
        const k1 = `main::${tile.filename}::L1`;

        if (targetLOD >= 3 && this.lruCache.has(k3)) {
          const item = this.lruCache.get(k3);
          item.lastAccess = now;
          bestBitmap = item.bitmap;
        } else if (targetLOD >= 2 && this.lruCache.has(k2)) {
          const item = this.lruCache.get(k2);
          item.lastAccess = now;
          bestBitmap = item.bitmap;
        } else if (targetLOD >= 1 && this.lruCache.has(k1)) {
          const item = this.lruCache.get(k1);
          item.lastAccess = now;
          bestBitmap = item.bitmap;
        }

        if (!bestBitmap && this.mainOverviewCache.has(tile.filename)) {
          bestBitmap = this.mainOverviewCache.get(tile.filename);
        }

        if (bestBitmap) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(bestBitmap, tileX, tileY, tileW, tileH);
        }

        if (targetLOD > 0) {
          const targetKey = `main::${tile.filename}::L${targetLOD}`;
          if (!this.lruCache.has(targetKey)) {
            this._requestMainTileLOD(tile, targetLOD);
          }
        }

        if (this.options.showBoundaries) {
          ctx.strokeStyle = MAP_UI_THEME.borderStrong;
          ctx.lineWidth = 1.0;
          ctx.strokeRect(tileX, tileY, tileW, tileH);
        }
      }

      this._cancelOutOfViewRequests(visibleTileKeys);
    } else {
      ctx.fillStyle = MAP_UI_THEME.canvas;
      ctx.fillRect(mapX, mapY, mapW, mapH);

      const layerTex = this.layerTextures.get(this.activeLayerId);
      if (layerTex && layerTex.complete && layerTex.naturalWidth > 0) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(layerTex, mapX, mapY, mapW, mapH);
      } else {
        ctx.fillStyle = MAP_UI_THEME.panel;
        ctx.fillRect(mapX, mapY, mapW, mapH);
        ctx.font = '13px "JetBrains Mono", monospace';
        ctx.fillStyle = MAP_UI_THEME.textSecondary;
        ctx.textAlign = 'center';
        const layerTitle = (SCIENTIFIC_LAYERS[this.activeLayerId] && SCIENTIFIC_LAYERS[this.activeLayerId].name) || this.activeLayerId;
        ctx.fillText(`Loading scientific raster: ${layerTitle}...`, mapX + mapW / 2, mapY + mapH / 2);
        ctx.textAlign = 'left';
      }

      this.activeLODName = `Scientific Layer: ${SCIENTIFIC_LAYERS[this.activeLayerId].name}`;

      if (this.options.showBoundaries) {
        ctx.strokeStyle = themeRgba(MAP_UI_THEME.borderSubtleRgb, 0.65);
        ctx.lineWidth = 1;
        for (let r = 0; r <= 6; r++) {
          const y = mapY + (r / 6.0) * mapH;
          ctx.beginPath();
          ctx.moveTo(mapX, y);
          ctx.lineTo(mapX + mapW, y);
          ctx.stroke();
        }
        for (let c = 0; c <= 12; c++) {
          const x = mapX + (c / 12.0) * mapW;
          ctx.beginPath();
          ctx.moveTo(x, mapY);
          ctx.lineTo(x, mapY + mapH);
          ctx.stroke();
        }
      }
    }

    // 7. Coordinate Grid Overlay (Parallels and Meridians)
    if (this.options.showGrid) {
      this._drawCoordinateGrid(ctx, mapX, mapY, mapW, mapH);
    }

    if (this.options.showPlaceNames) {
      this._drawPlaceNames(ctx, mapX, mapY, mapW, mapH);
    }

    // 8. Outer Map Border
    ctx.strokeStyle = MAP_UI_THEME.borderStrong;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(mapX, mapY, mapW, mapH);

    ctx.restore();
  }

  _drawPlaceNames(ctx, mapX, mapY, mapW, mapH) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(mapX, mapY, mapW, mapH);
    ctx.clip();
    ctx.font = '600 8.5px "Space Grotesk", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    const placedLabels = [];
    const requestedLandmarkIds = new Set(['utopia', 'gusev', 'meridiani', 'north_pole', 'south_pole']);
    const landmarks = MARS_LANDMARKS
      .filter(landmark => !landmark.type.startsWith('NASA Climate Sounder Track'))
      .sort((a, b) => Number(requestedLandmarkIds.has(b.id)) - Number(requestedLandmarkIds.has(a.id)));
    const labelOffsets = [];
    for (let y = -56; y <= 56; y += 14) {
      for (let x = -80; x <= 80; x += 20) {
        labelOffsets.push({ x, y, distance: Math.hypot(x, y) });
      }
    }
    labelOffsets.sort((a, b) => a.distance - b.distance);

    for (const landmark of landmarks) {
      const point = this.geoToScreen(landmark.lon, landmark.lat);
      if (point.x < mapX || point.x > mapX + mapW || point.y < mapY || point.y > mapY + mapH) continue;

      ctx.fillStyle = MAP_UI_THEME.accent;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
      ctx.fill();

      const labelWidth = ctx.measureText(landmark.name).width;
      const labelHeight = 12;
      let labelPosition = null;

      for (const offset of labelOffsets) {
        const candidate = { x: point.x + offset.x, y: point.y + offset.y };
        const left = candidate.x - labelWidth / 2;
        const bounds = {
          left: left - 2,
          right: left + labelWidth + 2,
          top: candidate.y - labelHeight / 2 - 1,
          bottom: candidate.y + labelHeight / 2 + 1
        };
        const fitsMap = bounds.left >= mapX && bounds.right <= mapX + mapW
          && bounds.top >= mapY && bounds.bottom <= mapY + mapH;
        const overlaps = placedLabels.some(other =>
          bounds.left < other.right && bounds.right > other.left
          && bounds.top < other.bottom && bounds.bottom > other.top
        );
        if (fitsMap && !overlaps) {
          labelPosition = { ...candidate, bounds };
          placedLabels.push(bounds);
          break;
        }
      }

      if (!labelPosition) continue;
      const targetX = Math.max(labelPosition.bounds.left, Math.min(point.x, labelPosition.bounds.right));
      const targetY = Math.max(labelPosition.bounds.top, Math.min(point.y, labelPosition.bounds.bottom));
      if (Math.hypot(targetX - point.x, targetY - point.y) > 15) {
        ctx.strokeStyle = themeRgba(MAP_UI_THEME.accentRgb, 0.6);
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(targetX, targetY);
        ctx.stroke();
        ctx.fillStyle = MAP_UI_THEME.accent;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(20, 18, 24, 0.9)';
      ctx.lineWidth = 3;
      ctx.strokeText(landmark.name, labelPosition.x, labelPosition.y);
      ctx.fillStyle = MAP_UI_THEME.textPrimary;
      ctx.fillText(landmark.name, labelPosition.x, labelPosition.y);
    }

    ctx.restore();
  }

  /**
   * LAYER B: Route & Navigation Layer.
   * START marker, DESTINATION marker, calculated route polyline, waypoints, direction indicators.
   * Redraws only on route calculation, start/dest change, or pan/zoom/resize.
   */
  renderLayerB(w, h, mapX, mapY, mapW, mapH) {
    const ctx = this.ctxB || this.ctxA;
    if (!ctx) return;

    if (this.ctxB) {
      ctx.clearRect(0, 0, w, h);
    }
    ctx.save();

    // 10.8 Optional Route-Corridor Safety Diagnostic Overlay (Part G)
    if (this.showCorridorDiagnostics && this.corridorDiagnostics) {
      try {
        this._drawCorridorDiagnostics(ctx, mapX, mapY, mapW, mapH);
      } catch (err) {
        console.warn('Non-fatal error in corridor diagnostics rendering:', err);
      }
    }

    // 11. Pedestrian Route Polyline & Directional Chevrons
    if (this.routeVisible && this.routePath && this.routePath.length > 1) {
      try {
        this._drawRoutePolyline(ctx, mapX, mapY, mapW, mapH);
      } catch (err) {
        console.warn('Non-fatal error in route polyline rendering:', err);
      }
    }

    // 12. Start (S) and Destination (D) Geographic Markers (ALWAYS preserved and rendered)
    try {
      this._drawRouteEndpoints(ctx);
    } catch (err) {
      console.warn('Non-fatal error in route endpoints rendering:', err);
    }

    ctx.restore();
  }

  /**
   * LAYER C: Dynamic Simulation Layer.
   * Moving astronaut avatar, history trail, moving dust storms, storm direction arrows, dynamic indicators.
   * Updates continuously on simulation tick without clearing or redrawing Layers A, B, or D.
   */
  renderLayerC(w, h, mapX, mapY, mapW, mapH) {
    const ctx = this.ctxC || this.ctxA;
    if (!ctx) return;

    if (this.ctxC) {
      ctx.clearRect(0, 0, w, h);
    }
    ctx.save();

    // 10.5 Dust Storm Simulation Hazards (Footprint, Velocity Vector, Trajectory)
    try {
      this._drawDustStorms(ctx, mapX, mapY, mapW, mapH);
    } catch (err) {
      console.warn('Non-fatal error in dust storms rendering:', err);
    }

    // 11.5 Simulated Walking Astronaut Marker & Trail
    if (this.simulatedWalker) {
      try {
        this._drawWalkingAstronaut(ctx);
      } catch (err) {
        console.warn('Non-fatal error in walking astronaut rendering:', err);
      }
    }

    ctx.restore();
  }

  /**
   * LAYER D: Interaction & Locator Layer.
   * Global Locator minimap, crosshairs, selected coordinate indicators, route hover tooltip, Fly To marker.
   * Updates on interaction, pan/zoom, or resize; independent of simulation ticks.
   */
  renderLayerD(w, h, mapX, mapY, mapW, mapH) {
    const ctx = this.ctxD || this.ctxA;
    if (!ctx) return;

    if (this.ctxD) {
      ctx.clearRect(0, 0, w, h);
    }
    ctx.save();

    // 9. Inspection Target Pin
    if (this.inspectedPoint) {
      const scr = this.geoToScreen(this.inspectedPoint.lon, this.inspectedPoint.lat);
      this._drawInspectionMarker(ctx, scr.x, scr.y, this.inspectedPoint);
    }

    // Route waypoint hover inspection tooltip
    if (this.routeHoverInspection) {
      const rScr = this.geoToScreen(this.routeHoverInspection.lon, this.routeHoverInspection.lat);
      this._drawRouteInspectionTooltip(ctx, rScr.x, rScr.y, this.routeHoverInspection);
    }

    // 10. Minimap / Global Locator Widget
    if (this.options.showMinimap) {
      this._drawMinimap(ctx, mapX, mapY, mapW, mapH);
    }

    // 13. Map Point Selection Mode Banner
    if (this.pointSelectionMode) {
      this._drawSelectionModeIndicator(ctx, w, h);
    }

    ctx.restore();
  }
  /**
   * Draws planetary coordinate grid lines and labels.
   */
  _drawCoordinateGrid(ctx, mapX, mapY, mapW, mapH) {
    ctx.save();
    const lonStep = 30;
    const latStep = 30;

    // Parallels (Latitude)
    for (let lat = -90; lat <= 90; lat += latStep) {
      const v = (90.0 - lat) / 180.0;
      const y = mapY + v * mapH;
      const isEquator = lat === 0;

      ctx.beginPath();
      ctx.moveTo(mapX, y);
      ctx.lineTo(mapX + mapW, y);

      if (isEquator) {
        ctx.strokeStyle = telemetryRgba(0.85);
        ctx.lineWidth = 1.8;
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = themeRgba(MAP_UI_THEME.textSecondaryRgb, 0.30);
        ctx.lineWidth = 0.8;
        ctx.setLineDash([4, 4]);
      }
      ctx.stroke();

      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = isEquator ? telemetryRgba(0.90) : themeRgba(MAP_UI_THEME.textPrimaryRgb, 0.78);
      ctx.fillText(formatLatitude(lat), Math.max(8, mapX - 36), y + 3);
      ctx.fillText(formatLatitude(lat), mapX + mapW + 6, y + 3);
    }

    // Meridians (Longitude)
    for (let lon = 0; lon <= 360; lon += lonStep) {
      const u = lon / 360.0;
      const x = mapX + u * mapW;
      const isPrime = lon === 0 || lon === 360;

      ctx.beginPath();
      ctx.moveTo(x, mapY);
      ctx.lineTo(x, mapY + mapH);

      if (isPrime) {
        ctx.strokeStyle = telemetryRgba(0.85);
        ctx.lineWidth = 1.8;
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = themeRgba(MAP_UI_THEME.textSecondaryRgb, 0.30);
        ctx.lineWidth = 0.8;
        ctx.setLineDash([4, 4]);
      }
      ctx.stroke();

      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = isPrime ? telemetryRgba(0.90) : themeRgba(MAP_UI_THEME.textPrimaryRgb, 0.78);
      const label = `${lon}°E`;
      const lw = ctx.measureText(label).width;
      ctx.fillText(label, x - lw / 2, Math.max(14, mapY - 8));
      ctx.fillText(label, x - lw / 2, mapY + mapH + 18);
    }

    ctx.restore();
  }

  /**
   * Draws mission-control target crosshair.
   */
  _drawInspectionMarker(ctx, x, y, info) {
    ctx.save();
    const markColor = telemetryRgba(0.90);

    ctx.strokeStyle = markColor;
    ctx.lineWidth = 1.6;

    const r = 12;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - r - 6, y);
    ctx.lineTo(x + r + 6, y);
    ctx.moveTo(x, y - r - 6);
    ctx.lineTo(x, y + r + 6);
    ctx.stroke();

    ctx.fillStyle = markColor;
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();

    let tag = `${info.latStr}, ${info.lonStr}`;
    if (info.landmark) {
      tag = `${info.landmark.name} • ${info.activeMeasurement || ''}`;
    } else if (info.activeMeasurement) {
      tag = `${info.latStr}, ${info.lonStr} [${info.activeMeasurement}]`;
    }

    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    const tagW = ctx.measureText(tag).width;

    const tx = Math.min(this.viewportWidth - tagW - 20, Math.max(10, x + 16));
    const ty = Math.min(this.viewportHeight - 20, Math.max(25, y - 16));

    ctx.fillStyle = MAP_UI_THEME.panel;
    ctx.strokeStyle = markColor;
    ctx.lineWidth = 1;
    ctx.fillRect(tx - 6, ty - 13, tagW + 12, 20);
    ctx.strokeRect(tx - 6, ty - 13, tagW + 12, 20);

    ctx.fillStyle = MAP_UI_THEME.textPrimary;
    ctx.fillText(tag, tx, ty + 1);
    ctx.restore();
  }

  /**
   * Pre-renders and caches the 72 overview tiles and planetary raster background for the Minimap.
   */
  _updateMinimapBgCache() {
    const mctx = this.minimapBgCtx;
    if (!mctx) return;
    const mw = this.minimapWidth;
    const mh = this.minimapHeight;

    if (this.minimapBgCanvas.width !== mw || this.minimapBgCanvas.height !== mh) {
      this.minimapBgCanvas.width = mw;
      this.minimapBgCanvas.height = mh;
    }

    let painted = false;
    // Base texture foundation
    const baseTex = this.layerTextures.get(this.activeLayerId) || this.layerTextures.get('elevation') || this.layerTextures.get('main');
    if (baseTex && baseTex.complete && baseTex.naturalWidth > 0) {
      mctx.imageSmoothingEnabled = true;
      mctx.imageSmoothingQuality = 'high';
      mctx.drawImage(baseTex, 0, 0, mw, mh);
      painted = true;
    } else {
      mctx.fillStyle = MAP_UI_THEME.panel;
      mctx.fillRect(0, 0, mw, mh);
    }

    const cellW = mw / 12.0;
    const cellH = mh / 6.0;

    if (this.activeLayerId === 'main') {
      for (const tile of this.mainTiles) {
        if (this.mainOverviewCache.has(tile.filename)) {
          const bmp = this.mainOverviewCache.get(tile.filename);
          const cx = tile.uMin * mw;
          const cy = tile.vMin * mh;
          mctx.drawImage(bmp, cx, cy, cellW, cellH);
          painted = true;
        }
      }
    } else {
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 12; c++) {
          const tile = this.spatialGrid.get(`${r}_${c}`);
          if (tile && this.overviewCache.has(tile.filename)) {
            const bmp = this.overviewCache.get(tile.filename);
            const cx = c * cellW;
            const cy = r * cellH;
            mctx.drawImage(bmp, cx, cy, cellW, cellH);
            painted = true;
          }
        }
      }
    }

    // Only mark clean once real planetary imagery has been rendered onto the cache
    if (painted) {
      this.isMinimapBgDirty = false;
    }
  }

  /**
   * Draws interactive Minimap / Global Locator with real-time camera footprint (Layer D).
   */
  _drawMinimap(ctx, mapX, mapY, mapW, mapH) {
    const mx = this.minimapX;
    const my = this.minimapY;
    const mw = this.minimapWidth;
    const mh = this.minimapHeight;

    ctx.save();
    // Locator Container Box
    ctx.fillStyle = MAP_UI_THEME.panel;
    ctx.strokeStyle = MAP_UI_THEME.borderStrong;
    ctx.lineWidth = 1.2;
    ctx.fillRect(mx - 4, my - 20, mw + 8, mh + 26);
    ctx.strokeRect(mx - 4, my - 20, mw + 8, mh + 26);

    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.fillStyle = MAP_UI_THEME.textSecondary;
    ctx.fillText(_tr('GLOBAL LOCATOR (0°–360°E)', 'ĐỊNH VỊ TOÀN CẦU (0°–360°E)'), mx, my - 8);

    // Refresh background cache if dirty
    if (this.isMinimapBgDirty) {
      this._updateMinimapBgCache();
    }

    // Immediate planetary texture fallback to guarantee map is ALWAYS visible
    const baseTex = this.layerTextures.get(this.activeLayerId) || this.layerTextures.get('elevation') || this.layerTextures.get('main');
    if (baseTex && baseTex.complete && baseTex.naturalWidth > 0) {
      ctx.drawImage(baseTex, mx, my, mw, mh);
    }
    // Draw cached high-res overview tiles
    ctx.drawImage(this.minimapBgCanvas, mx, my);

    // Planetary Equator
    ctx.strokeStyle = telemetryRgba(0.75);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mx, my + mh / 2);
    ctx.lineTo(mx + mw, my + mh / 2);
    ctx.stroke();

    // 180° Meridian
    ctx.strokeStyle = telemetryRgba(0.75);
    ctx.beginPath();
    ctx.moveTo(mx + mw / 2, my);
    ctx.lineTo(mx + mw / 2, my + mh);
    ctx.stroke();

    ctx.strokeStyle = telemetryRgba(0.75);
    ctx.strokeRect(mx, my, mw, mh);

    // Active Dust Storms on Global Locator
    try {
      if (typeof globalDustStormSimulator !== 'undefined' && globalDustStormSimulator.getActiveStorms) {
        const storms = globalDustStormSimulator.getActiveStorms();
        for (const st of storms) {
          const sx = mx + (((st.lon % 360) + 360) % 360 / 360.0) * mw;
          const sy = my + ((90.0 - Math.max(-90, Math.min(90, st.lat))) / 180.0) * mh;
          ctx.fillStyle = (st.intensity === 'extreme' || st.intensity === 'severe') ? 'rgba(239, 68, 68, 0.85)' : themeRgba(MAP_UI_THEME.textSecondaryRgb, 0.85);
          ctx.beginPath();
          ctx.arc(sx, sy, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } catch (_) {}

    // Mission START on Global Locator
    if (this.startPoint) {
      const sx = mx + (((this.startPoint.lon % 360) + 360) % 360 / 360.0) * mw;
      const sy = my + ((90.0 - Math.max(-90, Math.min(90, this.startPoint.lat))) / 180.0) * mh;
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = MAP_UI_THEME.textPrimary;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Mission DESTINATION on Global Locator
    if (this.destPoint) {
      const dx = mx + (((this.destPoint.lon % 360) + 360) % 360 / 360.0) * mw;
      const dy = my + ((90.0 - Math.max(-90, Math.min(90, this.destPoint.lat))) / 180.0) * mh;
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(dx, dy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = MAP_UI_THEME.textPrimary;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Walking Astronaut Dot on Global Locator
    if (this.simulatedWalker && this.simulatedWalker.lat !== undefined && this.simulatedWalker.lon !== undefined) {
      const wx = mx + (((this.simulatedWalker.lon % 360) + 360) % 360 / 360.0) * mw;
      const wy = my + ((90.0 - Math.max(-90, Math.min(90, this.simulatedWalker.lat))) / 180.0) * mh;
      ctx.fillStyle = telemetryRgba(0.75);
      ctx.beginPath();
      ctx.arc(wx, wy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = MAP_UI_THEME.textPrimary;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Viewport Footprint Bounding Box (Camera Frustum)
    const u1 = Math.max(0, Math.min(1, -mapX / mapW));
    const u2 = Math.max(0, Math.min(1, (this.viewportWidth - mapX) / mapW));
    const v1 = Math.max(0, Math.min(1, -mapY / mapH));
    const v2 = Math.max(0, Math.min(1, (this.viewportHeight - mapY) / mapH));

    const vx = mx + u1 * mw;
    const vy = my + v1 * mh;
    const vw = Math.max(4, (u2 - u1) * mw);
    const vh = Math.max(4, (v2 - v1) * mh);

    ctx.strokeStyle = telemetryRgba(0.75);
    ctx.lineWidth = 1.5;
    ctx.fillStyle = telemetryRgba(0.15);
    ctx.fillRect(vx, vy, vw, vh);
    ctx.strokeRect(vx, vy, vw, vh);

    ctx.restore();
  }

  /**
   * Panning to a location clicked on the minimap.
   */
  _handleMinimapClick(screenX, screenY) {
    const rx = (screenX - this.minimapX) / this.minimapWidth;
    const ry = (screenY - this.minimapY) / this.minimapHeight;

    const lon = rx * 360.0;
    const lat = 90.0 - ry * 180.0;
    this.flyTo(lon, lat, this.zoom);
  }

  /**
   * Attaches mouse, gesture, and keyboard event listeners with zero-lag interaction.
   */
  _attachEventHandlers() {
    const el = this.canvas;

    const resizeObserver = new ResizeObserver(() => {
      this._setupCanvas();
      this.isDirty = true;
    });
    resizeObserver.observe(el);

    // Mouse Down
    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        const rect = el.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (this.options.showMinimap &&
            mouseX >= this.minimapX && mouseX <= this.minimapX + this.minimapWidth &&
            mouseY >= this.minimapY && mouseY <= this.minimapY + this.minimapHeight) {
          this.isDraggingMinimap = true;
          this._handleMinimapClick(mouseX, mouseY);
          return;
        }

        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.lastPanX = this.panX;
        this.lastPanY = this.panY;
        this.hasMovedDuringDrag = false;
        el.style.cursor = 'grabbing';
      }
    });

    // Mouse Move (High-frequency pointer events decoupled from DOM updates)
    window.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (this.isDraggingMinimap) {
        this._handleMinimapClick(mouseX, mouseY);
        return;
      }

      if (this.isDragging) {
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        if (Math.hypot(dx, dy) > 4) {
          this.hasMovedDuringDrag = true;
        }
        this.panX = this.lastPanX + dx;
        this.panY = this.lastPanY + dy;
        this.requestRender();
      }

      // Throttled Hover Sampling to prevent DOM layout thrashing
      const now = performance.now();
      if (now - this.lastTelemetryUpdate > 30) {
        this.lastTelemetryUpdate = now;
        if (mouseX >= 0 && mouseX <= this.viewportWidth && mouseY >= 0 && mouseY <= this.viewportHeight) {
          const geo = this.screenToGeo(mouseX, mouseY);
          const col = Math.min(11, Math.max(0, Math.floor(geo.lon / 30.0)));
          const row = Math.min(5, Math.max(0, Math.floor((90.0 - geo.lat) / 30.0)));
          const hitTile = this.spatialGrid.get(`${row}_${col}`) || null;

          let pixelCoords = null;
          if (hitTile) {
            pixelCoords = geographicToPixelCoords(geo.lon, geo.lat, hitTile.meta, hitTile.width, hitTile.height);
          }

          // Sample environmental data on hover
          const hoverMeta = this._buildSampleMeta();
          const sampleData = sampleScientificGrid(geo.lat, geo.lon, this.samplePixels, hoverMeta);
          let activeMeasurement = '';
          if (sampleData) {
            if (this.activeLayerId === 'elevation') {
              activeMeasurement = `${sampleData.elevation >= 0 ? '+' : ''}${Math.round(sampleData.elevation).toLocaleString()} m`;
            } else if (this.activeLayerId === 'gravity_120g') {
              activeMeasurement = `${sampleData.gravityAnomaly >= 0 ? '+' : ''}${sampleData.gravityAnomaly.toFixed(1)} mGal`;
            } else if (this.activeLayerId === 'slope') {
              activeMeasurement = `${sampleData.slope.toFixed(2)}°`;
            } else if (this.activeLayerId === 'surface_g') {
              activeMeasurement = `${sampleData.surfaceG.toFixed(4)} m/s²`;
            } else if (this.activeLayerId === 'geoid_n') {
              activeMeasurement = `${sampleData.geoidN >= 0 ? '+' : ''}${Math.round(sampleData.geoidN)} m`;
            } else if (this.activeLayerId === 'gravity_delta') {
              activeMeasurement = `${sampleData.deltaGravity >= 0 ? '+' : ''}${sampleData.deltaGravity.toFixed(1)} mGal`;
            } else if (this.activeLayerId === 'main') {
              activeMeasurement = 'Viking MDIM 2.1 Color';
            } else if (this.activeLayerId === 'pressure') {
              const pressRes = calculateElevationPressure(sampleData ? sampleData.elevation : null);
              activeMeasurement = pressRes.dataValid 
                ? `${pressRes.pressurePa.toFixed(1)} Pa (${pressRes.pressureMbar.toFixed(2)} mbar)`
                : 'PRESSURE UNKNOWN — ELEVATION DATA UNAVAILABLE';
            }
          }

          const hoverData = {
            lon: geo.lon,
            lat: geo.lat,
            screenX: mouseX,
            screenY: mouseY,
            hasData: Boolean(hitTile),
            tile: hitTile,
            filename: hitTile ? hitTile.filename : 'No Data',
            resolution: hitTile ? `${hitTile.width} × ${hitTile.height} px` : 'N/A',
            pixelCoords: pixelCoords ? { px: pixelCoords.px, py: pixelCoords.py } : null,
            sphericalAreaKm2: hitTile ? hitTile.sphericalAreaKm2 : 0,
            currentLOD: this.activeLODName,
            latStr: formatLatitude(geo.lat),
            lonStr: formatLongitude(geo.lon),
            sampleData,
            activeMeasurement,
            activeLayerId: this.activeLayerId
          };

          this.hoverPoint = hoverData;
          if (this.options.onHover) {
            this.options.onHover(hoverData);
          }

          // Route Waypoint Inspection Check on Hover (Specification Section 9)
          if (this.routeVisible && this.routePath && this.routePath.length > 1) {
            let nearestPt = null;
            let minDistPx = 16.0;
            for (let i = 0; i < this.routePath.length; i++) {
              const rPt = this.routePath[i];
              const rScr = this.geoToScreen(rPt.lon, rPt.lat);
              const dPx = Math.hypot(mouseX - rScr.x, mouseY - rScr.y);
              if (dPx < minDistPx) {
                minDistPx = dPx;
                nearestPt = rPt;
              }
            }
            if (nearestPt !== this.routeHoverInspection) {
              this.routeHoverInspection = nearestPt;
              this.isLayerDDirty = true;
              this.isDirty = true;
            }
          } else if (this.routeHoverInspection) {
            this.routeHoverInspection = null;
            this.isLayerDDirty = true;
            this.isDirty = true;
          }
        }
      }
    });

    // Mouse Up
    window.addEventListener('mouseup', (e) => {
      if (this.isDraggingMinimap) {
        this.isDraggingMinimap = false;
        return;
      }

      if (this.isDragging) {
        this.isDragging = false;
        el.style.cursor = 'grab';

        if (!this.hasMovedDuringDrag) {
          const rect = el.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;
          if (clickX >= 0 && clickX <= this.viewportWidth && clickY >= 0 && clickY <= this.viewportHeight) {
            const geo = this.screenToGeo(clickX, clickY);
            if (this.pointSelectionMode) {
              this.setPointFromSelection(geo.lon, geo.lat);
              return;
            }
            this.inspectPointAtGeo(geo.lon, geo.lat, clickX, clickY);
          }
        }
      }
    });

    // Reset dragging on window blur or pointer cancel to prevent interaction lock
    window.addEventListener('blur', () => {
      if (this.isDragging) {
        this.isDragging = false;
        el.style.cursor = 'grab';
      }
    });
    window.addEventListener('pointercancel', () => {
      if (this.isDragging) {
        this.isDragging = false;
        el.style.cursor = 'grab';
      }
    });

    // Double Click: Zoom in at clicked position
    el.addEventListener('dblclick', (e) => {
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      this.zoomAtPoint(2.0, mouseX, mouseY);
    });

    // Mouse Wheel: Immediate cursor-centered zoom
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.18 : 1.0 / 1.18;
      this.zoomAtPoint(zoomFactor, mouseX, mouseY);
    }, { passive: false });

    // Touch Events: Smooth Drag & Multi-touch Pinch to Zoom
    let initialPinchDist = null;
    let lastTouchX = 0;
    let lastTouchY = 0;

    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.hasMovedDuringDrag = false;
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        this.isDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialPinchDist = Math.hypot(dx, dy);
      }
    }, { passive: false });

    el.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && this.isDragging) {
        this.hasMovedDuringDrag = true;
        const deltaX = e.touches[0].clientX - lastTouchX;
        const deltaY = e.touches[0].clientY - lastTouchY;
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
        this.panX += deltaX;
        this.panY += deltaY;
        this.requestRender();
      } else if (e.touches.length === 2 && initialPinchDist) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentDist = Math.hypot(dx, dy);
        if (currentDist > 5 && initialPinchDist > 5) {
          const factor = currentDist / initialPinchDist;
          const rect = el.getBoundingClientRect();
          const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
          const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
          this.zoomAtPoint(factor, centerX, centerY);
          initialPinchDist = currentDist;
        }
      }
    }, { passive: false });

    el.addEventListener('touchend', (e) => {
      if (e.touches.length === 0) {
        this.isDragging = false;
        initialPinchDist = null;
      } else if (e.touches.length === 1) {
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
        initialPinchDist = null;
      }
    });

    // Keyboard Navigation
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const panDelta = 60;
      if (e.key === 'ArrowUp') {
        this.panY += panDelta;
        this.requestRender();
      } else if (e.key === 'ArrowDown') {
        this.panY -= panDelta;
        this.requestRender();
      } else if (e.key === 'ArrowLeft') {
        this.panX += panDelta;
        this.requestRender();
      } else if (e.key === 'ArrowRight') {
        this.panX -= panDelta;
        this.requestRender();
      } else if (e.key === '+' || e.key === '=') {
        this.zoomAtPoint(1.25, this.viewportWidth / 2, this.viewportHeight / 2);
      } else if (e.key === '-' || e.key === '_') {
        this.zoomAtPoint(1 / 1.25, this.viewportWidth / 2, this.viewportHeight / 2);
      } else if (e.key === '0') {
        this.resetView();
      }
    });
  }

  // ==========================================
  // PEDESTRIAN ROUTE & ENDPOINT METHODS
  // ==========================================

  setRoute(routePath, segments = null, isMidWalk = false) {
    if (!routePath || routePath.length === 0) {
      this.routePath = null;
      this.routeSegments = null;
      this.isLayerBDirty = true;
      return;
    }

    // Robust normalization supporting both [lat, lon] tuples and { lat, lon } objects with waypoint metadata preserved
    this.routePath = routePath.map((pt, idx) => {
      if (Array.isArray(pt)) {
        return { index: idx, lat: Number(pt[0]), lon: Number(pt[1]) };
      } else if (pt && typeof pt === 'object') {
        return {
          ...pt,
          index: idx,
          lat: Number(pt.lat),
          lon: Number(pt.lon),
          elevation: pt.elevation !== undefined ? pt.elevation : pt.elevationM,
          slope: pt.slope !== undefined ? pt.slope : pt.slopeDeg,
          signedSlopeDeg: pt.signedSlopeDeg,
          deltaZ: pt.deltaZ,
          costMultiplier: pt.costMultiplier,
          slopeClass: pt.slopeClass || pt.safetyClass || 'SAFE',
          safetyClass: pt.safetyClass || pt.status || 'SAFE',
          survival: pt.survival
        };
      }
      return null;
    }).filter(p => p !== null && !isNaN(p.lat) && !isNaN(p.lon));

    // CRITICAL: Anchor route extremities exactly to Start and Destination coordinates while preserving telemetry
    if (!isMidWalk && this.startPoint && this.routePath.length > 0) {
      this.routePath[0] = { ...this.routePath[0], lat: this.startPoint.lat, lon: this.startPoint.lon };
    }
    if (this.destPoint && this.routePath.length > 0) {
      const lastIdx = this.routePath.length - 1;
      this.routePath[lastIdx] = { ...this.routePath[lastIdx], lat: this.destPoint.lat, lon: this.destPoint.lon };
    }

    // Normalize segments so each segment has valid p1, p2, and color
    if (segments && segments.length > 0 && this.routePath.length >= 2) {
      this.routeSegments = segments.map((seg, idx) => {
        const pt1 = (seg && seg.p1) ? seg.p1 : this.routePath[idx];
        const pt2 = (seg && seg.p2) ? seg.p2 : this.routePath[idx + 1] || this.routePath[idx];

        let strokeColor = '#10b981';
        if (seg && (seg.safetyClass === 'UNSAFE' || seg.isUnsafe)) {
          strokeColor = '#ef4444';
        } else if (seg && (seg.safetyClass === 'CAUTION' || seg.isCaution)) {
          strokeColor = MAP_UI_THEME.textSecondary;
        } else if (seg && seg.color) {
          strokeColor = seg.color;
        }

        const lat1 = pt1 ? Number(pt1.lat !== undefined ? pt1.lat : pt1[0]) : 0;
        const lon1 = pt1 ? Number(pt1.lon !== undefined ? pt1.lon : pt1[1]) : 0;
        const lat2 = pt2 ? Number(pt2.lat !== undefined ? pt2.lat : pt2[0]) : 0;
        const lon2 = pt2 ? Number(pt2.lon !== undefined ? pt2.lon : pt2[1]) : 0;

        return {
          p1: { lat: lat1, lon: lon1 },
          p2: { lat: lat2, lon: lon2 },
          color: strokeColor,
          status: seg?.status || seg?.safetyClass || 'SAFE',
          safetyClass: seg?.safetyClass || 'SAFE',
          slopeClass: seg?.slopeClass || 'SAFE',
          direction: seg?.direction || 'FLAT',
          distanceM: seg?.distanceM ?? seg?.distM ?? 0,
          signedSlopeDeg: seg?.signedSlopeDeg ?? 0,
          slopeDeg: seg?.maxSlopeDeg ?? seg?.slopeDeg ?? 0,
          maxSlopeDeg: seg?.maxSlopeDeg || 0,
          deltaZ: seg?.deltaZ ?? seg?.elevationChangeM ?? 0,
          elevationChangeM: seg?.elevationChangeM || 0,
          costMultiplier: seg?.costMultiplier ?? 1.0
        };
      }).filter(s => !isNaN(s.p1.lat) && !isNaN(s.p1.lon) && !isNaN(s.p2.lat) && !isNaN(s.p2.lon));

      if (this.routeSegments.length > 0) {
        if (!isMidWalk && this.startPoint) {
          this.routeSegments[0].p1 = { lat: this.startPoint.lat, lon: this.startPoint.lon };
        }
        if (this.destPoint) {
          this.routeSegments[this.routeSegments.length - 1].p2 = { lat: this.destPoint.lat, lon: this.destPoint.lon };
        }
      }
    } else {
      this.routeSegments = null;
    }

    this.routeVisible = true;
    this.routeHoverInspection = null;
    this.isLayerBDirty = true;
  }

  clearRoute() {
    this.routePath = null;
    this.routeSegments = null;
    this.routeHoverInspection = null;
    this.isLayerBDirty = true;
  }

  setCorridorDiagnostics(diagData) {
    this.corridorDiagnostics = diagData || null;
    this.isLayerBDirty = true;
  }

  toggleCorridorDiagnostics(forceState = null) {
    if (forceState !== null && forceState !== undefined) {
      this.showCorridorDiagnostics = Boolean(forceState);
    } else {
      this.showCorridorDiagnostics = !this.showCorridorDiagnostics;
    }
    this.isLayerBDirty = true;
    return this.showCorridorDiagnostics;
  }

  toggleRouteVisibility() {
    this.routeVisible = !this.routeVisible;
    this.isLayerBDirty = true;
    return this.routeVisible;
  }

  setStartPoint(lat, lon) {
    this.startPoint = { lat, lon };
    this.isLayerBDirty = true;
  }

  setDestPoint(lat, lon) {
    this.destPoint = { lat, lon };
    this.isLayerBDirty = true;
  }

  clearStartPoint() {
    this.startPoint = null;
    this.isLayerBDirty = true;
  }

  clearDestPoint() {
    this.destPoint = null;
    this.isLayerBDirty = true;
  }

  enterSelectionMode(mode) {
    this.pointSelectionMode = mode;
    this.canvas.style.cursor = 'crosshair';
    this.isLayerDDirty = true;
  }

  cancelSelectionMode() {
    this.pointSelectionMode = null;
    this.canvas.style.cursor = 'grab';
    this.isLayerDDirty = true;
  }

  setPointFromSelection(lon, lat) {
    const normLon = ((lon % 360.0) + 360.0) % 360.0;
    const clampLat = Math.max(-89.99, Math.min(89.99, lat));
    const mode = this.pointSelectionMode;

    if (mode === 'start') {
      this.startPoint = { lat: clampLat, lon: normLon };
      if (this.routePath && this.routePath.length > 0) {
        this.routePath[0] = { lat: clampLat, lon: normLon };
        if (this.routeSegments && this.routeSegments.length > 0) {
          this.routeSegments[0].p1 = { lat: clampLat, lon: normLon };
        }
      }
    } else if (mode === 'dest') {
      this.destPoint = { lat: clampLat, lon: normLon };
      if (this.routePath && this.routePath.length > 0) {
        const lastIdx = this.routePath.length - 1;
        this.routePath[lastIdx] = { lat: clampLat, lon: normLon };
        if (this.routeSegments && this.routeSegments.length > 0) {
          this.routeSegments[this.routeSegments.length - 1].p2 = { lat: clampLat, lon: normLon };
        }
      }
    }

    this.pointSelectionMode = null;
    this.canvas.style.cursor = 'grab';
    this.isLayerBDirty = true;
    this.isLayerDDirty = true;

    if (this.options.onPointSelected) {
      this.options.onPointSelected(mode, { lat: clampLat, lon: normLon });
    }
  }

  _drawRoutePolyline(ctx, mapX, mapY, mapW, mapH) {
    if (!this.routePath || this.routePath.length < 2) return;

    ctx.save();

    // 1. Render Multi-Colored Polyline Segments (Specification Section 9)
    if (this.routeSegments && this.routeSegments.length > 0) {
      for (const seg of this.routeSegments) {
        if (Math.abs(seg.p1.lon - seg.p2.lon) > 180.0) continue; // Meridian boundary wrap

        const p1 = this.geoToScreen(seg.p1.lon, seg.p1.lat);
        const p2 = this.geoToScreen(seg.p2.lon, seg.p2.lat);
        const strokeColor = seg.color || '#10b981';

        // Outer glow
        ctx.save();
        ctx.shadowColor = strokeColor;
        ctx.shadowBlur = 8;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Inner crisp white core
        ctx.shadowBlur = 0;
        ctx.strokeStyle = MAP_UI_THEME.textPrimary;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.restore();
      }
    } else {
      // Fallback single continuous stroke
      ctx.shadowColor = 'rgba(16, 185, 129, 0.85)';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 4.0;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      let isDrawing = false;

      for (let i = 0; i < this.routePath.length; i++) {
        const pt = this.routePath[i];
        const scr = this.geoToScreen(pt.lon, pt.lat);

        if (i > 0) {
          const prev = this.routePath[i - 1];
          if (Math.abs(pt.lon - prev.lon) > 180.0) {
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(scr.x, scr.y);
            continue;
          }
        }

        if (!isDrawing) {
          ctx.moveTo(scr.x, scr.y);
          isDrawing = true;
        } else {
          ctx.lineTo(scr.x, scr.y);
        }
      }
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = MAP_UI_THEME.textPrimary;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // 2. Intermediate Waypoint Vertex Nodes (shows genuine terrain-following polyline structure)
    if (this.routePath.length > 2) {
      const wpStep = this.routePath.length > 60 ? Math.ceil(this.routePath.length / 40) : 1;
      for (let i = 1; i < this.routePath.length - 1; i += wpStep) {
        const pt = this.routePath[i];
        const scr = this.geoToScreen(pt.lon, pt.lat);
        ctx.fillStyle = pt.safetyClass === 'CAUTION' ? MAP_UI_THEME.textSecondary : MAP_UI_THEME.textPrimary;
        ctx.strokeStyle = MAP_UI_THEME.elevated;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(scr.x, scr.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // 3. Directional Chevrons along route
    const stepInterval = Math.max(2, Math.floor(this.routePath.length / 10));
    for (let i = stepInterval; i < this.routePath.length - 1; i += stepInterval) {
      const p1 = this.geoToScreen(this.routePath[i - 1].lon, this.routePath[i - 1].lat);
      const p2 = this.geoToScreen(this.routePath[i].lon, this.routePath[i].lat);
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

      ctx.save();
      ctx.translate(p2.x, p2.y);
      ctx.rotate(angle);
      ctx.fillStyle = MAP_UI_THEME.textSecondary;
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-5, -4);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-5, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Hover tooltip is exclusively rendered on Layer D (Interaction Canvas) to prevent re-dirtying Layer B route geometry

    ctx.restore();
  }

  /**
   * PART G — Optional Route-Corridor Safety Diagnostic Overlay
   * Renders:
   * 1. Safety corridor envelope (scaled to real geographic metres clearanceM)
   * 2. Rejected candidate route segments (dashed crimson lines)
   * 3. Sampled surrounding corridor cells color-coded by SAFE (green), CAUTION (muted), UNSAFE (red), UNKNOWN (gray)
   */
  _drawCorridorDiagnostics(ctx, mapX, mapY, mapW, mapH) {
    const diag = this.corridorDiagnostics;
    if (!diag) return;

    ctx.save();

    // 1. Draw Safety Corridor Envelope around active route
    const clearanceM = diag.clearanceM || 30000;
    const degHalfWidth = clearanceM / 59274.8; // Mars meters per degree latitude
    const pxRadius = Math.max(8, (degHalfWidth / 180.0) * mapH);

    if (this.routePath && this.routePath.length >= 2 && clearanceM > 0) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const isCaution = diag.corridorStatus === 'CAUTION_CORRIDOR';
      // Outer safety buffer (r3 = 1.00 * C)
      ctx.strokeStyle = isCaution ? themeRgba(MAP_UI_THEME.textSecondaryRgb, 0.16) : 'rgba(16, 185, 129, 0.16)';
      ctx.lineWidth = pxRadius * 2.0;
      ctx.beginPath();
      for (let i = 0; i < this.routePath.length; i++) {
        const scr = this.geoToScreen(this.routePath[i].lon, this.routePath[i].lat);
        if (i === 0) ctx.moveTo(scr.x, scr.y);
        else if (Math.abs(this.routePath[i].lon - this.routePath[i - 1].lon) <= 180) ctx.lineTo(scr.x, scr.y);
      }
      ctx.stroke();

      // Immediate neighborhood buffer (r1 = 0.40 * C)
      ctx.strokeStyle = isCaution ? themeRgba(MAP_UI_THEME.textSecondaryRgb, 0.24) : 'rgba(16, 185, 129, 0.22)';
      ctx.lineWidth = pxRadius * 0.80;
      ctx.stroke();
      ctx.restore();
    }

    // 2. Draw Rejected Candidate Routes (Part E & Part G)
    if (diag.rejectedCandidateRoutes && diag.rejectedCandidateRoutes.length > 0) {
      for (let rIdx = 0; rIdx < diag.rejectedCandidateRoutes.length; rIdx++) {
        const rej = diag.rejectedCandidateRoutes[rIdx];
        const pts = rej.latLonPath || [];
        if (pts.length < 2) continue;

        ctx.save();
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
        ctx.lineWidth = 2.4;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const scr = this.geoToScreen(pts[i].lon, pts[i].lat);
          if (i === 0) ctx.moveTo(scr.x, scr.y);
          else if (Math.abs(pts[i].lon - pts[i - 1].lon) <= 180) ctx.lineTo(scr.x, scr.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        const midPt = pts[Math.floor(pts.length / 2)];
        if (midPt) {
          const mScr = this.geoToScreen(midPt.lon, midPt.lat);
          const label = `${_tr('REJECTED', 'BỊ LOẠI')} #${rIdx + 1}: ${rej.status || 'UNSAFE'}`;
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = 'rgba(24, 8, 12, 0.90)';
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1;
          ctx.fillRect(mScr.x - tw / 2 - 4, mScr.y - 18, tw + 8, 14);
          ctx.strokeRect(mScr.x - tw / 2 - 4, mScr.y - 18, tw + 8, 14);
          ctx.fillStyle = '#fca5a5';
          ctx.fillText(label, mScr.x - tw / 2, mScr.y - 8);
        }
        ctx.restore();
      }
    }

    // 3. Draw sampled corridor cells: safe, muted caution, unsafe, or unknown.
    const samples = diag.corridorSamples || [];
    if (samples.length > 0) {
      const dotR = Math.max(2.2, Math.min(5.0, this.zoom * 1.1));
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const scr = this.geoToScreen(s.lon, s.lat);
        if (scr.x < -10 || scr.x > this.viewportWidth + 10 || scr.y < -10 || scr.y > this.viewportHeight + 10) continue;

        if (s.safetyClass === 'UNSAFE') {
          ctx.fillStyle = 'rgba(239, 68, 68, 0.88)';
        } else if (s.safetyClass === 'CAUTION') {
          ctx.fillStyle = themeRgba(MAP_UI_THEME.textSecondaryRgb, 0.78);
        } else if (s.safetyClass === 'UNKNOWN') {
          ctx.fillStyle = 'rgba(148, 163, 184, 0.75)';
        } else {
          ctx.fillStyle = 'rgba(16, 185, 129, 0.45)';
        }
        ctx.beginPath();
        ctx.arc(scr.x, scr.y, s.safetyClass === 'UNSAFE' ? dotR * 1.25 : dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  _drawRouteInspectionTooltip(ctx, x, y, pt) {
    if (!pt || pt.lat === undefined || pt.lon === undefined) return;
    ctx.save();

    // Determine status safely with fallbacks
    let status = 'SAFE';
    if (pt.survival && pt.survival.classificationLabel) {
      status = pt.survival.classificationLabel;
    } else if (pt.safetyClass) {
      status = pt.safetyClass;
    } else if (pt.slope !== undefined && !isNaN(pt.slope)) {
      status = pt.slope > 20 ? 'DANGEROUS' : (pt.slope > 10 ? 'CAUTION' : 'SAFE');
    }

    const color = status === 'SAFE' ? '#10b981' : (status === 'CAUTION' ? MAP_UI_THEME.textSecondary : '#ef4444');

    // Pulse indicator on ground
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = MAP_UI_THEME.textPrimary;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Floating tooltip card dimensions
    const boxW = 248;
    const boxH = 86;
    let boxX = x + 12;
    let boxY = y - boxH - 12;
    if (boxX + boxW > this.viewportWidth - 10) boxX = x - boxW - 12;
    if (boxY < 10) boxY = y + 16;

    ctx.fillStyle = MAP_UI_THEME.panel;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 6);
    ctx.fill();
    ctx.stroke();

    const wpIdxStr = (pt.index !== undefined) ? ` #${pt.index + 1}` : '';
    const slopeBadge = (pt.slopeClass && pt.slopeClass !== status) ? `${status} • ${pt.slopeClass}` : status;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = MAP_UI_THEME.textPrimary;
    ctx.fillText(`${_tr('Route Waypoint', 'Điểm hành trình')}${wpIdxStr} [${slopeBadge}]`, boxX + 8, boxY + 16);

    // Retrieve elevation, signed slope, and local slope safely
    let elevStr = 'N/A';
    let slopeStr = 'N/A';
    if (pt.elevation !== undefined && !isNaN(pt.elevation)) {
      elevStr = `${pt.elevation >= 0 ? '+' : ''}${Math.round(pt.elevation)} m`;
    }
    if (pt.slope !== undefined && !isNaN(pt.slope)) {
      slopeStr = `${Number(pt.slope).toFixed(1)}°`;
    }

    if ((elevStr === 'N/A' || slopeStr === 'N/A') && this.samplePixels) {
      try {
        const hoverMeta = this._buildSampleMeta();
        const sampleData = sampleScientificGrid(pt.lat, pt.lon, this.samplePixels, hoverMeta);
        if (sampleData) {
          if (elevStr === 'N/A' && sampleData.elevation !== undefined && !isNaN(sampleData.elevation)) {
            elevStr = `${sampleData.elevation >= 0 ? '+' : ''}${Math.round(sampleData.elevation)} m`;
          }
          if (slopeStr === 'N/A' && sampleData.slope !== undefined && !isNaN(sampleData.slope)) {
            slopeStr = `${Number(sampleData.slope).toFixed(1)}°`;
          }
        }
      } catch (_) {}
    }

    let signedStr = slopeStr;
    if (pt.signedSlopeDeg !== undefined && Number.isFinite(Number(pt.signedSlopeDeg))) {
      const sVal = Number(pt.signedSlopeDeg);
      const signPrefix = sVal > 0 ? '+' : '';
      const kVal = (pt.costMultiplier !== undefined && Number.isFinite(Number(pt.costMultiplier))) ? ` (K=${Number(pt.costMultiplier).toFixed(2)})` : '';
      signedStr = `${signPrefix}${sVal.toFixed(2)}°${kVal}`;
    }
    const dzStr = (pt.deltaZ !== undefined && Number.isFinite(Number(pt.deltaZ)))
      ? ` | Δz: ${pt.deltaZ >= 0 ? '+' : ''}${Math.round(pt.deltaZ)} m`
      : '';

    ctx.font = '10px monospace';
    ctx.fillStyle = MAP_UI_THEME.textPrimary;
    ctx.fillText(`${_tr('Elev', 'Độ cao')}: ${elevStr}${dzStr}`, boxX + 8, boxY + 34);
    ctx.fillStyle = MAP_UI_THEME.textSecondary;
    ctx.fillText(`${_tr('Signed θ', 'Góc θ')}: ${signedStr} | ${_tr('Local', 'Cục bộ')}: ${slopeStr}`, boxX + 8, boxY + 50);
    ctx.fillStyle = themeRgba(MAP_UI_THEME.textSecondaryRgb, 1);
    ctx.fillText(`${_tr('Lat', 'Vĩ độ')}: ${Number(pt.lat).toFixed(2)}° | ${_tr('Lon', 'Kinh độ')}: ${Number(pt.lon).toFixed(2)}°E`, boxX + 8, boxY + 66);

    ctx.restore();
  }

  _drawRouteEndpoints(ctx) {
    if (this.startPoint) {
      const scr = this.geoToScreen(this.startPoint.lon, this.startPoint.lat);
      this._drawEndpointMarker(ctx, scr.x, scr.y, 'S', '#22c55e', '#15803d', _tr('START', 'XUẤT PHÁT'));
    }
    if (this.destPoint) {
      const scr = this.geoToScreen(this.destPoint.lon, this.destPoint.lat);
      this._drawEndpointMarker(ctx, scr.x, scr.y, 'D', '#ef4444', '#b91c1c', _tr('DESTINATION', 'ĐIỂM ĐẾN'));
    }
  }

  _drawEndpointMarker(ctx, x, y, letter, strokeColor, fillColor, label) {
    ctx.save();

    // 1. Outer radar halo ring centered precisely at (x, y)
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.stroke();

    // 2. Precision reticle crosshairs centered at (x, y)
    ctx.strokeStyle = themeRgba(MAP_UI_THEME.textPrimaryRgb, 0.7);
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(x - 20, y); ctx.lineTo(x - 12, y);
    ctx.moveTo(x + 12, y); ctx.lineTo(x + 20, y);
    ctx.moveTo(x, y - 20); ctx.lineTo(x, y - 12);
    ctx.moveTo(x, y + 12); ctx.lineTo(x, y + 20);
    ctx.stroke();

    // 3. Main Circular Badge anchored directly at (x, y)
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = 12;
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = MAP_UI_THEME.textPrimary;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // 4. Centered Letter Badge ('S' or 'D') at exact center (x, y)
    ctx.fillStyle = MAP_UI_THEME.textPrimary;
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, x, y + 0.5);

    // 5. Label Tag Badge ('START' or 'DESTINATION') placed neatly above (x, y - 24)
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    const tagW = ctx.measureText(label).width + 8;
    ctx.fillStyle = MAP_UI_THEME.panel;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.0;
    ctx.fillRect(x - tagW / 2, y - 30, tagW, 14);
    ctx.strokeRect(x - tagW / 2, y - 30, tagW, 14);
    ctx.fillStyle = strokeColor;
    ctx.fillText(label, x, y - 22);

    ctx.restore();
  }

  _drawSelectionModeIndicator(ctx, w, h) {
    ctx.save();
    let title = _tr('SELECT TARGET POINT', 'CHỌN ĐIỂM MỤC TIÊU');
    let color = '#22c55e';
    if (this.pointSelectionMode === 'start') {
      title = _tr('SELECT START POINT (S)', 'CHỌN ĐIỂM XUẤT PHÁT (S)');
      color = '#22c55e';
    } else if (this.pointSelectionMode === 'dest') {
      title = _tr('SELECT DESTINATION (D)', 'CHỌN ĐIỂM ĐẾN (D)');
      color = '#ef4444';
    } else if (this.pointSelectionMode === 'storm') {
      title = _tr('PLACE DUST STORM CENTER', 'ĐẶT TÂM BÃO BỤI');
      color = MAP_UI_THEME.textSecondary;
    }
    const bannerW = 480;
    const bannerH = 34;
    const bx = (w - bannerW) / 2;
    const by = 20;

    ctx.fillStyle = MAP_UI_THEME.panel;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillRect(bx, by, bannerW, bannerH);
    ctx.strokeRect(bx, by, bannerW, bannerH);

    ctx.shadowBlur = 0;
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      _tr(
        `TARGET: ${title} - Click Mars map location (ESC to cancel)`,
        `MỤC TIÊU: ${title} - Nhấp chọn vị trí trên bản đồ (ESC để hủy)`
      ),
      w / 2,
      by + bannerH / 2
    );
    ctx.restore();
  }


  setSimulatedWalker(walker) {
    this.simulatedWalker = walker;
    this.isLayerCDirty = true;
  }

  clearSimulatedWalker() {
    this.simulatedWalker = null;
    this.isLayerCDirty = true;
  }

  _drawDustStorms(ctx, mapX, mapY, mapW, mapH) {
    const storms = globalDustStormSimulator.getActiveStorms();
    if (!storms || storms.length === 0) return;

    const simTime = globalDustStormSimulator.getSimulationTime();

    for (const storm of storms) {
      const center = globalDustStormSimulator.getStormCenterAt(storm, simTime);
      const scrCenter = this.geoToScreen(center.lon, center.lat);

      // Mars radius R_M = 3396.19 km.
      // 1 degree latitude = 59.274 km. Screen px per km:
      const pxPerKmY = (mapH / 180.0) / 59.274;
      const cosLat = Math.max(0.08, Math.cos((center.lat * Math.PI) / 180.0));
      const pxPerKmX = (mapW / 360.0) / (59.274 * cosLat);

      const radPxX = storm.radiusKm * pxPerKmX;
      const radPxY = storm.radiusKm * pxPerKmY;

      // Forecast Trajectory & Future Footprints (48-Hour Buffer Visualization)
      const forecast = globalDustStormSimulator.predictTrajectory(storm, 72.0, 12.0);
      if (forecast.length > 1) {
        ctx.save();
        ctx.strokeStyle = themeRgba(MAP_UI_THEME.textSecondaryRgb, 0.45);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        let first = true;
        for (const pt of forecast) {
          const sPt = this.geoToScreen(pt.lon, pt.lat);
          if (first) {
            ctx.moveTo(sPt.x, sPt.y);
            first = false;
          } else {
            ctx.lineTo(sPt.x, sPt.y);
          }
        }
        ctx.stroke();

        // 48-Hour Forecast Footprint Ring
        const pt48 = forecast.find(p => Math.abs(p.relativeHrs - 48.0) < 1.0) || forecast[forecast.length - 1];
        if (pt48) {
          const s48 = this.geoToScreen(pt48.lon, pt48.lat);
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.ellipse(s48.x, s48.y, Math.max(5, storm.radiusKm * pxPerKmX), Math.max(5, storm.radiusKm * pxPerKmY), 0, 0, Math.PI * 2);
          ctx.stroke();

          ctx.setLineDash([]);
          ctx.font = '8px "JetBrains Mono", monospace';
          ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
          ctx.textAlign = 'center';
          ctx.fillText(_tr('+48h Footprint', 'Vùng ảnh hưởng +48h'), s48.x, s48.y - storm.radiusKm * pxPerKmY - 4);
        }
        ctx.restore();
      }

      // Multi-Zone Storm Footprint (Geodesic Ellipse with True Atmospheric Safety Gradient)
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(scrCenter.x, scrCenter.y, Math.max(4, radPxX), Math.max(4, radPxY), 0, 0, Math.PI * 2);

      const grad = ctx.createRadialGradient(
        scrCenter.x, scrCenter.y, 0,
        scrCenter.x, scrCenter.y, Math.max(4, Math.max(radPxX, radPxY))
      );

      const isCoreUnsafe = (storm.deltaTauMax + 0.35 >= 2.0) || (storm.deltaVMax + 10.0 > 100.0);
      if (isCoreUnsafe) {
        grad.addColorStop(0.0, 'rgba(239, 68, 68, 0.40)'); // Deep Red Core
        grad.addColorStop(0.45, themeRgba(MAP_UI_THEME.textSecondaryRgb, 0.30));
        grad.addColorStop(0.85, themeRgba(MAP_UI_THEME.textSecondaryRgb, 0.15));
        grad.addColorStop(1.0, themeRgba(MAP_UI_THEME.textSecondaryRgb, 0.0));
      } else {
        grad.addColorStop(0.0, themeRgba(MAP_UI_THEME.textSecondaryRgb, 0.35));
        grad.addColorStop(0.7, themeRgba(MAP_UI_THEME.textSecondaryRgb, 0.18));
        grad.addColorStop(1.0, themeRgba(MAP_UI_THEME.textSecondaryRgb, 0.0));
      }

      ctx.fillStyle = grad;
      ctx.fill();

      // Outer boundary stroke
      ctx.strokeStyle = isCoreUnsafe ? 'rgba(239, 68, 68, 0.8)' : themeRgba(MAP_UI_THEME.textSecondaryRgb, 0.8);
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Directional Propagation Vector Arrow
      const arrowLenPx = Math.min(radPxX * 1.5, Math.max(35, 20 + storm.speedKmH * 0.9));
      const rad = ((storm.directionDeg - 90.0) * Math.PI) / 180.0;
      const arrowEndX = scrCenter.x + Math.cos(rad) * arrowLenPx;
      const arrowEndY = scrCenter.y + Math.sin(rad) * arrowLenPx;

      ctx.strokeStyle = MAP_UI_THEME.textPrimary;
      ctx.lineWidth = 2.4;
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(scrCenter.x, scrCenter.y);
      ctx.lineTo(arrowEndX, arrowEndY);
      ctx.stroke();

      // Arrow head
      const headAngle = Math.PI / 6;
      const headLen = 10;
      ctx.fillStyle = MAP_UI_THEME.textPrimary;
      ctx.beginPath();
      ctx.moveTo(arrowEndX, arrowEndY);
      ctx.lineTo(arrowEndX - headLen * Math.cos(rad - headAngle), arrowEndY - headLen * Math.sin(rad - headAngle));
      ctx.lineTo(arrowEndX - headLen * Math.cos(rad + headAngle), arrowEndY - headLen * Math.sin(rad + headAngle));
      ctx.closePath();
      ctx.fill();

      // Storm Center Vortex Glyph & Info Pill
      ctx.shadowBlur = 6;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.fillStyle = isCoreUnsafe ? '#ef4444' : MAP_UI_THEME.textSecondary;
      ctx.beginPath();
      ctx.arc(scrCenter.x, scrCenter.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = MAP_UI_THEME.textPrimary;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label Pill
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      const labelText = `${storm.name.toUpperCase()} (R=${storm.radiusKm}km, ${storm.speedKmH}km/h)`;
      const pillW = ctx.measureText(labelText).width + 10;
      ctx.fillStyle = MAP_UI_THEME.panel;
      ctx.strokeStyle = isCoreUnsafe ? '#ef4444' : MAP_UI_THEME.textSecondary;
      ctx.lineWidth = 1;
      ctx.fillRect(scrCenter.x - pillW / 2, scrCenter.y - 24, pillW, 14);
      ctx.strokeRect(scrCenter.x - pillW / 2, scrCenter.y - 24, pillW, 14);
      ctx.fillStyle = MAP_UI_THEME.textPrimary;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, scrCenter.x, scrCenter.y - 17);

      ctx.restore();
    }
  }

  _drawWalkingAstronaut(ctx) {
    if (!this.simulatedWalker) return;
    const { lat, lon, elapsedHrs, historyPath } = this.simulatedWalker;
    const scr = this.geoToScreen(lon, lat);

    ctx.save();

    // Historical route and current position use the muted telemetry color.
    if (historyPath && historyPath.length > 1) {
      ctx.save();
      ctx.strokeStyle = telemetryRgba(0.75);
      ctx.lineWidth = 3.0;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      let isFirst = true;
      for (const pt of historyPath) {
        const s = this.geoToScreen(pt.lon, pt.lat);
        if (isFirst) {
          ctx.moveTo(s.x, s.y);
          isFirst = false;
        } else {
          ctx.lineTo(s.x, s.y);
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    // High-contrast clean moving dot marker (Specification Part IV)
    // 1. Subtle Outer Glow
    ctx.fillStyle = telemetryRgba(0.35);
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, 7, 0, Math.PI * 2);
    ctx.fill();

    // 2. High-contrast crisp border ring
    ctx.strokeStyle = telemetryRgba(0.75);
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, 4.5, 0, Math.PI * 2);
    ctx.stroke();

    // 3. Bright high-contrast center core dot (Solid White)
    ctx.fillStyle = MAP_UI_THEME.textPrimary;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

}
