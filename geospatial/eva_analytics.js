/**
 * ============================================================================
 * MARS EXPLORER — EVA ANALYTICS DASHBOARD MODULE (geospatial/eva_analytics.js)
 * ============================================================================
 * Implements Parts B, C, and E:
 * - B1: Adjacent Navigation (Algorithms | Analytics) with full state preservation.
 * - B2: Region 1 — Six live Summary Metric Cards driven by actual route & suit state.
 * - B3: Region 2 (Left) — Coupled Walking Speed & Oxygen Flow Rate Along Path (Dual-Axis SVG).
 * - B4: Region 2 (Right) — Martian DEM Elevation Profile (m) Along Trajectory (MOLA DEM).
 * - B5: Region 3 — Coupled Martian EVA Mathematical Model (5 equation groups + View LaTeX Code).
 * - B6: Region 4 — Martian Surface Environment & NASA xEMU / AxEMU Spacesuit Specifications Table.
 * - C:  Real-time dynamic synchronization with route calculations, astronaut parameters,
 *       Maximum Slope settings, dust storm state, and live astronaut walking simulation.
 */

import { getAtmosphericModelConfig, calculateElevationPressure } from './atmospheric_pressure.js';

const _tr = (en, vi) => (typeof window !== 'undefined' && window.evaTr ? window.evaTr(en, vi) : en);

export class EvaAnalyticsUI {
  constructor() {
    this.isOpen = false;
    this.isLatexModalOpen = false;
    this.lastRenderTime = 0;
    this._init();
    if (typeof window !== 'undefined' && typeof window.onEvaLangChange === 'function') {
      window.onEvaLangChange(() => this._refreshLocalization());
    }
  }

  _refreshLocalization() {
    const modal = document.getElementById('evaAnalyticsModal');
    if (modal) {
      const wasLatexOpen = this.isLatexModalOpen;
      modal.innerHTML = this._getModalHTML();
      this._bindModalEvents();
      if (wasLatexOpen) {
        this.toggleLatexModal(true);
      }
      this.refreshAnalytics(true);
    }
  }

  _init() {
    this._injectAnalyticsModal();
    this._bindNavigationButtons();
    this._bindModalEvents();
  }

  _injectAnalyticsModal() {
    if (document.getElementById('evaAnalyticsModal')) return;
    const modal = document.createElement('div');
    modal.id = 'evaAnalyticsModal';
    modal.className = 'fixed inset-0 z-[100] hidden items-center justify-center bg-panel backdrop-blur-md p-2 sm:p-4 select-none';
    modal.innerHTML = this._getModalHTML();
    document.body.appendChild(modal);
  }

  _bindNavigationButtons() {
    const btnOpen = document.getElementById('btnOpenAnalytics');
    if (btnOpen) {
      btnOpen.onclick = (e) => {
        e.stopPropagation();
        this.openModal();
      };
    }
  }

