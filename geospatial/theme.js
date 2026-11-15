/**
 * EVA MARS EXPLORER — Centralized 7-Theme Controller & Persistence
 * Shared across:
 *   - index.html
 *   - mars_2d_map.html
 *   - mars_3d_map.html (via template_index.html)
 *
 * Loaded synchronously in <head> to prevent FOUC and synchronize
 * `document.documentElement.dataset.theme` + `localStorage['eva-theme']` across pages.
 */
(function (global) {
  'use strict';

  const THEME_STORAGE_KEY = 'eva-theme';
  const DEFAULT_THEME_ID = 'rose-pine-dusk';

  // Exact 7-theme registry in canonical display order
  const EVA_THEMES = [
    {
      id: 'cartographic-paper',
      name: 'Cartographic Paper',
      isLight: true,
      canvas: '#f0ede6',
      panel: 'rgba(248, 246, 241, 0.90)',
      elevated: '#e5e0d5',
      border: '#d1cbc0',
      textPrimary: '#222426',
      textSecondary: '#5c6066',
      accent: '#2c6e63',
      telemetry: '#b85635',
      evaGradient: 'linear-gradient(135deg, #1b433c 0%, #2c6e63 55%, #b85635 100%)'
    },
    {
      id: 'rose-pine-dusk',
      name: 'Rosé Pine Moon / Dusk',
      isLight: false,
      canvas: '#1f1e24',
      panel: 'rgba(38, 37, 45, 0.88)',
      elevated: '#2f2d38',
      border: '#3d3b47',
      textPrimary: '#e0def4',
      textSecondary: '#9a96b0',
      accent: '#e2b878',
      telemetry: '#d68585',
      evaGradient: 'linear-gradient(135deg, #f6c177 0%, #ebbcba 50%, #c4a7e7 100%)'
    },
    {
      id: 'studio-graphite',
      name: 'Studio Graphite & Muted Sage',
      isLight: false,
      canvas: '#18191b',
      panel: 'rgba(31, 33, 37, 0.88)',
      elevated: '#272a30',
      border: '#32363e',
      textPrimary: '#e4e5e7',
      textSecondary: '#9ca0a8',
      accent: '#68b893',
      telemetry: '#d4a359',
      evaGradient: 'linear-gradient(135deg, #98e0be 0%, #68b893 55%, #d4a359 100%)'
    },
    {
      id: 'usgs-light',
      name: 'USGS Cartographic Light',
      isLight: true,
      canvas: '#f4f1ea',
      panel: 'rgba(255, 255, 255, 0.92)',
      elevated: '#ebe6dc',
      border: '#d6cfc2',
      textPrimary: '#1c1917',
      textSecondary: '#57534e',
      accent: '#c2410c',
      telemetry: '#0f766e',
      evaGradient: 'linear-gradient(135deg, #7c2d12 0%, #c2410c 55%, #0f766e 100%)'
    },
    {
      id: 'martian-regolith',
      name: 'Martian Regolith',
      isLight: false,
      canvas: '#14100e',
      panel: 'rgba(31, 25, 22, 0.88)',
      elevated: '#29211d',
      border: '#382d27',
      textPrimary: '#efe5dc',
      textSecondary: '#a8988c',
      accent: '#e06d44',
      telemetry: '#d99b52',
      evaGradient: 'linear-gradient(135deg, #f7a47c 0%, #e06d44 55%, #d99b52 100%)'
    },
    {
      id: 'nasa-jpl',
      name: 'NASA JPL Tactical',
      isLight: false,
      canvas: '#0b0b0d',
      panel: 'rgba(20, 20, 23, 0.88)',
      elevated: '#1c1c21',
      border: '#27272a',
      textPrimary: '#f4f4f5',
      textSecondary: '#a1a1aa',
      accent: '#f59e0b',
      telemetry: '#ef4444',
      evaGradient: 'linear-gradient(135deg, #fde047 0%, #f59e0b 55%, #ef4444 100%)'
    },
    {
      id: 'classic-ai',
      name: 'Classic AI Slate',
      isLight: false,
      canvas: '#0b1120',
      panel: 'rgba(15, 23, 42, 0.88)',
      elevated: '#1e293b',
      border: '#334155',
      textPrimary: '#f8fafc',
      textSecondary: '#94a3b8',
      accent: '#38bdf8',
      telemetry: '#eab308',
      evaGradient: 'linear-gradient(135deg, #bae6fd 0%, #38bdf8 50%, #818cf8 100%)'
    }
  ];

  const THEME_MAP = new Map(EVA_THEMES.map((t) => [t.id, t]));
  const listeners = new Set();

  function isValidTheme(themeId) {
    return typeof themeId === 'string' && THEME_MAP.has(themeId);
  }

  function getThemeMeta(themeId) {
    return THEME_MAP.get(isValidTheme(themeId) ? themeId : DEFAULT_THEME_ID);
  }

  function getStoredTheme() {
    try {
      const saved = global.localStorage ? global.localStorage.getItem(THEME_STORAGE_KEY) : null;
      return isValidTheme(saved) ? saved : null;
    } catch (_) {
      return null;
    }
  }

  function getTheme() {
    const attr = typeof document !== 'undefined' ? document.documentElement.dataset.theme : null;
    if (isValidTheme(attr)) return attr;
    return getStoredTheme() || DEFAULT_THEME_ID;
  }

  function applyThemeToDOM(themeId) {
    const validId = isValidTheme(themeId) ? themeId : DEFAULT_THEME_ID;
    const meta = THEME_MAP.get(validId);

    if (typeof document !== 'undefined' && document.documentElement) {
      const root = document.documentElement;
      root.dataset.theme = validId;
      root.style.colorScheme = meta.isLight ? 'light' : 'dark';
      root.classList.toggle('dark', !meta.isLight);
      root.classList.toggle('light', meta.isLight);

      const themeMetaEl = document.querySelector('meta[name="theme-color"]');
      if (themeMetaEl) {
        themeMetaEl.setAttribute('content', meta.canvas);
      }
    }

    return validId;
  }

  function setTheme(themeId, options = {}) {
    const persist = options.persist !== false;
    const notify = options.notify !== false;
    const validId = applyThemeToDOM(themeId);
    const meta = THEME_MAP.get(validId);

    if (persist) {
      try {
        if (global.localStorage) {
          global.localStorage.setItem(THEME_STORAGE_KEY, validId);
        }
      } catch (_) {}
    }

    if (notify) {
      listeners.forEach((cb) => {
        try {
          cb(validId, meta);
        } catch (err) {
          console.warn('Theme listener error:', err);
        }
      });
    }

    return validId;
  }

  function onEvaThemeChange(cb) {
    if (typeof cb === 'function') {
      listeners.add(cb);
    }
    return () => listeners.delete(cb);
  }

  function initTheme() {
    const saved = getStoredTheme();
    const initial = saved || DEFAULT_THEME_ID;
    // Persist default or sanitize invalid stored preference
    const needsPersist = !saved;
    return setTheme(initial, { persist: needsPersist, notify: false });
  }

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('storage', (event) => {
      if (event.key === THEME_STORAGE_KEY) {
        const nextId = isValidTheme(event.newValue) ? event.newValue : DEFAULT_THEME_ID;
        setTheme(nextId, { persist: false, notify: true });
      }
    });
  }

  // Run immediately during <head> execution to prevent initial flash
  initTheme();

  global.EVA_THEMES = EVA_THEMES;
  global.EVA_THEME_STORAGE_KEY = THEME_STORAGE_KEY;
  global.EVA_DEFAULT_THEME = DEFAULT_THEME_ID;
  global.onEvaThemeChange = onEvaThemeChange;
  global.EvaTheme = {
    STORAGE_KEY: THEME_STORAGE_KEY,
    DEFAULT_THEME: DEFAULT_THEME_ID,
    THEMES: EVA_THEMES,
    isValidTheme,
    getThemeMeta,
    getStoredTheme,
    getTheme,
    setTheme,
    onChange: onEvaThemeChange
  };
})(typeof window !== 'undefined' ? window : globalThis);
