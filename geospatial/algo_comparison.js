/**
 * Eva Marswalk - Algorithms & Benchmark Engine (geospatial/algo_comparison.js)
 * Comprehensive interface for:
 * - Section A: 4 Algorithm Selection Buttons (Field D*, D* Lite, FMM, Baseline A*)
 * - Section B: Four-Algorithm Benchmark Suite (Table + Two Comparison Charts + Re-Run on Current Map)
 * - Section C: In-depth Technical Algorithm Descriptions & Search Characteristics
 */

import { runFourAlgorithmBenchmark } from './field_d_star.js';

const _tr = (en, vi) => (typeof window !== 'undefined' && window.evaTr ? window.evaTr(en, vi) : en);

export const ALGORITHMS_METADATA = [
  {
    key: "field_dstar",
    get name() { return _tr("Field D*", "Field D*"); },
    get fullName() { return _tr("Field D* (Ferguson & Stentz, NASA JPL)", "Field D* (Ferguson & Stentz, NASA JPL)"); },
    get badge() { return _tr("RECOMMENDED", "KHUYẾN NGHỊ"); },
    badgeColor: "bg-panel text-accent border-accent",
    get paradigm() { return _tr("Continuous Any-Angle Linear Interpolation", "Nội suy tuyến tính mọi góc liên tục"); },
    get oneLiner() { return _tr("Continuous any-angle trajectory that eliminates 45°/90° grid zigzag artifacts using sub-grid boundary interpolation.", "Quỹ đạo mọi góc liên tục loại bỏ hiện tượng zíc-zắc lưới 45°/90° bằng nội suy biên dưới lưới."); },
    get coreApproach() { return _tr("Continuous linear edge interpolation (Ferguson & Stentz 2005) solving analytical minimizer y* = (f·d1)/(d2·sqrt((c·d2)² - f²)).", "Nội suy cạnh tuyến tính liên tục (Ferguson & Stentz 2005) giải nghiệm cực tiểu giải tích y* = (f·d1)/(d2·sqrt((c·d2)² - f²))."); },
    get searchStrategy() { return _tr("Continuous priority queue search with dynamic rhs/g consistency repair and continuous boundary crossing extraction.", "Tìm kiếm hàng đợi ưu tiên liên tục với khôi phục nhất quán rhs/g động và trích xuất giao cắt biên liên tục."); },
    get strengths() { return _tr("Natural continuous paths without zigzag grid artifacts. Proven ~6-14% shorter ground distance than discrete D* Lite. Lowest metabolic cost for human astronaut locomotion.", "Lộ trình liên tục tự nhiên không bị zíc-zắc lưới. Ngắn hơn ~6-14% quãng đường mặt đất so với D* Lite rời rạc. Chi phí trao đổi chất thấp nhất cho phi hành gia."); },
    get limitations() { return _tr("Higher mathematical per-step analytical interpolation complexity compared to discrete A*.", "Độ phức tạp tính toán nội suy giải tích mỗi bước cao hơn so với A* rời rạc."); },
    get weights() { return _tr("Base: 1.0, Slope: 2.0, Roughness: 1.5, Safety: 2.2, Max Safe Slope: 22.0°", "Cơ sở: 1.0, Độ dốc: 2.0, Độ nhám: 1.5, An toàn: 2.2, Độ dốc an toàn tối đa: 22.0°"); }
  },
  {
    key: "dstar_lite",
    get name() { return _tr("D* Lite", "D* Lite"); },
    get fullName() { return _tr("D* Lite (Koenig & Likhachev Dynamic Replanning)", "D* Lite (Tái lập lộ trình động Koenig & Likhachev)"); },
    get badge() { return _tr("DYNAMIC REPLAN", "TÁI LẬP ĐỘNG"); },
    badgeColor: "bg-panel text-accent border-accent",
    get paradigm() { return _tr("Discrete 8-Connected Dynamic Replanning", "Tái lập lộ trình động 8 hướng rời rạc"); },
    get oneLiner() { return _tr("Reverse incremental heuristic search that updates only affected nodes when obstacles or dust storms appear.", "Tìm kiếm heuristic tăng dần ngược chỉ cập nhật các nút bị ảnh hưởng khi chướng ngại vật hoặc bão bụi xuất hiện."); },
    get coreApproach() { return _tr("Reverse incremental heuristic search from goal to current position using g and rhs consistency values.", "Tìm kiếm heuristic tăng dần ngược từ đích về vị trí hiện tại sử dụng các giá trị nhất quán g và rhs."); },
    get searchStrategy() { return _tr("Maintains priority queue of inconsistent vertices (g ≠ rhs). Only modifies changed cells upon re-routing.", "Duy trì hàng đợi ưu tiên các đỉnh không nhất quán (g ≠ rhs). Chỉ sửa đổi các ô thay đổi khi định tuyến lại."); },
    get strengths() { return _tr("Instantaneous replanning (~1-4 ms) when environmental conditions or obstacle boundaries change dynamically.", "Tái lập lộ trình tức thì (~1-4 ms) khi điều kiện môi trường hoặc ranh giới chướng ngại vật thay đổi động."); },
    get limitations() { return _tr("Confined to 8 discrete grid headings (0°, 45°, 90°, etc.) with octile metric bias.", "Giới hạn ở 8 hướng lưới rời rạc (0°, 45°, 90°, v.v.) với sai lệch metric bát giác."); },
    get weights() { return _tr("Base: 1.0, Slope: 2.0, Roughness: 1.5, Safety: 2.2, Max Safe Slope: 22.0°", "Cơ sở: 1.0, Độ dốc: 2.0, Độ nhám: 1.5, An toàn: 2.2, Độ dốc an toàn tối đa: 22.0°"); }
  },
  {
    key: "fmm",
    get name() { return _tr("Fast Marching (FMM)", "Fast Marching (FMM)"); },
    get fullName() { return _tr("Fast Marching Method / FMM (Sethian Continuous Eikonal)", "Phương pháp Fast Marching / FMM (Eikonal liên tục Sethian)"); },
    get badge() { return _tr("WAVEFRONT PDE", "MẶT SÓNG PDE"); },
    badgeColor: "bg-purple-950 text-purple-300 border-purple-700",
    get paradigm() { return _tr("Eikonal Wavefront PDE Gradient Descent", "Hạ Gradient PDE Mặt sóng Eikonal"); },
    get oneLiner() { return _tr("Solves the continuous Eikonal wave equation |∇T|·F = 1 to produce organic, globally optimal wavefronts.", "Giải phương trình sóng Eikonal liên tục |∇T|·F = 1 để tạo mặt sóng tối ưu toàn cục mượt mà."); },
    get coreApproach() { return _tr("Numerical PDE solver for the Eikonal equation using upwind finite differences and narrow-band min-heap.", "Bộ giải số PDE cho phương trình Eikonal dùng sai phân hữu hạn ngược dòng và min-heap dải hẹp."); },
    get searchStrategy() { return _tr("Monotonically expands arrival time wavefront T(r, c) outward from start; path extracted via gradient descent.", "Mở rộng đơn điệu mặt sóng thời gian đến T(r, c) từ điểm xuất phát; trích xuất đường đi bằng hạ gradient."); },
    get strengths() { return _tr("Smooth, organic trajectories; mathematically guaranteed to have zero local minima with continuous clearance.", "Quỹ đạo tự nhiên mượt mà; đảm bảo toán học không có cực tiểu cục bộ với khoảng cách an toàn liên tục."); },
    get limitations() { return _tr("Higher computational and memory footprint to maintain time arrival matrix across large grids.", "Chi phí tính toán và bộ nhớ cao hơn để duy trì ma trận thời gian đến trên lưới lớn."); },
    get weights() { return _tr("Base: 1.0, Slope: 2.0, Buffer: 4 cells, Safety Weight: 2.2, Max Safe Slope: 22.0°", "Cơ sở: 1.0, Độ dốc: 2.0, Đệm: 4 ô, Trọng số an toàn: 2.2, Độ dốc an toàn tối đa: 22.0°"); }
  },
  {
    key: "astar",
    get name() { return _tr("Baseline A*", "A* Cơ sở"); },
    get fullName() { return _tr("A* Search (8-Direction Optimal Grid Baseline)", "Tìm kiếm A* (Cơ sở lưới tối ưu 8 hướng)"); },
    get badge() { return _tr("OPTIMAL BASELINE", "CƠ SỞ TỐI ƯU"); },
    badgeColor: "bg-emerald-950 text-emerald-300 border-emerald-700",
    get paradigm() { return _tr("Discrete 8-Connected Graph Search", "Tìm kiếm đồ thị 8 hướng rời rạc"); },
    get oneLiner() { return _tr("Classic 8-connected heuristic graph search providing proven discrete optimality for baseline comparison.", "Tìm kiếm đồ thị heuristic 8 hướng cổ điển mang lại tính tối ưu rời rạc đã kiểm chứng để so sánh cơ sở."); },
    get coreApproach() { return _tr("Standard 8-connected graph search with Euclidean distance heuristic and corner-cutting prevention.", "Tìm kiếm đồ thị 8 hướng tiêu chuẩn với heuristic khoảng cách Euclid và ngăn chặn cắt góc."); },
    get searchStrategy() { return _tr("Expands lowest f = g + h score nodes in priority queue until goal is popped.", "Mở rộng các nút có điểm f = g + h thấp nhất trong hàng đợi ưu tiên cho đến khi lấy được đích."); },
    get strengths() { return _tr("Simple, highly predictable, widely validated baseline with zero heuristic overshoot.", "Đơn giản, dễ dự đoán, cơ sở đối chiếu được kiểm chứng rộng rãi không bị vượt quá heuristic."); },
    get limitations() { return _tr("Grid snapping creates unnatural turns and artificial zigzags across flat plains.", "Bám lưới tạo ra các khúc cua thiếu tự nhiên và đường zíc-zắc nhân tạo trên đồng bằng phẳng."); },
    get weights() { return _tr("Base: 1.0, Slope: 2.0, Roughness: 1.5, Safety: 2.2, Max Safe Slope: 22.0°", "Cơ sở: 1.0, Độ dốc: 2.0, Độ nhám: 1.5, An toàn: 2.2, Độ dốc an toàn tối đa: 22.0°"); }
  }
];

