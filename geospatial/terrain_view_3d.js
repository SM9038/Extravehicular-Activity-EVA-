/**
 * MARS LARGE-SCALE 3D TERRAIN SIMULATION ENGINE
 * NASA Mars Explorer / EVA Marswalk
 *
 * Real-time WebGL large-area terrain heightfield displaced by actual MOLA elevation values.
 * Features:
 * - Large-scale regional landscape coverage (~450-500 km across, 8°x8° default)
 * - Configurable vertical exaggeration: Z_visual = Z_ref + E * (Z_actual - Z_ref)
 * - Real planetary horizontal scaling: R_mars = 3,389.5 km, lat/lon metric distance accounting
 * - 97x97 vertex heightfield (18,432 triangles) with central-difference surface normals
 * - Multi-mode shading: 0: Visual Satellite Mosaic, 1: MOLA Hypsometric Tint, 2: Slope Traversability
 * - Elevated oblique camera perspective with orbit, pan, zoom, and reset controls
 * - Tiny central astronaut beacon pin marker marking the dropped coordinates in the vast terrain
 * - Dynamic Level of Detail and WebGL memory lifecycle cleanup
 */

import { sampleScientificGrid } from './survivability.js';

export class MarsTerrainView3D {
  /**
   * @param {HTMLCanvasElement} canvas - Dedicated WebGL viewport canvas
   * @param {Object} options - Configuration options
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = options;
    this.samplePixels = options.samplePixels || null;
    this.datasetsMeta = options.datasetsMeta || null;

    // WebGL Context with fallback
    this.gl = canvas.getContext('webgl', { antialias: true, alpha: false, depth: true }) ||
              canvas.getContext('experimental-webgl', { antialias: true, alpha: false, depth: true }) ||
              canvas.getContext('webgl');

    if (!this.gl) {
      console.error('WebGL is not available for MarsTerrainView3D.');
      return;
    }

    // Planetary constants (IAU 2000 / MOLA MEGDR reference radius = 3,396.19 km)
    this.R_MARS_KM = 3396.19;
    this.DEG_TO_KM = (Math.PI * this.R_MARS_KM) / 180.0; // ~59.2747 km/deg

    // Simulation scale & coverage (Expanded 5x horizontal: 40.0° x 40.0°, ~2,366 km across, 25x surface area)
    this.extentDeg = options.extentDeg || 40.0; // Expanded to exactly 5x previous 8.0° = 40.0° x 40.0°
    this.gridSize = 97; // 97x97 vertices = 9,409 vertices, 18,432 triangles

    // Configurable vertical exaggeration factor E (default 5x)
    // Z_visual = Z_ref + E * (Z_actual - Z_ref)
    this.verticalExaggeration = options.verticalExaggeration || 5.0;

    // Camera state (Spherical coordinates around target)
    this.camera = {
      azimuth: 0.0,         // Radians (heading)
      pitch: -0.68,         // Radians (~39° down - elevated oblique landscape perspective)
      distance: 1800.0,     // Local kilometers from center (scaled for 40° extent)
      minDistance: 20.0,    // Zoom-in limit (20 km)
      maxDistance: 15000.0, // Zoom-out limit (15,000 km)
      target: [0, 0, 0]     // Center of terrain (km)
    };

    // Current location & cached elevation state
    this.currentLat = 0;
    this.currentLon = 0;
    this.centerElev = 0;
    this.minElev = 0;
    this.maxElev = 0;
    this.elevations = null; // Float32Array of raw MOLA elevation in meters
    this.renderMode = 0;    // 0: Surface/Viking, 1: Elevation Grayscale, 2: Slope Hazard

    // Interactive gesture state
    this.isDragging = false;
    this.isPanning = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.animFrameId = null;

    // WebGL Resources
    this.program = null;
    this.markerProgram = null;
    this.posBuffer = null;
    this.normBuffer = null;
    this.uvBuffer = null;
    this.indexBuffer = null;
    this.markerPosBuffer = null;
    this.texture = null;
    this.indexCount = 0;
    this.markerVertexCount = 0;

    this._initShaders();
    this._initMarkerShader();
    this._initEventListeners();
  }

  _initShaders() {
    const gl = this.gl;
    if (!gl) return;

    const vsSource = `
      attribute vec3 aPosition;
      attribute vec3 aNormal;
      attribute vec2 aUv;

      uniform mat4 uProjection;
      uniform mat4 uView;
      uniform mat4 uModel;

      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vUv;
      varying float vHeight;

      void main() {
        vUv = aUv;
        vNormal = mat3(uModel) * aNormal;
        vec4 worldPos = uModel * vec4(aPosition, 1.0);
        vPosition = worldPos.xyz;
        vHeight = aPosition.y;
        gl_Position = uProjection * uView * worldPos;
      }
    `;

    const fsSource = `
      precision highp float;

      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vUv;
      varying float vHeight;

      uniform sampler2D uTexture;
      uniform int uRenderMode; // 0: Surface Texture, 1: Elevation Tint, 2: Slope Hazard
      uniform vec3 uSunDirection;
      uniform vec3 uCameraPos;
      uniform float uMinElev;
      uniform float uMaxElev;
      uniform float uFar;

      void main() {
        vec3 N = normalize(vNormal);
        vec3 L = normalize(uSunDirection);
        vec3 V = normalize(uCameraPos - vPosition);
        vec3 H = normalize(L + V);

        // Directional Sun lighting (Martian direct solar beam)
        float NdotL = max(dot(N, L), 0.0);
        float diffuse = NdotL * 0.85;

        // Ambient with subtle warm Martian dust scatter
        vec3 ambientColor = vec3(0.24, 0.17, 0.13);
        float ambient = 0.28;

        // Specular sheen for rocky basalt facets
        float spec = pow(max(dot(N, H), 0.0), 32.0) * 0.12;

        vec4 baseColor;

        if (uRenderMode == 0) {
          // Visual surface mosaic
          baseColor = texture2D(uTexture, vUv);
        } else if (uRenderMode == 1) {
          // Scientific Elevation Grayscale / Hypsometric Tint
          float elevRange = max(1.0, uMaxElev - uMinElev);
          float normH = clamp((vHeight - uMinElev) / elevRange, 0.0, 1.0);
          vec3 lowTint = vec3(0.10, 0.16, 0.26);
          vec3 midTint = vec3(0.72, 0.45, 0.25);
          vec3 highTint = vec3(0.96, 0.92, 0.88);
          vec3 tint = (normH < 0.5)
            ? mix(lowTint, midTint, normH * 2.0)
            : mix(midTint, highTint, (normH - 0.5) * 2.0);
          baseColor = vec4(tint, 1.0);
        } else {
          // Slope Hazard Traversability Colormap (Astronaut mobility)
          float slopeRad = acos(clamp(dot(N, vec3(0.0, 1.0, 0.0)), 0.0, 1.0));
          float slopeDeg = slopeRad * 57.2957795;
          vec3 slopeColor;
          if (slopeDeg <= 8.0) {
            slopeColor = vec3(0.06, 0.72, 0.50); // Safe (< 8 deg)
          } else if (slopeDeg <= 18.0) {
            slopeColor = vec3(0.96, 0.62, 0.04); // Caution (8 - 18 deg)
          } else {
            slopeColor = vec3(0.93, 0.26, 0.26); // Unsafe (> 18 deg)
          }
          baseColor = vec4(slopeColor, 1.0);
        }

        // Combine lighting
        vec3 finalColor = baseColor.rgb * (ambientColor * ambient + vec3(1.0, 0.92, 0.84) * diffuse) + vec3(spec);

        // Distance atmospheric haze (Martian salmon dust sky blending at distant horizon)
        float dist = length(uCameraPos - vPosition);
        float haze = clamp((dist - uFar * 0.35) / (uFar * 0.65), 0.0, 0.60);
        vec3 hazeColor = vec3(0.68, 0.44, 0.34);
        finalColor = mix(finalColor, hazeColor, haze);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    function createShader(type, src) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    const vs = createShader(gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return;

    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(this.program));
      return;
    }

    this.attribs = {
      position: gl.getAttribLocation(this.program, 'aPosition'),
      normal: gl.getAttribLocation(this.program, 'aNormal'),
      uv: gl.getAttribLocation(this.program, 'aUv')
    };

    this.uniforms = {
      projection: gl.getUniformLocation(this.program, 'uProjection'),
      view: gl.getUniformLocation(this.program, 'uView'),
      model: gl.getUniformLocation(this.program, 'uModel'),
      texture: gl.getUniformLocation(this.program, 'uTexture'),
      renderMode: gl.getUniformLocation(this.program, 'uRenderMode'),
      sunDirection: gl.getUniformLocation(this.program, 'uSunDirection'),
      cameraPos: gl.getUniformLocation(this.program, 'uCameraPos'),
      minElev: gl.getUniformLocation(this.program, 'uMinElev'),
      maxElev: gl.getUniformLocation(this.program, 'uMaxElev'),
      far: gl.getUniformLocation(this.program, 'uFar')
    };
  }

  _initMarkerShader() {
    const gl = this.gl;
    if (!gl) return;

    const vsMarker = `
      attribute vec3 aPosition;
      uniform mat4 uProjection;
      uniform mat4 uView;
      void main() {
        gl_Position = uProjection * uView * vec4(aPosition, 1.0);
      }
    `;

    const fsMarker = `
      precision mediump float;
      uniform vec4 uMarkerColor;
      void main() {
        gl_FragColor = uMarkerColor;
      }
    `;

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }

    const vs = compile(gl.VERTEX_SHADER, vsMarker);
    const fs = compile(gl.FRAGMENT_SHADER, fsMarker);
    this.markerProgram = gl.createProgram();
    gl.attachShader(this.markerProgram, vs);
    gl.attachShader(this.markerProgram, fs);
    gl.linkProgram(this.markerProgram);

    this.markerAttribs = {
      position: gl.getAttribLocation(this.markerProgram, 'aPosition')
    };
    this.markerUniforms = {
      projection: gl.getUniformLocation(this.markerProgram, 'uProjection'),
      view: gl.getUniformLocation(this.markerProgram, 'uView'),
      color: gl.getUniformLocation(this.markerProgram, 'uMarkerColor')
    };
  }

  /**
   * Sets the vertical exaggeration factor and recomputes the heightfield geometry on the fly.
   * Z_visual = Z_reference + E * (Z_actual - Z_reference)
   * Visualization only: Never modifies original elevation, slope, or safety calculations.
   * @param {number} factor - Vertical exaggeration multiplier (e.g. 1.0 to 12.0)
   */
  setVerticalExaggeration(factor) {
    this.verticalExaggeration = Math.max(1.0, Math.min(15.0, factor));
    this._recomputeHeightfield();
    this.render();
  }

