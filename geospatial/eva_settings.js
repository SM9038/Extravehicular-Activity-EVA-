/**
 * Eva Marswalk Shared Settings & Theme Persistence System
 * Shared across:
 * - 2D Map (mars_2d_map.html)
 * - 3D Globe Explorer (mars_3d_map.html)
 * 
 * Manages:
 * 1. Appearance (7-Theme Design System selector, live preview, default restore)
 * 2. Maps & Offline Data (LOD resolution, offline dataset status, Future Developments)
 * 3. Navigation & Sensors (Future Developments)
 * 4. Profile & Vehicle Constraints (Astronaut vs Rover vs Scout profiles, active Maximum Slope connected to signed-slope directional cost engine)
 * 5. Power & Performance (60 FPS vs 30 FPS Eco-Nav, Safe texture cache clearing)
 * 6. Safety & Survival (Dust storm threshold, Oxygen reserve buffer, shelter search in Future Developments)
 * 7. UI / HUD Display (HUD density, high contrast night mode)
 * 8. Future Developments (Comprehensive catalog of hardware/API dependent features)
 */

export const STORAGE_KEY = 'eva_mars_settings';
export const DEFAULT_THEME_ID = 'rose-pine-dusk';

export const DEFAULT_SETTINGS = {
  theme: DEFAULT_THEME_ID,
  movementProfile: 'astronaut', // astronaut, rover, scout
  maxSafeSlopeDeg: 22.0,
  routeSafetyClearanceM: 30000, // 30,000 m (~1.01x global 0.5° MOLA DEM cell spacing of 29,637 m; application-level assumption, not NASA-certified)
  maxCautionDensity: 0.35,      // 35% maximum allowed CAUTION sample concentration in corridor
  maxUnknownCoverage: 0.15,     // 15% maximum allowed UNKNOWN/NoData coverage under conservative policy
  performanceMode: 'performance', // performance (60fps), eco (30fps)
  dustStormThreshold: 2.2,
  oxygenBufferRatio: 0.20,
  hudDensity: 'standard', // standard, compact
  terrainQuality: 'high' // high, medium, low
};

const _tr = (en, vi) => (typeof window !== 'undefined' && window.evaTr ? window.evaTr(en, vi) : en);

const FALLBACK_THEMES = [
  { id: 'cartographic-paper', name: 'Cartographic Paper', canvas: '#f0ede6', panel: 'rgba(248, 246, 241, 0.90)', elevated: '#e5e0d5', border: '#d1cbc0', textPrimary: '#222426', textSecondary: '#5c6066', accent: '#2c6e63', telemetry: '#b85635', evaGradient: 'linear-gradient(135deg, #1b433c 0%, #2c6e63 55%, #b85635 100%)' },
  { id: 'rose-pine-dusk', name: 'Rosé Pine Moon / Dusk', canvas: '#1f1e24', panel: 'rgba(38, 37, 45, 0.88)', elevated: '#2f2d38', border: '#3d3b47', textPrimary: '#e0def4', textSecondary: '#9a96b0', accent: '#e2b878', telemetry: '#d68585', evaGradient: 'linear-gradient(135deg, #f6c177 0%, #ebbcba 50%, #c4a7e7 100%)' },
  { id: 'studio-graphite', name: 'Studio Graphite & Muted Sage', canvas: '#18191b', panel: 'rgba(31, 33, 37, 0.88)', elevated: '#272a30', border: '#32363e', textPrimary: '#e4e5e7', textSecondary: '#9ca0a8', accent: '#68b893', telemetry: '#d4a359', evaGradient: 'linear-gradient(135deg, #98e0be 0%, #68b893 55%, #d4a359 100%)' },
  { id: 'usgs-light', name: 'USGS Cartographic Light', canvas: '#f4f1ea', panel: 'rgba(255, 255, 255, 0.92)', elevated: '#ebe6dc', border: '#d6cfc2', textPrimary: '#1c1917', textSecondary: '#57534e', accent: '#c2410c', telemetry: '#0f766e', evaGradient: 'linear-gradient(135deg, #7c2d12 0%, #c2410c 55%, #0f766e 100%)' },
  { id: 'martian-regolith', name: 'Martian Regolith', canvas: '#14100e', panel: 'rgba(31, 25, 22, 0.88)', elevated: '#29211d', border: '#382d27', textPrimary: '#efe5dc', textSecondary: '#a8988c', accent: '#e06d44', telemetry: '#d99b52', evaGradient: 'linear-gradient(135deg, #f7a47c 0%, #e06d44 55%, #d99b52 100%)' },
  { id: 'nasa-jpl', name: 'NASA JPL Tactical', canvas: '#0b0b0d', panel: 'rgba(20, 20, 23, 0.88)', elevated: '#1c1c21', border: '#27272a', textPrimary: '#f4f4f5', textSecondary: '#a1a1aa', accent: '#f59e0b', telemetry: '#ef4444', evaGradient: 'linear-gradient(135deg, #fde047 0%, #f59e0b 55%, #ef4444 100%)' },
  { id: 'classic-ai', name: 'Classic', canvas: '#0b1120', panel: 'rgba(15, 23, 42, 0.88)', elevated: '#1e293b', border: '#334155', textPrimary: '#f8fafc', textSecondary: '#94a3b8', accent: '#38bdf8', telemetry: '#eab308', evaGradient: 'linear-gradient(135deg, #bae6fd 0%, #38bdf8 50%, #818cf8 100%)' }
];

function getThemeCatalog() {
  if (typeof window !== 'undefined' && window.EvaTheme && Array.isArray(window.EvaTheme.THEMES)) {
    return window.EvaTheme.THEMES;
  }
  return FALLBACK_THEMES;
}

function getActiveThemeId(preferredId) {
  if (typeof window !== 'undefined' && window.EvaTheme) {
    if (preferredId && window.EvaTheme.isValidTheme(preferredId)) return preferredId;
    return window.EvaTheme.getTheme();
  }
  const found = FALLBACK_THEMES.find(t => t.id === preferredId);
  return found ? found.id : DEFAULT_THEME_ID;
}

export const VEHICLE_PROFILES = {
  astronaut: {
    get name() { return _tr('Astronaut EVA (NASA xEMU Standard)', 'Phi Hành Gia EVA (Chuẩn NASA xEMU)'); },
    speedMS: 1.2,
    massKg: 135.0,
    defaultMaxSlope: 22.0,
    get desc() { return _tr('Human pedestrian exploration with pressurized life support suit. Hard uphill cliff limit at 22.0°.', 'Khám phá bộ hành với bộ đồ bảo hộ điều áp. Giới hạn leo dốc tối đa ở 22.0°.'); }
  },
  rover: {
    get name() { return _tr('Robotic Rover (Curiosity / Perseverance Class)', 'Xe Tự Hành Robot (Lớp Curiosity / Perseverance)'); },
    speedMS: 0.3,
    massKg: 899.0,
    defaultMaxSlope: 15.0,
    get desc() { return _tr('Heavy wheeled robotic science laboratory. Conservative tipping threshold at 15.0° slope.', 'Phòng thí nghiệm tự hành bánh lốp hạng nặng. Ngưỡng chống lật an toàn ở độ dốc 15.0°.'); }
  },
  scout: {
    get name() { return _tr('Agile Scout (Lightweight Mobility EVA)', 'Trinh Sát Cơ Động (EVA Gọn Nhẹ)'); },
    speedMS: 1.8,
    massKg: 90.0,
    defaultMaxSlope: 28.0,
    get desc() { return _tr('High-mobility athletic astronaut profile for steep crater rim surveys up to 28.0° slope.', 'Cấu hình phi hành gia cơ động cao khảo sát vành miệng hố dốc tới 28.0°.'); }
  }
};

export function sanitizeMaxSlopeDeg(val, fallback = 22.0) {
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.max(5.0, Math.min(35.0, Math.round(num * 10) / 10));
}

export function sanitizeClearanceM(val, fallback = 30000) {
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.max(0, Math.min(120000, Math.round(num / 500) * 500));
}

export function sanitizeRatio(val, fallback = 0.35, min = 0.05, max = 0.95) {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num * 100) / 100));
}

export class EvaSettingsManager {
  constructor(options = {}) {
    this.is3D = Boolean(options.is3D);
    this.onSettingsChanged = options.onSettingsChanged || null;
    this.activeTab = 'appearance';
    this.settings = this.loadSettings();
    this.initDOM();
    this.applySettings(this.settings, false);
    if (typeof window !== 'undefined' && window.onEvaLangChange) {
      window.onEvaLangChange(() => {
        this._refreshLocalization();
      });
    }
    if (typeof window !== 'undefined' && window.onEvaThemeChange) {
      window.onEvaThemeChange((themeId) => {
        this.settings.theme = themeId;
        this._syncUIFromState();
      });
    }
  }