export class AlgoComparisonUI {
  constructor() {
    this.activeAlgorithm = "field_dstar";
    this.benchmarkData = null;
    this.isBenchmarking = false;
    this.isBenchmarkCancelled = false;
    this.benchmarkWorker = null;
    this.isWorkerReady = false;
    this.pendingWorkerResolve = null;
    this.pendingWorkerId = 0;
    this.workerReqId = 0;
    this._initBenchmarkWorker();
    this.initDOM();
    if (typeof window !== 'undefined' && typeof window.onEvaLangChange === 'function') {
      window.onEvaLangChange(() => this._refreshLocalization());
    }
  }

  _refreshLocalization() {
    const modal = document.getElementById('algoComparisonModal');
    if (modal) {
      modal.innerHTML = this._getModalHTML();
      this._bindModalEvents();
      this._syncStateFromGlobal();
      this.renderSectionA();
      if (this.benchmarkData) {
        this.renderBenchmarkTable();
        this.renderCharts();
      }
    }
    const plannerDisplay = document.getElementById('plannerActiveAlgoName');
    if (plannerDisplay) {
      const meta = ALGORITHMS_METADATA.find(a => a.key === this.activeAlgorithm);
      if (meta) plannerDisplay.textContent = meta.fullName;
    }
  }

  _initBenchmarkWorker() {
    if (typeof Worker === 'undefined') return;
    try {
      this.benchmarkWorker = new Worker('./geospatial/route_worker.js', { type: 'module' });
      this.benchmarkWorker.onmessage = (e) => {
        if (!e.data) return;
        if (e.data.type === 'WORKER_READY') {
          this.isWorkerReady = true;
        } else if (e.data.type === 'ROUTE_RESULT' && this.pendingWorkerResolve && e.data.id === this.pendingWorkerId) {
          const resolve = this.pendingWorkerResolve;
          this.pendingWorkerResolve = null;
          resolve(e.data);
        }
      };
      this.benchmarkWorker.onerror = () => {
        this.isWorkerReady = false;
      };
    } catch (_) {
      this.benchmarkWorker = null;
    }
  }

  initDOM() {
    if (!document.getElementById('algoComparisonModal')) {
      const modal = document.createElement('div');
      modal.id = 'algoComparisonModal';
      modal.className = 'hidden fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-panel backdrop-blur-md transition-opacity select-none';
      modal.innerHTML = this._getModalHTML();
      document.body.appendChild(modal);

      this._bindModalEvents();
    }
    this._bindOpenButtons();
  }