  _bindModalEvents() {
    const modal = document.getElementById('evaAnalyticsModal');
    const closeBtn = document.getElementById('btnCloseAnalyticsModal');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        this.closeModal();
      };
    }

    if (modal) {
      modal.onclick = (e) => {
        if (e.target === modal) {
          e.stopPropagation();
          this.closeModal();
        }
      };
    }

    if (!this._escBound) {
      this._escBound = true;
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen) {
          if (this.isLatexModalOpen) {
            this.toggleLatexModal(false);
          } else {
            this.closeModal();
          }
        }
      });
    }

    const switchAlgoBtn = document.getElementById('btnAnalyticsSwitchToAlgorithms');
    if (switchAlgoBtn) {
      switchAlgoBtn.onclick = (e) => {
        e.stopPropagation();
        if (window.algoComparisonUI && typeof window.algoComparisonUI.openModal === 'function') {
          window.algoComparisonUI.openModal();
        }
      };
    }

    const btnRecalcAnalytics = document.getElementById('btnAnalyticsRecalculateRoute');
    if (btnRecalcAnalytics) {
      btnRecalcAnalytics.onclick = (e) => {
        e.stopPropagation();
        const calcBtn = document.getElementById('calculateRouteBtn');
        if (calcBtn && !calcBtn.disabled) {
          calcBtn.click();
        } else {
          this.refreshAnalytics(true);
        }
      };
    }

    const btnViewLatex = document.getElementById('btnViewLatexCode');
    if (btnViewLatex) {
      btnViewLatex.onclick = (e) => {
        e.stopPropagation();
        this.toggleLatexModal();
      };
    }

    const btnCloseLatex = document.getElementById('btnCloseLatexDrawer');
    if (btnCloseLatex) {
      btnCloseLatex.onclick = (e) => {
        e.stopPropagation();
        this.toggleLatexModal(false);
      };
    }

    const btnCopyLatex = document.getElementById('btnCopyLatexSource');
    if (btnCopyLatex) {
      btnCopyLatex.onclick = (e) => {
        e.stopPropagation();
        const pre = document.getElementById('latexRawSourceCode');
        if (pre && navigator.clipboard) {
          navigator.clipboard.writeText(pre.textContent || '').then(() => {
            btnCopyLatex.textContent = _tr('✓ Copied LaTeX', '✓ Đã sao chép LaTeX');
            setTimeout(() => {
              btnCopyLatex.textContent = _tr('📋 Copy LaTeX', '📋 Sao chép LaTeX');
            }, 1500);
          }).catch(() => {});
        }
      };
    }
  }

  openModal() {
    const modal = document.getElementById('evaAnalyticsModal');
    if (!modal) return;
    if (window.algoComparisonUI && typeof window.algoComparisonUI.closeModal === 'function') {
      window.algoComparisonUI.closeModal(true);
    }
    this.isOpen = true;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    if (typeof window.syncTopNavActiveSection === 'function') {
      window.syncTopNavActiveSection('analytics');
    }
    this.refreshAnalytics(true);
  }

  closeModal(silent = false) {
    const modal = document.getElementById('evaAnalyticsModal');
    this.isOpen = false;
    this.toggleLatexModal(false);
    this._hideAnalyticsTooltip();
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
    if (!silent && typeof window.syncTopNavActiveSection === 'function') {
      window.syncTopNavActiveSection(null);
    }
  }

  toggleLatexModal(forceState = null) {
    const drawer = document.getElementById('analyticsLatexCodeDrawer');
    const btn = document.getElementById('btnViewLatexCode');
    if (!drawer) return;
    this.isLatexModalOpen = forceState !== null ? Boolean(forceState) : !this.isLatexModalOpen;
    if (this.isLatexModalOpen) {
      drawer.classList.remove('hidden');
      if (btn) btn.innerHTML = `<span>${_tr('Hide LaTeX Code', 'Ẩn mã LaTeX')}</span> <span>▲</span>`;
    } else {
      drawer.classList.add('hidden');
      if (btn) btn.innerHTML = `<span>&lt;/&gt; ${_tr('View LaTeX Code', 'Xem mã LaTeX')}</span>`;
    }
  }

  /**
   * Re-evaluates the current route path using the latest astronaut profile & slope constraints
   * so that changing walking speed, body mass, equipment mass, or O2 capacity immediately
   * updates all Analytics metrics and charts without losing the active trajectory.
   */
  _getSynchronizedRouteData() {
    const st = window.state || {};
    const route = st.currentRoute;
    const walker = st.walkerParameters || {
      speed: 1.2,
      bodyMass: 80.0,
      equipmentMass: 15.0,
      oxygenCapacity: 1200.0,
      suitMass: 50.0,
      maxSafeSlopeDeg: 22.0
    };

    if (!route || !route.path || route.path.length < 2) {
      return { hasRoute: false, route: null, walker };
    }

    // Check if walker parameters or slope threshold changed since route.metrics was computed
    const m = route.metrics || {};
    const currentMaxSlope = Number(window.evaSettings?.settings?.maxSafeSlopeDeg) || Number(walker.maxSafeSlopeDeg) || 22.0;
    const needsRevalidation = (
      Math.abs((Number(m.speedMS) || 1.2) - Number(walker.speed || 1.2)) > 1e-4 ||
      Math.abs((Number(m.bodyMassKg) || 80.0) - Number(walker.bodyMass || 80.0)) > 1e-4 ||
      Math.abs((Number(m.equipmentMassKg) ?? 15.0) - Number(walker.equipmentMass ?? 15.0)) > 1e-4 ||
      Math.abs((Number(m.initialO2L) || 1200.0) - Number(walker.oxygenCapacity || 1200.0)) > 1e-4 ||
      Math.abs((Number(m.thetaMaxUp) || 22.0) - currentMaxSlope) > 1e-4 ||
      !route.waypoints ||
      route.waypoints.length === 0 ||
      route.waypoints[0].effectiveSpeedMS === undefined
    );

    if (needsRevalidation && typeof window.validateRoutePath === 'function' && window.localPlanner?.elevationGrid) {
      try {
        const rawGridPath = route.path.map(pt => {
          if (pt.r !== undefined && pt.c !== undefined) return { r: pt.r, c: pt.c };
          const r = ((90.0 - pt.lat) / 180.0) * 360.0;
          const normLon = ((pt.lon % 360.0) + 360.0) % 360.0;
          const c = (normLon / 360.0) * 720.0;
          return { r, c };
        });
        const validated = window.validateRoutePath(
          rawGridPath,
          {
            elevationGrid: window.localPlanner.elevationGrid,
            slopeGrid: window.localPlanner.slopeGrid,
            rows: 360,
            cols: 720
          },
          { ...walker, maxSafeSlopeDeg: currentMaxSlope },
          {},
          { maxSafeSlope: currentMaxSlope }
        );
        if (validated && validated.metrics) {
          route.metrics = validated.metrics;
          route.waypoints = validated.waypoints;
          route.segments = validated.segments;
          route.trajectorySamples = validated.trajectorySamples || validated.waypoints;
        }
      } catch (e) {
        console.warn('Analytics live revalidation fallback:', e);
      }
    } else if (needsRevalidation && m.totalDistanceM > 0) {
      // Lightweight analytical rescaling if localPlanner binary grid hasn't been fetched on main thread yet
      const speedMS = Math.max(0.1, Math.min(15.0, Number(walker.speed) || 1.2));
      const bodyMassKg = Number(walker.bodyMass) || 80.0;
      const equipmentMassKg = walker.equipmentMass !== undefined ? Number(walker.equipmentMass) : 15.0;
      const suitMassKg = 50.0;
      const totalMassKg = bodyMassKg + equipmentMassKg + suitMassKg;
      const initialO2L = Number(walker.oxygenCapacity) || 1200.0;
      const totalDistM = Number(m.totalDistanceM) || 0;
      const totalAscentM = Number(m.totalAscentM) || 0;
      const totalDescentM = Number(m.totalDescentM) || 0;
      const massPenaltyTerm = 0.002 * Math.max(0.0, totalMassKg - 110.0) * (3.721 / 9.81);
      const speedMetabolicFactor = 0.65 + 0.35 * Math.pow(speedMS / 1.2, 0.85);
      const uphillGrade = totalDistM > 0 ? totalAscentM / totalDistM : 0.0;
      const downhillGrade = totalDistM > 0 ? totalDescentM / totalDistM : 0.0;
      const metabolicMult = (1.0 + 3.6 * uphillGrade + 0.8 * downhillGrade + massPenaltyTerm) * speedMetabolicFactor;
      const avgO2RateLMin = Math.round(2.8 * metabolicMult * 100) / 100;
      const traversalTimeSec = totalDistM / speedMS;
      const timeMin = traversalTimeSec / 60.0;
      const totalO2L = Math.round(avgO2RateLMin * timeMin * 10) / 10;
      const remainingO2L = Math.round((initialO2L - totalO2L) * 10) / 10;
      const returnReserveO2L = Math.round(initialO2L * 0.20 * 10) / 10;
      const prevMass = Number(m.totalMassKg) || 145.0;
      const massRatio = totalMassKg / Math.max(1.0, prevMass);
      const totalEnergyKJ = (Number(m.totalEnergyKJ) || 0) * massRatio;
      const totalEnergyKcal = Math.round((totalEnergyKJ / 4.184) * 10) / 10;
      const totalEnergyWh = Math.round((totalEnergyKJ / 3.6) * 10) / 10;
      const avgMetabolicPowerW = traversalTimeSec > 0 ? Math.round(((totalEnergyKJ * 1000.0) / traversalTimeSec) * 10) / 10 : 0.0;

      m.speedMS = speedMS;
      m.configuredSpeedMS = speedMS;
      m.bodyMassKg = bodyMassKg;
      m.equipmentMassKg = equipmentMassKg;
      m.totalMassKg = totalMassKg;
      m.initialO2L = initialO2L;
      m.avgO2RateLMin = avgO2RateLMin;
      m.totalO2L = totalO2L;
      m.remainingO2L = remainingO2L;
      m.returnReserveO2L = returnReserveO2L;
      m.o2UsedPct = Math.round((totalO2L / initialO2L) * 1000) / 10;
      m.isOxygenFeasible = remainingO2L >= 0;
      m.hasReserveMargin = remainingO2L >= returnReserveO2L;
      m.traversalTimeHrs = traversalTimeSec / 3600.0;
      m.traversalTimeMin = Math.round(timeMin * 10) / 10;
      m.totalEnergyKJ = totalEnergyKJ;
      m.totalEnergyKcal = totalEnergyKcal;
      m.totalEnergyWh = totalEnergyWh;
      m.avgMetabolicPowerW = avgMetabolicPowerW;
      m.o2LimitedEnduranceHrs = avgO2RateLMin > 0 ? Math.round(((initialO2L / avgO2RateLMin) / 60.0) * 100) / 100 : 8.0;
      m.thetaMaxUp = currentMaxSlope;
      m.thetaMaxDown = 0.75 * currentMaxSlope;
      m.thetaRef = 0.4 * currentMaxSlope;

      // Update segments and waypoints proportionally
      const segs = route.segments || [];
      const wps = route.waypoints || [];
      let sumEffSpd = 0.0;
      let peakO2 = 0.0;
      let minO2 = Infinity;
      let cumD = 0.0;
      if (wps.length > 0) {
        wps[0].cumDistM = 0.0;
        wps[0].cumDistKm = 0.0;
      }
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const sDist = Math.max(1e-3, Number(s.distanceM) || 1000.0);
        const clampedK = Number.isFinite(s.costMultiplier) ? Math.max(0.5, Math.min(12.0, s.costMultiplier)) : 1.0;
        const dustImp = 1.0 + 0.10 * Math.max(0.0, Number(s.tau) || 0.0);
        const effSpd = Math.round((speedMS / (Math.sqrt(clampedK) * dustImp)) * 1000) / 1000;
        const upG = s.elevationChangeM > 0 ? s.elevationChangeM / sDist : 0.0;
        const dnG = s.elevationChangeM < 0 ? Math.abs(s.elevationChangeM) / sDist : 0.0;
        const sO2 = Math.round(2.8 * (1.0 + 3.6 * upG + 0.8 * dnG + massPenaltyTerm) * speedMetabolicFactor * 100) / 100;
        s.cumDistStartM = cumD;
        cumD += sDist;
        s.cumDistEndM = cumD;
        s.effectiveSpeedMS = effSpd;
        s.o2RateLMin = sO2;
        sumEffSpd += effSpd * sDist;
        peakO2 = Math.max(peakO2, sO2);
        minO2 = Math.min(minO2, sO2);
        if (wps[i + 1]) {
          wps[i + 1].cumDistM = cumD;
          wps[i + 1].cumDistKm = cumD / 1000.0;
          wps[i + 1].effectiveSpeedMS = effSpd;
          wps[i + 1].o2RateLMin = sO2;
        }
      }
      if (wps.length > 0 && segs.length > 0) {
        wps[0].effectiveSpeedMS = segs[0].effectiveSpeedMS;
        wps[0].o2RateLMin = segs[0].o2RateLMin;
      }
      m.avgEffectiveSpeedMS = totalDistM > 0 ? Math.round((sumEffSpd / totalDistM) * 1000) / 1000 : speedMS;
      m.peakO2RateLMin = peakO2 > 0 ? peakO2 : avgO2RateLMin;
      m.minO2RateLMin = Number.isFinite(minO2) ? minO2 : avgO2RateLMin;
    }

    return { hasRoute: true, route, walker };
  }

  /**
   * Main entry point to update all 4 regions of the Analytics Dashboard.
   * Throttled during live walking animation so map rendering stays at 60 FPS.
   */
  refreshAnalytics(force = false) {
    if (!this.isOpen && !force) return;
    const now = performance.now();
    if (!force && (now - this.lastRenderTime < 120)) return;
    this.lastRenderTime = now;

    const syncData = this._getSynchronizedRouteData();
    const walkerState = typeof window.getWalkerState === 'function' ? window.getWalkerState() : null;

    this._renderContextBanner(syncData, walkerState);
    this._renderRegion1SummaryCards(syncData, walkerState);
    this._renderRegion2CoupledSpeedO2Chart(syncData, walkerState);
    this._renderRegion2ElevationChart(syncData, walkerState);
    this._renderRegion3MathematicalModel(syncData);
    this._renderRegion4EnvironmentTable(syncData, walkerState);
  }

  _renderContextBanner(syncData, walkerState) {
    const banner = document.getElementById('analyticsRouteContextSummary');
    if (!banner) return;
    const st = window.state || {};
    const algoKey = st.activeAlgorithm || 'field_dstar';
    const algoNames = {
      astar: _tr('A* (8-Neighbor Grid)', 'A* (Lưới 8 hướng)'),
      dstar_lite: _tr('D* Lite (Incremental)', 'D* Lite (Tăng dần)'),
      field_dstar: _tr('Field D* (Any-Angle)', 'Field D* (Mọi góc)'),
      fmm: _tr('Fast Marching (Eikonal PDE)', 'Fast Marching (PDE Eikonal)')
    };
    const algoLabel = algoNames[algoKey] || algoKey;
    const w = syncData.walker;
    const totalMass = (Number(w.bodyMass) || 80) + (Number(w.equipmentMass) ?? 15) + 50;

    if (!syncData.hasRoute) {
      banner.innerHTML = `
        <span class="text-secondary font-bold">${_tr('No Active Route Selected', 'Chưa chọn lộ trình hoạt động')}</span>
        <span class="text-muted">•</span>
        <span>${_tr('Algorithm:', 'Thuật toán:')} <strong class="text-accent">${algoLabel}</strong></span>
        <span class="text-muted">•</span>
        <span>${_tr('Suit Mass Config:', 'Khối lượng bộ đồ:')} <strong class="text-primary">${totalMass.toFixed(0)} kg</strong> | v₀ = <strong class="text-accent">${Number(w.speed || 1.2).toFixed(1)} m/s</strong> | O₂ = <strong class="text-emerald-300">${Number(w.oxygenCapacity || 1200).toFixed(0)} L</strong></span>
      `;
      return;
    }

    const r = syncData.route;
    const m = r.metrics || {};
    const sPt = st.startPoint || r.path[0];
    const dPt = st.destPoint || r.path[r.path.length - 1];
    const simBadge = walkerState && walkerState.walkProgress > 0
      ? `<span class="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/50 font-bold">${_tr('SIMULATION', 'MÔ PHỎNG')} ${(walkerState.walkProgress * 100).toFixed(0)}% (${(walkerState.walkSimulatedDistanceM / 1000).toFixed(2)} km)</span>`
      : `<span class="px-2 py-0.5 rounded bg-panel text-secondary border border-subtle">${_tr('PLANNED TRAJECTORY', 'QUỸ ĐẠO DỰ KIẾN')}</span>`;

    banner.innerHTML = `
      <span>${_tr('Route:', 'Lộ trình:')} <strong class="text-secondary">${sPt.lat.toFixed(2)}°, ${sPt.lon.toFixed(2)}°</strong> → <strong class="text-accent">${dPt.lat.toFixed(2)}°, ${dPt.lon.toFixed(2)}°</strong></span>
      <span class="text-muted">|</span>
      <span>${_tr('Solver:', 'Bộ giải:')} <strong class="text-accent">${r.algorithmUsed || algoLabel}</strong></span>
      <span class="text-muted">|</span>
      <span>${_tr('Mass:', 'Khối lượng:')} <strong class="text-primary">${(m.totalMassKg || totalMass).toFixed(0)} kg</strong> (${m.bodyMassKg || w.bodyMass} + ${m.equipmentMassKg ?? w.equipmentMass} + 50 kg xEMU)</span>
      <span class="text-muted">|</span>
      <span>${_tr('Max Slope:', 'Độ dốc tối đa:')} <strong class="text-emerald-300">+${(m.thetaMaxUp || 22).toFixed(1)}°</strong> / <strong class="text-secondary">-${(m.thetaMaxDown || 16.5).toFixed(1)}°</strong></span>
      <span class="text-muted">|</span>
      ${simBadge}
    `;
  }

  // ==========================================================================
  // REGION 1: SIX SUMMARY METRIC CARDS (Part B2)
  // ==========================================================================
  _renderRegion1SummaryCards(syncData, walkerState) {
    const container = document.getElementById('analyticsSummaryCardsGrid');
    if (!container) return;

    if (!syncData.hasRoute) {
      const w = syncData.walker;
      container.innerHTML = `
        ${this._buildMetricCard({
          id: 'card-distance',
          title: _tr('1. Total Traverse Distance', '1. Tổng quãng đường di chuyển'),
          value: 'N/A',
          unit: '',
          accent: 'text-secondary',
          border: 'border-subtle',
          subtitle: _tr('Select Start & Destination on map and click Calculate Route to compute trajectory distance.', 'Chọn Điểm xuất phát & Đích trên bản đồ rồi nhấp Tính toán Lộ trình để tính quãng đường.')
        })}
        ${this._buildMetricCard({
          id: 'card-duration',
          title: _tr('2. EVA Duration vs. Suit Limit', '2. Thời lượng EVA so với Giới hạn Bộ đồ'),
          value: 'N/A',
          unit: _tr('/ 8.0 h Limit', '/ Giới hạn 8.0 giờ'),
          accent: 'text-secondary',
          border: 'border-subtle',
          subtitle: _tr('Hard Operational Suit Limit: 8.0 h (NASA xEMU SOR). Awaiting active route.', 'Giới hạn vận hành cứng của bộ đồ: 8.0 giờ (NASA xEMU SOR). Đang chờ lộ trình.')
        })}
        ${this._buildMetricCard({
          id: 'card-speed',
          title: _tr('3. Effective Walking Speed', '3. Tốc độ đi bộ hiệu dụng'),
          value: Number(w.speed || 1.2).toFixed(2),
          unit: _tr('m/s (Configured)', 'm/s (Đã cấu hình)'),
          accent: 'text-accent',
          border: 'border-accent-soft',
          subtitle: _tr(`Configured nominal speed v₀ = ${Number(w.speed || 1.2).toFixed(2)} m/s (${(Number(w.speed || 1.2) * 3.6).toFixed(1)} km/h). Route-coupled average requires active route.`, `Tốc độ danh định v₀ = ${Number(w.speed || 1.2).toFixed(2)} m/s (${(Number(w.speed || 1.2) * 3.6).toFixed(1)} km/h). Trung bình theo lộ trình cần lộ trình hoạt động.`)
        })}
        ${this._buildMetricCard({
          id: 'card-o2-rate',
          title: _tr('4. Oxygen Flow Rate', '4. Lưu lượng tiêu thụ Oxy'),
          value: 'N/A',
          unit: _tr('L/min', 'L/phút'),
          accent: 'text-secondary',
          border: 'border-subtle',
          subtitle: _tr('Baseline flat-terrain reference: 2.80 L/min. Segment flow rate requires active route.', 'Tham chiếu địa hình phẳng cơ sở: 2.80 L/phút. Lưu lượng từng chặng cần lộ trình hoạt động.')
        })}
        ${this._buildMetricCard({
          id: 'card-o2-total',
          title: _tr('5. Total Oxygen Consumed', '5. Tổng lượng Oxy tiêu thụ'),
          value: 'N/A',
          unit: 'L',
          accent: 'text-secondary',
          border: 'border-subtle',
          subtitle: _tr('Cumulative O₂ (L) and Minetti-Mars metabolic energy (kcal / kJ) require active route.', 'Tổng O₂ tích lũy (L) và năng lượng trao đổi chất Minetti-Mars (kcal / kJ) cần lộ trình hoạt động.')
        })}
        ${this._buildMetricCard({
          id: 'card-reserve',
          title: _tr('6. xEMU O₂ & Battery Reserve', '6. Dự trữ O₂ & Pin xEMU'),
          value: Number(w.oxygenCapacity || 1200).toFixed(0),
          unit: 'L (100% O₂)',
          accent: 'text-emerald-300',
          border: 'border-emerald-500/30',
          subtitle: _tr(`Configured O₂: ${Number(w.oxygenCapacity || 1200).toFixed(0)} L (20% Return Reserve: ${(Number(w.oxygenCapacity || 1200) * 0.2).toFixed(0)} L). Battery discharge: Not Modeled (Spec: 20.5V 40Ah / 820 Wh).`, `O₂ cấu hình: ${Number(w.oxygenCapacity || 1200).toFixed(0)} L (Dự trữ quay về 20%: ${(Number(w.oxygenCapacity || 1200) * 0.2).toFixed(0)} L). Xả pin: Chưa mô phỏng (Thông số: 20.5V 40Ah / 820 Wh).`)
        })}
      `;
      return;
    }

    const m = syncData.route.metrics || {};
    const totalDistKm = Number(m.totalDistanceKm) || 0;
    const totalDistM = Number(m.totalDistanceM) || 0;
    const simDistM = walkerState ? (Number(walkerState.walkSimulatedDistanceM) || 0) : 0;
    const simDistKm = simDistM / 1000.0;
    const simPct = walkerState ? Math.round((Number(walkerState.walkProgress) || 0) * 100) : 0;

    // 1. Total Traverse Distance
    const distDisplayVal = totalDistKm >= 1.0 ? totalDistKm.toFixed(2) : Math.round(totalDistM).toLocaleString();
    const distDisplayUnit = totalDistKm >= 1.0 ? 'km' : 'm';
    const distSubtitle = simDistM > 0
      ? _tr(`Planned: ${Math.round(totalDistM).toLocaleString()} m (${totalDistKm.toFixed(2)} km) • Traversed: ${simDistKm.toFixed(2)} km (${simPct}%)`, `Dự kiến: ${Math.round(totalDistM).toLocaleString()} m (${totalDistKm.toFixed(2)} km) • Đã đi: ${simDistKm.toFixed(2)} km (${simPct}%)`)
      : _tr(`Planned: ${Math.round(totalDistM).toLocaleString()} m (${(syncData.route.waypoints || []).length} pts) • Traversed: 0.00 km (Sim Idle)`, `Dự kiến: ${Math.round(totalDistM).toLocaleString()} m (${(syncData.route.waypoints || []).length} điểm) • Đã đi: 0.00 km (Chờ mô phỏng)`);

    // 2. EVA Duration vs. Suit Limit
    const estHrs = Number(m.traversalTimeHrs) || 0;
    const suitLimitHrs = Number(m.suitMaxEvaLimitHrs) || 8.0;
    const o2EnduranceHrs = Number(m.o2LimitedEnduranceHrs) || (m.avgO2RateLMin > 0 ? (m.initialO2L / m.avgO2RateLMin) / 60.0 : 8.0);
    const withinSuitLimit = estHrs <= suitLimitHrs;
    const durAccent = withinSuitLimit ? 'text-emerald-300' : 'text-secondary';
    const durSubtitle = _tr(`Estimated Traverse: ${estHrs.toFixed(2)} h (${Math.round(estHrs * 60)} min) vs. Hard Suit Limit: ${suitLimitHrs.toFixed(1)} h (O₂ Endurance: ${o2EnduranceHrs.toFixed(1)} h)`, `Thời gian dự kiến: ${estHrs.toFixed(2)} giờ (${Math.round(estHrs * 60)} phút) so với Giới hạn cứng: ${suitLimitHrs.toFixed(1)} giờ (Sức bền O₂: ${o2EnduranceHrs.toFixed(1)} giờ)`);

    // 3. Effective Walking Speed
    const avgEffSpd = Number(m.avgEffectiveSpeedMS) || Number(m.speedMS) || 1.2;
    const cfgSpd = Number(m.configuredSpeedMS) || Number(m.speedMS) || 1.2;
    const minEffSpd = Number(m.minEffectiveSpeedMS) || avgEffSpd;
    const maxEffSpd = Number(m.maxEffectiveSpeedMS) || avgEffSpd;
    const spdSubtitle = _tr(`Configured Max v₀: ${cfgSpd.toFixed(2)} m/s (${(cfgSpd * 3.6).toFixed(1)} km/h) • Segment Range: ${minEffSpd.toFixed(2)}–${maxEffSpd.toFixed(2)} m/s`, `Tốc độ v₀ tối đa: ${cfgSpd.toFixed(2)} m/s (${(cfgSpd * 3.6).toFixed(1)} km/h) • Biên độ chặng: ${minEffSpd.toFixed(2)}–${maxEffSpd.toFixed(2)} m/s`);

    // 4. Oxygen Flow Rate
    const avgO2Rate = Number(m.avgO2RateLMin) || 2.8;
    const peakO2Rate = Number(m.peakO2RateLMin) || avgO2Rate;
    const minO2Rate = Number(m.minO2RateLMin) || avgO2Rate;
    const o2RateSubtitle = _tr(`Peak Flow Rate: ${peakO2Rate.toFixed(2)} L/min • Min Flow Rate: ${minO2Rate.toFixed(2)} L/min`, `Lưu lượng đỉnh: ${peakO2Rate.toFixed(2)} L/phút • Lưu lượng tối thiểu: ${minO2Rate.toFixed(2)} L/phút`);

    // 5. Total Oxygen Consumed (+ Energy in kcal & kJ)
    const totalO2L = Number(m.totalO2L) || 0;
    const energyKJ = Number(m.totalEnergyKJ) || 0;
    const energyKcal = Number(m.totalEnergyKcal) || Math.round((energyKJ / 4.184) * 10) / 10;
    const avgPowerW = Number(m.avgMetabolicPowerW) || 0;
    const o2TotalSubtitle = _tr(`Metabolic Energy: ${energyKcal.toLocaleString()} kcal (${energyKJ.toFixed(1)} kJ • Avg ${avgPowerW.toFixed(0)} W)`, `Năng lượng trao đổi chất: ${energyKcal.toLocaleString()} kcal (${energyKJ.toFixed(1)} kJ • TB ${avgPowerW.toFixed(0)} W)`);

    // 6. xEMU O2 and Battery Reserve
    const initO2L = Number(m.initialO2L) || 1200.0;
    const remO2L = Number(m.remainingO2L) ?? (initO2L - totalO2L);
    const remO2Pct = initO2L > 0 ? Math.max(0.0, (remO2L / initO2L) * 100.0) : 0.0;
    const returnResL = Number(m.returnReserveO2L) || (initO2L * 0.20);
    const energyWh = Number(m.totalEnergyWh) || Math.round((energyKJ / 3.6) * 10) / 10;
    const reserveAccent = remO2L >= returnResL ? 'text-emerald-300' : (remO2L >= 0 ? 'text-secondary' : 'text-rose-400');
    const reserveBorder = remO2L >= returnResL ? 'border-emerald-500/40' : (remO2L >= 0 ? 'border-strong' : 'border-rose-500/50');
    const reserveSubtitle = _tr(`Return O₂ Req (20%): ${returnResL.toFixed(1)} L • Battery Reserve: N/A (Static Spec 20.5V 40Ah / 820 Wh; Mech. Work Equiv: ${energyWh.toFixed(1)} Wh)`, `Yêu cầu O₂ quay về (20%): ${returnResL.toFixed(1)} L • Dự trữ Pin: N/A (Thông số tĩnh 20.5V 40Ah / 820 Wh; Tương đương công cơ học: ${energyWh.toFixed(1)} Wh)`);

    container.innerHTML = `
      ${this._buildMetricCard({
        id: 'card-distance',
        title: _tr('1. Total Traverse Distance', '1. Tổng quãng đường di chuyển'),
        value: distDisplayVal,
        unit: distDisplayUnit,
        accent: 'text-accent',
        border: 'border-accent-soft',
        subtitle: distSubtitle
      })}
      ${this._buildMetricCard({
        id: 'card-duration',
        title: _tr('2. EVA Duration vs. Suit Limit', '2. Thời lượng EVA so với Giới hạn Bộ đồ'),
        value: estHrs.toFixed(2),
        unit: _tr(`h / ${suitLimitHrs.toFixed(1)} h Limit`, `giờ / Giới hạn ${suitLimitHrs.toFixed(1)} giờ`),
        accent: durAccent,
        border: withinSuitLimit ? 'border-emerald-500/30' : 'border-strong',
        subtitle: durSubtitle
      })}
      ${this._buildMetricCard({
        id: 'card-speed',
        title: _tr('3. Effective Walking Speed', '3. Tốc độ đi bộ hiệu dụng'),
        value: avgEffSpd.toFixed(2),
        unit: 'm/s',
        accent: 'text-accent',
        border: 'border-accent-soft',
        subtitle: spdSubtitle
      })}
      ${this._buildMetricCard({
        id: 'card-o2-rate',
        title: _tr('4. Oxygen Flow Rate', '4. Lưu lượng tiêu thụ Oxy'),
        value: avgO2Rate.toFixed(2),
        unit: _tr('L/min', 'L/phút'),
        accent: 'text-rose-300',
        border: 'border-rose-500/30',
        subtitle: o2RateSubtitle
      })}
      ${this._buildMetricCard({
        id: 'card-o2-total',
        title: _tr('5. Total Oxygen Consumed', '5. Tổng lượng Oxy tiêu thụ'),
        value: totalO2L.toFixed(1),
        unit: 'L',
        accent: 'text-secondary',
        border: 'border-strong',
        subtitle: o2TotalSubtitle
      })}
      ${this._buildMetricCard({
        id: 'card-reserve',
        title: _tr('6. xEMU O₂ & Battery Reserve', '6. Dự trữ O₂ & Pin xEMU'),
        value: `${remO2L.toFixed(1)} L`,
        unit: `(${remO2Pct.toFixed(1)}% O₂)`,
        accent: reserveAccent,
        border: reserveBorder,
        subtitle: reserveSubtitle
      })}
    `;
  }

  _buildMetricCard({ id, title, value, unit, accent, border, subtitle }) {
    return `
      <div id="${id}" class="analytics-summary-card p-3 rounded-xl bg-panel border ${border} shadow-lg flex flex-col justify-between gap-1.5">
        <div class="text-[10px] font-bold uppercase tracking-wider text-secondary truncate" title="${title}">${title}</div>
        <div class="flex items-baseline gap-1.5 mono my-0.5">
          <span class="analytics-card-value text-lg font-extrabold ${accent}">${value}</span>
          <span class="analytics-card-unit text-[11px] font-semibold text-secondary">${unit}</span>
        </div>
        <div class="analytics-card-subtitle text-[10px] text-secondary leading-snug border-t border-subtle pt-1.5">${subtitle}</div>
      </div>
    `;
  }

  // ==========================================================================
  // REGION 2 (LEFT): COUPLED WALKING SPEED & OXYGEN FLOW RATE CHART (Part B3)
  // ==========================================================================
  _computeNiceScale(minVal, maxVal, tickCount = 4, forceZeroMin = false) {
    let lo = forceZeroMin ? 0.0 : (Number.isFinite(minVal) ? minVal : 0.0);
    let hi = Number.isFinite(maxVal) ? maxVal : 1.0;
    if (hi <= lo + 1e-6) {
      hi = lo + 1.0;
    }
    const span = hi - lo;
    const rawStep = span / tickCount;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const niceMults = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    let step = 10 * mag;
    for (const m of niceMults) {
      const candidate = m * mag;
      const niceLo = forceZeroMin ? 0.0 : Math.floor(lo / candidate) * candidate;
      const niceHi = niceLo + candidate * tickCount;
      if (niceHi >= hi - 1e-9) {
        step = candidate;
        lo = niceLo;
        hi = niceHi;
        break;
      }
    }
    const ticks = [];
    for (let i = 0; i <= tickCount; i++) {
      ticks.push(Number((lo + i * step).toFixed(6)));
    }
    return { min: lo, max: hi, step, tickCount, ticks };
  }

  _formatTickNum(val, step) {
    if (Math.abs(val) < 1e-9) return '0';
    if (step >= 100) return Math.round(val).toLocaleString();
    if (step >= 1) return Number.isInteger(step) ? String(Math.round(val)) : val.toFixed(1);
    if (step >= 0.1) return val.toFixed(2).replace(/0$/, '');
    return val.toFixed(2);
  }

  _renderRegion2CoupledSpeedO2Chart(syncData, walkerState) {
    const container = document.getElementById('analyticsCoupledSpeedO2ChartContainer');
    const metaBadge = document.getElementById('analyticsCoupledChartMeta');
    if (!container) return;

    if (!syncData.hasRoute || !syncData.route.waypoints || syncData.route.waypoints.length < 2) {
      container.innerHTML = `
        <div class="h-full flex flex-col items-center justify-center text-secondary text-xs gap-1 p-4 text-center">
          <span class="text-base">📉</span>
          <span class="font-bold text-secondary">${_tr('No Active Route Trajectory', 'Chưa có Quỹ đạo Lộ trình Hoạt động')}</span>
          <span class="text-[11px] text-muted">${_tr('Calculate a route in Marswalk Planner to plot coupled Oxygen Flow Rate (L/min) and Effective Walking Speed (m/s) along the path.', 'Hãy tính toán lộ trình trong Trình lập lộ trình Marswalk để vẽ biểu đồ Lưu lượng Oxy (L/phút) và Tốc độ đi bộ hiệu dụng (m/s) dọc đường đi.')}</span>
        </div>
      `;
      if (metaBadge) metaBadge.textContent = _tr('Awaiting Route', 'Đang chờ lộ trình');
      return;
    }

    const wps = (syncData.route.trajectorySamples && syncData.route.trajectorySamples.length >= 2)
      ? syncData.route.trajectorySamples
      : syncData.route.waypoints;
    const m = syncData.route.metrics || {};
    const totalDistKm = Math.max(0.001, (wps[wps.length - 1].cumDistM || m.totalDistanceM || 1000.0) / 1000.0);
    const useMeters = totalDistKm < 2.0;
    const distUnit = useMeters ? 'm' : 'km';
    const maxDistVal = useMeters ? (totalDistKm * 1000.0) : totalDistKm;

    const o2Values = wps.map(w => Number(w.o2RateLMin) || Number(m.avgO2RateLMin) || 2.8);
    const spdValues = wps.map(w => Number(w.effectiveSpeedMS) || Number(m.speedMS) || 1.2);

    const minO2 = Math.max(0.0, Math.min(...o2Values) * 0.9);
    const maxO2 = Math.max(...o2Values) * 1.08;
    const minSpd = Math.max(0.0, Math.min(...spdValues) * 0.85);
    const maxSpd = Math.max(...spdValues, Number(m.configuredSpeedMS) || 1.2) * 1.08;

    const leftScale = this._computeNiceScale(minO2, maxO2, 4, false);
    const rightScale = this._computeNiceScale(minSpd, maxSpd, 4, false);
    const xScale = this._computeNiceScale(0, maxDistVal, 5, true);

    if (metaBadge) {
      metaBadge.textContent = _tr(`${wps.length} Samples • Avg VO₂: ${(m.avgO2RateLMin || 2.8).toFixed(2)} L/min • Avg v_eff: ${(m.avgEffectiveSpeedMS || m.speedMS || 1.2).toFixed(2)} m/s`, `${wps.length} Mẫu • VO₂ TB: ${(m.avgO2RateLMin || 2.8).toFixed(2)} L/phút • v_eff TB: ${(m.avgEffectiveSpeedMS || m.speedMS || 1.2).toFixed(2)} m/s`);
    }

    const svgW = 540;
    const svgH = 235;
    const padL = 56;
    const padR = 56;
    const padT = 26;
    const padB = 38;
    const plotW = svgW - padL - padR;
    const plotH = svgH - padT - padB;
    const baseY = padT + plotH;

    let svg = `<svg viewBox="0 0 ${svgW} ${svgH}" class="w-full h-full select-none" id="svgCoupledSpeedO2Chart" data-sample-count="${wps.length}" data-left-unit="L/min" data-right-unit="m/s">`;

    // Axis Headers
    svg += `<text x="${padL - 4}" y="14" font-size="9.5" font-weight="bold" fill="var(--accent-telemetry)" text-anchor="end" font-family="monospace">${_tr('O₂ Flow (L/min)', 'Lưu lượng O₂ (L/p)')}</text>`;
    svg += `<text x="${svgW - padR + 4}" y="14" font-size="9.5" font-weight="bold" fill="var(--text-secondary)" text-anchor="start" font-family="monospace">${_tr('Speed (m/s)', 'Tốc độ (m/s)')}</text>`;

    // Horizontal Grid & Dual Y-Axis Ticks
    for (let i = 0; i <= 4; i++) {
      const frac = i / 4;
      const y = baseY - frac * plotH;
      const lVal = leftScale.ticks[i];
      const rVal = rightScale.ticks[i];
      const lStr = this._formatTickNum(lVal, leftScale.step);
      const rStr = this._formatTickNum(rVal, rightScale.step);
      svg += `
        <line x1="${padL}" y1="${y.toFixed(1)}" x2="${svgW - padR}" y2="${y.toFixed(1)}" stroke="${i === 0 ? 'var(--border-strong)' : 'var(--border-subtle)'}" stroke-width="1" ${i === 0 ? '' : 'stroke-dasharray="3,3"'}/>
        <line x1="${padL - 4}" y1="${y.toFixed(1)}" x2="${padL}" y2="${y.toFixed(1)}" stroke="var(--accent-telemetry)" stroke-width="1.2"/>
        <text x="${padL - 7}" y="${(y + 3).toFixed(1)}" font-size="9" fill="var(--accent-telemetry)" text-anchor="end" font-family="monospace">${lStr}</text>
        <line x1="${svgW - padR}" y1="${y.toFixed(1)}" x2="${svgW - padR + 4}" y2="${y.toFixed(1)}" stroke="var(--text-secondary)" stroke-width="1.2"/>
        <text x="${svgW - padR + 7}" y="${(y + 3).toFixed(1)}" font-size="9" fill="var(--text-secondary)" text-anchor="start" font-family="monospace">${rStr}</text>
      `;
    }

    // X-Axis Distance Ticks
    const xTicks = 5;
    for (let i = 0; i <= xTicks; i++) {
      const frac = i / xTicks;
      const x = padL + frac * plotW;
      const dVal = frac * maxDistVal;
      const dLabel = maxDistVal >= 20 ? Math.round(dVal).toLocaleString() : dVal.toFixed(1);
      svg += `
        <line x1="${x.toFixed(1)}" y1="${baseY}" x2="${x.toFixed(1)}" y2="${baseY + 4}" stroke="var(--text-muted)" stroke-width="1"/>
        <text x="${x.toFixed(1)}" y="${baseY + 15}" font-size="8.5" fill="var(--text-secondary)" text-anchor="middle" font-family="monospace">${dLabel} ${distUnit}</text>
      `;
    }
    svg += `<text x="${padL + plotW / 2}" y="${svgH - 4}" font-size="9" fill="var(--text-muted)" text-anchor="middle" font-family="monospace">${_tr('Distance Along Route', 'Quãng đường dọc lộ trình')} (${distUnit})</text>`;

    // Left & Right Axis Spines
    svg += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${baseY}" stroke="var(--accent-telemetry)" stroke-width="1.5"/>`;
    svg += `<line x1="${svgW - padR}" y1="${padT}" x2="${svgW - padR}" y2="${baseY}" stroke="var(--text-secondary)" stroke-width="1.5"/>`;

    // Build Polyline Coordinates
    const o2Points = [];
    const spdPoints = [];
    const o2Span = Math.max(1e-6, leftScale.max - leftScale.min);
    const spdSpan = Math.max(1e-6, rightScale.max - rightScale.min);

    wps.forEach((w, idx) => {
      const d = useMeters ? (w.cumDistM || 0) : ((w.cumDistM || 0) / 1000.0);
      const x = padL + Math.min(1.0, Math.max(0.0, d / Math.max(1e-6, maxDistVal))) * plotW;
      const yO2 = baseY - Math.min(1.0, Math.max(0.0, (o2Values[idx] - leftScale.min) / o2Span)) * plotH;
      const ySpd = baseY - Math.min(1.0, Math.max(0.0, (spdValues[idx] - rightScale.min) / spdSpan)) * plotH;
      o2Points.push(`${x.toFixed(1)},${yO2.toFixed(1)}`);
      spdPoints.push(`${x.toFixed(1)},${ySpd.toFixed(1)}`);
    });

    // Subtle Area Fills + Polylines
    if (o2Points.length >= 2) {
      const firstX = o2Points[0].split(',')[0];
      const lastX = o2Points[o2Points.length - 1].split(',')[0];
      svg += `<polygon points="${firstX},${baseY} ${o2Points.join(' ')} ${lastX},${baseY}" fill="rgba(var(--accent-telemetry-rgb), 0.10)"/>`;
      svg += `<polyline id="lineCoupledO2Flow" fill="none" stroke="var(--accent-telemetry)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" points="${o2Points.join(' ')}"/>`;
      svg += `<polyline id="lineCoupledWalkSpeed" fill="none" stroke="var(--text-secondary)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" points="${spdPoints.join(' ')}"/>`;
    }

    // Live Astronaut Simulation Progress Marker
    if (walkerState && walkerState.walkProgress > 0 && walkerState.routeTotalDistM > 0) {
      const simFrac = Math.min(1.0, Math.max(0.0, walkerState.walkProgress));
      const simX = padL + simFrac * plotW;
      svg += `
        <line x1="${simX.toFixed(1)}" y1="${padT}" x2="${simX.toFixed(1)}" y2="${baseY}" stroke="var(--text-secondary)" stroke-width="1.5" stroke-dasharray="4,2"/>
        <circle cx="${simX.toFixed(1)}" cy="${padT + 8}" r="3.5" fill="var(--text-secondary)" stroke="var(--bg-elevated)" stroke-width="1"/>
      `;
    }

    // Interactive Hover SampleSlices
    const stepStride = Math.max(1, Math.floor(wps.length / 40));
    for (let i = 0; i < wps.length; i += stepStride) {
      const w = wps[i];
      const d = useMeters ? (w.cumDistM || 0) : ((w.cumDistM || 0) / 1000.0);
      const x = padL + Math.min(1.0, Math.max(0.0, d / Math.max(1e-6, maxDistVal))) * plotW;
      const yO2 = baseY - Math.min(1.0, Math.max(0.0, (o2Values[i] - leftScale.min) / o2Span)) * plotH;
      const ySpd = baseY - Math.min(1.0, Math.max(0.0, (spdValues[i] - rightScale.min) / spdSpan)) * plotH;
      svg += `
        <circle cx="${x.toFixed(1)}" cy="${yO2.toFixed(1)}" r="2.3" fill="var(--accent-telemetry)" class="coupled-sample-dot"
                data-wp-idx="${i}" data-dist="${d.toFixed(2)} ${distUnit}" data-o2="${o2Values[i].toFixed(2)}"
                data-spd="${spdValues[i].toFixed(2)}" data-slope="${(w.signedSlopeDeg || 0).toFixed(2)}"
                data-elev="${Math.round(w.elevationM || 0)}"/>
        <circle cx="${x.toFixed(1)}" cy="${ySpd.toFixed(1)}" r="2.3" fill="var(--text-secondary)" class="coupled-sample-dot"
                data-wp-idx="${i}" data-dist="${d.toFixed(2)} ${distUnit}" data-o2="${o2Values[i].toFixed(2)}"
                data-spd="${spdValues[i].toFixed(2)}" data-slope="${(w.signedSlopeDeg || 0).toFixed(2)}"
                data-elev="${Math.round(w.elevationM || 0)}"/>
      `;
    }

    svg += `</svg>`;
    container.innerHTML = svg;
    this._bindChartSampleTooltips(container);
  }

  // ==========================================================================
  // REGION 2 (RIGHT): MARTIAN DEM ELEVATION PROFILE (m) ALONG TRAJECTORY (Part B4)
  // ==========================================================================
  _renderRegion2ElevationChart(syncData, walkerState) {
    const container = document.getElementById('analyticsElevationChartContainer');
    const unvisitedBadge = document.getElementById('analyticsElevationUnvisitedBadge');
    if (!container) return;

    if (!syncData.hasRoute || !syncData.route.waypoints || syncData.route.waypoints.length < 2) {
      container.innerHTML = `
        <div class="h-full flex flex-col items-center justify-center text-secondary text-xs gap-1 p-4 text-center">
          <span class="text-base">⛰️</span>
          <span class="font-bold text-secondary">${_tr('No Active DEM Trajectory Profile', 'Chưa có Mặt cắt Độ cao DEM Hoạt động')}</span>
          <span class="text-[11px] text-muted">${_tr('Calculate a route in Marswalk Planner to render the actual MOLA DEM elevation profile (m) along the trajectory.', 'Hãy tính toán lộ trình trong Trình lập lộ trình Marswalk để hiển thị mặt cắt độ cao MOLA DEM (m) thực tế dọc quỹ đạo.')}</span>
        </div>
      `;
      if (unvisitedBadge) unvisitedBadge.textContent = _tr('Unvisited Stations: --', 'Điểm chưa đi qua: --');
      return;
    }

    const wps = (syncData.route.trajectorySamples && syncData.route.trajectorySamples.length >= 2)
      ? syncData.route.trajectorySamples
      : syncData.route.waypoints;
    const m = syncData.route.metrics || {};
    const totalWaypoints = wps.length;
    const visitedIdx = (walkerState && walkerState.walkProgress > 0)
      ? Math.min(totalWaypoints, Math.floor(walkerState.walkProgress * (totalWaypoints - 1)) + 1)
      : 0;
    const unvisitedCount = Math.max(0, totalWaypoints - visitedIdx);
    const noDataCount = wps.filter(w => Boolean(w.isNoData)).length;

    if (unvisitedBadge) {
      unvisitedBadge.textContent = _tr(
        `Unvisited Waypoints: ${unvisitedCount} / ${totalWaypoints}${noDataCount > 0 ? ` • ⚠️ ${noDataCount} NoData` : ' • 100% MOLA Valid'}`,
        `Điểm chưa đi qua: ${unvisitedCount} / ${totalWaypoints}${noDataCount > 0 ? ` • ⚠️ ${noDataCount} Không có dữ liệu` : ' • 100% Hợp lệ MOLA'}`
      );
    }

    const totalDistKm = Math.max(0.001, (wps[wps.length - 1].cumDistM || m.totalDistanceM || 1000.0) / 1000.0);
    const useMeters = totalDistKm < 2.0;
    const distUnit = useMeters ? 'm' : 'km';
    const maxDistVal = useMeters ? (totalDistKm * 1000.0) : totalDistKm;

    const validElevs = wps.filter(w => !w.isNoData && Number.isFinite(w.elevationM)).map(w => w.elevationM);
    const rawMinElev = validElevs.length > 0 ? Math.min(...validElevs) : -2000.0;
    const rawMaxElev = validElevs.length > 0 ? Math.max(...validElevs) : 2000.0;
    const elevPad = Math.max(25.0, (rawMaxElev - rawMinElev) * 0.12);
    const yScale = this._computeNiceScale(rawMinElev - elevPad, rawMaxElev + elevPad, 4, false);

    const svgW = 540;
    const svgH = 235;
    const padL = 62;
    const padR = 24;
    const padT = 26;
    const padB = 38;
    const plotW = svgW - padL - padR;
    const plotH = svgH - padT - padB;
    const baseY = padT + plotH;
    const elevSpan = Math.max(1e-6, yScale.max - yScale.min);

    let svg = `<svg viewBox="0 0 ${svgW} ${svgH}" class="w-full h-full select-none" id="svgElevationProfileChart" data-waypoint-count="${totalWaypoints}" data-unvisited-count="${unvisitedCount}" data-nodata-count="${noDataCount}">`;
    svg += `
      <defs>
        <linearGradient id="molaElevFillGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--text-secondary)" stop-opacity="0.42"/>
          <stop offset="100%" stop-color="var(--text-secondary)" stop-opacity="0.03"/>
        </linearGradient>
      </defs>
    `;

    // Y-Axis Header
    svg += `<text x="${padL - 4}" y="14" font-size="9.5" font-weight="bold" fill="var(--text-secondary)" text-anchor="end" font-family="monospace">${_tr('Elevation (m)', 'Độ cao (m)')}</text>`;
    svg += `<text x="${svgW - padR}" y="14" font-size="9" fill="var(--text-secondary)" text-anchor="end" font-family="monospace">Δh: +${Math.round(m.totalAscentM || 0)}m / -${Math.round(m.totalDescentM || 0)}m</text>`;

    // Horizontal Grid & Elevation Ticks
    for (let i = 0; i <= 4; i++) {
      const frac = i / 4;
      const y = baseY - frac * plotH;
      const eVal = yScale.ticks[i];
      const eStr = `${eVal >= 0 ? '+' : ''}${Math.round(eVal).toLocaleString()}`;
      svg += `
        <line x1="${padL}" y1="${y.toFixed(1)}" x2="${svgW - padR}" y2="${y.toFixed(1)}" stroke="${i === 0 ? 'var(--border-strong)' : 'var(--border-subtle)'}" stroke-width="1" ${i === 0 ? '' : 'stroke-dasharray="3,3"'}/>
        <line x1="${padL - 4}" y1="${y.toFixed(1)}" x2="${padL}" y2="${y.toFixed(1)}" stroke="var(--text-secondary)" stroke-width="1.2"/>
        <text x="${padL - 7}" y="${(y + 3).toFixed(1)}" font-size="9" fill="var(--text-secondary)" text-anchor="end" font-family="monospace">${eStr}</text>
      `;
    }

    // X-Axis Distance Ticks
    const xTicks = 5;
    for (let i = 0; i <= xTicks; i++) {
      const frac = i / xTicks;
      const x = padL + frac * plotW;
      const dVal = frac * maxDistVal;
      const dLabel = maxDistVal >= 20 ? Math.round(dVal).toLocaleString() : dVal.toFixed(1);
      svg += `
        <line x1="${x.toFixed(1)}" y1="${baseY}" x2="${x.toFixed(1)}" y2="${baseY + 4}" stroke="var(--text-muted)" stroke-width="1"/>
        <text x="${x.toFixed(1)}" y="${baseY + 15}" font-size="8.5" fill="var(--text-secondary)" text-anchor="middle" font-family="monospace">${dLabel} ${distUnit}</text>
      `;
    }
    svg += `<text x="${padL + plotW / 2}" y="${svgH - 4}" font-size="9" fill="var(--text-muted)" text-anchor="middle" font-family="monospace">${_tr('Distance Along Route', 'Quãng đường dọc lộ trình')} (${distUnit})</text>`;

    // Left Axis Spine
    svg += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${baseY}" stroke="var(--text-secondary)" stroke-width="1.5"/>`;

    // Build contiguous valid elevation sub-paths (do NOT interpolate across NoData gaps)
    let currentSubPath = [];
    const subPaths = [];
    const noDataMarkers = [];

    wps.forEach((w, idx) => {
      const d = useMeters ? (w.cumDistM || 0) : ((w.cumDistM || 0) / 1000.0);
      const x = padL + Math.min(1.0, Math.max(0.0, d / Math.max(1e-6, maxDistVal))) * plotW;
      if (w.isNoData || !Number.isFinite(w.elevationM)) {
        if (currentSubPath.length > 0) {
          subPaths.push(currentSubPath);
          currentSubPath = [];
        }
        noDataMarkers.push({ x, idx });
      } else {
        const y = baseY - Math.min(1.0, Math.max(0.0, (w.elevationM - yScale.min) / elevSpan)) * plotH;
        currentSubPath.push({ x, y, w, idx, d });
      }
    });
    if (currentSubPath.length > 0) {
      subPaths.push(currentSubPath);
    }

    // Render Filled Area + Line for each contiguous valid segment group
    subPaths.forEach((sp) => {
      if (sp.length >= 2) {
        const ptsStr = sp.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        const firstX = sp[0].x.toFixed(1);
        const lastX = sp[sp.length - 1].x.toFixed(1);
        svg += `<polygon points="${firstX},${baseY} ${ptsStr} ${lastX},${baseY}" fill="url(#molaElevFillGrad)"/>`;
        svg += `<polyline class="dem-elevation-polyline" fill="none" stroke="var(--text-secondary)" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round" points="${ptsStr}"/>`;
      }
    });

    // Render NoData gap indicators if any exist
    noDataMarkers.forEach(nd => {
      svg += `
        <line x1="${nd.x.toFixed(1)}" y1="${padT}" x2="${nd.x.toFixed(1)}" y2="${baseY}" stroke="#ef4444" stroke-width="2" stroke-dasharray="2,2"/>
        <text x="${nd.x.toFixed(1)}" y="${padT + 12}" font-size="8" fill="var(--accent-telemetry)" text-anchor="middle" font-family="monospace">NoData</text>
      `;
    });

    // Live Astronaut Simulation Marker on DEM Profile
    if (walkerState && walkerState.walkProgress > 0 && walkerState.routeTotalDistM > 0) {
      const simFrac = Math.min(1.0, Math.max(0.0, walkerState.walkProgress));
      const simX = padL + simFrac * plotW;
      svg += `
        <line x1="${simX.toFixed(1)}" y1="${padT}" x2="${simX.toFixed(1)}" y2="${baseY}" stroke="var(--text-secondary)" stroke-width="1.5" stroke-dasharray="4,2"/>
        <circle cx="${simX.toFixed(1)}" cy="${padT + 8}" r="3.5" fill="var(--text-secondary)" stroke="var(--bg-elevated)" stroke-width="1"/>
      `;
    }

    // Interactive Hover Dots along DEM Profile
    const stepStride = Math.max(1, Math.floor(wps.length / 40));
    subPaths.forEach(sp => {
      for (let i = 0; i < sp.length; i += stepStride) {
        const p = sp[i];
        const dotColor = p.w.safetyClass === 'CAUTION' ? 'var(--text-secondary)' : 'var(--text-secondary)';
        svg += `
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.4" fill="${dotColor}" class="coupled-sample-dot"
                  data-wp-idx="${p.idx}" data-dist="${p.d.toFixed(2)} ${distUnit}"
                  data-o2="${(p.w.o2RateLMin || m.avgO2RateLMin || 2.8).toFixed(2)}"
                  data-spd="${(p.w.effectiveSpeedMS || m.speedMS || 1.2).toFixed(2)}"
                  data-slope="${(p.w.signedSlopeDeg || 0).toFixed(2)}"
                  data-elev="${Math.round(p.w.elevationM || 0)}"/>
        `;
      }
    });

    svg += `</svg>`;
    container.innerHTML = svg;
    this._bindChartSampleTooltips(container);
  }

  _ensureAnalyticsTooltip() {
    let tip = document.getElementById('analyticsChartHoverTooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'analyticsChartHoverTooltip';
      tip.className = 'fixed z-[130] hidden pointer-events-none px-3 py-2 rounded-lg bg-canvas border border-accent shadow-2xl text-[11px] text-primary mono backdrop-blur-sm';
      document.body.appendChild(tip);
    }
    return tip;
  }

  _hideAnalyticsTooltip() {
    const tip = document.getElementById('analyticsChartHoverTooltip');
    if (tip) tip.classList.add('hidden');
  }

  _bindChartSampleTooltips(containerEl) {
    if (!containerEl) return;
    const tip = this._ensureAnalyticsTooltip();
    containerEl.querySelectorAll('.coupled-sample-dot').forEach(dot => {
      dot.addEventListener('mouseenter', (e) => {
        const wpIdx = dot.getAttribute('data-wp-idx');
        const dist = dot.getAttribute('data-dist');
        const o2 = dot.getAttribute('data-o2');
        const spd = dot.getAttribute('data-spd');
        const slope = dot.getAttribute('data-slope');
        const elev = dot.getAttribute('data-elev');
        tip.innerHTML = `
          <div class="font-bold text-primary border-b border-subtle pb-1 mb-1">
            ${_tr('Waypoint', 'Điểm lộ trình')} #${wpIdx} • ${_tr('Distance:', 'Quãng đường:')} <span class="text-accent">${dist}</span>
          </div>
          <div class="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
            <span class="text-secondary">${_tr('MOLA Elevation:', 'Độ cao MOLA:')}</span><span class="text-secondary font-bold text-right">${Number(elev) >= 0 ? '+' : ''}${Number(elev).toLocaleString()} m</span>
            <span class="text-secondary">${_tr('Signed Slope (θ):', 'Độ dốc có dấu (θ):')}</span><span class="text-emerald-300 font-bold text-right">${Number(slope) >= 0 ? '+' : ''}${slope}°</span>
            <span class="text-secondary">${_tr('Effective Speed:', 'Tốc độ hiệu dụng:')}</span><span class="text-accent font-bold text-right">${spd} m/s</span>
            <span class="text-secondary">${_tr('O₂ Flow Rate:', 'Lưu lượng O₂:')}</span><span class="text-rose-300 font-bold text-right">${o2} ${_tr('L/min', 'L/phút')}</span>
          </div>
        `;
        tip.classList.remove('hidden');
        this._posAnalyticsTooltip(e, tip);
      });
      dot.addEventListener('mousemove', (e) => this._posAnalyticsTooltip(e, tip));
      dot.addEventListener('mouseleave', () => this._hideAnalyticsTooltip());
    });
  }

  _posAnalyticsTooltip(e, tip) {
    if (!tip) return;
    let left = e.clientX + 14;
    let top = e.clientY - 28;
    const r = tip.getBoundingClientRect();
    if (left + r.width > window.innerWidth - 12) left = e.clientX - r.width - 14;
    if (top + r.height > window.innerHeight - 12) top = window.innerHeight - r.height - 12;
    if (top < 12) top = 12;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  // ==========================================================================
  // REGION 3: COUPLED MARTIAN EVA MATHEMATICAL MODEL (Part B5)
  // ==========================================================================
  _renderRegion3MathematicalModel(syncData) {
    const container = document.getElementById('analyticsMathEquationsGrid');
    const latexPre = document.getElementById('latexRawSourceCode');
    if (!container) return;

    const atmCfg = getAtmosphericModelConfig();
    const p0Pa = Number(atmCfg.p0_pa ?? atmCfg.P0 ?? 610.0);
    const h0M = Number(atmCfg.h0_m ?? atmCfg.h0 ?? 0.0);
    const tempK = Number(atmCfg.temperature_k ?? atmCfg.T ?? 210.0);
    const molarMass = Number(atmCfg.molar_mass_kg_mol ?? atmCfg.M ?? 0.04401);
    const gravMS2 = Number(atmCfg.gravity_m_s2 ?? atmCfg.g ?? 3.71);
    const gasR = Number(atmCfg.gas_constant_j_mol_k ?? atmCfg.R ?? 8.314462618);
    const scaleHeightM = Number(atmCfg.scale_height_m) || ((gasR * tempK) / (molarMass * gravMS2));
    const w = syncData.walker;
    const m = syncData.route?.metrics || {};
    const v0 = Number(m.configuredSpeedMS || w.speed || 1.2);
    const totalMass = Number(m.totalMassKg) || ((Number(w.bodyMass) || 80) + (Number(w.equipmentMass) ?? 15) + 50);
    const thetaMax = Number(m.thetaMaxUp) || Number(window.evaSettings?.settings?.maxSafeSlopeDeg) || 22.0;
    const thetaDown = Number((0.75 * thetaMax).toFixed(2));
    const thetaRef = Number((0.40 * thetaMax).toFixed(2));

    container.innerHTML = `
      <!-- Group 1: Walking Speed & Directional Slope Model -->
      <div class="p-3.5 rounded-xl bg-panel border border-accent-soft space-y-2">
        <div class="flex items-center justify-between border-b border-subtle pb-1.5">
          <span class="text-xs font-bold text-accent">${_tr('1. Walking Speed & Directional Slope Coupling', '1. Mô hình Kết hợp Tốc độ Đi bộ & Độ dốc Có hướng')}</span>
          <span class="text-[9px] px-1.5 py-0.5 rounded bg-panel text-accent border border-accent mono">terrain_cost_evaluator.js</span>
        </div>
        <div class="p-2.5 rounded-lg bg-canvas border border-subtle mono text-[11px] text-primary space-y-1.5 overflow-x-auto">
          <div>θ<sub>k</sub> = arctan( (z<sub>v</sub> − z<sub>u</sub>) / Δs<sub>k</sub> ) · (180° / π)</div>
          <div>v<sub>eff</sub>(θ<sub>k</sub>, τ<sub>k</sub>) = v<sub>0</sub> / [ √K(θ<sub>k</sub>) · (1 + 0.10 τ<sub>k</sub>) ] &nbsp; [m/s]</div>
          <div class="text-[10px] text-secondary pt-1 border-t border-subtle">
            K(θ) = 1 + θ/θ<sub>ref</sub> (${_tr('Uphill SAFE', 'Lên dốc AN TOÀN')}, 0 ≤ θ ≤ ${thetaRef}°) &nbsp;|&nbsp; 2 + 4p + 6p² (${_tr('Uphill CAUTION', 'Lên dốc CẢNH BÁO')}, θ ≤ +${thetaMax.toFixed(1)}°)<br/>
            K(θ) = 1 − 0.25|θ|/(0.5θ<sub>ref</sub>) (${_tr('Downhill SAFE', 'Xuống dốc AN TOÀN')}) &nbsp;|&nbsp; 0.75 + 5q² (${_tr('Downhill CAUTION', 'Xuống dốc CẢNH BÁO')}, |θ| ≤ ${thetaDown}°)
          </div>
        </div>
        <div class="text-[10px] text-secondary leading-relaxed">
          <strong>${_tr('Active Parameters:', 'Tham số đang dùng:')}</strong> ${_tr('Configured speed', 'Tốc độ cấu hình')} <code class="text-accent">v₀ = ${v0.toFixed(2)} m/s</code>, ${_tr('Uphill limit', 'Giới hạn lên dốc')} <code class="text-emerald-300">+${thetaMax.toFixed(1)}°</code>, ${_tr('Downhill limit', 'Giới hạn xuống dốc')} <code class="text-secondary">-${thetaDown}°</code>, ${_tr('Ref slope', 'Độ dốc tham chiếu')} <code class="text-accent">${thetaRef}°</code>, ${_tr('Dust optical depth', 'Độ dày quang học bụi')} <code class="text-secondary">τ<sub>k</sub></code>.
        </div>
      </div>

      <!-- Group 2: Total Power & Mars-Scaled Minetti Metabolic Energy -->
      <div class="p-3.5 rounded-xl bg-panel border border-strong space-y-2">
        <div class="flex items-center justify-between border-b border-subtle pb-1.5">
          <span class="text-xs font-bold text-secondary">${_tr('2. Total Power & Metabolic Energy Model', '2. Mô hình Tổng Công suất & Năng lượng Trao đổi chất')}</span>
          <span class="text-[9px] px-1.5 py-0.5 rounded bg-elevated text-secondary border border-strong mono">${_tr('Minetti-Mars 5th-Order', 'Đa thức bậc 5 Minetti-Mars')}</span>
        </div>
        <div class="p-2.5 rounded-lg bg-canvas border border-subtle mono text-[11px] text-primary space-y-1.5 overflow-x-auto">
          <div>C<sub>W</sub>(i) = 280.5 i⁵ − 58.7 i⁴ − 218.4 i³ + 43.3 i² + 9.6 i + 1.88 &nbsp; [J/(kg·m)]</div>
          <div>C<sub>Mars</sub>(i) = max(1.1, C<sub>W</sub>(i) · (0.38 + 0.62 · g<sub>Mars</sub>/g<sub>Earth</sub>)) &nbsp; [J/(kg·m)]</div>
          <div>E<sub>k</sub> = C<sub>Mars</sub>(i<sub>k</sub>) · M<sub>tot</sub> · Δs<sub>k</sub> &nbsp; [J], &nbsp; P<sub>met,k</sub> = E<sub>k</sub> / Δt<sub>eff,k</sub> &nbsp; [W]</div>
        </div>
        <div class="text-[10px] text-secondary leading-relaxed">
          <strong>${_tr('Active Parameters:', 'Tham số đang dùng:')}</strong> ${_tr('Gradient', 'Độ dốc')} <code class="text-secondary">i = clamp(Δz/Δs, −0.6, +0.6)</code>, <code class="text-primary">M<sub>tot</sub> = ${totalMass.toFixed(1)} kg</code> (${_tr('Body + Equip + 50 kg xEMU', 'Cơ thể + Thiết bị + 50 kg xEMU')}), <code class="text-primary">g<sub>Mars</sub> = 3.721 m/s²</code>, <code class="text-primary">g<sub>Earth</sub> = 9.80665 m/s²</code>, <code class="text-primary">1 kcal = 4.184 kJ</code>.
        </div>
      </div>

      <!-- Group 3: Oxygen Flow Rate & Total Consumption -->
      <div class="p-3.5 rounded-xl bg-panel border border-rose-500/30 space-y-2">
        <div class="flex items-center justify-between border-b border-subtle pb-1.5">
          <span class="text-xs font-bold text-rose-300">${_tr('3. Oxygen Flow Rate & Consumption Model', '3. Mô hình Lưu lượng & Tổng tiêu thụ Oxy')}</span>
          <span class="text-[9px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-700/50 mono">validateRoutePath()</span>
        </div>
        <div class="p-2.5 rounded-lg bg-canvas border border-subtle mono text-[11px] text-primary space-y-1.5 overflow-x-auto">
          <div>M<sub>met,k</sub> = [1.0 + 3.6 i<sub>up,k</sub> + 0.8 i<sub>down,k</sub> + 0.002 max(0, M<sub>tot</sub> − 110)(g<sub>Mars</sub>/g<sub>Earth</sub>)] · Φ<sub>v</sub>(v<sub>0</sub>)</div>
          <div>Φ<sub>v</sub>(v<sub>0</sub>) = 0.65 + 0.35 · (v<sub>0</sub> / 1.2)<sup>0.85</sup>, &nbsp; V̇<sub>O₂,k</sub> = 2.80 · M<sub>met,k</sub> &nbsp; [L/min]</div>
          <div>V<sub>O₂,tot</sub> = V̇<sub>O₂,avg</sub> · (T<sub>EVA</sub> / 60) &nbsp; [L], &nbsp; V<sub>O₂,rem</sub> = V<sub>O₂,init</sub> − V<sub>O₂,tot</sub> &nbsp; [L]</div>
        </div>
        <div class="text-[10px] text-secondary leading-relaxed">
          <strong>${_tr('Active Parameters:', 'Tham số đang dùng:')}</strong> ${_tr('Baseline flat rate', 'Lưu lượng phẳng cơ sở')} <code class="text-rose-300">2.80 L/min</code>, ${_tr('Uphill grade factor', 'Hệ số độ dốc lên')} <code class="text-primary">3.6</code>, ${_tr('Downhill grade factor', 'Hệ số độ dốc xuống')} <code class="text-primary">0.8</code>, ${_tr('Safety return reserve threshold', 'Ngưỡng dự trữ quay về an toàn')} <code class="text-emerald-300">20% V<sub>O₂,init</sub></code>.
        </div>
      </div>

      <!-- Group 4: Atmospheric Pressure Model (Elevation-Based Barometric Formula) -->
      <div class="p-3.5 rounded-xl bg-panel border border-accent-soft space-y-2">
        <div class="flex items-center justify-between border-b border-subtle pb-1.5">
          <span class="text-xs font-bold text-accent">${_tr('4. Atmospheric Pressure Model (Elevation-Derived)', '4. Mô hình Áp suất Khí quyển (Theo Độ cao)')}</span>
          <span class="text-[9px] px-1.5 py-0.5 rounded bg-panel text-accent border border-accent mono">${_tr('MODELED ESTIMATE • atmospheric_pressure.js', 'ƯỚC LƯỢNG MÔ HÌNH • atmospheric_pressure.js')}</span>
        </div>
        <div class="p-2.5 rounded-lg bg-canvas border border-subtle mono text-[11px] text-primary space-y-1.5 overflow-x-auto">
          <div>P(h) = P<sub>0</sub> · exp( − [ M<sub>CO₂</sub> · g · (h − h<sub>0</sub>) ] / [ R · T ] ) = P<sub>0</sub> · exp( −(h − h<sub>0</sub>) / H ) &nbsp; [Pa]</div>
          <div>H = (R · T) / (M<sub>CO₂</sub> · g) ≈ ${Math.round(scaleHeightM).toLocaleString()} m (${(scaleHeightM / 1000).toFixed(2)} km), &nbsp; P<sub>mbar</sub>(h) = P(h) / 100</div>
        </div>
        <div class="text-[10px] text-secondary leading-relaxed">
          <strong>${_tr('Constants & Provenance:', 'Hằng số & Nguồn gốc:')}</strong> <code class="text-accent">P₀ = ${p0Pa.toFixed(1)} Pa</code> ${_tr('at datum', 'tại mốc chuẩn')} <code class="text-primary">h₀ = ${h0M.toFixed(1)} m</code>, <code class="text-primary">T = ${tempK.toFixed(1)} K</code>, <code class="text-primary">M<sub>CO₂</sub> = ${molarMass} kg/mol</code>, <code class="text-primary">g = ${gravMS2} m/s²</code>, <code class="text-primary">R = ${gasR} J/(mol·K)</code>. <em>${_tr('Modeled hydrostatic estimate from MOLA DEM elevation h ∈ [−9,000 m, +25,000 m] (not in-situ sensor data; climate TAB layers removed).', 'Ước lượng thủy tĩnh mô hình từ độ cao MOLA DEM h ∈ [−9.000 m, +25.000 m] (không phải dữ liệu cảm biến tại chỗ; các lớp khí hậu TAB đã loại bỏ).')}</em>
        </div>
      </div>

      <!-- Group 5: Ionizing Radiation Model -->
      <div class="p-3.5 rounded-xl bg-panel border border-purple-500/30 space-y-2 md:col-span-2">
        <div class="flex items-center justify-between border-b border-subtle pb-1.5 flex-wrap gap-1">
          <span class="text-xs font-bold text-purple-300">${_tr('5. Solar & GCR Ionizing Radiation Attenuation Model', '5. Mô hình Suy giảm Bức xạ Ion hóa Mặt Trời & Tia Vũ trụ (GCR)')}</span>
          <span class="text-[9px] px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-700/50 mono">${_tr('MODELED ESTIMATE • survivability.js (Lines 553–593)', 'ƯỚC LƯỢNG MÔ HÌNH • survivability.js (Dòng 553–593)')}</span>
        </div>
        <div class="p-2.5 rounded-lg bg-canvas border border-subtle mono text-[11px] text-primary space-y-1.5 overflow-x-auto">
          <div>Ḋ<sub>rad</sub>(h) = D<sub>base</sub> + ΔD<sub>GCR</sub> · [ 1 − clamp( (P(h) − P<sub>min</sub>) / P<sub>span</sub>, 0, 1 ) ] &nbsp; [mSv/day]</div>
          <div>D<sub>EVA</sub> = Ḋ<sub>rad,avg</sub> · (T<sub>EVA,hrs</sub> / 24.0) &nbsp; [mSv]</div>
        </div>
        <div class="text-[10px] text-secondary leading-relaxed">
          <strong>${_tr('Constants, Scope & Provenance:', 'Hằng số, Phạm vi & Nguồn gốc:')}</strong> ${_tr('Shielded deep-basin baseline', 'Mức cơ sở lòng chảo sâu được che chắn')} <code class="text-purple-300">D<sub>base</sub> = 0.50 mSv/day</code>, ${_tr('high-altitude GCR increment', 'gia số GCR vùng cao')} <code class="text-purple-300">ΔD<sub>GCR</sub> = 0.35 mSv/day</code>, ${_tr('column reference pressure', 'áp suất cột tham chiếu')} <code class="text-primary">P<sub>min</sub> = 100.0 Pa</code>, ${_tr('attenuation span', 'khoảng suy giảm')} <code class="text-primary">P<sub>span</sub> = 1150.0 Pa</code>. ${_tr('Evaluates daily dose rate', 'Đánh giá liều bức xạ ngày')} <code class="text-primary">Ḋ<sub>rad</sub> ∈ [0.50, 0.85] mSv/day</code> ${_tr('against ALARA nominal range', 'so với ngưỡng danh định ALARA')} (<code class="text-emerald-300">≤ 0.72 mSv/day ${_tr('SAFE', 'AN TOÀN')}</code>; <code class="text-rose-300">≥ 1.10 mSv/day ${_tr('UNSAFE limit', 'Giới hạn NGUY HIỂM')}</code>). <em>${_tr('Modeled barometric column-shielding proxy calibrated to MSL Curiosity RAD surface range; used for Astronaut Monitoring & EVA dose analytics (not an active edge-rejection constraint in pathfinding).', 'Mô hình xấp xỉ che chắn cột khí áp hiệu chuẩn theo dải đo bề mặt MSL Curiosity RAD; dùng cho Giám sát Phi hành gia & phân tích liều EVA (không dùng làm ràng buộc loại bỏ cạnh trong tìm đường).')}</em>
        </div>
      </div>
    `;

    if (latexPre) {
      latexPre.textContent = [
        '% ============================================================================',
        '% COUPLED MARTIAN EVA MATHEMATICAL MODEL — RAW LATEX SOURCE',
        '% Generated directly from active application model parameters',
        '% ============================================================================',
        '',
        '% 1. Walking Speed & Directional Slope Coupling (terrain_cost_evaluator.js)',
        '\\theta_k = \\arctan\\!\\left(\\frac{z(v) - z(u)}{\\Delta s_k}\\right) \\cdot \\frac{180^\\circ}{\\pi}',
        'v_{\\text{eff}}(\\theta_k, \\tau_k) = \\frac{v_0}{\\sqrt{K(\\theta_k)} \\cdot (1 + 0.10\\,\\tau_k)} \\quad [\\text{m/s}]',
        `% Active Parameters: v_0 = ${v0.toFixed(2)} m/s, theta_max_up = +${thetaMax.toFixed(1)} deg, theta_max_down = -${thetaDown} deg, theta_ref = ${thetaRef} deg`,
        '',
        '% 2. Total Power & Mars-Scaled Minetti Metabolic Energy (terrain_cost_evaluator.js)',
        'C_W(i) = 280.5\\,i^5 - 58.7\\,i^4 - 218.4\\,i^3 + 43.3\\,i^2 + 9.6\\,i + 1.88 \\quad [\\text{J}/(\\text{kg}\\cdot\\text{m})]',
        'C_{\\text{Mars}}(i) = \\max\\!\\left(1.1,\\; C_W(i)\\cdot\\left(0.38 + 0.62\\,\\frac{g_{\\text{Mars}}}{g_{\\text{Earth}}}\\right)\\right)',
        'E_k = C_{\\text{Mars}}(i_k)\\cdot M_{\\text{tot}}\\cdot \\Delta s_k \\quad [\\text{J}], \\qquad P_{\\text{met},k} = \\frac{E_k}{\\Delta t_{\\text{eff},k}} \\quad [\\text{W}]',
        `% Active Parameters: M_tot = ${totalMass.toFixed(1)} kg, g_Mars = 3.721 m/s^2, g_Earth = 9.80665 m/s^2`,
        '',
        '% 3. Oxygen Flow Rate & Total Consumption (terrain_cost_evaluator.js)',
        '\\dot{V}_{\\text{O}_2,k} = 2.80 \\cdot \\left(1.0 + 3.6\\,i_{\\text{up},k} + 0.8\\,i_{\\text{down},k} + 0.002\\,\\max(0, M_{\\text{tot}} - 110)\\frac{g_{\\text{Mars}}}{g_{\\text{Earth}}}\\right) \\cdot \\Phi_v(v_0) \\quad [\\text{L/min}]',
        '\\Phi_v(v_0) = 0.65 + 0.35\\left(\\frac{v_0}{1.2}\\right)^{0.85}, \\qquad V_{\\text{O}_2,\\text{tot}} = \\bar{\\dot{V}}_{\\text{O}_2} \\cdot \\frac{T_{\\text{EVA,sec}}}{60} \\quad [\\text{L}]',
        '',
        '% 4. Atmospheric Pressure Hydrostatic Model (atmospheric_pressure.js)',
        'P(h) = P_0 \\exp\\!\\left(-\\frac{M_{\\text{CO}_2}\\,g\\,(h - h_0)}{R\\,T}\\right) = P_0 \\exp\\!\\left(-\\frac{h - h_0}{H}\\right) \\quad [\\text{Pa}]',
        `% Constants: P_0 = ${p0Pa.toFixed(1)} Pa, h_0 = ${h0M.toFixed(1)} m, T = ${tempK.toFixed(1)} K, M_CO2 = ${molarMass} kg/mol, g = ${gravMS2} m/s^2, R = ${gasR} J/(mol*K), H = ${scaleHeightM.toFixed(1)} m`,
        '',
        '% 5. Solar & GCR Ionizing Radiation Attenuation Proxy (survivability.js)',
        '\\dot{D}_{\\text{rad}}(h) = D_{\\text{base}} + \\Delta D_{\\text{GCR}} \\cdot \\left(1 - \\operatorname{clamp}\\!\\left(\\frac{P(h) - P_{\\min}}{P_{\\text{span}}},\\; 0,\\; 1\\right)\\right) \\quad [\\text{mSv/day}]',
        'D_{\\text{EVA}} = \\bar{\\dot{D}}_{\\text{rad}} \\cdot \\frac{T_{\\text{EVA,hrs}}}{24.0} \\quad [\\text{mSv}]',
        '% Constants: D_base = 0.50 mSv/day, Delta_D_GCR = 0.35 mSv/day, P_min = 100.0 Pa, P_span = 1150.0 Pa'
      ].join('\n');
    }
  }

  // ==========================================================================
  // REGION 4: MARTIAN SURFACE ENVIRONMENT & SPACESUIT SPECIFICATIONS TABLE (Part B6)
  // ==========================================================================
  _renderRegion4EnvironmentTable(syncData, walkerState) {
    const tbody = document.getElementById('analyticsEnvSpecsTableBody');
    if (!tbody) return;

    const w = syncData.walker;
    const hasRoute = syncData.hasRoute;
    const wps = hasRoute ? (syncData.route.waypoints || []) : [];
    const m = hasRoute ? (syncData.route.metrics || {}) : {};

    // Sample representative elevation, pressure, temperature, and radiation from active route or selected map location
    let elevSampleText = _tr('Global MOLA Range: −8,201 m to +21,241 m (Awaiting route)', 'Phạm vi MOLA Toàn cầu: −8.201 m đến +21.241 m (Đang chờ lộ trình)');
    let pressSampleText = _tr('610.0 Pa (6.10 mbar) at 0 m Datum', '610.0 Pa (6.10 mbar) tại mốc chuẩn 0 m');
    let pressStatus = _tr('SAFE', 'AN TOÀN');
    let tempSampleText = _tr('210.0 K (−63.2°C) Mean Column Ref', '210.0 K (−63.2°C) Tham chiếu cột trung bình');
    let radSampleText = _tr('0.665 mSv/day at 0 m Datum', '0.665 mSv/ngày tại mốc chuẩn 0 m');
    let radStatus = _tr('SAFE', 'AN TOÀN');

    if (hasRoute && wps.length > 0) {
      const validElevs = wps.filter(p => !p.isNoData && Number.isFinite(p.elevationM)).map(p => p.elevationM);
      const minE = validElevs.length > 0 ? Math.min(...validElevs) : 0;
      const maxE = validElevs.length > 0 ? Math.max(...validElevs) : 0;
      const startE = wps[0].elevationM || 0;
      const endE = wps[wps.length - 1].elevationM || 0;
      elevSampleText = _tr(
        `Route Span: ${Math.round(minE).toLocaleString()} m to ${Math.round(maxE).toLocaleString()} m (Start ${Math.round(startE)} m → Dest ${Math.round(endE)} m)`,
        `Phạm vi lộ trình: ${Math.round(minE).toLocaleString()} m đến ${Math.round(maxE).toLocaleString()} m (Xuất phát ${Math.round(startE)} m → Đích ${Math.round(endE)} m)`
      );

      const pStart = calculateElevationPressure(startE);
      const pEnd = calculateElevationPressure(endE);
      if (pStart.dataValid && pEnd.dataValid) {
        pressSampleText = _tr(
          `${pStart.pressurePa.toFixed(1)}–${pEnd.pressurePa.toFixed(1)} Pa (${pStart.pressureMbar.toFixed(2)}–${pEnd.pressureMbar.toFixed(2)} mbar along route)`,
          `${pStart.pressurePa.toFixed(1)}–${pEnd.pressurePa.toFixed(1)} Pa (${pStart.pressureMbar.toFixed(2)}–${pEnd.pressureMbar.toFixed(2)} mbar dọc lộ trình)`
        );
      }
      const rawPressSt = m.pressureStatus || 'SAFE';
      pressStatus = rawPressSt === 'SAFE' ? _tr('SAFE', 'AN TOÀN') : (rawPressSt === 'CAUTION' ? _tr('CAUTION', 'CẢNH BÁO') : _tr('UNSAFE', 'NGUY HIỂM'));

      const temps = wps.map(p => p.tempK).filter(t => Number.isFinite(t));
      if (temps.length > 0) {
        const minT = Math.min(...temps);
        const maxT = Math.max(...temps);
        tempSampleText = _tr(
          `${minT.toFixed(1)}–${maxT.toFixed(1)} K (${(minT - 273.15).toFixed(1)}°C to ${(maxT - 273.15).toFixed(1)}°C)`,
          `${minT.toFixed(1)}–${maxT.toFixed(1)} K (${(minT - 273.15).toFixed(1)}°C đến ${(maxT - 273.15).toFixed(1)}°C)`
        );
      }

      const avgRad = Number(m.avgRadiationMSvDay) || 0.65;
      const doseMSv = Number(m.missionRadiationDoseMSv) || 0.0;
      radSampleText = _tr(
        `${avgRad.toFixed(3)} mSv/day (Est. Route Dose: ${doseMSv.toFixed(4)} mSv)`,
        `${avgRad.toFixed(3)} mSv/ngày (Liều lộ trình ước tính: ${doseMSv.toFixed(4)} mSv)`
      );
      radStatus = avgRad <= 0.72 ? _tr('SAFE', 'AN TOÀN') : (avgRad < 1.10 ? _tr('CAUTION', 'CẢNH BÁO') : _tr('UNSAFE', 'NGUY HIỂM'));
    }

    const totalMass = Number(m.totalMassKg) || ((Number(w.bodyMass) || 80) + (Number(w.equipmentMass) ?? 15) + 50);
    const initO2 = Number(m.initialO2L) || Number(w.oxygenCapacity) || 1200.0;
    const remO2 = hasRoute ? (Number(m.remainingO2L) ?? initO2) : initO2;
    const retResO2 = Math.round(initO2 * 0.20 * 10) / 10;
    const thetaMaxUp = Number(m.thetaMaxUp) || Number(window.evaSettings?.settings?.maxSafeSlopeDeg) || 22.0;
    const thetaMaxDown = Number((0.75 * thetaMaxUp).toFixed(2));
    const energyWh = hasRoute ? (Number(m.totalEnergyWh) || 0).toFixed(1) : 'N/A';

    const rows = [
      {
        criterion: _tr('1. Surface Gravity (g)', '1. Trọng trường Bề mặt (g)'),
        provenance: _tr('MEASURED / IAU CONST', 'ĐO ĐẠC / HẰNG SỐ IAU'),
        provClass: 'bg-emerald-950 text-emerald-300 border-emerald-700/50',
        value: _tr('3.721 m/s² (0.379 g_Earth) • Local MRO 120g: 3.7136 + Δg×10⁻⁵ m/s²', '3.721 m/s² (0.379 g_Trái Đất) • MRO 120g cục bộ: 3.7136 + Δg×10⁻⁵ m/s²'),
        impact: _tr(
          'Reduces vertical weight-bearing load on xEMU lower torso by 62%, while inertial mass (leg swing & momentum) remains 100% (' + totalMass.toFixed(0) + ' kg total mass).',
          'Giảm 62% tải trọng thẳng đứng lên thân dưới bộ đồ xEMU, trong khi khối lượng quán tính (vung chân & động lượng) vẫn giữ nguyên 100% (tổng khối lượng ' + totalMass.toFixed(0) + ' kg).'
        ),
        status: _tr('NOMINAL (0.38g)', 'DANH ĐỊNH (0.38g)'),
        statusClass: 'text-emerald-300'
      },
      {
        criterion: _tr('2. Topographic Relief & Elevation (h)', '2. Địa hình & Độ cao (h)'),
        provenance: _tr('MEASURED MOLA DEM', 'DỮ LIỆU ĐO MOLA DEM'),
        provClass: 'bg-emerald-950 text-emerald-300 border-emerald-700/50',
        value: elevSampleText,
        impact: _tr(
          'Derived from NASA MGS MOLA planetary DEM (−8,201 m Hellas Basin to +21,241 m Olympus Mons). Directly governs signed slope θ and barometric pressure P(h).',
          'Trích xuất từ bản đồ độ cao hành tinh NASA MGS MOLA (−8.201 m bồn địa Hellas đến +21.241 m đỉnh Olympus Mons). Quyết định trực tiếp độ dốc có dấu θ và áp suất khí quyển P(h).'
        ),
        status: hasRoute && (m.noDataSampleCount || 0) === 0 ? _tr('DEM VERIFIED', 'ĐÃ XÁC MINH DEM') : _tr('GLOBAL DEM', 'DEM TOÀN CẦU'),
        statusClass: 'text-accent'
      },
      {
        criterion: _tr('3. Ambient Surface Temperature (T)', '3. Nhiệt độ Bề mặt Môi trường (T)'),
        provenance: _tr('MODELED ESTIMATE', 'ƯỚC LƯỢNG MÔ HÌNH'),
        provClass: 'bg-panel text-accent border-accent',
        value: _tr(`${tempSampleText} • Suit Envelope: 180.0–290.0 K (Limits: 130–330 K)`, `${tempSampleText} • Dải bộ đồ: 180.0–290.0 K (Giới hạn: 130–330 K)`),
        impact: _tr(
          'Estimated via latitudinal/elevation profile (survivability.js). Requires xEMU Thermal Micrometeoroid Garment (TMG) insulation and auxiliary heater regulation below 180 K.',
          'Ước tính qua mặt cắt vĩ độ/độ cao (survivability.js). Yêu cầu lớp cách nhiệt vi thiên thạch (TMG) của bộ đồ xEMU và bộ sưởi phụ trợ dưới 180 K.'
        ),
        status: _tr('MODEL ESTIMATE', 'ƯỚC LƯỢNG MÔ HÌNH'),
        statusClass: 'text-accent'
      },
      {
        criterion: _tr('4. Humidity / Atmospheric H₂O Vapor', '4. Độ ẩm / Hơi nước Khí quyển H₂O'),
        provenance: _tr('NOT MODELED', 'KHÔNG MÔ PHỎNG'),
        provClass: 'bg-panel text-secondary border-subtle',
        value: _tr('Not Available (N/A) — Climate TAB water-vapor layers removed', 'Không khả dụng (N/A) — Các lớp hơi nước khí hậu TAB đã loại bỏ'),
        impact: _tr(
          'Ambient Martian water vapor is trace (~0.03%) and is not actively modeled in the application pipeline; xEMU operates as a closed-loop pressurized ventilation circuit.',
          'Hơi nước môi trường Sao Hỏa ở mức vết (~0.03%) và không được mô phỏng trong hệ thống; xEMU vận hành như mạch thông gió điều áp khép kín.'
        ),
        status: _tr('N/A (UNSUPPORTED)', 'N/A (KHÔNG HỖ TRỢ)'),
        statusClass: 'text-secondary'
      },
      {
        criterion: _tr('5. Atmospheric Surface Pressure P(h)', '5. Áp suất Khí quyển Bề mặt P(h)'),
        provenance: _tr('MODELED ESTIMATE', 'ƯỚC LƯỢNG MÔ HÌNH'),
        provClass: 'bg-panel text-accent border-accent',
        value: _tr(`${pressSampleText} • SWME Envelope: 400.0–611.65 Pa (Limits: 180–1150 Pa)`, `${pressSampleText} • Dải SWME: 400.0–611.65 Pa (Giới hạn: 180–1150 Pa)`),
        impact: _tr(
          'Derived from elevation via isothermal hydrostatic formula P(h) = P₀ exp(−(h−h₀)/H). Governs xEMU Spacesuit Water Membrane Evaporator (SWME) heat rejection.',
          'Tính từ độ cao qua công thức thủy tĩnh đẳng nhiệt P(h) = P₀ exp(−(h−h₀)/H). Quyết định khả năng thải nhiệt của Bộ bay hơi màng nước (SWME) trên xEMU.'
        ),
        status: pressStatus,
        statusClass: (m.pressureStatus || 'SAFE') === 'SAFE' ? 'text-emerald-300' : ((m.pressureStatus || 'SAFE') === 'CAUTION' ? 'text-secondary' : 'text-rose-400')
      },
      {
        criterion: _tr('6. Ionizing Radiation Environment', '6. Môi trường Bức xạ Ion hóa'),
        provenance: _tr('MODELED ESTIMATE', 'ƯỚC LƯỢNG MÔ HÌNH'),
        provClass: 'bg-purple-950 text-purple-300 border-purple-700/50',
        value: _tr(`${radSampleText} • ALARA Standard: ≤ 0.72 mSv/day (Ceiling: 1.10 mSv/day)`, `${radSampleText} • Chuẩn ALARA: ≤ 0.72 mSv/ngày (Trần: 1.10 mSv/ngày)`),
        impact: _tr(
          'Barometric column-shielding proxy calibrated to MSL RAD surface range (0.50–0.85 mSv/day). Higher elevations have thinner CO₂ shielding and higher GCR dose rates.',
          'Mô hình che chắn cột khí áp hiệu chuẩn theo dải đo bề mặt MSL RAD (0.50–0.85 mSv/ngày). Độ cao lớn hơn có lớp chắn CO₂ mỏng hơn và liều GCR cao hơn.'
        ),
        status: radStatus,
        statusClass: (Number(m.avgRadiationMSvDay) || 0.65) <= 0.72 ? 'text-emerald-300' : 'text-secondary'
      },
      {
        criterion: _tr('7. Spacesuit Oxygen Capacity (O₂)', '7. Dung tích Oxy Bộ đồ Vũ trụ (O₂)'),
        provenance: _tr('CONFIGURED / MODEL SPEC', 'CẤU HÌNH / THÔNG SỐ MÔ HÌNH'),
        provClass: 'bg-elevated text-secondary border-strong',
        value: _tr(`Configured: ${initO2.toFixed(0)} L • Remaining: ${remO2.toFixed(1)} L • Return Reserve (20%): ${retResO2.toFixed(1)} L`, `Đã cấu hình: ${initO2.toFixed(0)} L • Còn lại: ${remO2.toFixed(1)} L • Dự trữ quay về (20%): ${retResO2.toFixed(1)} L`),
        impact: _tr(
          'Configurable PLSS primary + secondary O₂ supply. Route validation enforces ≥ 0 L feasibility and flags a caution warning if remaining O₂ drops below the 20% return reserve.',
          'Nguồn cấp O₂ sơ cấp + thứ cấp PLSS có thể cấu hình. Xác thực lộ trình đảm bảo khả thi ≥ 0 L và phát cảnh báo nếu O₂ còn lại giảm xuống dưới mức dự trữ quay về 20%.'
        ),
        status: remO2 >= retResO2 ? _tr('FEASIBLE (>20% RES)', 'KHẢ THI (>20% DỰ TRỮ)') : (remO2 >= 0 ? _tr('LOW RESERVE', 'DỰ TRỮ THẤP') : _tr('O₂ DEFICIT', 'THIẾU HỤT O₂')),
        statusClass: remO2 >= retResO2 ? 'text-emerald-300' : (remO2 >= 0 ? 'text-secondary' : 'text-rose-400')
      },
      {
        criterion: _tr('8. PLSS Battery & Electrical Power', '8. Pin PLSS & Nguồn điện'),
        provenance: _tr('REFERENCE SPEC / NOT MODELED', 'THÔNG SỐ THAM CHIẾU / KHÔNG MÔ PHỎNG'),
        provClass: 'bg-panel text-secondary border-subtle',
        value: _tr(`Ref Label: 20.5 V × 40 Ah (820 Wh LIB) | 8.0 h Max EVA Limit • Active Battery Discharge: N/A (Mech. Work Equiv: ${energyWh} Wh)`, `Nhãn tham chiếu: 20.5 V × 40 Ah (820 Wh LIB) | Giới hạn EVA tối đa 8.0 giờ • Xả pin chủ động: N/A (Tương đương công cơ học: ${energyWh} Wh)`),
        impact: _tr(
          'Application displays reference LIB label (20.5V 40Ah) and 8.0 h EVA duration limit, and computes mechanical/metabolic work equivalent (Wh), but does not simulate avionics/fan/heater electrical battery drain.',
          'Ứng dụng hiển thị nhãn pin LIB tham chiếu (20.5V 40Ah) cùng giới hạn thời lượng EVA 8.0 giờ, và tính công cơ học/trao đổi chất tương đương (Wh), nhưng không mô phỏng tiêu hao điện năng quạt/sưởi/điện tử.'
        ),
        status: _tr('STATIC REF / N/A', 'THAM CHIẾU TĨNH / N/A'),
        statusClass: 'text-secondary'
      },
      {
        criterion: _tr('9. Directional Slope & Storm Constraints', '9. Ràng buộc Độ dốc Có hướng & Bão bụi'),
        provenance: _tr('ACTIVE CONSTRAINT', 'RÀNG BUỘC HOẠT ĐỘNG'),
        provClass: 'bg-emerald-950 text-emerald-300 border-emerald-700/50',
        value: _tr(`Max Slope: +${thetaMaxUp.toFixed(1)}° Uphill / −${thetaMaxDown.toFixed(1)}° Downhill • Storm Limit: τ < 2.0, Wind ≤ 100 km/h, 48h Buffer`, `Độ dốc tối đa: +${thetaMaxUp.toFixed(1)}° Lên dốc / −${thetaMaxDown.toFixed(1)}° Xuống dốc • Giới hạn bão: τ < 2.0, Gió ≤ 100 km/h, Đệm 48h`),
        impact: _tr(
          'Enforced identically across all 4 pathfinding algorithms (A*, D* Lite, Field D*, FMM). Asymmetric downhill limit (−0.75 θ_max) prevents pressurized suit center-of-gravity tipping.',
          'Áp dụng đồng nhất trên cả 4 thuật toán tìm đường (A*, D* Lite, Field D*, FMM). Giới hạn xuống dốc bất đối xứng (−0.75 θ_max) ngăn ngừa mất trọng tâm ngã nhào khi mặc bộ đồ điều áp.'
        ),
        status: hasRoute ? (m.safetyStatus || syncData.route.safetyStatus || _tr('SAFE', 'AN TOÀN')) : _tr('ACTIVE', 'ĐANG BẬT'),
        statusClass: 'text-emerald-300'
      }
    ];

    tbody.innerHTML = rows.map(r => `
      <tr class="border-b border-subtle hover:bg-hover transition-colors">
        <td class="p-2.5 align-top">
          <div class="font-bold text-primary text-xs">${r.criterion}</div>
          <span class="inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded border mono font-semibold ${r.provClass}">${r.provenance}</span>
        </td>
        <td class="p-2.5 align-top mono text-[11px] text-primary">${r.value}</td>
        <td class="p-2.5 align-top text-[11px] text-secondary leading-relaxed">
          <div class="flex items-center justify-between gap-2 mb-0.5">
            <span class="text-[9px] font-bold uppercase tracking-wider ${r.statusClass}">● ${r.status}</span>
          </div>
          <div>${r.impact}</div>
        </td>
      </tr>
    `).join('');
  }

  _getModalHTML() {
    return `
      <div class="relative w-full max-w-7xl max-h-[94vh] bg-panel border border-accent-soft rounded-2xl shadow-2xl flex flex-col overflow-hidden text-primary">
        
        <!-- Top Header with Adjacent Navigation Switcher: Algorithms | Analytics -->
        <div class="flex items-center justify-between px-5 py-3 border-b border-subtle bg-panel shrink-0 gap-3 flex-wrap">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-panel border border-accent flex items-center justify-center text-accent font-bold text-base shadow">
              📈
            </div>
            <div>
              <h2 class="text-sm font-bold text-primary tracking-wider uppercase flex items-center gap-2 flex-wrap">
                ${_tr('Mars EVA Telemetry & Biophysical Analytics Dashboard', 'Bảng Phân Tích Sinh Lý & Viễn Thám EVA Sao Hỏa')}
                <span class="text-[9px] bg-panel text-accent border border-accent px-2 py-0.5 rounded mono">${_tr('LIVE ROUTE & SUIT MODEL', 'MÔ HÌNH LỘ TRÌNH & BỘ ĐỒ TRỰC TIẾP')}</span>
              </h2>
              <div id="analyticsRouteContextSummary" class="text-[11px] text-secondary flex items-center gap-2 flex-wrap mt-0.5">
                ${_tr('Synchronizing with active Marswalk Planner route & astronaut parameters...', 'Đang đồng bộ với lộ trình Marswalk Planner & thông số phi hành gia...')}
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2.5">
            <button id="btnAnalyticsRecalculateRoute" type="button" class="px-2.5 py-1 rounded-lg bg-panel hover:bg-hover text-accent border border-accent-soft text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer" title="${_tr('Refresh or recalculate route telemetry', 'Làm mới hoặc tính toán lại viễn thám lộ trình')}">
              <span>🔄</span> ${_tr('Sync Telemetry', 'Đồng bộ dữ liệu')}
            </button>

            <!-- Adjacent Section Switcher: Algorithms | Analytics -->
            <div class="inline-flex items-center rounded-lg bg-canvas border border-subtle p-0.5 text-xs">
              <button id="btnAnalyticsSwitchToAlgorithms" type="button" class="px-2.5 py-1 rounded-md text-secondary hover:text-accent hover:bg-hover font-semibold flex items-center gap-1 transition-colors cursor-pointer" title="${_tr('Switch to Algorithms Benchmark (preserves route & astronaut state)', 'Chuyển sang Đối chiếu Thuật toán (giữ nguyên lộ trình & trạng thái phi hành gia)')}">
                <span>📊</span> ${_tr('Algorithms', 'Thuật toán')}
              </button>
              <span class="text-muted px-0.5 select-none">|</span>
              <button type="button" class="px-2.5 py-1 rounded-md bg-panel text-accent border border-accent font-bold flex items-center gap-1 cursor-default shadow-sm">
                <span>📈</span> ${_tr('Analytics', 'Phân tích')}
              </button>
            </div>

            <button id="btnCloseAnalyticsModal" type="button" class="p-1.5 rounded-lg text-secondary hover:text-primary hover:bg-hover transition-colors cursor-pointer text-sm font-bold" title="${_tr('Close Analytics Dashboard', 'Đóng Bảng Phân tích')}">
              ✕
            </button>
          </div>
        </div>

        <!-- Scrollable 4-Region Dashboard Content -->
        <div class="flex-1 p-4 sm:p-5 overflow-y-auto overflow-x-hidden space-y-5">

          <!-- =============================================================== -->
          <!-- REGION 1: SUMMARY METRIC CARDS (6 Cards in Responsive Row)      -->
          <!-- =============================================================== -->
          <section aria-label="Summary Metric Cards" class="space-y-2">
            <div class="flex items-center justify-between">
              <h3 class="text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1.5">
                <span>🧭</span> ${_tr('Region 1: Mission Traverse & xEMU Life-Support Summary Metrics', 'Vùng 1: Chỉ số Tổng hợp Hành trình & Hỗ trợ Sự sống xEMU')}
              </h3>
              <span class="text-[10px] text-secondary mono">${_tr('Derived from active trajectory & astronaut configuration (no static sample values)', 'Trích xuất từ quỹ đạo đang hoạt động & cấu hình phi hành gia (không dùng giá trị mẫu tĩnh)')}</span>
            </div>
            <div id="analyticsSummaryCardsGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <!-- Populated dynamically by _renderRegion1SummaryCards() -->
            </div>
          </section>

          <!-- =============================================================== -->
          <!-- REGION 2: SIDE-BY-SIDE TRAJECTORY TELEMETRY CHARTS              -->
          <!-- =============================================================== -->
          <section aria-label="Trajectory Telemetry Charts" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            <!-- B3: Coupled Walking Speed & Oxygen Flow Rate Along Path -->
            <div class="p-3.5 rounded-xl bg-panel border border-subtle shadow-lg flex flex-col justify-between space-y-2">
              <div class="flex items-center justify-between border-b border-subtle pb-2 flex-wrap gap-1">
                <div>
                  <h4 id="titleCoupledSpeedO2Chart" class="text-xs font-bold text-primary flex items-center gap-1.5">
                    <span>💓</span> ${_tr('Coupled Walking Speed &amp; Oxygen Flow Rate Along Path', 'Tốc độ Đi bộ &amp; Lưu lượng Oxy Kết hợp Dọc Lộ trình')}
                  </h4>
                  <span id="analyticsCoupledChartMeta" class="text-[10px] text-secondary mono block">${_tr('Dual-Axis Route Telemetry', 'Viễn thám lộ trình hai trục')}</span>
                </div>
                <div class="flex items-center gap-3 text-[10px] mono">
                  <span class="flex items-center gap-1 text-rose-300"><span class="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span> ${_tr('O₂ Flow (L/min, Left)', 'Lưu lượng O₂ (L/phút, Trái)')}</span>
                  <span class="flex items-center gap-1 text-accent"><span class="w-2.5 h-2.5 rounded-full bg-accent-hover inline-block"></span> ${_tr('Effective Speed (m/s, Right)', 'Tốc độ hiệu dụng (m/s, Phải)')}</span>
                </div>
              </div>
              <div id="analyticsCoupledSpeedO2ChartContainer" class="h-56 w-full relative">
                <!-- Populated by _renderRegion2CoupledSpeedO2Chart() -->
              </div>
            </div>

            <!-- B4: Martian DEM Elevation Profile (m) Along Trajectory -->
            <div class="p-3.5 rounded-xl bg-panel border border-subtle shadow-lg flex flex-col justify-between space-y-2">
              <div class="flex items-center justify-between border-b border-subtle pb-2 flex-wrap gap-1">
                <div>
                  <h4 id="titleMartianDemElevationChart" class="text-xs font-bold text-primary flex items-center gap-1.5">
                    <span>⛰️</span> ${_tr('Martian DEM Elevation Profile (m) Along Trajectory', 'Mặt cắt Độ cao DEM Sao Hỏa (m) Dọc Quỹ đạo')}
                  </h4>
                  <span id="analyticsElevationUnvisitedBadge" class="text-[10px] text-secondary mono block">${_tr('Unvisited Waypoints: --', 'Điểm chưa đi qua: --')}</span>
                </div>
                <div class="flex items-center gap-3 text-[10px] mono">
                  <span class="flex items-center gap-1 text-secondary"><span class="w-2.5 h-2.5 rounded bg-elevated inline-block"></span> MOLA DEM (m)</span>
                  <span class="flex items-center gap-1 text-rose-300"><span class="w-2.5 h-0.5 bg-rose-500 inline-block"></span> ${_tr('NoData Gap', 'Khoảng thiếu dữ liệu')}</span>
                </div>
              </div>
              <div id="analyticsElevationChartContainer" class="h-56 w-full relative">
                <!-- Populated by _renderRegion2ElevationChart() -->
              </div>
            </div>

          </section>

          <!-- =============================================================== -->
          <!-- REGION 3: COUPLED MARTIAN EVA MATHEMATICAL MODEL (Part B5)      -->
          <!-- =============================================================== -->
          <section aria-label="Coupled Martian EVA Mathematical Model" class="p-4 rounded-xl bg-panel border border-accent-soft space-y-3 shadow-lg">
            <div class="flex items-center justify-between border-b border-subtle pb-2 flex-wrap gap-2">
              <div>
                <h3 id="titleCoupledMathModel" class="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <span>📐</span> ${_tr('Coupled Martian EVA Mathematical Model', 'Mô hình Toán học EVA Sao Hỏa Kết hợp')}
                </h3>
                <p class="text-[11px] text-secondary">${_tr('Exact biophysical, barometric, and radiation equations executed by the application engine', 'Các phương trình sinh lý học, khí áp và bức xạ chính xác được thực thi bởi hệ thống')}</p>
              </div>
              <button id="btnViewLatexCode" type="button" class="px-3 py-1 rounded-lg bg-panel hover:bg-hover text-accent border border-accent text-xs mono font-bold transition-colors cursor-pointer">
                <span>&lt;/&gt; ${_tr('View LaTeX Code', 'Xem mã LaTeX')}</span>
              </button>
            </div>

            <!-- Collapsible Raw LaTeX Code Drawer -->
            <div id="analyticsLatexCodeDrawer" class="hidden p-3 rounded-xl bg-canvas border border-accent-soft space-y-2">
              <div class="flex items-center justify-between border-b border-subtle pb-1.5">
                <span class="text-[11px] font-bold text-accent mono">${_tr('Raw LaTeX Source Equations (Synchronized with Active Parameters)', 'Mã nguồn phương trình LaTeX gốc (Đồng bộ với tham số đang hoạt động)')}</span>
                <div class="flex items-center gap-2">
                  <button id="btnCopyLatexSource" type="button" class="px-2 py-0.5 rounded bg-panel hover:bg-hover text-primary text-[10px] mono border border-subtle cursor-pointer">
                    ${_tr('📋 Copy LaTeX', '📋 Sao chép LaTeX')}
                  </button>
                  <button id="btnCloseLatexDrawer" type="button" class="px-2 py-0.5 rounded bg-panel hover:bg-hover text-secondary text-[10px] mono cursor-pointer">
                    ${_tr('✕ Close', '✕ Đóng')}
                  </button>
                </div>
              </div>
              <pre id="latexRawSourceCode" class="text-[11px] mono text-emerald-300 overflow-x-auto leading-relaxed p-2 bg-panel rounded border border-subtle select-text"></pre>
            </div>

            <!-- 5 Equation Groups Grid -->
            <div id="analyticsMathEquationsGrid" class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <!-- Populated by _renderRegion3MathematicalModel() -->
            </div>
          </section>

          <!-- =============================================================== -->
          <!-- REGION 4: MARTIAN SURFACE ENVIRONMENT & SPACESUIT SPECS (B6)    -->
          <!-- =============================================================== -->
          <section aria-label="Martian Surface Environment and Spacesuit Specifications" class="p-4 rounded-xl bg-panel border border-subtle space-y-3 shadow-lg">
            <div class="flex items-center justify-between border-b border-subtle pb-2 flex-wrap gap-2">
              <div>
                <h3 id="titleEnvironmentSpecsTable" class="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <span>🛰️</span> ${_tr('Martian Surface Environment &amp; NASA xEMU / AxEMU Spacesuit Specifications', 'Môi trường Bề mặt Sao Hỏa &amp; Thông số Bộ đồ Vũ trụ NASA xEMU / AxEMU')}
                </h3>
                <p class="text-[11px] text-secondary">${_tr('Distinguishes measured planetary datasets, mathematical model estimates, configurable suit parameters, and unmodeled systems', 'Phân biệt rõ dữ liệu đo đạc hành tinh, ước lượng mô hình toán học, thông số bộ đồ cấu hình được và hệ thống chưa mô phỏng')}</p>
              </div>
              <div class="flex items-center gap-2 text-[9px] mono flex-wrap">
                <span class="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/50">${_tr('MEASURED DEM', 'ĐO ĐẠC DEM')}</span>
                <span class="px-1.5 py-0.5 rounded bg-panel text-accent border border-accent">${_tr('MODELED ESTIMATE', 'ƯỚC LƯỢNG MÔ HÌNH')}</span>
                <span class="px-1.5 py-0.5 rounded bg-elevated text-secondary border border-strong">${_tr('CONFIGURED SPEC', 'THÔNG SỐ CẤU HÌNH')}</span>
                <span class="px-1.5 py-0.5 rounded bg-panel text-secondary border border-subtle">${_tr('NOT MODELED', 'KHÔNG MÔ PHỎNG')}</span>
              </div>
            </div>

            <div class="overflow-x-auto rounded-xl border border-subtle bg-canvas">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="border-b border-subtle bg-panel text-[10px] uppercase tracking-wider text-secondary">
                    <th class="p-2.5 w-1/4">${_tr('Criterion / System', 'Tiêu chí / Hệ thống')}</th>
                    <th class="p-2.5 w-1/3">${_tr('Martian / xEMU Value', 'Giá trị Sao Hỏa / xEMU')}</th>
                    <th class="p-2.5">${_tr('Human Suitability &amp; EVA Impact', 'Mức độ Phù hợp &amp; Tác động EVA')}</th>
                  </tr>
                </thead>
                <tbody id="analyticsEnvSpecsTableBody" class="divide-y divide-subtle">
                  <!-- Populated by _renderRegion4EnvironmentTable() -->
                </tbody>
              </table>
            </div>
          </section>

        </div>
      </div>
    `;
  }
}

// Auto-instantiate
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
      window.evaAnalyticsUI = new EvaAnalyticsUI();
    });
  } else {
    window.evaAnalyticsUI = new EvaAnalyticsUI();
  }
}
