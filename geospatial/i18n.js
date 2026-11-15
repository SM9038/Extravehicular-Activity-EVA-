/**
 * ============================================================================
 * EVA MARS EXPLORER — CENTRALIZED BILINGUAL LOCALIZATION ENGINE (ENG / VIE)
 * ============================================================================
 * Provides unified English ('en') and Vietnamese ('vi') localization across
 * both the 3D Globe page (mars_3d_map.html) and 2D Explorer page (mars_2d_map.html).
 *
 * Features:
 * - Persists user selection in localStorage ('eva_mars_lang') with cross-tab sync
 * - Defaults to English ('en') when no saved preference exists
 * - Live DOM translation via data-i18n, data-i18n-placeholder, data-i18n-title,
 *   data-i18n-aria-label, and data-i18n-html attributes
 * - Reactive listener callbacks for immediate re-rendering of dynamic panels,
 *   canvas HUDs, telemetry cards, charts, and modals without page reload
 */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'eva_mars_lang';
  const SUPPORTED_LANGS = ['en', 'vi'];
  const DEFAULT_LANG = 'en';

  const DICTIONARY = {
    en: {
      // Branding & Navigation
      'brand.eva': 'EVA',
      'brand.mars': 'MARS',
      'brand.explorer': 'EXPLORER',
      'brand.mars_explorer': 'MARS EXPLORER',
      'lang.eng': 'ENG',
      'lang.vie': 'VIE',
      'lang.switch_to_en': 'Switch language to English (ENG)',
      'lang.switch_to_vi': 'Chuyển ngôn ngữ sang Tiếng Việt (VIE)',

      // Common Status Labels
      'status.safe': 'SAFE',
      'status.caution': 'CAUTION',
      'status.unsafe': 'UNSAFE',
      'status.dangerous': 'UNSAFE',
      'status.uncertain': 'UNCERTAIN',
      'status.unknown': 'UNKNOWN',
      'status.nominal': 'NOMINAL',
      'status.active': 'ACTIVE',
      'status.idle': 'IDLE',

      // 3D Globe Header
      'g3d.page_title': 'EVA Mars Explorer — 3D Planetary Globe & Astronaut Survival System',
      'g3d.search_placeholder': 'Lat, Lon (e.g. 18.65, 226.2)',
      'g3d.fly_to': 'Fly To',
      'g3d.fly_to_title': 'Fly to entered coordinates',
      'g3d.landmarks_placeholder': '-- Landmarks (Fly To) --',
      'g3d.optgroup.volcano': 'Volcanoes (Mons / Tholus)',
      'g3d.optgroup.canyon': 'Canyons & Valleys (Valles)',
      'g3d.optgroup.crater': 'Impact Basins & Craters',
      'g3d.optgroup.landing': 'NASA Landing Sites',
      'g3d.optgroup.plain': 'Plains & Highland Plateaus',
      'g3d.nav_2d_map': '🗺️ 2D Map (72 Tiles LOD)',
      'g3d.nav_2d_map_title': 'Open High-Resolution 2D Equirectangular Map (72 Tiles)',
      'g3d.reset_btn': 'Reset',
      'g3d.reset_btn_title': 'Reset camera view',
      'g3d.full_btn': 'Full',
      'g3d.exit_full_btn': 'Exit',
      'g3d.full_btn_title': 'Toggle Fullscreen',

      // 3D Globe Left Panel
      'g3d.collapse_left_title': 'Collapse / Expand left panel',
      'g3d.sec1_title': '1. Planetary Data Layers',
      'g3d.layer.elevation.name': 'MOLA Topographic Elevation',
      'g3d.layer.elevation.sub': 'MGS MOLA MEGDR • Meters (m)',
      'g3d.layer.gravity_120g.name': 'Gravity Anomaly (MRO 120g)',
      'g3d.layer.gravity_120g.sub': 'JGMRO_120G_SHA • Free-Air (mGal)',
      'g3d.layer.slope.name': 'Terrain Slope',
      'g3d.layer.slope.sub': 'Derived from MOLA • Degrees (°)',
      'g3d.layer.surface_g.name': 'Total Surface Gravity',
      'g3d.layer.surface_g.sub': 'g₀ + Δg + ω²r • m/s²',
      'g3d.layer.geoid_n.name': 'Areoid Undulation (Geoid N)',
      'g3d.layer.geoid_n.sub': 'Equipotential Surface • Meters (m)',
      'g3d.layer.gravity_delta.name': 'Gravity Model Diff (120g - 120f)',
      'g3d.layer.gravity_delta.sub': 'Model Convergence • mGal',
      'g3d.sec2_title': '2. 3D Relief & Lighting',
      'g3d.relief_exag': '3D Relief Exaggeration',
      'g3d.sun_azimuth': 'Sun Direction (Azimuth)',
      'g3d.ambient_light': 'Ambient Illumination',
      'g3d.sec3_title': '3. Space Display Options',
      'g3d.toggle_grid': 'Lat/Lon Grid (30°)',
      'g3d.toggle_landmarks': '22 NASA Landmarks',
      'g3d.toggle_atmosphere': 'Rayleigh Atmosphere',
      'g3d.toggle_autorotate': 'Auto-Rotate Globe',
      'g3d.toggle_crosshair': 'Selected Target Marker',
      'g3d.sec4_title': '4. NASA Dataset Provenance',
      'g3d.meta_source': 'Source:',
      'g3d.meta_res': 'Resolution:',
      'g3d.meta_range': 'Value Range:',

      // 3D Globe HUD & Bottom Bar
      'g3d.hud_mean_radius': 'Mean Radius: 3,396.19 km',
      'g3d.cursor_label': 'Cursor:',
      'g3d.controls_hint': 'Left-click: Inspect • Drag: Rotate • Scroll: Zoom',
      'g3d.scale_label': 'Scale',
      'g3d.geodesic_dist': 'Geodesic Distance:',
      'g3d.measure_btn': '📏 Measure 2 Points',
      'g3d.measure_step1': 'Click Point A...',
      'g3d.measure_step2': 'Click Point B...',

      // 3D Globe Right Panel (Astronaut Survival Monitor)
      'g3d.collapse_right_title': 'Collapse / Expand right panel',
      'g3d.surv_title': 'Astronaut Survival Monitor',
      'g3d.surv_sub': 'NASA xEMU Suit • 5 Safety Criteria',
      'g3d.selected_target': 'Selected Target Location',
      'g3d.searching_landmark': 'Searching nearest landmark...',
      'g3d.suit_index_label': 'Suit Survival Index',
      'g3d.suit_index_model': 'Suit Survival Index (Model-Based):',
      'g3d.max_eva_window': 'Max Safe EVA Window:',
      'g3d.criteria_heading': '5 Core Life-Support Criteria',
      'g3d.crit1.name': '1. Ambient Temperature',
      'g3d.crit1.sub': 'Safe: -93°C to +17°C (180–290 K)',
      'g3d.crit2.name': '2. Atmospheric Pressure (Modeled)',
      'g3d.crit2.sub': 'Barometric P(h) • Safe: 400–611.65 Pa',
      'g3d.crit3.name': '3. Terrain Slope & Mobility',
      'g3d.crit3.sub': 'Safe: < 8° • Max Limit: 20°',
      'g3d.crit4.name': '4. Airborne Dust (τ)',
      'g3d.crit4.sub': 'Optical Depth • Safe: τ < 0.05',
      'g3d.crit5.name': '5. Solar & GCR Radiation',
      'g3d.crit5.sub': 'Safe: ≤ 0.72 mSv/day',
      'g3d.warnings_heading': '⚠️ Operational Warnings & Recommendations',
      'g3d.details_summary': '🔬 Detailed Topographic & Geophysical Parameters',
      'g3d.det.elevation': 'MOLA Elevation',
      'g3d.det.radius': 'Planetary Radius',
      'g3d.det.grav120g': 'Gravity Anomaly (120g)',
      'g3d.det.surfg': 'Surface Gravity',
      'g3d.det.geoidn': 'Areoid Undulation (N)',
      'g3d.det.gravdiff': 'Model Diff (120g-120f)',
      'g3d.det.lat_centric': 'Planetocentric Lat',
      'g3d.det.lat_graphic': 'Planetographic Lat',
      'g3d.det.lon_ew': 'East / West Lon',
      'g3d.det.cartesian': '3D Cartesian (X, Y, Z)',

      // Fullscreen Lock Overlay
      'fs.locked_title': 'Fullscreen Mode Locked',
      'fs.locked_desc': 'You pressed ESC. Do you want to exit fullscreen mode or continue exploring Mars?',
      'fs.stay_btn': 'Stay in Fullscreen',
      'fs.exit_btn': 'Exit Fullscreen',

      // 2D Explorer Header & Navigation
      'm2d.page_title': 'EVA Mars Explorer — 2D Planetary GIS & Marswalk Planner',
      'm2d.nav.algorithms': 'Algorithms',
      'm2d.nav.algorithms_title': 'Open Pathfinding Algorithms & Live Route Benchmark',
      'm2d.nav.analytics': 'Analytics',
      'm2d.nav.analytics_title': 'Open Coupled EVA Biophysical & Telemetry Analytics Dashboard',
      'm2d.mode_label': 'MODE',
      'm2d.mode_main': '🗺️ Main Map',
      'm2d.mode_main_title': 'Main Visual Map (72 High-Resolution Tiles)',
      'm2d.mode_sub': '🔬 Sub Maps (Data Layers)',
      'm2d.mode_sub_title': 'Sub Maps — Scientific & Topographic Data Layers',
      'm2d.search_placeholder': 'Fly to: Lat, Lon (e.g. 18.65, 226.2)',
      'm2d.fly_to': 'Fly To',
      'm2d.fly_to_title': 'Fly to coordinates',
      'm2d.landmarks_placeholder': '📍 Landmarks...',
      'm2d.landmarks_title': 'Fly to NASA Landmark',
      'm2d.optgroup.volcano': 'Volcanoes (Mons)',
      'm2d.optgroup.canyon': 'Canyons & Valleys',
      'm2d.optgroup.landing': 'NASA Landing Sites',
      'm2d.optgroup.basin': 'Impact Basins & Plains',

      // 2D Sub-Map Layer Ribbon
      'm2d.sublayer_label': 'Sub-Map Layer:',
      'm2d.layer.elevation': '🏔️ MOLA Elevation (72 Tiles)',
      'm2d.layer.slope': '📐 Terrain Slope (°)',
      'm2d.layer.gravity_120g': '🧲 Gravity Anomaly (mGal)',
      'm2d.layer.surface_g': '⚖️ Surface Gravity (m/s²)',
      'm2d.layer.geoid_n': '🌐 Areoid Geoid N (m)',
      'm2d.layer.gravity_delta': '📊 Model Diff (120g-120f)',

      // 2D Left Dock — Marswalk Planner & Dust Storm
      'm2d.dock.title': 'Marswalk Planner',
      'm2d.dock.sub': 'Route & Weather Sim',
      'm2d.dock.toggle_title': 'Toggle Marswalk Route & Storm Simulation Panel',
      'm2d.tab.planner': '🧭 Marswalk Planner',
      'm2d.tab.storm': '🌪️ Dust Storm',
      'm2d.planner.start_label': 'START POINT (S)',
      'm2d.planner.dest_label': 'DESTINATION (D)',
      'm2d.planner.pick_map': '🎯 Pick on Map',
      'm2d.planner.pick_map_active': '🎯 Click Map...',
      'm2d.planner.pick_start_title': 'Click on the 2D map to set Start Point',
      'm2d.planner.pick_dest_title': 'Click on the 2D map to set Destination Point',
      'm2d.planner.landmark_select': '-- Select Martian Landmark or Custom --',
      'm2d.planner.lat_placeholder': 'Lat (-90..90)',
      'm2d.planner.lon_placeholder': 'Lon (0..360)',
      'm2d.planner.suit_config_title': 'Astronaut & Spacesuit Configuration',
      'm2d.planner.suit_badge': '50 kg xEMU Suit',
      'm2d.planner.walk_speed': 'Walking Speed (m/s)',
      'm2d.planner.body_mass': 'Body Mass (kg)',
      'm2d.planner.equip_mass': 'Equipment Mass (kg)',
      'm2d.planner.o2_cap': 'Oxygen Capacity (L)',
      'm2d.planner.total_mass_label': 'Total Mass (Body + Equip + 50kg Suit):',
      'm2d.planner.calc_route': '🧭 Calculate Route',
      'm2d.planner.calculating_route': '⏳ Calculating Route...',
      'm2d.planner.swap_title': 'Swap Start & Destination',
      'm2d.planner.vis_title': 'Show/Hide Route Line',
      'm2d.planner.corridor_title': 'Toggle Corridor Safety Envelope & Rejected Candidate Routes',
      'm2d.planner.clear_title': 'Clear Route & Markers',

      // Route Validation & Telemetry Summary
      'm2d.val.report_title': 'Route Validation Report',
      'm2d.val.verified_badge': 'VERIFIED',
      'm2d.val.feasible_msg': 'All segments satisfy slope, storm, and oxygen limits.',
      'm2d.telem.summary_title': 'Route Telemetry Summary',
      'm2d.telem.distance': 'Distance',
      'm2d.telem.est_time': 'Est. Time',
      'm2d.telem.o2_consumed': 'O₂ Consumed',
      'm2d.telem.energy': 'Energy (Minetti)',
      'm2d.telem.ascent_descent': 'Ascent / Descent',
      'm2d.telem.max_slope': 'Max Slope (Up/Dn)',
      'm2d.walk.title': '🚶 Simulated Astronaut Walk',
      'm2d.walk.idle': 'IDLE',
      'm2d.walk.walking': 'WALKING',
      'm2d.walk.paused': 'PAUSED',
      'm2d.walk.completed': 'ARRIVED',
      'm2d.walk.start_btn': '▶ Start Walk',
      'm2d.walk.resume_btn': '▶ Resume',
      'm2d.walk.pause_btn': '⏸ Pause',
      'm2d.walk.reset_btn': '↺ Reset',
      'm2d.walk.reroute_btn': '⚡ Re-Route Around Storm',
      'm2d.det_params_summary': '🔬 Detailed Topographic & Life Support Parameters',
      'm2d.algo_diag_summary': '🧭 Algorithm & Corridor Safety Diagnostics',
      'm2d.wp_table_summary': '📋 Route Waypoint Schedule (Top 10 Nodes)',
      'm2d.export_json': '⬇ Export Route JSON',
      'm2d.export_csv': '⬇ Export CSV',

      // Dust Storm Simulator Tab
      'm2d.storm.title': 'Martian Dust Storm Simulator',
      'm2d.storm.desc': 'Simulates moving atmospheric dust hazards. Enforces a 48-hour safety buffer for Marswalk route planning.',
      'm2d.storm.clock_label': 'Simulation Clock',
      'm2d.storm.play': '▶ Play',
      'm2d.storm.pause': '⏸ Pause',
      'm2d.storm.step': '+1h',
      'm2d.storm.reset': 'Reset',
      'm2d.storm.create_title': 'Create / Spawn Dust Storm',
      'm2d.storm.pick_center': '🎯 Pick Storm Center on Map',
      'm2d.storm.pick_center_active': '🎯 Click Map to Place Storm...',
      'm2d.storm.center_lat': 'Center Lat (°)',
      'm2d.storm.center_lon': 'Center Lon (°E)',
      'm2d.storm.radius': 'Radius (km)',
      'm2d.storm.speed': 'Trans. Speed (km/h)',
      'm2d.storm.heading': 'Heading (0°=N, 90°=E)',
      'm2d.storm.intensity': 'Intensity Class',
      'm2d.storm.int_moderate': 'Moderate (τ+0.9, CAUTION)',
      'm2d.storm.int_severe': 'Severe (τ+1.8, UNSAFE Core)',
      'm2d.storm.int_extreme': 'Global/Extreme (τ+3.0, UNSAFE)',
      'm2d.storm.spawn_btn': '🌪️ Spawn Storm',
      'm2d.storm.preset_btn': '⚡ Preset',
      'm2d.storm.clear_all_btn': '🗑️ Clear All',
      'm2d.storm.active_list_title': 'Active Storm Cells',
      'm2d.storm.no_storms': 'No active dust storms. Click "Spawn Storm" or "Preset" to inject weather hazards.',

      // 2D Right Panel — Astronaut Monitoring
      'm2d.mon.title': 'Astronaut Monitoring',
      'm2d.mon.sub': 'NASA xEMU Suit • 5 Safety Criteria',
      'm2d.mon.click_to_inspect': 'Click map to inspect',
      'm2d.mon.target_loc': 'Target Location',
      'm2d.mon.btn_3d_terrain': '🏔️ 3D Terrain View',
      'm2d.mon.click_terrain': 'Click map to inspect terrain',
      'm2d.mon.active_layer_val': 'Active Layer Value:',
      'm2d.mon.suit_index': 'Suit Survival Index',
      'm2d.mon.suit_index_model': 'Suit Survival Index (Model-Based):',
      'm2d.mon.max_eva_window': 'Max Safe EVA Window:',
      'm2d.mon.criteria_heading': '5 Core Life-Support Criteria',
      'm2d.mon.warnings_heading': '⚠️ Operational Warnings & Recommendations',
      'm2d.mon.details_summary': '🔬 Detailed Topographic & Geophysical Parameters',
      'm2d.mon.tile_meta_summary': '🗺️ Cartographic & Tile Metadata',

      // 2D Bottom Toolbar
      'm2d.bot.settings': 'Settings',
      'm2d.bot.settings_title': 'Open Application Settings & Preferences',
      'm2d.bot.lat': 'LAT',
      'm2d.bot.lon': 'LON',
      'm2d.bot.val': 'VAL',
      'm2d.bot.zoom_in_title': 'Zoom In (+)',
      'm2d.bot.zoom_out_title': 'Zoom Out (-)',
      'm2d.bot.reset': 'Reset',
      'm2d.bot.reset_title': 'Reset View (0)',
      'm2d.bot.grid': 'Grid',
      'm2d.bot.grid_title': 'Toggle Lat/Lon Grid',
      'm2d.bot.tiles': 'Tiles',
      'm2d.bot.tiles_title': 'Toggle 72-Tile Boundaries',
      'm2d.bot.globe_3d': '🌐 3D Globe',
      'm2d.bot.globe_3d_title': 'Switch to 3D Interactive Mars Globe',
      'm2d.bot.full': 'Full',
      'm2d.bot.full_title': 'Toggle Fullscreen',
      'm2d.bot.pegman_label': '3D Terrain',
      'm2d.bot.pegman_title': 'Drag and drop onto map to inspect 3D regional terrain',

      // 3D Terrain Modal (in 2D page)
      'm2d.t3d.title': '3D Regional Terrain Simulation (MOLA DEM)',
      'm2d.t3d.sub': 'Real-time WebGL heightfield displaced by NASA MGS MOLA altimetry',
      'm2d.t3d.exag': 'Vertical Exaggeration:',
      'm2d.t3d.extent': 'Regional Coverage:',
      'm2d.t3d.shading': 'Surface Shading:',
      'm2d.t3d.shade_viking': 'Satellite Mosaic',
      'm2d.t3d.shade_elev': 'Hypsometric Tint',
      'm2d.t3d.shade_slope': 'Slope Hazard',
      'm2d.t3d.reset_cam': 'Reset Camera',
      'm2d.t3d.close': '✕ Close',

      // Canvas HUD Labels
      'canvas.global_locator': 'GLOBAL LOCATOR (0°–360°E)',
      'canvas.start': 'START',
      'canvas.destination': 'DESTINATION',
      'canvas.select_start': 'SELECT START POINT (S)',
      'canvas.select_dest': 'SELECT DESTINATION (D)',
      'canvas.select_storm': 'PLACE DUST STORM CENTER',
      'canvas.select_target': 'SELECT TARGET POINT',
      'canvas.selection_banner': 'TARGET: {title} - Click Mars map location (ESC to cancel)',
      'canvas.route_waypoint': 'Route Waypoint',
      'canvas.loading_raster': 'Loading scientific raster: {name}...',
      'canvas.footprint_48h': '+48h Footprint',
      'canvas.rejected': 'REJECTED'
    },

    vi: {
      // Branding & Navigation
      'brand.eva': 'EVA',
      'brand.mars': 'MARS',
      'brand.explorer': 'EXPLORER',
      'brand.mars_explorer': 'MARS EXPLORER',
      'lang.eng': 'ENG',
      'lang.vie': 'VIE',
      'lang.switch_to_en': 'Switch language to English (ENG)',
      'lang.switch_to_vi': 'Chuyển ngôn ngữ sang Tiếng Việt (VIE)',

      // Common Status Labels
      'status.safe': 'AN TOÀN',
      'status.caution': 'CẢNH BÁO',
      'status.unsafe': 'NGUY HIỂM',
      'status.dangerous': 'NGUY HIỂM',
      'status.uncertain': 'CHƯA ĐỦ DỮ LIỆU',
      'status.unknown': 'KHÔNG RÕ',
      'status.nominal': 'BÌNH THƯỜNG',
      'status.active': 'HOẠT ĐỘNG',
      'status.idle': 'CHỜ',

      // 3D Globe Header
      'g3d.page_title': 'EVA Mars Explorer — Quả Cầu 3D Sao Hỏa & Hệ Thống Sinh Tồn Phi Hành Gia',
      'g3d.search_placeholder': 'Vĩ độ, Kinh độ (VD: 18.65, 226.2)',
      'g3d.fly_to': 'Bay tới',
      'g3d.fly_to_title': 'Bay tới tọa độ vừa nhập',
      'g3d.landmarks_placeholder': '-- Địa danh (Bay tới) --',
      'g3d.optgroup.volcano': 'Núi lửa (Mons / Tholus)',
      'g3d.optgroup.canyon': 'Hẻm núi & Thung lũng (Valles)',
      'g3d.optgroup.crater': 'Bồn trũng & Hố va chạm',
      'g3d.optgroup.landing': 'Bãi đáp Tàu vũ trụ NASA',
      'g3d.optgroup.plain': 'Đồng bằng & Cao nguyên',
      'g3d.nav_2d_map': '🗺️ Bản Đồ 2D (72 Ô LOD)',
      'g3d.nav_2d_map_title': 'Mở Bản đồ Phẳng 2D Độ phân giải cao (72 Mảnh)',
      'g3d.reset_btn': 'Đặt lại',
      'g3d.reset_btn_title': 'Đặt lại góc nhìn',
      'g3d.full_btn': 'Toàn màn',
      'g3d.exit_full_btn': 'Thoát',
      'g3d.full_btn_title': 'Chế độ Toàn màn hình',

      // 3D Globe Left Panel
      'g3d.collapse_left_title': 'Thu gọn / Mở rộng bảng trái',
      'g3d.sec1_title': '1. Lớp Dữ Liệu Hành Tinh',
      'g3d.layer.elevation.name': 'Địa hình độ cao MOLA',
      'g3d.layer.elevation.sub': 'MGS MOLA MEGDR • Đơn vị: Mét (m)',
      'g3d.layer.gravity_120g.name': 'Dị thường Trọng trường (MRO 120g)',
      'g3d.layer.gravity_120g.sub': 'JGMRO_120G_SHA • Khí tự do (mGal)',
      'g3d.layer.slope.name': 'Độ dốc Địa hình (Slope)',
      'g3d.layer.slope.sub': 'Tính đạo hàm từ MOLA • Độ (°)',
      'g3d.layer.surface_g.name': 'Gia tốc Trọng trường Bề mặt',
      'g3d.layer.surface_g.sub': 'g₀ + Δg + ω²r • m/s²',
      'g3d.layer.geoid_n.name': 'Độ cao Dị thường Areoid (Geoid N)',
      'g3d.layer.geoid_n.sub': 'Mặt đẳng thế trọng trường • Mét (m)',
      'g3d.layer.gravity_delta.name': 'Sai khác Mô hình (120g - 120f)',
      'g3d.layer.gravity_delta.sub': 'Độ hội tụ mô hình • mGal',
      'g3d.sec2_title': '2. Địa Hình 3D & Ánh Sáng',
      'g3d.relief_exag': 'Độ phóng đại lồi lõm 3D',
      'g3d.sun_azimuth': 'Hướng Mặt Trời (Azimuth)',
      'g3d.ambient_light': 'Ánh sáng môi trường',
      'g3d.sec3_title': '3. Hiển Thị Không Gian',
      'g3d.toggle_grid': 'Lưới kinh vĩ độ (30°)',
      'g3d.toggle_landmarks': '22 Địa danh chuẩn NASA',
      'g3d.toggle_atmosphere': 'Khí quyển tán xạ Rayleigh',
      'g3d.toggle_autorotate': 'Tự động xoay hành tinh',
      'g3d.toggle_crosshair': 'Tâm điểm vị trí đang chọn',
      'g3d.sec4_title': '4. Hồ Sơ Dữ Liệu Gốc NASA',
      'g3d.meta_source': 'Nguồn:',
      'g3d.meta_res': 'Độ phân giải:',
      'g3d.meta_range': 'Dải giá trị:',

      // 3D Globe HUD & Bottom Bar
      'g3d.hud_mean_radius': 'Bán kính TB: 3,396.19 km',
      'g3d.cursor_label': 'Con trỏ:',
      'g3d.controls_hint': 'Click trái: Đo đạc • Kéo: Xoay • Cuộn: Thu phóng',
      'g3d.scale_label': 'Tỷ lệ',
      'g3d.geodesic_dist': 'Đo khoảng cách:',
      'g3d.measure_btn': '📏 Đo 2 điểm',
      'g3d.measure_step1': 'Chọn điểm A...',
      'g3d.measure_step2': 'Chọn điểm B...',

      // 3D Globe Right Panel (Astronaut Survival Monitor)
      'g3d.collapse_right_title': 'Thu gọn / Mở rộng bảng phải',
      'g3d.surv_title': 'Giám Sát Sinh Tồn Phi Hành Gia',
      'g3d.surv_sub': 'Bộ đồ NASA xEMU • 5 Tiêu Chí An Toàn',
      'g3d.selected_target': 'Vị Trí Mục Tiêu Đang Chọn',
      'g3d.searching_landmark': 'Đang tìm địa danh gần nhất...',
      'g3d.suit_index_label': 'Chỉ Số Sinh Tồn Bộ Đồ',
      'g3d.suit_index_model': 'Chỉ số sinh tồn (Mô hình):',
      'g3d.max_eva_window': 'Thời gian EVA an toàn tối đa:',
      'g3d.criteria_heading': '5 Tiêu Chí Sinh Tồn Cốt Lõi',
      'g3d.crit1.name': '1. Nhiệt độ môi trường',
      'g3d.crit1.sub': 'An toàn: -93°C đến +17°C (180–290 K)',
      'g3d.crit2.name': '2. Áp suất khí quyển (Mô hình)',
      'g3d.crit2.sub': 'Mô hình P(h) • An toàn: 400–611.65 Pa',
      'g3d.crit3.name': '3. Độ dốc địa hình di chuyển',
      'g3d.crit3.sub': 'An toàn: < 8° • Giới hạn: 20°',
      'g3d.crit4.name': '4. Mật độ bụi khí quyển (τ)',
      'g3d.crit4.sub': 'Độ dày quang học • An toàn: τ < 0.05',
      'g3d.crit5.name': '5. Bức xạ Vũ trụ & Mặt Trời',
      'g3d.crit5.sub': 'An toàn: ≤ 0.72 mSv/ngày',
      'g3d.warnings_heading': '⚠️ Cảnh Báo & Khuyến Nghị Vận Hành',
      'g3d.details_summary': '🔬 Thông Số Địa Hình & Địa Vật Lý Chi Tiết',
      'g3d.det.elevation': 'Độ cao MOLA (Elevation)',
      'g3d.det.radius': 'Bán kính hành tinh',
      'g3d.det.grav120g': 'Dị thường trọng trường (120g)',
      'g3d.det.surfg': 'Gia tốc trọng trường bề mặt',
      'g3d.det.geoidn': 'Độ cao Geoid / Areoid (N)',
      'g3d.det.gravdiff': 'Sai số mô hình (120g-120f)',
      'g3d.det.lat_centric': 'Vĩ độ Tâm hành tinh',
      'g3d.det.lat_graphic': 'Vĩ độ Địa lý (Planetographic)',
      'g3d.det.lon_ew': 'Kinh độ Đông / Tây',
      'g3d.det.cartesian': 'Tọa độ Đề-các 3D (X, Y, Z)',

      // Fullscreen Lock Overlay
      'fs.locked_title': 'Đang Khóa Chế Độ Toàn Màn Hình',
      'fs.locked_desc': 'Bạn vừa nhấn phím ESC. Bạn có thực sự muốn thoát chế độ Toàn màn hình hay tiếp tục khám phá Sao Hỏa?',
      'fs.stay_btn': 'Ở lại Toàn màn hình',
      'fs.exit_btn': 'Thoát Toàn màn hình',

      // 2D Explorer Header & Navigation
      'm2d.page_title': 'EVA Mars Explorer — Bản Đồ Địa Lý 2D & Lập Lộ Trình Marswalk',
      'm2d.nav.algorithms': 'Thuật Toán',
      'm2d.nav.algorithms_title': 'Mở So Sánh Thuật Toán Tìm Đường & Đối Chuẩn Trực Tiếp',
      'm2d.nav.analytics': 'Phân Tích',
      'm2d.nav.analytics_title': 'Mở Bảng Điều Khiển Phân Tích Sinh Lý & Viễn Thám EVA',
      'm2d.mode_label': 'CHẾ ĐỘ',
      'm2d.mode_main': '🗺️ Bản Đồ Chính',
      'm2d.mode_main_title': 'Bản Đồ Trực Quan Chính (72 Mảnh Độ Phân Giải Cao)',
      'm2d.mode_sub': '🔬 Bản Đồ Phụ (Lớp Dữ Liệu)',
      'm2d.mode_sub_title': 'Bản Đồ Phụ — Các Lớp Dữ Liệu Khoa Học & Địa Hình',
      'm2d.search_placeholder': 'Bay tới: Vĩ độ, Kinh độ (VD: 18.65, 226.2)',
      'm2d.fly_to': 'Bay Tới',
      'm2d.fly_to_title': 'Bay tới tọa độ',
      'm2d.landmarks_placeholder': '📍 Địa danh...',
      'm2d.landmarks_title': 'Bay tới Địa danh NASA',
      'm2d.optgroup.volcano': 'Núi lửa (Mons)',
      'm2d.optgroup.canyon': 'Hẻm núi & Thung lũng',
      'm2d.optgroup.landing': 'Bãi đáp Tàu vũ trụ NASA',
      'm2d.optgroup.basin': 'Bồn trũng & Đồng bằng',

      // 2D Sub-Map Layer Ribbon
      'm2d.sublayer_label': 'Lớp dữ liệu phụ:',
      'm2d.layer.elevation': '🏔️ Độ Cao MOLA (72 Mảnh)',
      'm2d.layer.slope': '📐 Độ Dốc Địa Hình (°)',
      'm2d.layer.gravity_120g': '🧲 Dị Thường Trọng Trường (mGal)',
      'm2d.layer.surface_g': '⚖️ Trọng Trường Bề Mặt (m/s²)',
      'm2d.layer.geoid_n': '🌐 Độ Cao Areoid Geoid N (m)',
      'm2d.layer.gravity_delta': '📊 Sai Khác Mô Hình (120g-120f)',

      // 2D Left Dock — Marswalk Planner & Dust Storm
      'm2d.dock.title': 'Lộ Trình Marswalk',
      'm2d.dock.sub': 'Lộ Trình & Bão Bụi',
      'm2d.dock.toggle_title': 'Đóng/Mở Bảng Lập Lộ Trình Marswalk & Mô Phỏng Bão Bụi',
      'm2d.tab.planner': '🧭 Lộ Trình Marswalk',
      'm2d.tab.storm': '🌪️ Bão Bụi',
      'm2d.planner.start_label': 'ĐIỂM XUẤT PHÁT (S)',
      'm2d.planner.dest_label': 'ĐIỂM ĐÍCH (D)',
      'm2d.planner.pick_map': '🎯 Chọn Trên Bản Đồ',
      'm2d.planner.pick_map_active': '🎯 Chạm Bản Đồ...',
      'm2d.planner.pick_start_title': 'Chạm vào bản đồ 2D để chọn Điểm Xuất Phát',
      'm2d.planner.pick_dest_title': 'Chạm vào bản đồ 2D để chọn Điểm Đích',
      'm2d.planner.landmark_select': '-- Chọn Địa Danh Sao Hỏa Hoặc Tùy Chỉnh --',
      'm2d.planner.lat_placeholder': 'Vĩ độ (-90..90)',
      'm2d.planner.lon_placeholder': 'Kinh độ (0..360)',
      'm2d.planner.suit_config_title': 'Cấu Hình Phi Hành Gia & Bộ Đồ',
      'm2d.planner.suit_badge': 'Bộ Đồ xEMU 50 kg',
      'm2d.planner.walk_speed': 'Tốc Độ Đi Bộ (m/s)',
      'm2d.planner.body_mass': 'Khối Lượng Cơ Thể (kg)',
      'm2d.planner.equip_mass': 'Khối Lượng Thiết Bị (kg)',
      'm2d.planner.o2_cap': 'Dung Tích Oxy (L)',
      'm2d.planner.total_mass_label': 'Tổng Khối Lượng (Cơ thể + Thiết bị + 50kg Bộ đồ):',
      'm2d.planner.calc_route': '🧭 Tính Toán Lộ Trình',
      'm2d.planner.calculating_route': '⏳ Đang Tính Lộ Trình...',
      'm2d.planner.swap_title': 'Đảo Điểm Xuất Phát & Điểm Đích',
      'm2d.planner.vis_title': 'Hiện/Ẩn Đường Lộ Trình',
      'm2d.planner.corridor_title': 'Bật/Tắt Hành Lang An Toàn & Lộ Trình Bị Loại',
      'm2d.planner.clear_title': 'Xóa Lộ Trình & Điểm Đánh Dấu',

      // Route Validation & Telemetry Summary
      'm2d.val.report_title': 'Báo Cáo Thẩm Định Lộ Trình',
      'm2d.val.verified_badge': 'ĐÃ KIỂM ĐỊNH',
      'm2d.val.feasible_msg': 'Tất cả chặng đều thỏa mãn giới hạn độ dốc, bão bụi và oxy.',
      'm2d.telem.summary_title': 'Tóm Tắt Viễn Thám Lộ Trình',
      'm2d.telem.distance': 'Tổng Quãng Đường',
      'm2d.telem.est_time': 'Thời Gian Dự Kiến',
      'm2d.telem.o2_consumed': 'Oxy Tiêu Thụ',
      'm2d.telem.energy': 'Năng Lượng (Minetti)',
      'm2d.telem.ascent_descent': 'Độ Cao Leo / Xuống',
      'm2d.telem.max_slope': 'Độ Dốc Cực Đại (Lên/Xuống)',
      'm2d.walk.title': '🚶 Mô Phỏng Phi Hành Gia Bộ Hành',
      'm2d.walk.idle': 'CHỜ',
      'm2d.walk.walking': 'ĐANG ĐI',
      'm2d.walk.paused': 'TẠM DỪNG',
      'm2d.walk.completed': 'ĐÃ ĐẾN ĐÍCH',
      'm2d.walk.start_btn': '▶ Bắt Đầu Đi',
      'm2d.walk.resume_btn': '▶ Tiếp Tục',
      'm2d.walk.pause_btn': '⏸ Tạm Dừng',
      'm2d.walk.reset_btn': '↺ Đặt Lại',
      'm2d.walk.reroute_btn': '⚡ Tái Định Tuyến Tránh Bão',
      'm2d.det_params_summary': '🔬 Thông Số Địa Hình & Hỗ Trợ Sự Sống Chi Tiết',
      'm2d.algo_diag_summary': '🧭 Chẩn Đoán Thuật Toán & An Toàn Hành Lang',
      'm2d.wp_table_summary': '📋 Lịch Trình Điểm Nút Lộ Trình (10 Điểm Đầu)',
      'm2d.export_json': '⬇ Xuất JSON Lộ Trình',
      'm2d.export_csv': '⬇ Xuất CSV',

      // Dust Storm Simulator Tab
      'm2d.storm.title': 'Mô Phỏng Bão Bụi Sao Hỏa',
      'm2d.storm.desc': 'Mô phỏng hiểm họa bão bụi di chuyển. Áp dụng vùng đệm an toàn 48 giờ khi lập lộ trình Marswalk.',
      'm2d.storm.clock_label': 'Đồng Hồ Mô Phỏng',
      'm2d.storm.play': '▶ Chạy',
      'm2d.storm.pause': '⏸ Dừng',
      'm2d.storm.step': '+1 giờ',
      'm2d.storm.reset': 'Đặt Lại',
      'm2d.storm.create_title': 'Tạo / Khởi Tạo Bão Bụi',
      'm2d.storm.pick_center': '🎯 Chọn Tâm Bão Trên Bản Đồ',
      'm2d.storm.pick_center_active': '🎯 Chạm Bản Đồ Để Đặt Tâm Bão...',
      'm2d.storm.center_lat': 'Vĩ Độ Tâm (°)',
      'm2d.storm.center_lon': 'Kinh Độ Tâm (°Đ)',
      'm2d.storm.radius': 'Bán Kính (km)',
      'm2d.storm.speed': 'Tốc Độ Di Chuyển (km/h)',
      'm2d.storm.heading': 'Hướng Di Chuyển (0°=B, 90°=Đ)',
      'm2d.storm.intensity': 'Cấp Độ Cường Độ',
      'm2d.storm.int_moderate': 'Trung bình (τ+0.9, CẢNH BÁO)',
      'm2d.storm.int_severe': 'Mạnh (τ+1.8, Lõi NGUY HIỂM)',
      'm2d.storm.int_extreme': 'Cực đoan/Toàn cầu (τ+3.0, NGUY HIỂM)',
      'm2d.storm.spawn_btn': '🌪️ Tạo Bão Bụi',
      'm2d.storm.preset_btn': '⚡ Mẫu Có Sẵn',
      'm2d.storm.clear_all_btn': '🗑️ Xóa Tất Cả',
      'm2d.storm.active_list_title': 'Các Cơn Bão Đang Hoạt Động',
      'm2d.storm.no_storms': 'Chưa có bão bụi hoạt động. Nhấn "Tạo Bão Bụi" hoặc "Mẫu Có Sẵn" để thêm hiểm họa thời tiết.',

      // 2D Right Panel — Astronaut Monitoring
      'm2d.mon.title': 'Giám Sát Phi Hành Gia',
      'm2d.mon.sub': 'Bộ Đồ NASA xEMU • 5 Tiêu Chí An Toàn',
      'm2d.mon.click_to_inspect': 'Chạm bản đồ để kiểm tra',
      'm2d.mon.target_loc': 'Vị Trí Mục Tiêu',
      'm2d.mon.btn_3d_terrain': '🏔️ Địa Hình 3D',
      'm2d.mon.click_terrain': 'Chạm bản đồ để kiểm tra địa hình',
      'm2d.mon.active_layer_val': 'Giá Trị Lớp Đang Chọn:',
      'm2d.mon.suit_index': 'Chỉ Số Sinh Tồn Bộ Đồ',
      'm2d.mon.suit_index_model': 'Chỉ số sinh tồn (Mô hình):',
      'm2d.mon.max_eva_window': 'Thời gian EVA an toàn tối đa:',
      'm2d.mon.criteria_heading': '5 Tiêu Chí Sinh Tồn Cốt Lõi',
      'm2d.mon.warnings_heading': '⚠️ Cảnh Báo & Khuyến Nghị Vận Hành',
      'm2d.mon.details_summary': '🔬 Thông Số Địa Hình & Địa Vật Lý Chi Tiết',
      'm2d.mon.tile_meta_summary': '🗺️ Siêu Dữ Liệu Bản Đồ & Mảnh Địa Hình',

      // 2D Bottom Toolbar
      'm2d.bot.settings': 'Cài Đặt',
      'm2d.bot.settings_title': 'Mở Cài Đặt Hệ Thống & Tùy Chọn',
      'm2d.bot.lat': 'VĨ ĐỘ',
      'm2d.bot.lon': 'KINH ĐỘ',
      'm2d.bot.val': 'GIÁ TRỊ',
      'm2d.bot.zoom_in_title': 'Phóng To (+)',
      'm2d.bot.zoom_out_title': 'Thu Nhỏ (-)',
      'm2d.bot.reset': 'Đặt lại',
      'm2d.bot.reset_title': 'Đặt Lại Góc Nhìn (0)',
      'm2d.bot.grid': 'Lưới',
      'm2d.bot.grid_title': 'Bật/Tắt Lưới Kinh Vĩ Độ',
      'm2d.bot.tiles': 'Mảnh',
      'm2d.bot.tiles_title': 'Bật/Tắt Ranh Giới 72 Mảnh Bản Đồ',
      'm2d.bot.globe_3d': '🌐 Quả Cầu 3D',
      'm2d.bot.globe_3d_title': 'Chuyển sang Quả Cầu 3D Sao Hỏa Tương Tác',
      'm2d.bot.full': 'Toàn màn',
      'm2d.bot.full_title': 'Bật/Tắt Toàn Màn Hình',
      'm2d.bot.pegman_label': 'Địa Hình 3D',
      'm2d.bot.pegman_title': 'Kéo và thả vào bản đồ để khảo sát địa hình 3D khu vực',

      // 3D Terrain Modal (in 2D page)
      'm2d.t3d.title': 'Mô Phỏng Địa Hình 3D Khu Vực (MOLA DEM)',
      'm2d.t3d.sub': 'Lưới độ cao WebGL thời gian thực từ dữ liệu độ cao kế laser NASA MGS MOLA',
      'm2d.t3d.exag': 'Độ Phóng Đại Cao Độ:',
      'm2d.t3d.extent': 'Phạm Vi Khu Vực:',
      'm2d.t3d.shading': 'Chế Độ Đổ Bóng:',
      'm2d.t3d.shade_viking': 'Ảnh Vệ Tinh Quang Học',
      'm2d.t3d.shade_elev': 'Phổ Màu Độ Cao',
      'm2d.t3d.shade_slope': 'Cảnh Báo Độ Dốc',
      'm2d.t3d.reset_cam': 'Đặt Lại Camera',
      'm2d.t3d.close': '✕ Đóng',

      // Canvas HUD Labels
      'canvas.global_locator': 'ĐỊNH VỊ TOÀN CẦU (0°–360°Đ)',
      'canvas.start': 'XUẤT PHÁT',
      'canvas.destination': 'ĐÍCH ĐẾN',
      'canvas.select_start': 'CHỌN ĐIỂM XUẤT PHÁT (S)',
      'canvas.select_dest': 'CHỌN ĐIỂM ĐÍCH (D)',
      'canvas.select_storm': 'ĐẶT TÂM BÃO BỤI',
      'canvas.select_target': 'CHỌN ĐIỂM MỤC TIÊU',
      'canvas.selection_banner': 'MỤC TIÊU: {title} - Chạm vào bản đồ Sao Hỏa (ESC để hủy)',
      'canvas.route_waypoint': 'Điểm Lộ Trình',
      'canvas.loading_raster': 'Đang tải lớp dữ liệu khoa học: {name}...',
      'canvas.footprint_48h': 'Vùng dự báo +48h',
      'canvas.rejected': 'BỊ LOẠI'
    }
  };

  // Landmark type & description translations (shared between 3D Globe & 2D Map)
  const LANDMARK_TRANSLATIONS_EN = {
    'Olympus Mons': {
      type: 'Shield Volcano (Mons)',
      desc: 'Tallest volcano in the Solar System (~21.9 km above datum), 600 km wide with an 80 km summit caldera.'
    },
    'Ascraeus Mons': {
      type: 'Shield Volcano (Mons)',
      desc: 'Northernmost of the three Tharsis Montes shield volcanoes, rising over 18 km in elevation.'
    },
    'Pavonis Mons': {
      type: 'Shield Volcano (Mons)',
      desc: 'Central volcano of the Tharsis Montes chain, located right on the Martian equator.'
    },
    'Arsia Mons': {
      type: 'Shield Volcano (Mons)',
      desc: 'Southernmost Tharsis Montes volcano with a massive 110 km diameter summit caldera.'
    },
    'Elysium Mons': {
      type: 'Volcano (Mons)',
      desc: 'Largest volcano in the Elysium Planitia volcanic province, rising ~14 km above surrounding plains.'
    },
    'Hecates Tholus': {
      type: 'Volcanic Dome (Tholus)',
      desc: 'Northern volcano of the Elysium group showing ancient glacial and caldera collapse features.'
    },
    'Albor Tholus': {
      type: 'Volcanic Dome (Tholus)',
      desc: 'Southern volcanic dome in the Elysium province with a deep summit crater.'
    },
    'Alba Mons': {
      type: 'Low-Profile Volcano (Mons)',
      desc: 'Immense low-slope volcano north of Tharsis with a basal diameter exceeding 1,600 km.'
    },
    'Valles Marineris': {
      type: 'Tectonic Canyon System',
      desc: 'Grand Canyon of Mars: stretches over 4,000 km long, 200 km wide, and up to 7 km deep.'
    },
    'Noctis Labyrinthus': {
      type: 'Fractured Graben Valleys',
      desc: 'Maze-like network of intersecting tectonic valleys between Valles Marineris and the Tharsis bulge.'
    },
    'Kasei Valles': {
      type: 'Outflow Channel System',
      desc: 'One of the largest ancient catastrophic flood outflow channel systems on Mars, draining into Chryse Planitia.'
    },
    'Ares Vallis': {
      type: 'Ancient Outflow Channel',
      desc: 'Ancient flood channel with streamlined teardrop islands; NASA Mars Pathfinder landing region.'
    },
    'Hellas Planitia': {
      type: 'Giant Impact Basin',
      desc: 'Deepest impact basin on Mars (~2,300 km diameter, floor below -7,150 m), with the highest surface atmospheric pressure.'
    },
    'Argyre Planitia': {
      type: 'Impact Basin',
      desc: 'Well-preserved ~1,800 km wide impact basin in the southern highlands surrounded by rugged massifs.'
    },
    'Isidis Planitia': {
      type: 'Impact Basin',
      desc: 'Giant impact basin straddling the dichotomy boundary; adjacent to Jezero Crater.'
    },
    'Utopia Planitia': {
      type: 'Northern Impact Basin',
      desc: 'Largest recognized impact basin on Mars (~3,300 km diameter), holding vast subsurface water-ice deposits.'
    },
    'Jezero Crater (Perseverance)': {
      type: 'Ancient Lakebed & Landing Site',
      desc: 'NASA Perseverance Rover & Ingenuity Helicopter landing site (2021), preserving an ancient river delta.'
    },
    'Gale Crater (Curiosity)': {
      type: 'Impact Crater & Landing Site',
      desc: '154 km diameter crater featuring Aeolis Mons (Mount Sharp, 5.5 km high); NASA Curiosity Rover site (2012).'
    },
    'Gusev Crater (Spirit)': {
      type: 'Impact Crater & Landing Site',
      desc: 'NASA Spirit Rover landing site (2004); ancient crater lake modified by basaltic lava flows.'
    },
    'Meridiani Planum (Opportunity)': {
      type: 'Equatorial Plain & Landing Site',
      desc: 'NASA Opportunity Rover site (2004); famous for hematite "blueberries" indicating past liquid water.'
    },
    'Elysium Planitia (InSight)': {
      type: 'Equatorial Plain & Landing Site',
      desc: 'Smooth volcanic plain where NASA InSight Lander deployed its seismometer to study Marsquakes (2018).'
    },
    'Chryse Planitia (Viking 1)': {
      type: 'Northern Lowland Plain',
      desc: 'Historic landing site of NASA Viking 1 (1976), the first spacecraft to operate successfully on Mars.'
    },
    'Syrtis Major Planum': {
      type: 'Dark Basaltic Shield Plateau',
      desc: 'Prominent low-albedo basaltic volcanic shield visible from Earth telescopes, relatively dust-free.'
    },
    'Tharsis Montes': {
      type: 'Volcanic Plateau',
      desc: 'Vast volcanic plateau hosting three giant aligned shield volcanoes: Ascraeus, Pavonis, and Arsia Mons.'
    }
  };

  const LANDMARK_TYPE_VI_MAP = {
    'Shield Volcano': 'Núi lửa khiên (Mons)',
    'Volcano': 'Núi lửa (Mons)',
    'Canyon System': 'Hệ thống hẻm núi kiến tạo',
    'Impact Basin': 'Bồn địa va chạm khổng lồ',
    'Landing Site': 'Bãi đáp Tàu vũ trụ NASA',
    'Volcanic Plain': 'Đồng bằng núi lửa',
    'Outflow Channel': 'Kênh dòng chảy cổ đại',
    'Volcanic Plateau': 'Cao nguyên núi lửa'
  };

  let currentLang = DEFAULT_LANG;
  const listeners = new Set();

  function detectInitialLanguage() {
    try {
      const urlParams = new URLSearchParams(global.location ? global.location.search : '');
      const urlLang = (urlParams.get('lang') || '').toLowerCase();
      if (SUPPORTED_LANGS.includes(urlLang)) {
        localStorage.setItem(STORAGE_KEY, urlLang);
        return urlLang;
      }
    } catch (_) {}

    try {
      const saved = (localStorage.getItem(STORAGE_KEY) || '').toLowerCase();
      if (SUPPORTED_LANGS.includes(saved)) {
        return saved;
      }
    } catch (_) {}

    return DEFAULT_LANG;
  }

  currentLang = detectInitialLanguage();

  function getLang() {
    return currentLang;
  }

  function tr(enText, viText) {
    return currentLang === 'vi' ? (viText !== undefined ? viText : enText) : enText;
  }

  function t(key, vars = null) {
    const langTable = DICTIONARY[currentLang] || DICTIONARY.en;
    let raw = langTable[key];
    if (raw === undefined) {
      raw = DICTIONARY.en[key];
    }
    if (raw === undefined) {
      return String(key || '');
    }
    if (vars && typeof vars === 'object') {
      return raw.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''));
    }
    return raw;
  }

  function translateLandmark(lm) {
    if (!lm) return { name: '', type: '', desc: '' };
    if (currentLang === 'en') {
      const enEntry = LANDMARK_TRANSLATIONS_EN[lm.name];
      if (enEntry) {
        return {
          name: lm.name,
          type: enEntry.type,
          desc: enEntry.desc
        };
      }
      return {
        name: lm.name,
        type: lm.type || 'Martian Landmark',
        desc: lm.desc || ''
      };
    } else {
      // Vietnamese
      const viType = LANDMARK_TYPE_VI_MAP[lm.type] || lm.type || 'Địa danh Sao Hỏa';
      return {
        name: lm.name,
        type: viType,
        desc: lm.desc || ''
      };
    }
  }

  function formatStatusBadge(status) {
    const norm = String(status || 'SAFE').toUpperCase();
    if (currentLang === 'vi') {
      if (norm === 'SAFE') return 'AN TOÀN';
      if (norm === 'CAUTION') return 'CẢNH BÁO';
      if (norm === 'UNSAFE' || norm === 'DANGEROUS') return 'NGUY HIỂM';
      if (norm === 'UNCERTAIN') return 'CHƯA ĐỦ DỮ LIỆU';
      if (norm === 'UNKNOWN') return 'KHÔNG RÕ';
    } else {
      if (norm === 'DANGEROUS') return 'UNSAFE';
    }
    return norm;
  }

  function applyDOMTranslations(root = document) {
    if (!root || !root.querySelectorAll) return;

    if (root === document && document.documentElement) {
      document.documentElement.lang = currentLang;
    }

    // 1. data-i18n (textContent)
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      const val = t(key);
      if (val !== undefined) {
        if (el.tagName === 'OPTGROUP') {
          el.label = val;
        } else {
          el.textContent = val;
        }
      }
    });

    // 2. data-i18n-html (innerHTML)
    root.querySelectorAll('[data-i18n-html]').forEach((el) => {
      const key = el.getAttribute('data-i18n-html');
      if (!key) return;
      const val = t(key);
      if (val !== undefined) {
        el.innerHTML = val;
      }
    });

    // 3. data-i18n-placeholder
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (!key) return;
      const val = t(key);
      if (val !== undefined) {
        el.setAttribute('placeholder', val);
      }
    });

    // 4. data-i18n-title
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      if (!key) return;
      const val = t(key);
      if (val !== undefined) {
        el.setAttribute('title', val);
      }
    });

    // 5. data-i18n-aria-label
    root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      const key = el.getAttribute('data-i18n-aria-label');
      if (!key) return;
      const val = t(key);
      if (val !== undefined) {
        el.setAttribute('aria-label', val);
      }
    });

    // 6. Sync language toggle buttons state
    document.querySelectorAll('[data-lang-btn]').forEach((btn) => {
      const btnLang = btn.getAttribute('data-lang-btn');
      const isActive = btnLang === currentLang;
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      btn.classList.toggle('active', isActive);
    });
  }

  function setLang(newLang, notify = true) {
    const norm = String(newLang || '').toLowerCase();
    const target = SUPPORTED_LANGS.includes(norm) ? norm : DEFAULT_LANG;
    const changed = target !== currentLang;
    currentLang = target;

    try {
      localStorage.setItem(STORAGE_KEY, currentLang);
    } catch (_) {}

    applyDOMTranslations(document);

    if (notify || changed) {
      listeners.forEach((fn) => {
        try {
          fn(currentLang);
        } catch (err) {
          console.warn('EVA_I18N listener error:', err);
        }
      });
    }
    return currentLang;
  }

  function onLangChange(callback) {
    if (typeof callback === 'function') {
      listeners.add(callback);
    }
    return () => listeners.delete(callback);
  }

  function bindLanguageToggleButtons(root = document) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[data-lang-btn]').forEach((btn) => {
      if (btn._evaLangBound) return;
      btn._evaLangBound = true;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = btn.getAttribute('data-lang-btn');
        if (target) {
          setLang(target, true);
        }
      });
    });
    // Sync active visual state immediately
    root.querySelectorAll('[data-lang-btn]').forEach((btn) => {
      const btnLang = btn.getAttribute('data-lang-btn');
      const isActive = btnLang === currentLang;
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      btn.classList.toggle('active', isActive);
    });
  }

  // Listen for cross-tab / cross-page storage updates
  if (global.addEventListener) {
    global.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const norm = String(e.newValue).toLowerCase();
        if (SUPPORTED_LANGS.includes(norm) && norm !== currentLang) {
          currentLang = norm;
          applyDOMTranslations(document);
          listeners.forEach((fn) => {
            try { fn(currentLang); } catch (_) {}
          });
        }
      }
    });

    global.addEventListener('DOMContentLoaded', () => {
      bindLanguageToggleButtons(document);
      applyDOMTranslations(document);
    });
  }

  const api = {
    STORAGE_KEY,
    SUPPORTED_LANGS,
    DEFAULT_LANG,
    DICTIONARY,
    getLang,
    setLang,
    t,
    tr,
    translateLandmark,
    formatStatusBadge,
    applyDOMTranslations,
    bindLanguageToggleButtons,
    onLangChange
  };

  global.EVA_I18N = api;
  global.evaT = t;
  global.evaTr = tr;
  global.getEvaLang = getLang;
  global.setEvaLang = setLang;
  global.onEvaLangChange = onLangChange;
})(typeof window !== 'undefined' ? window : globalThis);