  loadSettings() {
    const activeTheme = getActiveThemeId();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const { backgroundColor: _legacyBg, ...rest } = parsed;
        return {
          ...DEFAULT_SETTINGS,
          ...rest,
          theme: activeTheme,
          maxSafeSlopeDeg: sanitizeMaxSlopeDeg(parsed.maxSafeSlopeDeg, DEFAULT_SETTINGS.maxSafeSlopeDeg),
          routeSafetyClearanceM: sanitizeClearanceM(parsed.routeSafetyClearanceM, DEFAULT_SETTINGS.routeSafetyClearanceM),
          maxCautionDensity: sanitizeRatio(parsed.maxCautionDensity, DEFAULT_SETTINGS.maxCautionDensity, 0.05, 0.90),
          maxUnknownCoverage: sanitizeRatio(parsed.maxUnknownCoverage, DEFAULT_SETTINGS.maxUnknownCoverage, 0.01, 0.50)
        };
      }
    } catch (_) {}
    return { ...DEFAULT_SETTINGS, theme: activeTheme };
  }

  saveSettings(newSettings) {
    const merged = { ...this.settings, ...newSettings };
    if (newSettings.theme !== undefined) {
      merged.theme = getActiveThemeId(newSettings.theme);
    } else {
      merged.theme = getActiveThemeId(merged.theme);
    }
    if (merged.maxSafeSlopeDeg !== undefined) {
      merged.maxSafeSlopeDeg = sanitizeMaxSlopeDeg(merged.maxSafeSlopeDeg, this.settings.maxSafeSlopeDeg);
    }
    if (merged.routeSafetyClearanceM !== undefined) {
      merged.routeSafetyClearanceM = sanitizeClearanceM(merged.routeSafetyClearanceM, this.settings.routeSafetyClearanceM);
    }
    if (merged.maxCautionDensity !== undefined) {
      merged.maxCautionDensity = sanitizeRatio(merged.maxCautionDensity, this.settings.maxCautionDensity, 0.05, 0.90);
    }
    if (merged.maxUnknownCoverage !== undefined) {
      merged.maxUnknownCoverage = sanitizeRatio(merged.maxUnknownCoverage, this.settings.maxUnknownCoverage, 0.01, 0.50);
    }
    this.settings = merged;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (_) {}
    this.applySettings(this.settings, true);
    if (typeof this.onSettingsChanged === 'function') {
      this.onSettingsChanged(this.settings);
    }
  }

  setMaxSafeSlope(deg) {
    const cleanDeg = sanitizeMaxSlopeDeg(deg, this.settings.maxSafeSlopeDeg);
    this.saveSettings({ maxSafeSlopeDeg: cleanDeg });
    this._syncUIFromState();
    return cleanDeg;
  }

  setRouteSafetyClearance(meters) {
    const cleanM = sanitizeClearanceM(meters, this.settings.routeSafetyClearanceM);
    this.saveSettings({ routeSafetyClearanceM: cleanM });
    this._syncUIFromState();
    return cleanM;
  }

  setMaxCautionDensity(ratio) {
    const cleanR = sanitizeRatio(ratio, this.settings.maxCautionDensity, 0.05, 0.90);
    this.saveSettings({ maxCautionDensity: cleanR });
    this._syncUIFromState();
    return cleanR;
  }

  setMaxUnknownCoverage(ratio) {
    const cleanU = sanitizeRatio(ratio, this.settings.maxUnknownCoverage, 0.01, 0.50);
    this.saveSettings({ maxUnknownCoverage: cleanU });
    this._syncUIFromState();
    return cleanU;
  }

  getCorridorSafetyConfig() {
    const c = sanitizeClearanceM(this.settings.routeSafetyClearanceM, DEFAULT_SETTINGS.routeSafetyClearanceM);
    return {
      routeSafetyClearanceM: c,
      immediateRadiusM: Math.round(c * 0.40),
      intermediateRadiusM: Math.round(c * 0.75),
      outerRadiusM: c,
      maxCautionDensity: sanitizeRatio(this.settings.maxCautionDensity, DEFAULT_SETTINGS.maxCautionDensity, 0.05, 0.90),
      maxUnknownCoverage: sanitizeRatio(this.settings.maxUnknownCoverage, DEFAULT_SETTINGS.maxUnknownCoverage, 0.01, 0.50)
    };
  }

  getDerivedSlopeThresholds(maxSlopeDeg = this.settings.maxSafeSlopeDeg) {
    const thetaMax = sanitizeMaxSlopeDeg(maxSlopeDeg, 22.0);
    const thetaMaxUp = thetaMax;
    const thetaMaxDown = Math.round(thetaMax * 0.75 * 100) / 100;
    const thetaRef = Math.round(thetaMax * 0.40 * 100) / 100;
    const thetaRefDown = Math.round(thetaRef * 0.50 * 100) / 100;
    return {
      thetaMax,
      thetaMaxUp,
      thetaMaxDown,
      thetaRef,
      thetaRefDown
    };
  }

  applySettings(s, notify = true) {
    const slopeDeg = sanitizeMaxSlopeDeg(s.maxSafeSlopeDeg, 22.0);
    s.maxSafeSlopeDeg = slopeDeg;

    // 1. Synchronize active 7-theme CSS design tokens (without touching map shaders/colors)
    const targetTheme = getActiveThemeId(s.theme);
    s.theme = targetTheme;
    if (typeof window !== 'undefined' && window.EvaTheme) {
      if (window.EvaTheme.getTheme() !== targetTheme) {
        window.EvaTheme.setTheme(targetTheme, { persist: true, notify: true });
      }
    } else if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = targetTheme;
    }

    // Clear any legacy inline background overrides so CSS --bg-canvas takes full control
    if (typeof document !== 'undefined') {
      document.body.style.backgroundColor = '';
      const mainContainer = document.getElementById('mapContainer') || document.getElementById('canvas-container');
      if (mainContainer) mainContainer.style.backgroundColor = '';
      const spaceBg = document.getElementById('space-bg');
      if (spaceBg) spaceBg.style.backgroundColor = '';
    }

    // 2. Performance mode: target FPS
    if (window.state && window.state.map) {
      if (s.performanceMode === 'eco') {
        window.state.map.targetFPS = 30;
      } else {
        window.state.map.targetFPS = 60;
      }
    }

    // 3. Synchronize Maximum Slope & Corridor Safety with all pathfinding engines, worker, and caches (Part D)
    const clearanceM = sanitizeClearanceM(s.routeSafetyClearanceM, DEFAULT_SETTINGS.routeSafetyClearanceM);
    const maxCautionDensity = sanitizeRatio(s.maxCautionDensity, DEFAULT_SETTINGS.maxCautionDensity, 0.05, 0.90);
    const maxUnknownCoverage = sanitizeRatio(s.maxUnknownCoverage, DEFAULT_SETTINGS.maxUnknownCoverage, 0.01, 0.50);
    s.routeSafetyClearanceM = clearanceM;
    s.maxCautionDensity = maxCautionDensity;
    s.maxUnknownCoverage = maxUnknownCoverage;

    if (window.state) {
      if (window.state.walkerParameters) {
        window.state.walkerParameters.maxSafeSlopeDeg = slopeDeg;
        window.state.walkerParameters.routeSafetyClearanceM = clearanceM;
        window.state.walkerParameters.maxCautionDensity = maxCautionDensity;
        window.state.walkerParameters.maxUnknownCoverage = maxUnknownCoverage;
      }
      if (window.state.map && window.state.map.planner) {
        window.state.map.planner.setMaxSafeSlope(slopeDeg);
        if (typeof window.state.map.planner.setCorridorSafetyConfig === 'function') {
          window.state.map.planner.setCorridorSafetyConfig({
            routeSafetyClearanceM: clearanceM,
            maxCautionDensity,
            maxUnknownCoverage
          });
        }
      }
    }
    if (window.localPlanner) {
      if (typeof window.localPlanner.setMaxSafeSlope === 'function') {
        window.localPlanner.setMaxSafeSlope(slopeDeg);
      }
      if (typeof window.localPlanner.setCorridorSafetyConfig === 'function') {
        window.localPlanner.setCorridorSafetyConfig({
          routeSafetyClearanceM: clearanceM,
          maxCautionDensity,
          maxUnknownCoverage
        });
      }
    }
    if (window.routeWorker && typeof window.routeWorker.postMessage === 'function') {
      try {
        window.routeWorker.postMessage({
          type: 'SET_MAX_SLOPE',
          maxSafeSlopeDeg: slopeDeg,
          routeSafetyClearanceM: clearanceM,
          maxCautionDensity,
          maxUnknownCoverage
        });
      } catch (_) {}
    }
    if (typeof window.clearTransitionCostCache === 'function') {
      window.clearTransitionCostCache();
    }

    this._updateDerivedSlopeLabels(slopeDeg);
    this._updateCorridorSafetyLabels(s);

    if (notify && typeof window.onMaxSlopeSettingChanged === 'function') {
      window.onMaxSlopeSettingChanged(slopeDeg, this.getDerivedSlopeThresholds(slopeDeg));
    }
  }

  _updateDerivedSlopeLabels(slopeDeg = this.settings.maxSafeSlopeDeg) {
    const d = this.getDerivedSlopeThresholds(slopeDeg);
    const slopeVal = document.getElementById('settingsMaxSlopeValue');
    const slopeInput = document.getElementById('settingsMaxSlopeInput');
    const slopeSlider = document.getElementById('settingsMaxSlopeSlider');
    const upEl = document.getElementById('settingsDerivedMaxUphill');
    const downEl = document.getElementById('settingsDerivedMaxDownhill');
    const refEl = document.getElementById('settingsDerivedThetaRef');
    const downRefEl = document.getElementById('settingsDerivedDownhillRef');

    if (slopeVal) slopeVal.textContent = `${d.thetaMax.toFixed(1)}°`;
    if (slopeInput && document.activeElement !== slopeInput) slopeInput.value = d.thetaMax.toFixed(1);
    if (slopeSlider && document.activeElement !== slopeSlider) slopeSlider.value = d.thetaMax;
    if (upEl) upEl.textContent = `+${d.thetaMaxUp.toFixed(2)}°`;
    if (downEl) downEl.textContent = `-${d.thetaMaxDown.toFixed(2)}°`;
    if (refEl) refEl.textContent = `+${d.thetaRef.toFixed(2)}°`;
    if (downRefEl) downRefEl.textContent = `-${d.thetaRefDown.toFixed(2)}°`;
  }

  _updateCorridorSafetyLabels(s = this.settings) {
    const cfg = this.getCorridorSafetyConfig();
    const clrVal = document.getElementById('settingsCorridorClearanceValue');
    const clrInp = document.getElementById('settingsCorridorClearanceInput');
    const clrSlider = document.getElementById('settingsCorridorClearanceSlider');
    const r1El = document.getElementById('settingsDerivedRadiusR1');
    const r2El = document.getElementById('settingsDerivedRadiusR2');
    const r3El = document.getElementById('settingsDerivedRadiusR3');
    const cautInp = document.getElementById('settingsMaxCautionDensityInput');
    const unkInp = document.getElementById('settingsMaxUnknownCoverageInput');

    if (clrVal) clrVal.textContent = `${cfg.routeSafetyClearanceM.toLocaleString()} m`;
    if (clrInp && document.activeElement !== clrInp) clrInp.value = cfg.routeSafetyClearanceM;
    if (clrSlider && document.activeElement !== clrSlider) clrSlider.value = cfg.routeSafetyClearanceM;
    if (r1El) r1El.textContent = `${cfg.immediateRadiusM.toLocaleString()} m`;
    if (r2El) r2El.textContent = `${cfg.intermediateRadiusM.toLocaleString()} m`;
    if (r3El) r3El.textContent = `${cfg.outerRadiusM.toLocaleString()} m`;
    if (cautInp && document.activeElement !== cautInp) cautInp.value = Math.round(cfg.maxCautionDensity * 100);
    if (unkInp && document.activeElement !== unkInp) unkInp.value = Math.round(cfg.maxUnknownCoverage * 100);
  }

  initDOM() {
    if (!document.getElementById('btnOpenSettings')) {
      const btn = document.createElement('button');
      btn.id = 'btnOpenSettings';
      btn.className = 'fixed bottom-4 left-4 z-40 glass-panel px-3 py-2 rounded-xl text-primary hover:text-primary hover:border-accent flex items-center gap-2 text-xs font-bold transition-all shadow-2xl cursor-pointer group';
      btn.innerHTML = `
        <span class="text-sm group-hover:rotate-45 transition-transform duration-300">⚙️</span>
        <span id="btnOpenSettingsLabel">${_tr('Settings', 'Cài đặt')}</span>
      `;
      btn.onclick = () => this.openModal();
      document.body.appendChild(btn);
    } else {
      document.getElementById('btnOpenSettings').onclick = () => this.openModal();
    }

    if (!document.getElementById('evaSettingsModal')) {
      const modal = document.createElement('div');
      modal.id = 'evaSettingsModal';
      modal.className = 'hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-panel backdrop-blur-md transition-opacity select-none';
      modal.innerHTML = this._getModalHTML();
      document.body.appendChild(modal);
      this._bindModalEvents();
    }
  }

  _refreshLocalization() {
    const btnLbl = document.getElementById('btnOpenSettingsLabel');
    if (btnLbl) btnLbl.textContent = _tr('Settings', 'Cài đặt');
    const modal = document.getElementById('evaSettingsModal');
    if (!modal) return;
    const savedTab = this.activeTab || 'appearance';
    modal.innerHTML = this._getModalHTML();
    this._bindModalEvents();
    this._syncUIFromState();
    this.openTab(savedTab);
  }

  openModal(initialTab = null) {
    const modal = document.getElementById('evaSettingsModal');
    if (!modal) return;
    this._syncUIFromState();
    modal.classList.remove('hidden');
    if (initialTab) {
      this.openTab(initialTab);
    }
  }

  openTab(tabKey) {
    this.activeTab = tabKey || 'appearance';
    const modal = document.getElementById('evaSettingsModal');
    if (!modal) return;
    const tabBtns = modal.querySelectorAll('.settings-tab-btn');
    const tabContents = modal.querySelectorAll('.settings-tab-content');
    tabBtns.forEach(b => {
      if (b.getAttribute('data-tab') === tabKey) {
        b.classList.add('active', 'bg-panel', 'border-accent', 'text-accent');
        b.classList.remove('text-secondary');
      } else {
        b.classList.remove('active', 'bg-panel', 'border-accent', 'text-accent');
        b.classList.add('text-secondary');
      }
    });
    tabContents.forEach(tc => {
      if (tc.getAttribute('data-content') === tabKey) {
        tc.classList.remove('hidden');
      } else {
        tc.classList.add('hidden');
      }
    });
  }

  closeModal() {
    const modal = document.getElementById('evaSettingsModal');
    if (modal) modal.classList.add('hidden');
  }

  _syncUIFromState() {
    const s = this.settings;
    const activeThemeId = getActiveThemeId(s.theme);
    s.theme = activeThemeId;
    const themes = getThemeCatalog();
    const activeMeta = themes.find(t => t.id === activeThemeId) || themes[1] || themes[0];

    // Appearance tab: synchronize 7-theme card selection
    const themeCards = document.querySelectorAll('#settingsThemeGrid .eva-theme-card');
    themeCards.forEach(card => {
      const cardId = card.getAttribute('data-theme-id');
      const isActive = cardId === activeThemeId;
      card.setAttribute('aria-checked', isActive ? 'true' : 'false');
      card.setAttribute('tabindex', isActive ? '0' : '-1');
      card.classList.toggle('is-active', isActive);
      const badge = card.querySelector('[data-theme-badge]');
      if (badge) {
        badge.classList.toggle('hidden', !isActive);
      }
    });

    const activeNameEl = document.getElementById('settingsActiveThemeLabel');
    if (activeNameEl && activeMeta) activeNameEl.textContent = activeMeta.name;
    const hudThemeNameEl = document.getElementById('settingsHudActiveThemeName');
    if (hudThemeNameEl && activeMeta) hudThemeNameEl.textContent = activeMeta.name;

    // Profile & Constraints
    const profSelect = document.getElementById('settingsProfileSelect');
    if (profSelect) profSelect.value = s.movementProfile;
    const descEl = document.getElementById('settingsProfileDesc');
    if (descEl && VEHICLE_PROFILES[s.movementProfile]) {
      descEl.textContent = VEHICLE_PROFILES[s.movementProfile].desc;
    }
    this._updateDerivedSlopeLabels(s.maxSafeSlopeDeg);
    this._updateCorridorSafetyLabels(s);

    // Performance Mode
    const perfSelect = document.getElementById('settingsPerfModeSelect');
    if (perfSelect) perfSelect.value = s.performanceMode;

    // Safety & Survival
    const dustInp = document.getElementById('settingsDustThreshold');
    if (dustInp) dustInp.value = s.dustStormThreshold;
    const oxyInp = document.getElementById('settingsOxyBuffer');
    if (oxyInp) oxyInp.value = Math.round(s.oxygenBufferRatio * 100);
  }

  _bindModalEvents() {
    const modal = document.getElementById('evaSettingsModal');
    if (!modal) return;

    const closeBtn = document.getElementById('btnCloseSettingsModal');
    if (closeBtn) closeBtn.onclick = () => this.closeModal();
    modal.onclick = (e) => {
      if (e.target === modal) this.closeModal();
    };

    const tabBtns = modal.querySelectorAll('.settings-tab-btn');
    tabBtns.forEach(btn => {
      btn.onclick = () => {
        const tabKey = btn.getAttribute('data-tab');
        this.openTab(tabKey);
      };
    });

    const themeGrid = document.getElementById('settingsThemeGrid');
    const themeCards = Array.from(modal.querySelectorAll('#settingsThemeGrid .eva-theme-card'));
    const selectTheme = (themeId) => {
      if (!themeId) return;
      this.saveSettings({ theme: themeId });
      this._syncUIFromState();
    };

    themeCards.forEach((card, idx) => {
      card.onclick = () => {
        selectTheme(card.getAttribute('data-theme-id'));
      };
      card.onkeydown = (e) => {
        if (!themeCards.length) return;
        let nextIdx = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          nextIdx = (idx + 1) % themeCards.length;
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          nextIdx = (idx - 1 + themeCards.length) % themeCards.length;
        } else if (e.key === 'Home') {
          nextIdx = 0;
        } else if (e.key === 'End') {
          nextIdx = themeCards.length - 1;
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectTheme(card.getAttribute('data-theme-id'));
          return;
        }
        if (nextIdx >= 0 && themeGrid) {
          e.preventDefault();
          const targetCard = themeCards[nextIdx];
          selectTheme(targetCard.getAttribute('data-theme-id'));
          targetCard.focus();
        }
      };
    });

    const resetThemeBtn = document.getElementById('settingsResetThemeBtn');
    if (resetThemeBtn) {
      resetThemeBtn.onclick = () => {
        this.saveSettings({ theme: DEFAULT_THEME_ID });
        this._syncUIFromState();
      };
    }

    const profSelect = document.getElementById('settingsProfileSelect');
    if (profSelect) {
      profSelect.onchange = (e) => {
        const key = e.target.value;
        const profile = VEHICLE_PROFILES[key];
        if (profile) {
          const descEl = document.getElementById('settingsProfileDesc');
          if (descEl) descEl.textContent = profile.desc;
          this.saveSettings({
            movementProfile: key,
            maxSafeSlopeDeg: profile.defaultMaxSlope
          });
          this._syncUIFromState();
        }
      };
    }

    const slopeSlider = document.getElementById('settingsMaxSlopeSlider');
    const slopeInput = document.getElementById('settingsMaxSlopeInput');

    if (slopeSlider) {
      const handleSlider = (e) => {
        const deg = sanitizeMaxSlopeDeg(e.target.value, this.settings.maxSafeSlopeDeg);
        this._updateDerivedSlopeLabels(deg);
        this.saveSettings({ maxSafeSlopeDeg: deg });
      };
      slopeSlider.oninput = handleSlider;
      slopeSlider.onchange = handleSlider;
    }

    if (slopeInput) {
      const handleInput = (e) => {
        const raw = parseFloat(e.target.value);
        if (Number.isFinite(raw) && raw >= 5.0 && raw <= 35.0) {
          const deg = sanitizeMaxSlopeDeg(raw, this.settings.maxSafeSlopeDeg);
          this._updateDerivedSlopeLabels(deg);
          this.saveSettings({ maxSafeSlopeDeg: deg });
        }
      };
      slopeInput.oninput = handleInput;
      slopeInput.onchange = (e) => {
        const deg = sanitizeMaxSlopeDeg(e.target.value, this.settings.maxSafeSlopeDeg);
        e.target.value = deg.toFixed(1);
        this._updateDerivedSlopeLabels(deg);
        this.saveSettings({ maxSafeSlopeDeg: deg });
      };
    }

    const clrSlider = document.getElementById('settingsCorridorClearanceSlider');
    const clrInput = document.getElementById('settingsCorridorClearanceInput');
    const cautInput = document.getElementById('settingsMaxCautionDensityInput');
    const unkInput = document.getElementById('settingsMaxUnknownCoverageInput');

    if (clrSlider) {
      const handleClr = (e) => {
        const m = sanitizeClearanceM(e.target.value, this.settings.routeSafetyClearanceM);
        this.saveSettings({ routeSafetyClearanceM: m });
      };
      clrSlider.oninput = handleClr;
      clrSlider.onchange = handleClr;
    }

    if (clrInput) {
      clrInput.onchange = (e) => {
        const m = sanitizeClearanceM(e.target.value, this.settings.routeSafetyClearanceM);
        e.target.value = m;
        this.saveSettings({ routeSafetyClearanceM: m });
      };
    }

    if (cautInput) {
      cautInput.onchange = (e) => {
        const pct = parseFloat(e.target.value);
        const ratio = sanitizeRatio(Number.isFinite(pct) ? pct / 100 : 0.35, this.settings.maxCautionDensity, 0.05, 0.90);
        e.target.value = Math.round(ratio * 100);
        this.saveSettings({ maxCautionDensity: ratio });
      };
    }

    if (unkInput) {
      unkInput.onchange = (e) => {
        const pct = parseFloat(e.target.value);
        const ratio = sanitizeRatio(Number.isFinite(pct) ? pct / 100 : 0.15, this.settings.maxUnknownCoverage, 0.01, 0.50);
        e.target.value = Math.round(ratio * 100);
        this.saveSettings({ maxUnknownCoverage: ratio });
      };
    }

    const perfSelect = document.getElementById('settingsPerfModeSelect');
    if (perfSelect) {
      perfSelect.onchange = (e) => {
        this.saveSettings({ performanceMode: e.target.value });
      };
    }

    const clearCacheBtn = document.getElementById('settingsClearCacheBtn');
    if (clearCacheBtn) {
      clearCacheBtn.onclick = () => {
        if (confirm(_tr(
          "Are you sure you want to clear the local image bitmap cache? This releases GPU/VRAM memory and will NOT delete your original NASA datasets.",
          "Bạn có chắc chắn muốn xóa bộ nhớ đệm ảnh bitmap cục bộ không? Thao tác này giải phóng bộ nhớ GPU/VRAM và KHÔNG xóa các tập dữ liệu NASA gốc của bạn."
        ))) {
          if (window.state && window.state.map && window.state.map.lruCache) {
            for (const [k, v] of window.state.map.lruCache.entries()) {
              if (v.bitmap && typeof v.bitmap.close === 'function') v.bitmap.close();
            }
            window.state.map.lruCache.clear();
            alert(_tr("Local texture cache successfully purged from memory.", "Đã xóa sạch bộ nhớ đệm kết cấu cục bộ khỏi bộ nhớ."));
          } else {
            alert(_tr("Local browser memory cache cleared.", "Đã xóa bộ nhớ đệm trình duyệt cục bộ."));
          }
        }
      };
    }
  }

  _getModalHTML() {
    const themes = getThemeCatalog();
    const activeThemeId = getActiveThemeId(this.settings.theme);
    const activeMeta = themes.find(t => t.id === activeThemeId) || themes[1] || themes[0];
    return `
      <div class="relative w-full max-w-4xl max-h-[88vh] bg-elevated border border-accent-soft rounded-2xl shadow-2xl flex flex-col overflow-hidden text-primary">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-subtle bg-panel">
          <div class="flex items-center gap-3">
            <span class="text-xl">⚙️</span>
            <div>
              <h2 class="text-sm font-bold text-primary tracking-wider uppercase flex items-center gap-2">
                ${_tr('Eva Marswalk System Settings', 'Cài Đặt Hệ Thống Eva Marswalk')}
                <span class="text-[9px] bg-panel text-accent border border-accent px-1.5 py-0.5 rounded mono">${_tr('UNIFIED 2D/3D', 'ĐỒNG BỘ 2D/3D')}</span>
              </h2>
              <p class="text-[11px] text-secondary">${_tr('Appearance, Movement Constraints, Real-Time Pathfinding & Hardware Profiles', 'Giao diện, Giới hạn di chuyển, Tìm đường thời gian thực & Cấu hình phần cứng')}</p>
            </div>
          </div>
          <button id="btnCloseSettingsModal" class="p-1.5 rounded-lg text-secondary hover:text-primary hover:bg-hover transition-colors cursor-pointer text-sm font-bold">
            ✕
          </button>
        </div>

        <!-- Body: Left Category Tabs + Right Content Area -->
        <div class="flex-1 flex overflow-hidden">
          <!-- Sidebar Tabs -->
          <div class="w-56 border-r border-subtle bg-panel p-2.5 space-y-1 overflow-y-auto shrink-0 text-xs">
            <button class="settings-tab-btn active w-full text-left px-3 py-2 rounded-lg font-bold flex items-center gap-2 border border-accent bg-panel text-accent cursor-pointer transition-colors" data-tab="appearance">
              <span>🎨</span> <span>${_tr('Appearance', 'Giao diện')}</span>
            </button>
            <button class="settings-tab-btn w-full text-left px-3 py-2 rounded-lg font-bold flex items-center gap-2 border border-transparent text-secondary hover:text-primary hover:bg-hover cursor-pointer transition-colors" data-tab="maps">
              <span>🗺️</span> <span>${_tr('Maps & Offline Data', 'Bản đồ & Dữ liệu ngoại tuyến')}</span>
            </button>
            <button class="settings-tab-btn w-full text-left px-3 py-2 rounded-lg font-bold flex items-center gap-2 border border-transparent text-secondary hover:text-primary hover:bg-hover cursor-pointer transition-colors" data-tab="nav">
              <span>🛰️</span> <span>${_tr('Navigation & Sensors', 'Điều hướng & Cảm biến')}</span>
            </button>
            <button class="settings-tab-btn w-full text-left px-3 py-2 rounded-lg font-bold flex items-center gap-2 border border-transparent text-secondary hover:text-primary hover:bg-hover cursor-pointer transition-colors" data-tab="profile">
              <span>👨‍🚀</span> <span>${_tr('Profile & Constraints', 'Hồ sơ & Giới hạn')}</span>
            </button>
            <button class="settings-tab-btn w-full text-left px-3 py-2 rounded-lg font-bold flex items-center gap-2 border border-transparent text-secondary hover:text-primary hover:bg-hover cursor-pointer transition-colors" data-tab="power">
              <span>⚡</span> <span>${_tr('Power & Performance', 'Năng lượng & Hiệu năng')}</span>
            </button>
            <button class="settings-tab-btn w-full text-left px-3 py-2 rounded-lg font-bold flex items-center gap-2 border border-transparent text-secondary hover:text-primary hover:bg-hover cursor-pointer transition-colors" data-tab="safety">
              <span>🛡️</span> <span>${_tr('Safety & Survival', 'An toàn & Sinh tồn')}</span>
            </button>
            <button class="settings-tab-btn w-full text-left px-3 py-2 rounded-lg font-bold flex items-center gap-2 border border-transparent text-secondary hover:text-primary hover:bg-hover cursor-pointer transition-colors" data-tab="hud">
              <span>🖥️</span> <span>${_tr('UI / HUD Display', 'Hiển thị UI / HUD')}</span>
            </button>
            <button class="settings-tab-btn w-full text-left px-3 py-2 rounded-lg font-bold flex items-center gap-2 border border-transparent text-secondary hover:text-secondary hover:bg-hover cursor-pointer transition-colors" data-tab="future">
              <span>🚀</span> <span>${_tr('Future Developments', 'Phát triển tương lai')}</span>
            </button>
          </div>

          <!-- Content Panes -->
          <div class="flex-1 p-6 overflow-y-auto space-y-5 text-xs">
            
            <!-- 1. APPEARANCE (7-Theme Design System) -->
            <div class="settings-tab-content space-y-4" data-content="appearance">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h3 class="text-sm font-bold text-primary uppercase tracking-wider mb-1 flex items-center gap-2">
                    <span>🎨</span> ${_tr('Design System Theme', 'Chủ Đề Hệ Thống Giao Diện')}
                    <span class="text-[9px] bg-panel text-accent border border-accent px-1.5 py-0.5 rounded font-mono font-semibold">${_tr('ACTIVE', 'HOẠT ĐỘNG')}</span>
                  </h3>
                  <p class="text-secondary leading-relaxed text-[11px]">
                    ${_tr('Selects a consistent palette across the Mission Portal, 2D Explorer, and 3D Globe. Does NOT alter planetary surface imagery, elevation shaders, or scientific color scales.', 'Chọn bảng màu đồng nhất cho Cổng Nhiệm Vụ, Bản Đồ 2D và Quả Cầu 3D. KHÔNG làm thay đổi ảnh bề mặt hành tinh, shader độ cao hay thang màu khoa học.')}
                  </p>
                </div>
              </div>

              <!-- Theme Selector Grid -->
              <div class="space-y-2.5">
                <div class="flex items-center justify-between gap-2">
                  <label id="settingsThemeGroupLabel" class="font-bold text-secondary uppercase tracking-wider text-[10px]">${_tr('Theme:', 'Chủ đề:')}</label>
                  <span class="text-[11px] text-secondary">
                    ${_tr('Current:', 'Đang chọn:')} <strong id="settingsActiveThemeLabel" class="text-primary">${activeMeta.name}</strong>
                  </span>
                </div>
                <div id="settingsThemeGrid" role="radiogroup" aria-labelledby="settingsThemeGroupLabel" class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  ${themes.map(t => {
                    const isActive = t.id === activeThemeId;
                    return `
                      <button
                        type="button"
                        role="radio"
                        aria-checked="${isActive ? 'true' : 'false'}"
                        tabindex="${isActive ? '0' : '-1'}"
                        data-theme-id="${t.id}"
                        class="eva-theme-card ${isActive ? 'is-active' : ''}"
                      >
                        <div class="flex items-center justify-between gap-2 w-full">
                          <span class="text-xs font-bold text-primary truncate">${t.name}</span>
                          <span data-theme-badge class="${isActive ? '' : 'hidden'} shrink-0 text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded" style="background: ${t.accent}; color: ${t.isLight ? '#ffffff' : t.canvas};">✓ ${_tr('Active', 'Đang dùng')}</span>
                        </div>
                        <div class="flex items-center justify-between gap-2 w-full">
                          <div class="flex items-center gap-1.5" aria-hidden="true">
                            <span class="w-4 h-4 rounded-sm border" style="background: ${t.canvas}; border-color: ${t.border};" title="Canvas"></span>
                            <span class="w-4 h-4 rounded-sm border" style="background: ${t.elevated}; border-color: ${t.border};" title="Surface"></span>
                            <span class="w-4 h-4 rounded-sm border" style="background: ${t.accent}; border-color: ${t.border};" title="Accent"></span>
                            <span class="w-4 h-4 rounded-sm border" style="background: ${t.telemetry}; border-color: ${t.border};" title="Telemetry"></span>
                            <span class="w-4 h-4 rounded-sm border" style="background: ${t.textPrimary}; border-color: ${t.border};" title="Text"></span>
                          </div>
                          <span class="px-1.5 py-0.5 rounded-sm text-[10px] font-black tracking-wider border" style="background: ${t.canvas}; border-color: ${t.border};" aria-hidden="true">
                            <span style="background: ${t.evaGradient}; -webkit-background-clip: text; background-clip: text; color: transparent; -webkit-text-fill-color: transparent;">EVA</span>
                          </span>
                        </div>
                      </button>
                    `;
                  }).join('')}
                </div>
              </div>

              <!-- Reset Action -->
              <div class="pt-1 flex justify-end">
                <button type="button" id="settingsResetThemeBtn" class="px-3.5 py-1.5 rounded-lg border border-subtle bg-panel hover:bg-hover text-secondary hover:text-primary text-xs font-semibold transition-colors cursor-pointer">
                  ↺ ${_tr('Restore Default Theme', 'Khôi phục chủ đề mặc định')}
                </button>
              </div>
            </div>

            <!-- 2. MAPS & OFFLINE DATA -->
            <div class="settings-tab-content space-y-4 hidden" data-content="maps">
              <div>
                <h3 class="text-sm font-bold text-primary uppercase tracking-wider mb-1 flex items-center gap-2">
                  <span>🗺️</span> ${_tr('Maps & Dataset Management', 'Quản Lý Bản Đồ & Tập Dữ Liệu')}
                </h3>
                <p class="text-secondary leading-relaxed text-[11px]">
                  ${_tr('Local cached datasets, multi-resolution pyramids, and offline planetary tile management.', 'Các tập dữ liệu lưu đệm cục bộ, tháp đa độ phân giải (LOD) và quản lý các ô bản đồ hành tinh ngoại tuyến.')}
                </p>
              </div>

              <div class="p-3.5 rounded-xl border border-subtle bg-panel space-y-2.5">
                <div class="flex justify-between items-center">
                  <span class="font-bold text-primary text-xs">${_tr('Local Dataset Status', 'Trạng thái dữ liệu cục bộ')}</span>
                  <span class="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded font-mono">${_tr('STANDALONE OFFLINE READY', 'SẴN SÀNG NGOẠI TUYẾN')}</span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-[11px] text-secondary font-mono">
                  <div>• MOLA Elevation: 72 Tiles (Grayscale TIFF)</div>
                  <div>• Main Viking MDIM 2.1: 72 Tiles (4-Tier LOD)</div>
                  <div>• Gravity Anomaly (JGMRO_120g): 720x360 Grid</div>
                  <div>• Terrain Slope Derived: 720x360 Grid</div>
                </div>
              </div>

              <!-- Future Items -->
              <div class="p-3.5 rounded-xl border border-strong bg-elevated space-y-2">
                <div class="flex items-center gap-2 text-secondary font-bold text-xs">
                  <span>⏳</span> ${_tr('Future Development: Live MRO HiRISE Telecom Sync', 'Phát triển tương lai: Đồng bộ trực tiếp MRO HiRISE')}
                </div>
                <p class="text-secondary text-[11px] leading-relaxed">
                  ${_tr('Direct orbital synchronization with Mars Reconnaissance Orbiter requires active deep-space network telemetry gateway and NASA Planetary Data System (PDS) token authentication.', 'Đồng bộ quỹ đạo trực tiếp với tàu Mars Reconnaissance Orbiter cần cổng viễn thám mạng không gian sâu (DSN) và xác thực token hệ thống NASA PDS.')}
                </p>
              </div>
            </div>

            <!-- 3. NAVIGATION & SENSORS -->
            <div class="settings-tab-content space-y-4 hidden" data-content="nav">
              <div>
                <h3 class="text-sm font-bold text-primary uppercase tracking-wider mb-1 flex items-center gap-2">
                  <span>🛰️</span> ${_tr('Navigation Reference & Sensory Modes', 'Hệ Quy Chiếu Điều Hướng & Cảm Biến')}
                </h3>
                <p class="text-secondary leading-relaxed text-[11px]">
                  ${_tr('Planetary geodesy and sensory tracking systems for Mars surface exploration.', 'Hệ thống trắc địa hành tinh và theo dõi cảm biến phục vụ thám hiểm bề mặt Sao Hỏa.')}
                </p>
              </div>

              <div class="p-3.5 rounded-xl border border-subtle bg-panel space-y-2">
                <div class="font-bold text-primary text-xs">${_tr('Active Geodetic Reference Frame', 'Hệ quy chiếu trắc địa đang hoạt động')}</div>
                <p class="text-secondary text-[11px] font-mono leading-relaxed">
                  ${_tr('Datum: IAU 2015 Mars Equirectangular Spherical Projection (R = 3,396,190.0 m, g = 3.721 m/s²). Coordinates: Planetocentric East Longitude (0°–360°E), Latitude (-90°S to +90°N).', 'Mốc chuẩn: Phép chiếu cầu Equirectangular Sao Hỏa IAU 2015 (R = 3.396.190,0 m, g = 3,721 m/s²). Tọa độ: Kinh độ Đông tâm hành tinh (0°–360°E), Vĩ độ (-90°S đến +90°N).')}
                </p>
              </div>

              <!-- Future Items -->
              <div class="p-3.5 rounded-xl border border-strong bg-elevated space-y-2.5">
                <div class="flex items-center gap-2 text-secondary font-bold text-xs">
                  <span>⏳</span> ${_tr('Future Development: Hardware-Assisted Inertial Navigation (IMU / VO)', 'Phát triển tương lai: Điều hướng quán tính phần cứng (IMU / VO)')}
                </div>
                <p class="text-secondary text-[11px] leading-relaxed">
                  ${_tr('Real-time Visual Odometry and IMU dead reckoning require physical hardware sensor integration with a field-deployed Mars exploration rover or astronaut suit sensor pack.', 'Đo hành trình thị giác (Visual Odometry) và định vị quán tính IMU thời gian thực yêu cầu tích hợp cảm biến phần cứng vật lý trên xe tự hành hoặc bộ cảm biến trang phục phi hành gia.')}
                </p>
              </div>
            </div>

            <!-- 4. PROFILE & VEHICLE CONSTRAINTS (Active Implementation) -->
            <div class="settings-tab-content space-y-4 hidden" data-content="profile">
              <div>
                <h3 class="text-sm font-bold text-primary uppercase tracking-wider mb-1 flex items-center gap-2">
                  <span>👨‍🚀</span> ${_tr('Vehicle & Explorer Movement Constraints', 'Giới Hạn Di Chuyển Của Phi Hành Gia & Phương Tiện')}
                  <span class="text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-1.5 py-0.5 rounded font-mono font-semibold">${_tr('ACTIVE', 'HOẠT ĐỘNG')}</span>
                </h3>
                <p class="text-secondary leading-relaxed text-[11px]">
                  ${_tr('Configures mobility profiles and the authoritative Maximum Slope threshold (<span class="font-mono text-accent">θ_max</span>). Directly updates the signed-slope directional cost engine <span class="font-mono text-accent">K(θ)</span> and hard uphill/downhill safety limits across Field D*, D* Lite, FMM, and A*.', 'Cấu hình hồ sơ di chuyển và ngưỡng Độ dốc tối đa (<span class="font-mono text-accent">θ_max</span>). Cập nhật trực tiếp hàm chi phí độ dốc có dấu <span class="font-mono text-accent">K(θ)</span> và giới hạn an toàn lên/xuống dốc cho Field D*, D* Lite, FMM và A*.')}
                </p>
              </div>

              <div class="space-y-3">
                <label class="font-bold text-secondary uppercase tracking-wider text-[10px] block">${_tr('Explorer / Vehicle Profile', 'Hồ Sơ Phi Hành Gia / Phương Tiện')}</label>
                <select id="settingsProfileSelect" class="w-full bg-panel border border-subtle rounded-lg px-3 py-2 text-xs text-primary focus:border-accent font-medium">
                  <option value="astronaut">${_tr('👨‍🚀 Astronaut EVA (NASA xEMU Standard, Default Max Slope 22.0°)', '👨‍🚀 Phi Hành Gia EVA (Chuẩn NASA xEMU, Độ dốc tối đa mặc định 22.0°)')}</option>
                  <option value="rover">${_tr('🤖 Robotic Rover (Curiosity / Perseverance, Default Max Slope 15.0°)', '🤖 Xe Tự Hành Robot (Curiosity / Perseverance, Độ dốc tối đa mặc định 15.0°)')}</option>
                  <option value="scout">${_tr('🏃 Agile Scout (Lightweight Survey, Default Max Slope 28.0°)', '🏃 Trinh Sát Cơ Động (Khảo sát gọn nhẹ, Độ dốc tối đa mặc định 28.0°)')}</option>
                </select>
                <p id="settingsProfileDesc" class="text-[11px] text-accent italic">
                  ${VEHICLE_PROFILES[this.settings.movementProfile || 'astronaut'].desc}
                </p>
              </div>

              <!-- Dynamic Slope Slider & Input -->
              <div class="p-3.5 rounded-xl border border-accent-soft bg-panel space-y-3">
                <div class="flex justify-between items-center text-xs">
                  <div>
                    <span class="font-bold text-primary block">${_tr('Maximum Slope', 'Độ Dốc Tối Đa')} (<span class="font-mono text-accent">θ_max</span>)</span>
                    <span class="text-[10px] text-secondary">${_tr('Authoritative hard uphill limit & directional cost reference', 'Giới hạn leo dốc tối đa & mốc tham chiếu chi phí có hướng')}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <input type="number" id="settingsMaxSlopeInput" min="5" max="35" step="0.5" value="22.0" class="w-16 bg-panel border border-subtle rounded px-2 py-1 text-xs text-accent font-mono font-bold text-right focus:border-accent focus:outline-none">
                    <span id="settingsMaxSlopeValue" class="font-mono font-bold text-accent text-sm">22.0°</span>
                  </div>
                </div>
                <input type="range" id="settingsMaxSlopeSlider" min="5" max="35" step="0.5" value="22" class="w-full accent-primary h-1.5 bg-panel rounded cursor-pointer">

                <!-- Derived Directional Slope Thresholds Grid (Part D & Part G) -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-subtle text-[11px] font-mono">
                  <div class="p-2 rounded-lg bg-panel border border-subtle">
                    <span class="text-[9px] text-secondary block">${_tr('Max Uphill (θ_max)', 'Lên dốc tối đa (θ_max)')}</span>
                    <span id="settingsDerivedMaxUphill" class="font-bold text-rose-300 text-xs">+22.00°</span>
                  </div>
                  <div class="p-2 rounded-lg bg-panel border border-subtle">
                    <span class="text-[9px] text-secondary block">${_tr('Max Downhill (0.75·θ_max)', 'Xuống dốc tối đa (0.75·θ_max)')}</span>
                    <span id="settingsDerivedMaxDownhill" class="font-bold text-rose-300 text-xs">-16.50°</span>
                  </div>
                  <div class="p-2 rounded-lg bg-panel border border-subtle">
                    <span class="text-[9px] text-secondary block">${_tr('Uphill Ref (0.4·θ_max)', 'Mốc lên dốc (0.4·θ_max)')}</span>
                    <span id="settingsDerivedThetaRef" class="font-bold text-emerald-300 text-xs">+8.80°</span>
                  </div>
                  <div class="p-2 rounded-lg bg-panel border border-subtle">
                    <span class="text-[9px] text-secondary block">${_tr('Downhill Benefit (-0.5·θ_ref)', 'Lợi thế xuống dốc (-0.5·θ_ref)')}</span>
                    <span id="settingsDerivedDownhillRef" class="font-bold text-accent text-xs">-4.40°</span>
                  </div>
                </div>

                <p class="text-[10px] text-secondary leading-relaxed">
                  • <strong>${_tr('Uphill SAFE', 'Lên dốc AN TOÀN')}</strong> (<span class="font-mono">0° ≤ θ ≤ θ_ref</span>): <span class="font-mono text-emerald-300">K = 1 + θ/θ_ref</span> &nbsp;|&nbsp;
                  <strong>${_tr('Uphill CAUTION', 'Lên dốc CẢNH BÁO')}</strong> (<span class="font-mono">θ_ref &lt; θ ≤ θ_max</span>): <span class="font-mono text-secondary">K = 2 + 4p + 6p²</span> &nbsp;|&nbsp;
                  <strong>${_tr('Uphill UNSAFE', 'Lên dốc NGUY HIỂM')}</strong> (<span class="font-mono">θ &gt; θ_max</span>): <span class="font-mono text-rose-400">${_tr('REJECT', 'LOẠI BỎ')}</span><br>
                  • <strong>${_tr('Downhill Benefit', 'Xuống dốc nhẹ')}</strong> (<span class="font-mono">-0.5·θ_ref ≤ θ &lt; 0°</span>): <span class="font-mono text-accent">K ∈ [0.75, 1.0)</span> &nbsp;|&nbsp;
                  <strong>${_tr('Downhill CAUTION', 'Xuống dốc CẢNH BÁO')}</strong> (<span class="font-mono">-0.75·θ_max ≤ θ &lt; -0.5·θ_ref</span>): <span class="font-mono text-secondary">K = 0.75 + 5q²</span> &nbsp;|&nbsp;
                  <strong>${_tr('Downhill UNSAFE', 'Xuống dốc NGUY HIỂM')}</strong> (<span class="font-mono">|θ| &gt; 0.75·θ_max</span>): <span class="font-mono text-rose-400">${_tr('REJECT', 'LOẠI BỎ')}</span>
                </p>
              </div>

              <!-- Multi-Radius Route Corridor Safety Scan Configuration (Part D) -->
              <div class="p-3.5 rounded-xl border border-emerald-500/30 bg-panel space-y-3">
                <div class="flex justify-between items-center text-xs">
                  <div>
                    <span class="font-bold text-primary block">${_tr('Route Safety Clearance', 'Bán Kính Hành Lang An Toàn')} (<span class="font-mono text-emerald-300">C</span>)</span>
                    <span class="text-[10px] text-secondary">${_tr('Multi-radius surrounding terrain safety buffer in real geographic metres (application-level assumption)', 'Đệm an toàn địa hình đa bán kính tính bằng mét địa lý thực (giả định cấp ứng dụng)')}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <input type="number" id="settingsCorridorClearanceInput" min="0" max="120000" step="1000" value="30000" class="w-20 bg-panel border border-subtle rounded px-2 py-1 text-xs text-emerald-300 font-mono font-bold text-right focus:border-emerald-400 focus:outline-none">
                    <span id="settingsCorridorClearanceValue" class="font-mono font-bold text-emerald-300 text-xs">30,000 m</span>
                  </div>
                </div>
                <input type="range" id="settingsCorridorClearanceSlider" min="0" max="100000" step="2000" value="30000" class="w-full accent-emerald-400 h-1.5 bg-panel rounded cursor-pointer">

                <!-- 3 Concentric Radii (Part D2) -->
                <div class="grid grid-cols-3 gap-2 pt-2 border-t border-subtle text-[11px] font-mono">
                  <div class="p-2 rounded-lg bg-panel border border-subtle">
                    <span class="text-[9px] text-secondary block">${_tr('1. Immediate (0.40·C)', '1. Cận kề (0.40·C)')}</span>
                    <span id="settingsDerivedRadiusR1" class="font-bold text-rose-300 text-xs">12,000 m</span>
                  </div>
                  <div class="p-2 rounded-lg bg-panel border border-subtle">
                    <span class="text-[9px] text-secondary block">${_tr('2. Intermediate (0.75·C)', '2. Trung gian (0.75·C)')}</span>
                    <span id="settingsDerivedRadiusR2" class="font-bold text-secondary text-xs">22,500 m</span>
                  </div>
                  <div class="p-2 rounded-lg bg-panel border border-subtle">
                    <span class="text-[9px] text-secondary block">${_tr('3. Outer Buffer (1.00·C)', '3. Đệm ngoài (1.00·C)')}</span>
                    <span id="settingsDerivedRadiusR3" class="font-bold text-emerald-300 text-xs">30,000 m</span>
                  </div>
                </div>

                <!-- Risk Density & UNKNOWN Coverage Thresholds (Part D5) -->
                <div class="grid grid-cols-2 gap-3 pt-2 border-t border-subtle text-[11px]">
                  <div class="flex items-center justify-between bg-panel px-2.5 py-1.5 rounded-lg border border-subtle">
                    <span class="text-secondary font-semibold">${_tr('Max CAUTION Density (%)', 'Mật độ CẢNH BÁO tối đa (%)')}</span>
                    <input type="number" id="settingsMaxCautionDensityInput" min="5" max="90" step="5" value="35" class="w-14 bg-canvas border border-subtle rounded px-1.5 py-0.5 text-secondary font-mono font-bold text-right">
                  </div>
                  <div class="flex items-center justify-between bg-panel px-2.5 py-1.5 rounded-lg border border-subtle">
                    <span class="text-secondary font-semibold">${_tr('Max UNKNOWN Coverage (%)', 'Độ phủ CHƯA RÕ tối đa (%)')}</span>
                    <input type="number" id="settingsMaxUnknownCoverageInput" min="1" max="50" step="1" value="15" class="w-14 bg-canvas border border-subtle rounded px-1.5 py-0.5 text-secondary font-mono font-bold text-right">
                  </div>
                </div>
              </div>
            </div>

            <!-- 5. POWER & PERFORMANCE (Active Implementation) -->
            <div class="settings-tab-content space-y-4 hidden" data-content="power">
              <div>
                <h3 class="text-sm font-bold text-primary uppercase tracking-wider mb-1 flex items-center gap-2">
                  <span>⚡</span> ${_tr('Power Management & Rendering Quality', 'Quản Lý Năng Lượng & Chất Lượng Đồ Họa')}
                  <span class="text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-1.5 py-0.5 rounded font-mono font-semibold">${_tr('ACTIVE', 'HOẠT ĐỘNG')}</span>
                </h3>
                <p class="text-secondary leading-relaxed text-[11px]">
                  ${_tr('Regulates graphics pipeline frame rates and allows safe clearing of cached in-memory textures.', 'Điều chỉnh tốc độ khung hình đồ họa và cho phép giải phóng an toàn bộ nhớ đệm kết cấu.')}
                </p>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div class="p-3.5 rounded-xl border border-subtle bg-panel space-y-2">
                  <label class="font-bold text-primary text-xs block">${_tr('Rendering Performance Mode', 'Chế độ hiệu năng hiển thị')}</label>
                  <select id="settingsPerfModeSelect" class="w-full bg-panel border border-subtle rounded-lg px-2.5 py-1.5 text-xs text-primary focus:border-accent">
                    <option value="performance">${_tr('🚀 High Performance (Target 60 FPS)', '🚀 Hiệu năng cao (Mục tiêu 60 FPS)')}</option>
                    <option value="eco">${_tr('🌱 Eco-Nav Mode (Target 30 FPS Power Save)', '🌱 Chế độ tiết kiệm (Mục tiêu 30 FPS)')}</option>
                  </select>
                </div>

                <div class="p-3.5 rounded-xl border border-subtle bg-panel space-y-2">
                  <label class="font-bold text-primary text-xs block">${_tr('Texture VRAM Management', 'Quản lý bộ nhớ VRAM')}</label>
                  <button id="settingsClearCacheBtn" class="w-full py-1.5 rounded-lg border border-red-500/40 bg-red-950/40 hover:bg-red-900/60 text-red-200 text-xs font-semibold transition-colors cursor-pointer">
                    🗑️ ${_tr('Purge Local Bitmap Cache', 'Xóa bộ nhớ đệm Bitmap')}
                  </button>
                </div>
              </div>
            </div>

            <!-- 6. SAFETY & SURVIVAL -->
            <div class="settings-tab-content space-y-4 hidden" data-content="safety">
              <div>
                <h3 class="text-sm font-bold text-primary uppercase tracking-wider mb-1 flex items-center gap-2">
                  <span>🛡️</span> ${_tr('Astronaut Safety & Life Support Thresholds', 'Ngưỡng An Toàn Phi Hành Gia & Hỗ Trợ Sự Sống')}
                </h3>
                <p class="text-secondary leading-relaxed text-[11px]">
                  ${_tr('Safety reserve coefficients and environmental hazard warning triggers.', 'Hệ số dự phòng an toàn và ngưỡng kích hoạt cảnh báo nguy hiểm môi trường.')}
                </p>
              </div>

              <div class="grid grid-cols-2 gap-3 text-xs">
                <div class="p-3.5 rounded-xl border border-subtle bg-panel space-y-1.5">
                  <label class="font-bold text-secondary text-[11px]">${_tr('Dust Storm Optical Depth (τ) Alert', 'Ngưỡng cảnh báo độ dày quang học bão bụi (τ)')}</label>
                  <input type="number" id="settingsDustThreshold" step="0.1" value="2.2" class="w-full bg-panel border border-subtle rounded px-2.5 py-1.5 text-primary font-mono text-xs" readonly>
                  <p class="text-[10px] text-muted">${_tr('MRO MCS atmospheric opacity alert threshold.', 'Ngưỡng cảnh báo độ mờ đục khí quyển từ MRO MCS.')}</p>
                </div>

                <div class="p-3.5 rounded-xl border border-subtle bg-panel space-y-1.5">
                  <label class="font-bold text-secondary text-[11px]">${_tr('Oxygen Safety Return Reserve (%)', 'Dự phòng oxy quay về an toàn (%)')}</label>
                  <input type="number" id="settingsOxyBuffer" value="20" class="w-full bg-panel border border-subtle rounded px-2.5 py-1.5 text-primary font-mono text-xs" readonly>
                  <p class="text-[10px] text-muted">${_tr('NASA standard 20% contingency life support margin.', 'Biên dự phòng hỗ trợ sự sống 20% theo chuẩn NASA.')}</p>
                </div>
              </div>
            </div>

            <!-- 7. UI / HUD DISPLAY -->
            <div class="settings-tab-content space-y-4 hidden" data-content="hud">
              <div>
                <h3 class="text-sm font-bold text-primary uppercase tracking-wider mb-1 flex items-center gap-2">
                  <span>🖥️</span> ${_tr('UI & Heads-Up Display Telemetry', 'Giao Diện UI & Hiển Thị Thông Số HUD')}
                </h3>
                <p class="text-secondary leading-relaxed text-[11px]">
                  ${_tr('Controls on-screen telemetry panels, scale legends, and coordinate display styles.', 'Điều khiển bảng thông số trên màn hình, chú giải thang màu và kiểu hiển thị tọa độ.')}
                </p>
              </div>

              <div class="p-3.5 rounded-xl border border-subtle bg-panel space-y-2">
                <span class="font-bold text-primary text-xs block">${_tr('Telemetry Overlay Theme', 'Chủ đề lớp phủ viễn thám')}</span>
                <span class="text-[11px] text-secondary">${_tr('Active Theme:', 'Chủ đề đang dùng:')} <strong id="settingsHudActiveThemeName" class="text-primary">${activeMeta.name}</strong></span>
              </div>
            </div>

            <!-- 8. FUTURE DEVELOPMENTS -->
            <div class="settings-tab-content space-y-3.5 hidden" data-content="future">
              <div class="border-b border-strong pb-2">
                <h3 class="text-sm font-bold text-secondary uppercase tracking-wider mb-1 flex items-center gap-2">
                  <span>🚀</span> ${_tr('Future Developments & Sensor Systems', 'Định Hướng Phát Triển & Hệ Thống Cảm Biến')}
                  <span class="text-[9px] bg-elevated text-secondary border border-strong px-1.5 py-0.5 rounded font-mono font-semibold">${_tr('ROADMAP', 'LỘ TRÌNH')}</span>
                </h3>
                <p class="text-secondary leading-relaxed text-[11px]">
                  ${_tr('The following advanced capabilities are scheduled for future EVA hardware integrations and require external sensory, orbital, or robotic hardware connectivity:', 'Các tính năng nâng cao dưới đây nằm trong lộ trình tích hợp phần cứng EVA tương lai và yêu cầu kết nối cảm biến, vệ tinh quỹ đạo hoặc phần cứng robot bên ngoài:')}
                </p>
              </div>

              <div class="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                <div class="p-3 rounded-xl border border-subtle bg-panel space-y-1">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-primary text-xs">${_tr('1. Regional Offline Map Package Download', '1. Tải gói bản đồ ngoại tuyến theo vùng')}</span>
                    <span class="text-[9px] bg-panel text-secondary px-1.5 py-0.5 rounded mono">${_tr('Planned', 'Dự kiến')}</span>
                  </div>
                  <p class="text-[11px] text-secondary leading-normal">${_tr('Requires IndexedDB multi-gigabyte blob chunking and client-side tarball extraction.', 'Yêu cầu phân mảnh blob nhiều gigabyte trong IndexedDB và giải nén gói dữ liệu phía trình duyệt.')}</p>
                </div>

                <div class="p-3 rounded-xl border border-subtle bg-panel space-y-1">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-primary text-xs">${_tr('2. Live MRO Orbital Weather & Dust Telemetry', '2. Viễn thám thời tiết & bão bụi quỹ đạo MRO trực tiếp')}</span>
                    <span class="text-[9px] bg-panel text-secondary px-1.5 py-0.5 rounded mono">${_tr('Planned', 'Dự kiến')}</span>
                  </div>
                  <p class="text-[11px] text-secondary leading-normal">${_tr('Requires NASA PDS Open-Access API token and planetary orbital ephemeris relay.', 'Yêu cầu khóa API truy cập mở NASA PDS và trạm tiếp vận lịch thiên văn quỹ đạo.')}</p>
                </div>

                <div class="p-3 rounded-xl border border-subtle bg-panel space-y-1">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-primary text-xs">${_tr('3. Visual Odometry (VO) Landmark Tracking', '3. Định vị thị giác (VO) theo dõi địa danh')}</span>
                    <span class="text-[9px] bg-panel text-secondary px-1.5 py-0.5 rounded mono">${_tr('Hardware Dependent', 'Phụ thuộc phần cứng')}</span>
                  </div>
                  <p class="text-[11px] text-secondary leading-normal">${_tr('Requires rover/suit stereo optical camera feed and real-time ORB-SLAM3 visual odometry engine.', 'Yêu cầu luồng camera quang học lập thể trên xe/bộ đồ và bộ xử lý ORB-SLAM3 thời gian thực.')}</p>
                </div>

                <div class="p-3 rounded-xl border border-subtle bg-panel space-y-1">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-primary text-xs">${_tr('4. 6-DOF IMU Inertial Navigation & Dead Reckoning', '4. Điều hướng quán tính 6-DOF IMU & suy đoán vị trí')}</span>
                    <span class="text-[9px] bg-panel text-secondary px-1.5 py-0.5 rounded mono">${_tr('Hardware Dependent', 'Phụ thuộc phần cứng')}</span>
                  </div>
                  <p class="text-[11px] text-secondary leading-normal">${_tr('Requires physical tri-axial accelerometer and fiber-optic gyroscope sensor telemetry.', 'Yêu cầu cảm biến gia tốc kế 3 trục và con quay hồi chuyển sợi quang vật lý.')}</p>
                </div>

                <div class="p-3 rounded-xl border border-subtle bg-panel space-y-1">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-primary text-xs">${_tr('5. Celestial Navigation (Phobos & Deimos Triangulation)', '5. Điều hướng thiên văn (Tam giác đạc Phobos & Deimos)')}</span>
                    <span class="text-[9px] bg-panel text-secondary px-1.5 py-0.5 rounded mono">${_tr('Hardware Dependent', 'Phụ thuộc phần cứng')}</span>
                  </div>
                  <p class="text-[11px] text-secondary leading-normal">${_tr('Requires zenith-pointing star tracker camera and real-time celestial ephemeris engine.', 'Yêu cầu camera theo dõi sao hướng thiên đỉnh và bộ tính lịch thiên văn thời gian thực.')}</p>
                </div>

                <div class="p-3 rounded-xl border border-subtle bg-panel space-y-1">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-primary text-xs">${_tr('6. Physical Battery & Solar Array Consumption Controller', '6. Bộ điều khiển tiêu thụ pin & tấm pin mặt trời vật lý')}</span>
                    <span class="text-[9px] bg-panel text-secondary px-1.5 py-0.5 rounded mono">${_tr('Hardware Dependent', 'Phụ thuộc phần cứng')}</span>
                  </div>
                  <p class="text-[11px] text-secondary leading-normal">${_tr('Requires hardware CAN-bus telemetry interface to rover power distribution units.', 'Yêu cầu giao diện CAN-bus phần cứng kết nối với bộ phân phối nguồn của xe tự hành.')}</p>
                </div>

                <div class="p-3 rounded-xl border border-subtle bg-panel space-y-1">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-primary text-xs">${_tr('7. Subterranean Lava Tube Shelter Autonomous Routing', '7. Định tuyến tự động tìm hầm trú ẩn ống dung nham ngầm')}</span>
                    <span class="text-[9px] bg-panel text-secondary px-1.5 py-0.5 rounded mono">${_tr('Scientific Data', 'Dữ liệu khoa học')}</span>
                  </div>
                  <p class="text-[11px] text-secondary leading-normal">${_tr('Requires validated ground-penetrating radar (SHARAD/RIMFAX) subsurface void database.', 'Yêu cầu cơ sở dữ liệu hang ngầm đã kiểm chứng từ radar xuyên đất (SHARAD/RIMFAX).')}</p>
                </div>

                <div class="p-3 rounded-xl border border-subtle bg-panel space-y-1">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-primary text-xs">${_tr('8. Real-Time Physiological Oxygen Sensor Integration', '8. Tích hợp cảm biến sinh lý & oxy thời gian thực')}</span>
                    <span class="text-[9px] bg-panel text-secondary px-1.5 py-0.5 rounded mono">${_tr('Hardware Dependent', 'Phụ thuộc phần cứng')}</span>
                  </div>
                  <p class="text-[11px] text-secondary leading-normal">${_tr('Requires biometric Bluetooth Low Energy (BLE) pulse oximetry and suit pressure sensors.', 'Yêu cầu cảm biến nhịp tim/SpO2 sinh trắc học BLE và cảm biến áp suất bộ đồ.')}</p>
                </div>

                <div class="p-3 rounded-xl border border-subtle bg-panel space-y-1">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-primary text-xs">${_tr('9. Augmented Reality (AR) Visor Navigation HUD', '9. Màn hình HUD điều hướng thực tế tăng cường (AR) trên kính mũ')}</span>
                    <span class="text-[9px] bg-panel text-secondary px-1.5 py-0.5 rounded mono">${_tr('Hardware Dependent', 'Phụ thuộc phần cứng')}</span>
                  </div>
                  <p class="text-[11px] text-secondary leading-normal">${_tr('Requires WebXR-compatible optical waveguide astronaut helmet visor display hardware.', 'Yêu cầu phần cứng hiển thị ống dẫn sóng quang học tương thích WebXR trên kính mũ phi hành gia.')}</p>
                </div>

                <div class="p-3 rounded-xl border border-subtle bg-panel space-y-1">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-primary text-xs">${_tr('10. Live Thermal Infrared Night Vision Overlay', '10. Lớp phủ nhìn đêm hồng ngoại nhiệt trực tiếp')}</span>
                    <span class="text-[9px] bg-panel text-secondary px-1.5 py-0.5 rounded mono">${_tr('Sensor Dependent', 'Phụ thuộc cảm biến')}</span>
                  </div>
                  <p class="text-[11px] text-secondary leading-normal">${_tr('Requires long-wave infrared (LWIR) bolometer camera sensor telemetry.', 'Yêu cầu dữ liệu cảm biến camera bức xạ kế hồng ngoại sóng dài (LWIR).')}</p>
                </div>

                <div class="p-3 rounded-xl border border-accent-soft bg-panel space-y-1.5" data-future-feature="helmet-hologram-arrow">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-bold text-primary text-xs">${_tr('11. Helmet-Mounted Holographic Navigation Arrow', '11. Mũi tên điều hướng Hologram chiếu trên kính mũ')}</span>
                    <span class="text-[9px] bg-elevated text-secondary border border-strong px-1.5 py-0.5 rounded mono shrink-0">${_tr('Concept • Hardware Dependent', 'Ý tưởng • Phụ thuộc phần cứng')}</span>
                  </div>
                  <p class="text-[11px] text-secondary leading-normal">
                    ${_tr(
                      "An augmented-reality holographic navigation arrow projected directly onto the transparent glass of an astronaut's helmet visor. The arrow indicates the planned walking direction and guides astronauts along the selected Marswalk route without requiring them to constantly look at a handheld display.",
                      "Mũi tên điều hướng hologram thực tế tăng cường chiếu trực tiếp lên mặt kính trong suốt của mũ phi hành gia, chỉ hướng di chuyển dự kiến dọc theo lộ trình Marswalk mà không cần liên tục nhìn vào thiết bị cầm tay."
                    )}
                  </p>
                  <ul class="text-[10px] text-secondary leading-snug list-disc pl-4 space-y-0.5">
                    <li>${_tr('Directional visor projection aligned with the active walking bearing along the terrain-aware route (not merely pointing at the final destination).', 'Chiếu hướng đi trên kính mũ khớp với góc phương vị di chuyển thực tế dọc theo tuyến đường địa hình (không chỉ trỏ thẳng tới đích cuối).')}</li>
                    <li>${_tr('Real-time turn-by-turn route-following guidance with dynamic heading updates whenever automatic replanning occurs.', 'Hướng dẫn bám tuyến theo từng chặng thời gian thực và tự động cập nhật hướng khi hệ thống tái lập lộ trình.')}</li>
                    <li>${_tr('Visual visor alerts for route changes and proximity warnings ahead of impassable slopes or encroaching dust storms.', 'Cảnh báo trực quan trên kính mũ khi đổi hướng hoặc khi tiệm cận sườn dốc hiểm trở và bão bụi đang tiến gần.')}</li>
                  </ul>
                  <p class="text-[10px] text-muted italic">${_tr('Planned future EVA suit integration concept requiring waveguide optics and spacesuit pose telemetry (not active in current software).', 'Ý tưởng tích hợp bộ đồ EVA tương lai yêu cầu quang học ống dẫn sóng và cảm biến tư thế bộ đồ (chưa kích hoạt trong phần mềm hiện tại).')}</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    `;
  }
}

// Auto-initialize when loaded on page
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
      window.evaSettings = new EvaSettingsManager();
    });
  } else {
    window.evaSettings = new EvaSettingsManager();
  }
}