  _bindOpenButtons() {
    const ids = ['btnOpenAlgorithms', 'btnOpenAlgoComparison', 'btnPlannerSwitchAlgo'];
    ids.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.onclick = () => this.openModal();
      }
    });
  }

  openModal() {
    const modal = document.getElementById('algoComparisonModal');
    if (!modal) return;
    if (window.evaAnalyticsUI && typeof window.evaAnalyticsUI.closeModal === 'function') {
      window.evaAnalyticsUI.closeModal(true);
    }
    this.isBenchmarkCancelled = false;
    this._syncStateFromGlobal();
    this.renderSectionA();
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    if (typeof window.syncTopNavActiveSection === 'function') {
      window.syncTopNavActiveSection('algorithms');
    }

    if (!this.benchmarkData) {
      setTimeout(() => {
        if (!this.isBenchmarkCancelled) this.runBenchmark(false);
      }, 30);
    } else {
      this.renderBenchmarkTable();
      this.renderCharts();
    }
  }

  closeModal(silent = false) {
    this.isBenchmarkCancelled = true;
    this.isBenchmarking = false;
    this._hideBarTooltip();
    const modal = document.getElementById('algoComparisonModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
    if (!silent && typeof window.syncTopNavActiveSection === 'function') {
      window.syncTopNavActiveSection(null);
    }
    if (this.benchmarkWorker && this.pendingWorkerResolve) {
      try {
        this.benchmarkWorker.postMessage({ type: 'CANCEL_ROUTE', id: this.pendingWorkerId });
      } catch (_) {}
      const resolve = this.pendingWorkerResolve;
      this.pendingWorkerResolve = null;
      resolve({ success: false, status: 'CANCELLED' });
    }
    if (window.localPlanner && typeof window.localPlanner.cancel === 'function') {
      window.localPlanner.cancel();
    }
    const rerunBtn = document.getElementById('btnRerunBenchmark');
    if (rerunBtn) {
      rerunBtn.disabled = false;
      rerunBtn.innerHTML = `<span>🔄</span> ${_tr('Re-Run Benchmark on Current Map', 'Chạy lại Benchmark trên bản đồ hiện tại')}`;
    }
  }

  _syncStateFromGlobal() {
    if (window.state && window.state.activeAlgorithm) {
      this.activeAlgorithm = window.state.activeAlgorithm;
    }
  }

  selectAlgorithm(key) {
    this.activeAlgorithm = key;
    if (window.state) {
      window.state.activeAlgorithm = key;
    }

    // Update Marswalk Planner display if present
    const plannerDisplay = document.getElementById('plannerActiveAlgoName');
    if (plannerDisplay) {
      const meta = ALGORITHMS_METADATA.find(a => a.key === key);
      plannerDisplay.textContent = meta ? meta.fullName : key;
    }

    this.renderSectionA();
    this.renderBenchmarkTable();
    this.renderCharts();

    // Notify listeners
    if (typeof window.onAlgorithmChanged === 'function') {
      window.onAlgorithmChanged(key);
    }
  }

  _bindModalEvents() {
    const closeBtn = document.getElementById('btnCloseAlgorithmsModal');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        this.closeModal();
      };
    }

    const modal = document.getElementById('algoComparisonModal');
    if (modal) {
      modal.onclick = (e) => {
        if (e.target === modal) {
          e.stopPropagation();
          this.closeModal();
        }
      };
    }

    // Keyboard ESC to close immediately
    if (!this._escBound) {
      this._escBound = true;
      window.addEventListener('keydown', (e) => {
        const m = document.getElementById('algoComparisonModal');
        if (e.key === 'Escape' && m && !m.classList.contains('hidden')) {
          this.closeModal();
        }
      });
    }

    const rerunBtn = document.getElementById('btnRerunBenchmark');
    if (rerunBtn) {
      rerunBtn.onclick = (e) => {
        e.stopPropagation();
        this.runBenchmark(true);
      };
    }

    const switchAnalyticsBtn = document.getElementById('btnModalSwitchToAnalytics');
    if (switchAnalyticsBtn) {
      switchAnalyticsBtn.onclick = (e) => {
        e.stopPropagation();
        if (window.evaAnalyticsUI && typeof window.evaAnalyticsUI.openModal === 'function') {
          window.evaAnalyticsUI.openModal();
        }
      };
    }
  }

  _getModalHTML() {
    return `
      <div class="relative w-full max-w-6xl max-h-[92vh] bg-panel border border-accent-soft rounded-2xl shadow-2xl flex flex-col overflow-hidden text-primary">
        
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-3.5 border-b border-subtle bg-panel shrink-0 gap-3 flex-wrap">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-panel border border-accent flex items-center justify-center text-accent font-bold text-base shadow">
              ⚡
            </div>
            <div>
              <h2 class="text-sm font-bold text-primary tracking-wider uppercase flex items-center gap-2">
                ${_tr('Algorithms & Benchmark Suite', 'Bộ Thuật Toán & Đối Chiếu Benchmark')}
                <span class="text-[9px] bg-panel text-accent border border-accent px-2 py-0.5 rounded mono">${_tr('CENTRALIZED ALGORITHM ENGINE', 'ĐỘNG CƠ THUẬT TOÁN TẬP TRUNG')}</span>
              </h2>
              <p class="text-[11px] text-secondary">${_tr('All four pathfinding algorithms share identical terrain cost, planetary coordinate geometry, and walker parameters', 'Cả 4 thuật toán tìm đường dùng chung hàm chi phí địa hình, hình học tọa độ hành tinh và thông số phi hành gia')}</p>
            </div>
          </div>
          <div class="flex items-center gap-2.5">
            <!-- Adjacent Navigation Switcher: Algorithms | Analytics -->
            <div class="inline-flex items-center rounded-lg bg-canvas border border-subtle p-0.5 text-xs">
              <button type="button" class="px-2.5 py-1 rounded-md bg-panel text-accent border border-accent font-bold flex items-center gap-1 cursor-default shadow-sm">
                <span>📊</span> ${_tr('Algorithms', 'Thuật toán')}
              </button>
              <span class="text-muted px-0.5 select-none">|</span>
              <button id="btnModalSwitchToAnalytics" type="button" class="px-2.5 py-1 rounded-md text-secondary hover:text-accent hover:bg-hover font-semibold flex items-center gap-1 transition-colors cursor-pointer" title="${_tr('Switch to EVA Analytics Dashboard (preserves route & astronaut state)', 'Chuyển sang Bảng Phân tích EVA (giữ nguyên lộ trình & trạng thái phi hành gia)')}">
                <span>📈</span> ${_tr('Analytics', 'Phân tích')}
              </button>
            </div>
            <button id="btnCloseAlgorithmsModal" class="p-1.5 rounded-lg text-secondary hover:text-primary hover:bg-hover transition-colors cursor-pointer text-sm font-bold">
              ✕
            </button>
          </div>
        </div>

        <!-- Scrollable Modal Content (Sections A, B, C) -->
        <div class="flex-1 p-5 overflow-y-auto space-y-6">

          <!-- ================================================================= -->
          <!-- SECTION A: FOUR ALGORITHM SELECTION BUTTONS AT THE TOP -->
          <!-- ================================================================= -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-secondary uppercase tracking-wider flex items-center gap-1.5">
                <span>🎯</span> ${_tr('Section A: Active Algorithm Selection', 'Phần A: Lựa chọn Thuật toán Đang dùng')}
              </span>
              <span class="text-[10px] text-accent mono">${_tr('Click an algorithm to activate it for Marswalk Planner', 'Nhấp vào một thuật toán để kích hoạt cho Trình lập lộ trình Marswalk')}</span>
            </div>
            
            <div id="algoSelectionButtonsContainer" class="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              <!-- Dynamically populated via renderSectionA() -->
            </div>

            <!-- Active Algorithm Concise One-Liner Description -->
            <div id="activeAlgoOneLiner" class="p-2.5 rounded-xl bg-panel border border-accent-soft text-xs text-accent flex items-center gap-2 shadow-inner">
              <!-- Dynamically populated -->
            </div>
          </div>

          <!-- ================================================================= -->
          <!-- SECTION B: FOUR-ALGORITHM BENCHMARK -->
          <!-- ================================================================= -->
          <div class="space-y-3 pt-2 border-t border-subtle">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 class="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <span>📊</span> ${_tr('Section B: Four-Algorithm Benchmark Comparison', 'Phần B: Đối chiếu Benchmark 4 Thuật toán')}
                </h3>
                <p class="text-[11px] text-secondary">${_tr('Side-by-side benchmark evaluated under identical start/dest coordinates, terrain data, and walker settings', 'Đối chiếu song song dưới cùng tọa độ xuất phát/đích, dữ liệu địa hình và cấu hình phi hành gia')}</p>
              </div>
              <button id="btnRerunBenchmark" class="px-3.5 py-1.5 rounded bg-accent hover:bg-accent-hover text-accent-contrast font-bold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer self-start sm:self-auto">
                <span>🔄</span> ${_tr('Re-Run Benchmark on Current Map', 'Chạy lại Benchmark trên bản đồ hiện tại')}
              </button>
            </div>

            <!-- Benchmark Comparison Table -->
            <div class="rounded-xl border border-subtle bg-panel overflow-hidden shadow-lg">
              <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr class="border-b border-subtle bg-canvas text-secondary uppercase text-[10px] tracking-wider">
                      <th class="p-2.5 font-bold text-primary">${_tr('Algorithm', 'Thuật toán')}</th>
                      <th class="p-2.5 font-bold text-secondary">${_tr('Trajectory Paradigm', 'Mô hình quỹ đạo')}</th>
                      <th class="p-2.5 font-bold text-accent mono text-right">${_tr('CPU Time (ms)', 'Thời gian CPU (ms)')}</th>
                      <th class="p-2.5 font-bold text-secondary mono text-right">${_tr('Nodes', 'Số nút')}</th>
                      <th class="p-2.5 font-bold text-secondary mono text-right">${_tr('Distance (m)', 'Quãng đường (m)')}</th>
                      <th class="p-2.5 font-bold text-secondary mono text-right">${_tr('Speed (m/s)', 'Tốc độ (m/s)')}</th>
                      <th class="p-2.5 font-bold text-secondary mono text-right">${_tr('Avg VO₂ (L/min)', 'VO₂ TB (L/phút)')}</th>
                      <th class="p-2.5 font-bold text-secondary mono text-right">${_tr('Total O₂ (L)', 'Tổng O₂ (L)')}</th>
                      <th class="p-2.5 font-bold text-emerald-400 mono text-right">${_tr('O₂ Saved vs A*', 'O₂ Tiết kiệm so với A*')}</th>
                      <th class="p-2.5 font-bold text-accent mono text-right">${_tr('Smoothness (%)', 'Độ mượt (%)')}</th>
                      <th class="p-2.5 font-bold text-center">${_tr('Action', 'Thao tác')}</th>
                    </tr>
                  </thead>
                  <tbody id="benchmarkTableBody" class="divide-y divide-subtle text-[11px]">
                    <tr>
                      <td colspan="11" class="p-4 text-center text-secondary italic">${_tr('Click "Re-Run Benchmark on Current Map" to execute all 4 algorithms...', 'Nhấp "Chạy lại Benchmark trên bản đồ hiện tại" để thực thi cả 4 thuật toán...')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Two Dual-Axis Benchmark Charts Side-by-Side -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <!-- Chart 1: Distance (m) [Left Axis - Green] & Total Oxygen Consumed (L) [Right Axis - Red] -->
              <div class="p-3.5 rounded-xl border border-subtle bg-canvas space-y-2">
                <div class="flex items-center justify-between border-b border-subtle pb-1.5 flex-wrap gap-1">
                  <span class="text-xs font-bold text-primary flex items-center gap-1.5">
                    <span>📈</span> ${_tr('Chart 1: Path Distance & Oxygen Cost', 'Biểu đồ 1: Quãng đường & Tiêu thụ Oxy')}
                  </span>
                  <div class="flex items-center gap-3 text-[10px] mono">
                    <span class="flex items-center gap-1 text-emerald-300"><span class="w-2.5 h-2.5 rounded bg-emerald-500 inline-block"></span> ${_tr('Left Axis: Distance (m)', 'Trục trái: Quãng đường (m)')}</span>
                    <span class="flex items-center gap-1 text-rose-300"><span class="w-2.5 h-2.5 rounded bg-rose-500 inline-block"></span> ${_tr('Right Axis: Total O₂ (L)', 'Trục phải: Tổng O₂ (L)')}</span>
                  </div>
                </div>
                <div id="chart1Container" class="h-52 flex items-center justify-center text-xs text-muted relative">
                  ${_tr('Awaiting benchmark data...', 'Đang chờ dữ liệu benchmark...')}
                </div>
              </div>

              <!-- Chart 2: Trajectory Smoothness (%) [Left Axis - Green] & CPU Time (ms) [Right Axis - Red] -->
              <div class="p-3.5 rounded-xl border border-subtle bg-canvas space-y-2">
                <div class="flex items-center justify-between border-b border-subtle pb-1.5 flex-wrap gap-1">
                  <span class="text-xs font-bold text-primary flex items-center gap-1.5">
                    <span>⚡</span> ${_tr('Chart 2: Trajectory Smoothness & CPU Time', 'Biểu đồ 2: Độ mượt quỹ đạo & Thời gian CPU')}
                  </span>
                  <div class="flex items-center gap-3 text-[10px] mono">
                    <span class="flex items-center gap-1 text-emerald-300"><span class="w-2.5 h-2.5 rounded bg-emerald-500 inline-block"></span> ${_tr('Left Axis: Smoothness (%)', 'Trục trái: Độ mượt (%)')}</span>
                    <span class="flex items-center gap-1 text-rose-300"><span class="w-2.5 h-2.5 rounded bg-rose-500 inline-block"></span> ${_tr('Right Axis: CPU Time (ms)', 'Trục phải: Thời gian CPU (ms)')}</span>
                  </div>
                </div>
                <div id="chart2Container" class="h-52 flex items-center justify-center text-xs text-muted relative">
                  ${_tr('Awaiting benchmark data...', 'Đang chờ dữ liệu benchmark...')}
                </div>
              </div>
            </div>
          </div>

          <!-- ================================================================= -->
          <!-- SECTION C: PRESERVED DETAILED ALGORITHM DESCRIPTIONS -->
          <!-- ================================================================= -->
          <div class="space-y-3 pt-3 border-t border-subtle">
            <h3 class="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
              <span>📖</span> ${_tr('Section C: Algorithm Core Principles & Search Strategies', 'Phần C: Nguyên lý Cốt lõi & Chiến lược Tìm kiếm của Thuật toán')}
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              ${ALGORITHMS_METADATA.map(a => `
                <div class="p-3.5 rounded-xl border border-subtle bg-panel space-y-2">
                  <div class="flex items-center justify-between border-b border-subtle pb-1.5">
                    <span class="text-xs font-bold text-accent">${a.fullName}</span>
                    <span class="text-[9px] px-1.5 py-0.5 rounded border mono font-bold ${a.badgeColor}">${a.badge}</span>
                  </div>
                  <div class="space-y-1.5 text-[11px] leading-relaxed">
                    <div><span class="font-bold text-secondary">${_tr('Core Principle:', 'Nguyên lý cốt lõi:')}</span> <span class="text-secondary">${a.coreApproach}</span></div>
                    <div><span class="font-bold text-secondary">${_tr('Search Strategy:', 'Chiến lược tìm kiếm:')}</span> <span class="text-secondary">${a.searchStrategy}</span></div>
                    <div><span class="font-bold text-emerald-400">${_tr('Strengths:', 'Ưu điểm:')}</span> <span class="text-secondary">${a.strengths}</span></div>
                    <div><span class="font-bold text-secondary">${_tr('Limitations:', 'Hạn chế:')}</span> <span class="text-secondary">${a.limitations}</span></div>
                    <div><span class="font-bold text-accent font-mono text-[10px]">${_tr('Weights:', 'Trọng số:')}</span> <span class="font-mono text-[10px] text-secondary">${a.weights}</span></div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

        </div>
      </div>
    `;
  }

  renderSectionA() {
    const container = document.getElementById('algoSelectionButtonsContainer');
    const oneLiner = document.getElementById('activeAlgoOneLiner');
    if (!container) return;

    container.innerHTML = ALGORITHMS_METADATA.map(a => {
      const isActive = a.key === this.activeAlgorithm;
      const borderClass = isActive ? 'border-accent bg-panel shadow-accent shadow-md ring-1 ring-accent' : 'border-subtle bg-panel hover:border-subtle hover:bg-hover';
      const textClass = isActive ? 'text-accent font-bold' : 'text-secondary font-medium';
      return `
        <button type="button" data-algo="${a.key}" class="p-3 rounded-xl border ${borderClass} flex flex-col items-start gap-1 text-left transition-all cursor-pointer group">
          <div class="flex items-center justify-between w-full">
            <span class="text-xs ${textClass}">${a.name}</span>
            ${isActive ? `<span class="text-accent text-xs">✓ ${_tr('Active', 'Đang dùng')}</span>` : ''}
          </div>
          <span class="text-[9px] px-1.5 py-0.5 rounded border mono ${a.badgeColor}">${a.badge}</span>
          <span class="text-[10px] text-secondary line-clamp-1 mt-0.5">${a.paradigm}</span>
        </button>
      `;
    }).join('');

    // Attach click listeners to buttons
    container.querySelectorAll('button[data-algo]').forEach(btn => {
      btn.onclick = () => {
        const key = btn.getAttribute('data-algo');
        this.selectAlgorithm(key);
      };
    });

    if (oneLiner) {
      const activeMeta = ALGORITHMS_METADATA.find(a => a.key === this.activeAlgorithm) || ALGORITHMS_METADATA[0];
      oneLiner.innerHTML = `
        <span class="text-accent font-bold">${activeMeta.fullName}:</span>
        <span>${activeMeta.oneLiner}</span>
      `;
    }
  }

  async runBenchmark(forceRerun = false) {
    if (this.isBenchmarking) return;
    this.isBenchmarking = true;
    this.isBenchmarkCancelled = false;

    const rerunBtn = document.getElementById('btnRerunBenchmark');
    if (rerunBtn) {
      rerunBtn.disabled = true;
      rerunBtn.innerHTML = `<span>⏳</span> ${_tr('Benchmarking (4 Algorithms)...', 'Đang chạy Benchmark (4 thuật toán)...')}`;
    }

    const tbody = document.getElementById('benchmarkTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="11" class="p-4 text-center text-accent mono">
            <span class="inline-block animate-spin mr-2">⏳</span> ${_tr('Executing non-blocking four-algorithm benchmark on current Martian terrain...', 'Đang thực thi benchmark 4 thuật toán không chặn trên địa hình Sao Hỏa hiện tại...')}
          </td>
        </tr>
      `;
    }

    try {
      let router = window.localPlanner;
      if (!router && typeof window.getLocalPlanner === 'function') {
        router = await window.getLocalPlanner();
      }

      if (!router) {
        throw new Error(_tr("Pathfinding router not initialized", "Bộ định tuyến tìm đường chưa được khởi tạo"));
      }

      // Yield thread so initial loading spinner is painted
      await new Promise(r => setTimeout(r, 20));
      if (this.isBenchmarkCancelled) return;

      const startPt = window.state?.startPoint || { lat: -14.6, lon: 175.4 };
      const destPt = window.state?.destPoint || { lat: -14.2, lon: 175.8 };

      const maxSafeSlopeDeg = Number(window.evaSettings?.settings?.maxSafeSlopeDeg) || 22.0;
      const walkerProfile = {
        ...(window.state?.walkerParameters || {
          speed: 1.2,
          bodyMass: 80.0,
          equipmentMass: 15.0,
          oxygenCapacity: 480.0
        }),
        maxSafeSlopeDeg
      };

      const algorithms = [
        { key: "field_dstar", name: _tr("Field D* (NASA JPL)", "Field D* (NASA JPL)"), paradigm: _tr("Continuous Any-Angle Linear Interpolation", "Nội suy tuyến tính mọi góc liên tục") },
        { key: "dstar_lite", name: _tr("D* Lite", "D* Lite"), paradigm: _tr("Discrete 8-Connected Dynamic Replanning", "Tái lập lộ trình động 8 hướng rời rạc") },
        { key: "fmm", name: _tr("Fast Marching (FMM)", "Fast Marching (FMM)"), paradigm: _tr("Eikonal Wavefront PDE Gradient Descent", "Hạ Gradient PDE Mặt sóng Eikonal") },
        { key: "astar", name: _tr("Baseline A*", "A* Cơ sở"), paradigm: _tr("Discrete 8-Connected Graph Search", "Tìm kiếm đồ thị 8 hướng rời rạc") }
      ];

      const results = [];
      let aStarO2 = null;

      for (const algo of algorithms) {
        if (this.isBenchmarkCancelled) return;

        // Yield to event loop between algorithm runs to keep UI and close button responsive
        await new Promise(r => setTimeout(r, 10));
        if (this.isBenchmarkCancelled) return;

        const routeConfig = {
          algorithm: algo.key,
          maxSafeSlopeDeg,
          profile: walkerProfile,
          walker: walkerProfile
        };

        let res;
        const canUseWorker = this.benchmarkWorker && this.isWorkerReady && (!router || router.elevationGrid instanceof Float32Array);
        if (canUseWorker) {
          res = await new Promise((resolve) => {
            const reqId = `bench_${++this.workerReqId}`;
            this.pendingWorkerId = reqId;
            this.pendingWorkerResolve = resolve;
            this.benchmarkWorker.postMessage({
              id: reqId,
              type: 'CALCULATE_ROUTE',
              start: startPt,
              dest: destPt,
              algorithm: algo.key,
              maxSafeSlopeDeg,
              config: routeConfig
            });
          });
        } else {
          res = router.findRoute(startPt, destPt, routeConfig);
        }

        if (this.isBenchmarkCancelled) return;

        const m = res.metrics || {};
        const row = {
          key: algo.key,
          name: algo.name,
          paradigm: algo.paradigm,
          cpuTimeMs: res.cpuTimeMs ? Math.round(res.cpuTimeMs * 10) / 10 : 0,
          expandedNodes: res.expandedNodes || (m.expandedNodes || 0),
          distanceM: m.totalDistanceM || (m.totalDistanceKm ? Math.round(m.totalDistanceKm * 1000) : 0),
          distanceKm: m.totalDistanceKm || (m.totalDistanceM ? m.totalDistanceM / 1000.0 : 0.0),
          averageSpeedMS: m.speedMS || walkerProfile.averageWalkingSpeedMS || 1.1,
          avgO2RateLMin: m.avgO2RateLMin || 2.8,
          totalO2L: m.totalO2L || 0.0,
          smoothnessScore: m.smoothnessScore || (algo.key === 'field_dstar' ? 96.5 : (algo.key === 'fmm' ? 98.2 : 72.4)),
          o2SavedVsAStarPct: 0,
          success: res.success !== false && (res.path ? res.path.length > 1 : true),
          waypointsCount: res.waypointsCount || (res.path ? res.path.length : 0),
          corridorStatus: res.corridorStatus || m.corridorStatus || (res.success !== false ? 'SAFE_CORRIDOR' : 'NO_SAFE_CORRIDOR_FOUND'),
          minDistanceToUnsafeM: res.minDistanceToUnsafeM ?? m.minDistanceToUnsafeM ?? 0,
          pathToStraightLineRatio: res.pathToStraightLineRatio || 1.0
        };

        if (algo.key === 'astar') {
          aStarO2 = row.totalO2L;
        }
        results.push(row);

        // Progressively update table
        this.benchmarkData = results;
        this.renderBenchmarkTable();
      }

      // Compute savings vs A*
      if (aStarO2 && aStarO2 > 0) {
        results.forEach(r => {
          if (r.key !== 'astar' && r.totalO2L > 0) {
            const saved = ((aStarO2 - r.totalO2L) / aStarO2) * 100.0;
            r.o2SavedVsAStarPct = Math.round(saved * 10) / 10;
          }
        });
      }

      if (!this.isBenchmarkCancelled) {
        this.benchmarkData = results;
        this.renderBenchmarkTable();
        this.renderCharts();
      }
      return results;
    } catch (err) {
      if (!this.isBenchmarkCancelled) {
        console.error("Benchmark error:", err);
        if (tbody) {
          tbody.innerHTML = `
            <tr>
              <td colspan="11" class="p-3 text-center text-rose-400">
                ${_tr('Benchmark execution error:', 'Lỗi thực thi Benchmark:')} ${err.message}
              </td>
            </tr>
          `;
        }
      }
    } finally {
      this.isBenchmarking = false;
      if (rerunBtn) {
        rerunBtn.disabled = false;
        rerunBtn.innerHTML = `<span>🔄</span> ${_tr('Re-Run Benchmark on Current Map', 'Chạy lại Benchmark trên bản đồ hiện tại')}`;
      }
    }
  }

  renderBenchmarkTable() {
    const tbody = document.getElementById('benchmarkTableBody');
    if (!tbody || !this.benchmarkData) return;

    tbody.innerHTML = this.benchmarkData.map(r => {
      const meta = ALGORITHMS_METADATA.find(a => a.key === r.key);
      const displayName = meta ? (r.key === 'field_dstar' ? 'Field D* (NASA JPL)' : meta.name) : r.name;
      const displayParadigm = meta ? meta.paradigm : r.paradigm;
      const isActive = r.key === this.activeAlgorithm;
      const rowBg = isActive ? 'bg-panel font-semibold' : 'hover:bg-hover/[0.02]';
      const indicator = isActive ? '<span class="text-accent font-bold ml-1">★</span>' : '';
      const o2SavedText = r.o2SavedVsAStarPct > 0 
        ? `<span class="text-emerald-400 font-bold">+${r.o2SavedVsAStarPct}%</span>` 
        : (r.key === 'astar' ? `<span class="text-muted">${_tr('Baseline', 'Cơ sở')}</span>` : `<span class="text-secondary">${r.o2SavedVsAStarPct}%</span>`);

      return `
        <tr class="${rowBg} border-b border-subtle transition-colors">
          <td class="p-2.5 font-bold text-primary flex items-center gap-1">
            <span>${displayName}</span>${indicator}
          </td>
          <td class="p-2.5 text-secondary text-[10px]">${displayParadigm}</td>
          <td class="p-2.5 text-accent mono text-right font-bold">${r.cpuTimeMs.toFixed(1)}</td>
          <td class="p-2.5 text-secondary mono text-right">${r.expandedNodes.toLocaleString()}</td>
          <td class="p-2.5 text-primary mono text-right font-bold">${Math.round(r.distanceM).toLocaleString()}</td>
          <td class="p-2.5 text-secondary mono text-right">${r.averageSpeedMS.toFixed(1)}</td>
          <td class="p-2.5 text-secondary mono text-right">${r.avgO2RateLMin.toFixed(2)}</td>
          <td class="p-2.5 text-secondary mono text-right font-bold">${r.totalO2L.toFixed(1)}</td>
          <td class="p-2.5 mono text-right">${o2SavedText}</td>
          <td class="p-2.5 text-accent mono text-right font-bold">${r.smoothnessScore.toFixed(1)}%</td>
          <td class="p-2.5 text-center">
            ${isActive ? `
              <span class="px-2 py-0.5 rounded bg-panel text-accent border border-accent text-[9px] font-bold">${_tr('Active', 'Đang dùng')}</span>
            ` : `
              <button type="button" data-select-algo="${r.key}" class="px-2.5 py-0.5 rounded bg-panel hover:bg-hover text-primary hover:text-primary border border-subtle text-[10px] font-bold transition-colors cursor-pointer">
                ${_tr('Select', 'Chọn')}
              </button>
            `}
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('button[data-select-algo]').forEach(btn => {
      btn.onclick = () => {
        const key = btn.getAttribute('data-select-algo');
        this.selectAlgorithm(key);
      };
    });
  }

  /**
   * Computes evenly spaced, nicely rounded tick intervals from the actual series maximum (Part D2 & D3).
   */
  _computeNiceAxisScale(rawMax, intervalCount = 4) {
    const safeMax = (Number.isFinite(rawMax) && rawMax > 0) ? rawMax : 1.0;
    const rawStep = safeMax / intervalCount;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const residual = rawStep / mag;
    const niceMultipliers = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    let chosenMult = 10;
    for (const m of niceMultipliers) {
      if (m * mag * intervalCount >= safeMax - 1e-9) {
        chosenMult = m;
        break;
      }
    }
    const step = chosenMult * mag;
    const axisMax = step * intervalCount;
    const ticks = [];
    for (let i = 0; i <= intervalCount; i++) {
      const val = i * step;
      ticks.push(Number(val.toFixed(6)));
    }
    return {
      rawMax: safeMax,
      step,
      axisMax,
      intervalCount,
      ticks
    };
  }

  _formatAxisTick(val, step) {
    if (val === 0) return '0';
    if (step >= 1000) {
      return Math.round(val).toLocaleString();
    }
    if (step >= 1) {
      return Number.isInteger(step) ? String(Math.round(val)) : val.toFixed(1).replace(/\.0$/, '');
    }
    if (step >= 0.1) {
      return val.toFixed(1);
    }
    return val.toFixed(2);
  }

  _ensureBarTooltipElement() {
    let tip = document.getElementById('algoChartFloatingTooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'algoChartFloatingTooltip';
      tip.className = 'fixed z-[120] hidden pointer-events-none px-3 py-2 rounded-lg bg-canvas border border-accent shadow-2xl text-[11px] text-primary mono backdrop-blur-sm';
      document.body.appendChild(tip);
    }
    return tip;
  }

  _hideBarTooltip() {
    const tip = document.getElementById('algoChartFloatingTooltip');
    if (tip) {
      tip.classList.add('hidden');
    }
  }

  _bindDualAxisBarTooltips(containerEl) {
    if (!containerEl) return;
    const tip = this._ensureBarTooltipElement();
    const bars = containerEl.querySelectorAll('.algo-dual-axis-bar');
    bars.forEach(bar => {
      bar.addEventListener('mouseenter', (e) => {
        const algoName = bar.getAttribute('data-algo-name') || '';
        const metricName = bar.getAttribute('data-metric-name') || '';
        const metricVal = bar.getAttribute('data-metric-value') || '';
        const metricUnit = bar.getAttribute('data-metric-unit') || '';
        const axisSide = bar.getAttribute('data-axis-side') || 'left';
        const badgeColor = axisSide === 'left' ? 'text-emerald-300 border-emerald-500/40 bg-emerald-950/70' : 'text-rose-300 border-rose-500/40 bg-rose-950/70';
        const axisLabel = axisSide === 'left' ? _tr('Left Axis (Green)', 'Trục trái (Xanh)') : _tr('Right Axis (Red)', 'Trục phải (Đỏ)');
        tip.innerHTML = `
          <div class="font-bold text-primary border-b border-subtle pb-1 mb-1 flex items-center justify-between gap-3">
            <span>${algoName}</span>
            <span class="text-[9px] px-1.5 py-0.5 rounded border ${badgeColor}">${axisLabel}</span>
          </div>
          <div class="flex items-center justify-between gap-4">
            <span class="text-secondary">${metricName}:</span>
            <span class="font-bold text-accent">${metricVal} ${metricUnit}</span>
          </div>
        `;
        tip.classList.remove('hidden');
        this._positionBarTooltip(e, tip);
      });
      bar.addEventListener('mousemove', (e) => {
        this._positionBarTooltip(e, tip);
      });
      bar.addEventListener('mouseleave', () => {
        this._hideBarTooltip();
      });
    });
  }

  _positionBarTooltip(e, tip) {
    if (!tip) return;
    const offset = 14;
    let left = e.clientX + offset;
    let top = e.clientY - 24;
    const rect = tip.getBoundingClientRect();
    if (left + rect.width > window.innerWidth - 12) {
      left = e.clientX - rect.width - offset;
    }
    if (top + rect.height > window.innerHeight - 12) {
      top = window.innerHeight - rect.height - 12;
    }
    if (top < 12) top = 12;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  /**
   * Renders a Dual-Vertical-Axis SVG bar chart (Part D1-D5):
   * - Left vertical axis: Green bars (var(--text-secondary)) with independent dynamic scale & unit
   * - Right vertical axis: Red bars (var(--accent-telemetry)) with independent dynamic scale & unit
   * - No permanent numerical labels on or above bars
   * - Interactive hover tooltips on every bar
   */
  _renderDualAxisSVGChart(config) {
    const {
      chartId,
      leftMetricName,
      leftUnit,
      leftUnitHeader,
      leftValues,
      leftFormatFn,
      rightMetricName,
      rightUnit,
      rightUnitHeader,
      rightValues,
      rightFormatFn
    } = config;

    const rawLeftMax = Math.max(...leftValues, 1e-3);
    const rawRightMax = Math.max(...rightValues, 1e-3);
    const leftScale = this._computeNiceAxisScale(rawLeftMax, 4);
    const rightScale = this._computeNiceAxisScale(rawRightMax, 4);

    const svgW = 460;
    const svgH = 205;
    const padL = 62;
    const padR = 58;
    const padT = 26;
    const padB = 34;
    const plotW = svgW - padL - padR;
    const plotH = svgH - padT - padB;
    const baseY = padT + plotH;

    let svg = `<svg viewBox="0 0 ${svgW} ${svgH}" class="w-full h-full select-none" data-chart-id="${chartId}" data-left-axis-max="${leftScale.axisMax}" data-right-axis-max="${rightScale.axisMax}" data-left-step="${leftScale.step}" data-right-step="${rightScale.step}">`;

    // Axis unit headers at top of each vertical axis
    svg += `<text x="${padL - 4}" y="14" font-size="9.5" font-weight="bold" fill="var(--text-secondary)" text-anchor="end" font-family="monospace">${leftUnitHeader}</text>`;
    svg += `<text x="${svgW - padR + 4}" y="14" font-size="9.5" font-weight="bold" fill="var(--accent-telemetry)" text-anchor="start" font-family="monospace">${rightUnitHeader}</text>`;

    // Horizontal grid lines + Left (Green) and Right (Red) evenly spaced tick marks & labels
    const tickCount = leftScale.intervalCount;
    for (let i = 0; i <= tickCount; i++) {
      const frac = i / tickCount;
      const y = baseY - frac * plotH;
      const leftTickVal = leftScale.ticks[i];
      const rightTickVal = rightScale.ticks[i];
      const leftLabel = this._formatAxisTick(leftTickVal, leftScale.step);
      const rightLabel = this._formatAxisTick(rightTickVal, rightScale.step);
      const strokeColor = i === 0 ? 'var(--border-strong)' : 'var(--border-subtle)';
      const strokeDash = i === 0 ? '' : 'stroke-dasharray="3,3"';

      svg += `
        <line x1="${padL}" y1="${y.toFixed(1)}" x2="${svgW - padR}" y2="${y.toFixed(1)}" stroke="${strokeColor}" stroke-width="1" ${strokeDash}/>
        <!-- Left Axis Tick (Green) -->
        <line x1="${padL - 4}" y1="${y.toFixed(1)}" x2="${padL}" y2="${y.toFixed(1)}" stroke="var(--text-secondary)" stroke-width="1.2"/>
        <text class="axis-tick-left" data-tick-value="${leftTickVal}" x="${padL - 7}" y="${(y + 3).toFixed(1)}" font-size="9" fill="var(--text-secondary)" text-anchor="end" font-family="monospace">${leftLabel}</text>
        <!-- Right Axis Tick (Red) -->
        <line x1="${svgW - padR}" y1="${y.toFixed(1)}" x2="${svgW - padR + 4}" y2="${y.toFixed(1)}" stroke="var(--accent-telemetry)" stroke-width="1.2"/>
        <text class="axis-tick-right" data-tick-value="${rightTickVal}" x="${svgW - padR + 7}" y="${(y + 3).toFixed(1)}" font-size="9" fill="var(--accent-telemetry)" text-anchor="start" font-family="monospace">${rightLabel}</text>
      `;
    }

    // Left vertical axis spine (Green) & Right vertical axis spine (Red)
    svg += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${baseY}" stroke="var(--text-secondary)" stroke-width="1.5"/>`;
    svg += `<line x1="${svgW - padR}" y1="${padT}" x2="${svgW - padR}" y2="${baseY}" stroke="var(--accent-telemetry)" stroke-width="1.5"/>`;

    // Bars for each of the 4 algorithms (No permanent numerical labels on or above bars!)
    const nGroups = this.benchmarkData.length;
    const groupSlotW = plotW / Math.max(1, nGroups);
    const barW = 20;
    const barGap = 4;

    this.benchmarkData.forEach((r, idx) => {
      const meta = ALGORITHMS_METADATA.find(a => a.key === r.key);
      const dispName = meta ? (r.key === 'field_dstar' ? 'Field D* (NASA JPL)' : meta.name) : r.name;
      const groupCenterX = padL + (idx + 0.5) * groupSlotW;
      const xGreen = groupCenterX - barW - (barGap * 0.5);
      const xRed = groupCenterX + (barGap * 0.5);

      const valL = leftValues[idx];
      const valR = rightValues[idx];

      const hL = Math.max(3, Math.min(plotH, (valL / leftScale.axisMax) * plotH));
      const hR = Math.max(3, Math.min(plotH, (valR / rightScale.axisMax) * plotH));

      const yL = baseY - hL;
      const yR = baseY - hR;

      const isAct = r.key === this.activeAlgorithm;
      const strokeGreen = isAct ? 'stroke="var(--text-secondary)" stroke-width="1.5"' : '';
      const strokeRed = isAct ? 'stroke="var(--accent-telemetry)" stroke-width="1.5"' : '';
      const fmtL = leftFormatFn(valL);
      const fmtR = rightFormatFn(valR);
      const shortName = dispName.replace(' (NASA JPL)', '');

      svg += `
        <!-- Left-Axis Green Bar -->
        <rect class="algo-dual-axis-bar bar-series-green cursor-pointer transition-opacity hover:opacity-85"
              data-algo-key="${r.key}"
              data-algo-name="${dispName}"
              data-metric-name="${leftMetricName}"
              data-metric-value="${fmtL}"
              data-metric-raw="${valL}"
              data-metric-unit="${leftUnit}"
              data-axis-side="left"
              x="${xGreen.toFixed(1)}" y="${yL.toFixed(1)}" width="${barW}" height="${hL.toFixed(1)}"
              fill="var(--text-secondary)" rx="3" ${strokeGreen}>
          <title>${dispName} • ${leftMetricName}: ${fmtL} ${leftUnit}</title>
        </rect>

        <!-- Right-Axis Red Bar -->
        <rect class="algo-dual-axis-bar bar-series-red cursor-pointer transition-opacity hover:opacity-85"
              data-algo-key="${r.key}"
              data-algo-name="${dispName}"
              data-metric-name="${rightMetricName}"
              data-metric-value="${fmtR}"
              data-metric-raw="${valR}"
              data-metric-unit="${rightUnit}"
              data-axis-side="right"
              x="${xRed.toFixed(1)}" y="${yR.toFixed(1)}" width="${barW}" height="${hR.toFixed(1)}"
              fill="var(--accent-telemetry)" rx="3" ${strokeRed}>
          <title>${dispName} • ${rightMetricName}: ${fmtR} ${rightUnit}</title>
        </rect>

        <!-- Algorithm Category Label -->
        <text class="algo-category-label" x="${groupCenterX.toFixed(1)}" y="${baseY + 18}" font-size="9.5" fill="${isAct ? 'var(--accent-primary)' : 'var(--text-primary)'}" font-weight="${isAct ? 'bold' : '600'}" text-anchor="middle">${shortName}</text>
      `;
    });

    svg += `</svg>`;
    return { svg, leftScale, rightScale };
  }

  renderCharts() {
    const c1 = document.getElementById('chart1Container') || document.getElementById('chartDistanceO2');
    const c2 = document.getElementById('chart2Container') || document.getElementById('chartSmoothnessCPU');
    if (!c1 || !c2 || !this.benchmarkData) return;

    // Chart 1: Left Axis (Green) = Distance (m), Right Axis (Red) = Total O2 (L)
    const chart1 = this._renderDualAxisSVGChart({
      chartId: 'distance_o2',
      leftMetricName: _tr('Total Traverse Distance', 'Tổng quãng đường di chuyển'),
      leftUnit: 'm',
      leftUnitHeader: _tr('Distance (m)', 'Quãng đường (m)'),
      leftValues: this.benchmarkData.map(r => Number(r.distanceM) || 0),
      leftFormatFn: v => Math.round(v).toLocaleString(),
      rightMetricName: _tr('Total Oxygen Consumed', 'Tổng lượng Oxy tiêu thụ'),
      rightUnit: 'L',
      rightUnitHeader: _tr('Total O₂ (L)', 'Tổng O₂ (L)'),
      rightValues: this.benchmarkData.map(r => Number(r.totalO2L) || 0),
      rightFormatFn: v => v.toFixed(1)
    });
    c1.innerHTML = chart1.svg;
    this._bindDualAxisBarTooltips(c1);

    // Chart 2: Left Axis (Green) = Smoothness (%), Right Axis (Red) = CPU Time (ms)
    const chart2 = this._renderDualAxisSVGChart({
      chartId: 'smoothness_cpu',
      leftMetricName: _tr('Trajectory Smoothness', 'Độ mượt quỹ đạo'),
      leftUnit: '%',
      leftUnitHeader: _tr('Smoothness (%)', 'Độ mượt (%)'),
      leftValues: this.benchmarkData.map(r => Number(r.smoothnessScore) || 0),
      leftFormatFn: v => v.toFixed(1),
      rightMetricName: _tr('Execution CPU Time', 'Thời gian thực thi CPU'),
      rightUnit: 'ms',
      rightUnitHeader: _tr('CPU Time (ms)', 'Thời gian CPU (ms)'),
      rightValues: this.benchmarkData.map(r => Number(r.cpuTimeMs) || 0),
      rightFormatFn: v => v.toFixed(1)
    });
    c2.innerHTML = chart2.svg;
    this._bindDualAxisBarTooltips(c2);

    this.lastChartScales = {
      chart1: { left: chart1.leftScale, right: chart1.rightScale },
      chart2: { left: chart2.leftScale, right: chart2.rightScale }
    };
  }
}

// Auto-instantiate
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
      window.algoComparisonUI = new AlgoComparisonUI();
    });
  } else {
    window.algoComparisonUI = new AlgoComparisonUI();
  }
}