  /**
   * Changes the geographic coverage extent (e.g. 4°, 8°, 12°, 16°)
   * @param {number} extentDeg - Bounding box extent in degrees
   */
  setCoverageExtent(extentDeg) {
    this.extentDeg = Math.max(4.0, Math.min(60.0, extentDeg));
    if (this.currentLat !== null && this.currentLon !== null) {
      this.loadLocation(this.currentLat, this.currentLon);
    }
  }

  /**
   * Recomputes vertical height displacement and central-difference normals using current exaggeration
   * without re-sampling raster tiles from disk.
   */
  _recomputeHeightfield() {
    if (!this.elevations || !this.gl) return;

    const N = this.gridSize;
    const E = this.verticalExaggeration;
    const latScaleKm = this.DEG_TO_KM;
    const lonScaleKm = this.DEG_TO_KM * Math.cos((this.currentLat * Math.PI) / 180.0);
    const centerElev = this.centerElev;

    const positions = new Float32Array(N * N * 3);
    const normals = new Float32Array(N * N * 3);

    const latMin = Math.max(-89.9, this.currentLat - this.extentDeg / 2.0);
    const latMax = Math.min(89.9, this.currentLat + this.extentDeg / 2.0);
    const lonMin = this.currentLon - this.extentDeg / 2.0;
    const lonMax = this.currentLon + this.extentDeg / 2.0;

    let minH = Infinity;
    let maxH = -Infinity;

    for (let r = 0; r < N; r++) {
      const v = r / (N - 1);
      const sampleLat = latMax - v * (latMax - latMin);
      const yKm = (sampleLat - this.currentLat) * latScaleKm;

      for (let c = 0; c < N; c++) {
        const u = c / (N - 1);
        const sampleLon = lonMin + u * (lonMax - lonMin);
        const xKm = (sampleLon - this.currentLon) * lonScaleKm;

        const idx = r * N + c;
        const elevM = this.elevations[idx];

        // Z_visual = Z_reference + E * (Z_actual - Z_reference)
        const visualHeightKm = ((elevM - centerElev) / 1000.0) * E;

        positions[idx * 3 + 0] = xKm;
        positions[idx * 3 + 1] = visualHeightKm;
        positions[idx * 3 + 2] = -yKm; // North is -Z

        if (visualHeightKm < minH) minH = visualHeightKm;
        if (visualHeightKm > maxH) maxH = visualHeightKm;
      }
    }

    this.minElev = minH;
    this.maxElev = maxH;

    // Central difference normals
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const idx = r * N + c;
        const cLeft = Math.max(0, c - 1);
        const cRight = Math.min(N - 1, c + 1);
        const rUp = Math.max(0, r - 1);
        const rDown = Math.min(N - 1, r + 1);

        const hL = this.elevations[r * N + cLeft];
        const hR = this.elevations[r * N + cRight];
        const hU = this.elevations[rUp * N + c];
        const hD = this.elevations[rDown * N + c];

        const dx = (cRight - cLeft) * (this.extentDeg / (N - 1)) * lonScaleKm * 1000.0;
        const dy = (rDown - rUp) * (this.extentDeg / (N - 1)) * latScaleKm * 1000.0;

        const dh_dx = (hR - hL) / Math.max(1.0, dx);
        const dh_dy = (hU - hD) / Math.max(1.0, dy);

        let nx = -dh_dx * E;
        let ny = 1.0;
        let nz = dh_dy * E;
        const len = Math.hypot(nx, ny, nz);

        normals[idx * 3 + 0] = nx / len;
        normals[idx * 3 + 1] = ny / len;
        normals[idx * 3 + 2] = nz / len;
      }
    }

    // Stream updated subdata to GPU
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.normBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, normals);

    // Rebuild center marker pin at terrain surface (0, 0, 0)
    this._buildCenterMarker();
  }

  /**
   * Builds a distinct 3D beacon marker at the center (0, 0, 0) to represent the astronaut's position
   */
  _buildCenterMarker() {
    const gl = this.gl;
    if (!gl) return;

    // Pin beacon: vertical line from ground (Y=0) rising up ~12 km, plus small base cross
    const pinHeight = Math.max(15.0, (this.extentDeg * this.DEG_TO_KM) * 0.035);
    const markerLines = [
      // Vertical beacon stem
      0.0, 0.0, 0.0,
      0.0, pinHeight, 0.0,

      // Diamond head at the top
      0.0, pinHeight, 0.0,
      -pinHeight * 0.15, pinHeight * 0.85, 0.0,
      0.0, pinHeight, 0.0,
      pinHeight * 0.15, pinHeight * 0.85, 0.0,
      0.0, pinHeight, 0.0,
      0.0, pinHeight * 0.85, -pinHeight * 0.15,
      0.0, pinHeight, 0.0,
      0.0, pinHeight * 0.85, pinHeight * 0.15,

      // Base footprint ring / cross on terrain
      -pinHeight * 0.2, 0.1, 0.0,
      pinHeight * 0.2, 0.1, 0.0,
      0.0, 0.1, -pinHeight * 0.2,
      0.0, 0.1, pinHeight * 0.2
    ];

    const markerData = new Float32Array(markerLines);
    this.markerVertexCount = markerLines.length / 3;

    if (!this.markerPosBuffer) this.markerPosBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.markerPosBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, markerData, gl.STATIC_DRAW);
  }

  /**
   * Loads real MOLA elevation across the large surrounding geographic region (~450-500 km)
   * Centers the selected coordinate in that region and constructs the 3D landscape mesh.
   */
  loadLocation(lat, lon, sampleData = null, textureSource = null) {
    this.currentLat = lat;
    this.currentLon = ((lon % 360.0) + 360.0) % 360.0;

    const N = this.gridSize;
    const halfExtent = this.extentDeg / 2.0;
    const latMin = Math.max(-89.9, this.currentLat - halfExtent);
    const latMax = Math.min(89.9, this.currentLat + halfExtent);
    const lonMin = this.currentLon - halfExtent;
    const lonMax = this.currentLon + halfExtent;

    const latScaleKm = this.DEG_TO_KM;
    const lonScaleKm = this.DEG_TO_KM * Math.cos((this.currentLat * Math.PI) / 180.0);

    const positions = new Float32Array(N * N * 3);
    const normals = new Float32Array(N * N * 3);
    const uvs = new Float32Array(N * N * 2);
    this.elevations = new Float32Array(N * N);

    // 1. Sample elevation grid across the entire large geographic extent
    let centerSampleElev = 0;
    if (sampleData && typeof sampleData.elevation === 'number') {
      centerSampleElev = sampleData.elevation;
    } else if (this.samplePixels && this.datasetsMeta) {
      const sCenter = sampleScientificGrid(this.currentLat, this.currentLon, this.samplePixels, this.datasetsMeta);
      centerSampleElev = sCenter ? sCenter.elevation : 0;
    }
    this.centerElev = centerSampleElev;

    for (let r = 0; r < N; r++) {
      const v = r / (N - 1);
      const sampleLat = latMax - v * (latMax - latMin);

      for (let c = 0; c < N; c++) {
        const u = c / (N - 1);
        const sampleLon = lonMin + u * (lonMax - lonMin);

        let elevM = centerSampleElev;
        if (this.samplePixels && this.datasetsMeta) {
          const s = sampleScientificGrid(sampleLat, sampleLon, this.samplePixels, this.datasetsMeta);
          if (s && typeof s.elevation === 'number') elevM = s.elevation;
        }

        const idx = r * N + c;
        this.elevations[idx] = elevM;

        uvs[idx * 2 + 0] = u;
        uvs[idx * 2 + 1] = v;
      }
    }

    // 2. Build index buffer once
    const indices = new Uint16Array((N - 1) * (N - 1) * 6);
    let ptr = 0;
    for (let r = 0; r < N - 1; r++) {
      for (let c = 0; c < N - 1; c++) {
        const i0 = r * N + c;
        const i1 = i0 + 1;
        const i2 = (r + 1) * N + c;
        const i3 = i2 + 1;

        indices[ptr++] = i0;
        indices[ptr++] = i2;
        indices[ptr++] = i1;

        indices[ptr++] = i1;
        indices[ptr++] = i2;
        indices[ptr++] = i3;
      }
    }
    this.indexCount = indices.length;

    const gl = this.gl;
    if (!gl) return;

    if (!this.posBuffer) this.posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);

    if (!this.normBuffer) this.normBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.normBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.DYNAMIC_DRAW);

    if (!this.uvBuffer) this.uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);

    if (!this.indexBuffer) this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    // 3. Compute geometry with vertical exaggeration
    this._recomputeHeightfield();

    // 4. Update texture
    this._updateTexture(textureSource);

    // 5. Initial elevated oblique camera setup (viewing the broad landscape)
    const spanKm = Math.hypot(this.extentDeg * lonScaleKm, this.extentDeg * latScaleKm);
    this.camera.distance = spanKm * 0.72;
    this.camera.pitch = -0.68; // ~39° oblique
    this.camera.azimuth = 0.0;
    this.camera.target = [0, 0, 0];

    this.render();
  }

  _updateTexture(sourceImg) {
    const gl = this.gl;
    if (!gl) return;

    if (!this.texture) {
      this.texture = gl.createTexture();
    }
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);

    if (sourceImg && (sourceImg.complete || sourceImg instanceof ImageBitmap)) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceImg);
    } else {
      // Procedural Martian satellite regolith mosaic texture
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');

      const theme = getComputedStyle(document.documentElement);
      const canvasColor = theme.getPropertyValue('--bg-canvas').trim() || '#1f1e24';
      const elevatedColor = theme.getPropertyValue('--bg-elevated').trim() || '#2f2d38';
      const hoverColor = theme.getPropertyValue('--bg-hover').trim() || '#393742';
      const grad = ctx.createLinearGradient(0, 0, 512, 512);
      grad.addColorStop(0.0, elevatedColor);
      grad.addColorStop(0.35, hoverColor);
      grad.addColorStop(0.70, elevatedColor);
      grad.addColorStop(1.0, canvasColor);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);

      // Subtle geomorphological basalt specks
      ctx.fillStyle = 'rgba(224, 222, 244, 0.06)';
      for (let i = 0; i < 800; i++) {
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
      }
      ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
      for (let i = 0; i < 800; i++) {
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 2.5, 2.5);
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    }

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  _initEventListeners() {
    const canvas = this.canvas;
    if (!canvas) return;

    canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.isPanning = (e.button === 2 || e.shiftKey);
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      if (this.isPanning) {
        // Pan target along view plane
        const panSpeed = (this.camera.distance / 400.0);
        const cosA = Math.cos(this.camera.azimuth);
        const sinA = Math.sin(this.camera.azimuth);

        this.camera.target[0] -= (dx * cosA) * panSpeed;
        this.camera.target[2] += (dx * sinA) * panSpeed;
        this.camera.target[1] += dy * panSpeed;
      } else {
        // Orbit rotation
        this.camera.azimuth += dx * 0.007;
        this.camera.pitch += dy * 0.007;
        // Clamp pitch to maintain elevated oblique perspective
        this.camera.pitch = Math.max(-1.50, Math.min(-0.10, this.camera.pitch));
      }

      this.render();
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
      this.isPanning = false;
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Wheel zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 0.88 : 1.14;
      this.camera.distance = Math.max(
        this.camera.minDistance,
        Math.min(this.camera.maxDistance, this.camera.distance * zoomFactor)
      );
      this.render();
    }, { passive: false });

    // Touch support
    let touchDist = 0;
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.isPanning = false;
        this.lastMouseX = e.touches[0].clientX;
        this.lastMouseY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        touchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    });

    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && this.isDragging) {
        const dx = e.touches[0].clientX - this.lastMouseX;
        const dy = e.touches[0].clientY - this.lastMouseY;
        this.lastMouseX = e.touches[0].clientX;
        this.lastMouseY = e.touches[0].clientY;
        this.camera.azimuth += dx * 0.008;
        this.camera.pitch = Math.max(-1.50, Math.min(-0.10, this.camera.pitch + dy * 0.008));
        this.render();
      } else if (e.touches.length === 2) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (touchDist > 0) {
          const ratio = touchDist / d;
          this.camera.distance = Math.max(
            this.camera.minDistance,
            Math.min(this.camera.maxDistance, this.camera.distance * ratio)
          );
          this.render();
        }
        touchDist = d;
      }
    });

    canvas.addEventListener('touchend', () => {
      this.isDragging = false;
      touchDist = 0;
    });
  }

  /**
   * Resets the camera to the default elevated oblique bird's eye perspective
   */
  resetCamera() {
    const latScaleKm = this.DEG_TO_KM;
    const lonScaleKm = this.DEG_TO_KM * Math.cos((this.currentLat * Math.PI) / 180.0);
    const spanKm = Math.hypot(this.extentDeg * lonScaleKm, this.extentDeg * latScaleKm);

    this.camera.distance = spanKm * 0.72;
    this.camera.pitch = -0.68;
    this.camera.azimuth = 0.0;
    this.camera.target = [0, 0, 0];
    this.render();
  }

  setRenderMode(mode) {
    this.renderMode = mode;
    this.render();
  }

  render() {
    const gl = this.gl;
    if (!gl || !this.program) return;

    const w = this.canvas.clientWidth || 600;
    const h = this.canvas.clientHeight || 450;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    gl.viewport(0, 0, w, h);
    gl.clearColor(0.04, 0.06, 0.10, 1.0);
    gl.clearDepth(1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const fov = 48.0 * (Math.PI / 180.0);
    const aspect = w / Math.max(1, h);
    const near = 2.0;
    const far = Math.max(8000.0, this.camera.distance * 4.0);

    // 1. Projection Matrix
    const proj = this._createPerspectiveMatrix(fov, aspect, near, far);

    // 2. Camera Eye Position
    const cosP = Math.cos(this.camera.pitch);
    const sinP = Math.sin(this.camera.pitch);
    const cosA = Math.cos(this.camera.azimuth);
    const sinA = Math.sin(this.camera.azimuth);

    const eyeX = this.camera.target[0] + this.camera.distance * cosP * sinA;
    const eyeY = this.camera.target[1] - this.camera.distance * sinP;
    const eyeZ = this.camera.target[2] + this.camera.distance * cosP * cosA;

    // 3. View Matrix (LookAt)
    const view = this._createLookAtMatrix([eyeX, eyeY, eyeZ], this.camera.target, [0, 1, 0]);

    // 4. Render Main Terrain Heightfield Mesh
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.projection, false, proj);
    gl.uniformMatrix4fv(this.uniforms.view, false, view);

    const model = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
    gl.uniformMatrix4fv(this.uniforms.model, false, model);

    gl.uniform1i(this.uniforms.renderMode, this.renderMode);
    gl.uniform3f(this.uniforms.sunDirection, 0.45, 0.85, 0.28);
    gl.uniform3f(this.uniforms.cameraPos, eyeX, eyeY, eyeZ);
    gl.uniform1f(this.uniforms.minElev, this.minElev);
    gl.uniform1f(this.uniforms.maxElev, this.maxElev);
    gl.uniform1f(this.uniforms.far, far);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uniforms.texture, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.enableVertexAttribArray(this.attribs.position);
    gl.vertexAttribPointer(this.attribs.position, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.normBuffer);
    gl.enableVertexAttribArray(this.attribs.normal);
    gl.vertexAttribPointer(this.attribs.normal, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.enableVertexAttribArray(this.attribs.uv);
    gl.vertexAttribPointer(this.attribs.uv, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);

    // 5. Render Central Astronaut Beacon Pin Marker
    if (this.markerProgram && this.markerPosBuffer && this.markerVertexCount > 0) {
      gl.useProgram(this.markerProgram);
      gl.uniformMatrix4fv(this.markerUniforms.projection, false, proj);
      gl.uniformMatrix4fv(this.markerUniforms.view, false, view);
      gl.uniform4f(this.markerUniforms.color, 0.98, 0.75, 0.15, 1.0); // Amber/gold astronaut pin

      gl.bindBuffer(gl.ARRAY_BUFFER, this.markerPosBuffer);
      gl.enableVertexAttribArray(this.markerAttribs.position);
      gl.vertexAttribPointer(this.markerAttribs.position, 3, gl.FLOAT, false, 0, 0);

      gl.lineWidth(2.5);
      gl.drawArrays(gl.LINES, 0, this.markerVertexCount);
    }
  }

  // --- Linear Algebra Helpers ---
  _createPerspectiveMatrix(fov, aspect, near, far) {
    const f = 1.0 / Math.tan(fov / 2.0);
    const nf = 1.0 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, (2.0 * far * near) * nf, 0
    ]);
  }

  _createLookAtMatrix(eye, target, up) {
    let z0 = eye[0] - target[0];
    let z1 = eye[1] - target[1];
    let z2 = eye[2] - target[2];
    let len = Math.hypot(z0, z1, z2);
    if (len > 0) { z0 /= len; z1 /= len; z2 /= len; }

    let x0 = up[1] * z2 - up[2] * z1;
    let x1 = up[2] * z0 - up[0] * z2;
    let x2 = up[0] * z1 - up[1] * z0;
    len = Math.hypot(x0, x1, x2);
    if (len > 0) { x0 /= len; x1 /= len; x2 /= len; }

    const y0 = z1 * x2 - z2 * x1;
    const y1 = z2 * x0 - z0 * x2;
    const y2 = z0 * x1 - z1 * x0;

    return new Float32Array([
      x0, y0, z0, 0,
      x1, y1, z1, 0,
      x2, y2, z2, 0,
      -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]),
      -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]),
      -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]),
      1
    ]);
  }

  /**
   * Complete GPU resource cleanup
   */
  destroy() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    const gl = this.gl;
    if (gl) {
      if (this.posBuffer) gl.deleteBuffer(this.posBuffer);
      if (this.normBuffer) gl.deleteBuffer(this.normBuffer);
      if (this.uvBuffer) gl.deleteBuffer(this.uvBuffer);
      if (this.indexBuffer) gl.deleteBuffer(this.indexBuffer);
      if (this.markerPosBuffer) gl.deleteBuffer(this.markerPosBuffer);
      if (this.texture) gl.deleteTexture(this.texture);
      if (this.program) gl.deleteProgram(this.program);
      if (this.markerProgram) gl.deleteProgram(this.markerProgram);
    }
    this.posBuffer = null;
    this.normBuffer = null;
    this.uvBuffer = null;
    this.indexBuffer = null;
    this.markerPosBuffer = null;
    this.texture = null;
    this.program = null;
    this.markerProgram = null;
  }
}
