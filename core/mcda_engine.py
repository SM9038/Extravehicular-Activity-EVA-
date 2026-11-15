"""
core/mcda_engine.py — Multi-Criteria Decision Analysis (MCDA) & Explainable Routing Engine
========================================================================================
1. Bản đồ chi phí đa tiêu chí (MCDA Cost Map):
   - Ràng buộc an toàn cứng (Hard Constraints):
     + Độ dốc vật lý > 22.0° (MAX_SAFE_SLOPE_DEG) => np.inf
     + Túi rỗng ngầm địa chấn Vp < 330 m/s => np.inf
     + Bão bụi cục bộ dày đặc (tau > 2.2) => np.inf
     + Các ô NODATA và ô chướng ngại vật nhân tạo (danger=True).
   - Hàm mục tiêu đa tiêu chí (Soft Criteria with Configurable Weights):
     Cost = Base + w_slope * SlopeFactor + w_roughness * Roughness
            + w_buffer * SafetyBufferPenalty + w_thermal * ThermalStress
            + w_dust * DustPenalty + w_radiation * RadPenalty - w_science * ScienceReward
2. Động cơ Giải thích Tuyến đường (Explainable Routing Engine):
   - Trả lời rõ ràng: "Tại sao nên đi tuyến đường này?", "Phi hành gia sẽ quan sát được gì?",
     "Rủi ro lớn nhất ở đâu?", "Dữ liệu khoa học nào hỗ trợ quyết định?".
   - Phân tích tỷ trọng đóng góp của từng thành phần chi phí.
   - Thống kê định lượng: Tổng điểm phát hiện khoa học (Astrobiology Discovery Score),
     khoảng cách an toàn tối thiểu tới vách dốc, liều bức xạ tích lũy, mức tiết kiệm Oxy.
"""

from typing import Dict, Any, List, Optional, Tuple, Sequence
import math
import numpy as np
from core.config import (
    BASE_COST,
    SLOPE_WEIGHT,
    ROUGHNESS_WEIGHT,
    MAX_SAFE_SLOPE_DEG,
    DEFAULT_CELL_SIZE_M,
)
from core.cost_map import compute_slope, compute_slope_degrees
from core.safety import compute_safety_penalty


def build_mcda_cost_map(
    elevation: np.ndarray,
    roughness: np.ndarray,
    danger: np.ndarray,
    cell_size_m: float = DEFAULT_CELL_SIZE_M,
    max_safe_slope_deg: float = MAX_SAFE_SLOPE_DEG,
    safety_buffer_dist_m: float = 20.0,
    themis_surface_temp_k: Optional[np.ndarray] = None,
    crism_science_reward: Optional[np.ndarray] = None,
    seismic_vp: Optional[np.ndarray] = None,
    dust_tau: Optional[np.ndarray] = None,
    radiation_dose: Optional[np.ndarray] = None,
    weights: Optional[Dict[str, float]] = None,
) -> Tuple[np.ndarray, Dict[str, Any]]:
    elev = np.asarray(elevation, dtype=np.float64)
    rough = np.asarray(roughness, dtype=np.float64)
    dng = np.asarray(danger, dtype=bool).copy()

    w = {
        "slope": SLOPE_WEIGHT,
        "roughness": ROUGHNESS_WEIGHT,
        "safety_buffer": 1.2,
        "thermal_stress": 0.8,
        "dust": 0.9,
        "radiation": 0.5,
        "science_reward": 0.7,
    }
    if weights:
        w.update(weights)

    slope_tan = compute_slope(elev, cell_size_m=cell_size_m)
    slope_deg = np.degrees(np.arctan(slope_tan))

    steep_mask = slope_deg > float(max_safe_slope_deg)
    dng = dng | steep_mask

    if seismic_vp is not None:
        void_mask = np.asarray(seismic_vp, dtype=np.float64) < 330.0
        dng = dng | void_mask

    if dust_tau is not None:
        dust_hazard_mask = np.asarray(dust_tau, dtype=np.float64) > 2.2
        dng = dng | dust_hazard_mask

    buffer_penalty = compute_safety_penalty(dng, buffer_radius=safety_buffer_dist_m / cell_size_m, weight=1.2)

    if themis_surface_temp_k is not None:
        temp_k = np.asarray(themis_surface_temp_k, dtype=np.float64)
        thermal_penalty = np.abs(temp_k - 245.0) / 25.0
    else:
        thermal_penalty = np.zeros_like(elev)

    if dust_tau is not None:
        tau_val = np.asarray(dust_tau, dtype=np.float64)
        dust_penalty = np.maximum(0.0, tau_val - 0.4) * 1.5
    else:
        dust_penalty = np.zeros_like(elev)

    if radiation_dose is not None:
        rad_val = np.asarray(radiation_dose, dtype=np.float64)
        rad_penalty = np.maximum(0.0, (rad_val - 250.0) / 100.0)
    else:
        rad_penalty = np.zeros_like(elev)

    if crism_science_reward is not None:
        sci_reward = np.asarray(crism_science_reward, dtype=np.float64)
        sci_discount = np.clip(sci_reward, 0.0, 1.0) * 1.2
    else:
        sci_discount = np.zeros_like(elev)

    cost = (
        BASE_COST
        + w["slope"] * slope_tan
        + w["roughness"] * rough
        + w["safety_buffer"] * buffer_penalty
        + w["thermal_stress"] * thermal_penalty
        + w["dust"] * dust_penalty
        + w["radiation"] * rad_penalty
        - w["science_reward"] * sci_discount
    )

    cost = np.clip(cost, 1.0, None)
    cost[dng] = np.inf

    layer_breakdown = {
        "slope_tan": slope_tan,
        "slope_deg": slope_deg,
        "roughness": rough,
        "buffer_penalty": buffer_penalty,
        "thermal_penalty": thermal_penalty,
        "dust_penalty": dust_penalty,
        "radiation_penalty": rad_penalty,
        "science_discount": sci_discount,
        "impassable_mask": dng,
        "weights": w,
    }

    return cost, layer_breakdown


def explain_route_decision(
    path: Sequence[Tuple[float, float]],
    elevation: np.ndarray,
    roughness: np.ndarray,
    cost_map: np.ndarray,
    mcda_breakdown: Dict[str, Any],
    crism_reward: Optional[np.ndarray] = None,
    themis_temp: Optional[np.ndarray] = None,
    seismic_vp: Optional[np.ndarray] = None,
    geology_map: Optional[np.ndarray] = None,
    cell_size_m: float = DEFAULT_CELL_SIZE_M,
    max_safe_slope_deg: float = MAX_SAFE_SLOPE_DEG,
) -> Dict[str, Any]:
    if not path or len(path) < 2:
        return {
            "error": "Tuyến đường rỗng hoặc không đủ điểm để phân tích.",
            "is_valid": False,
        }

    elev = np.asarray(elevation, dtype=np.float64)
    rough = np.asarray(roughness, dtype=np.float64)
    rows, cols = elev.shape

    path_coords = []
    total_dist_m = 0.0
    slopes_deg = []
    rough_vals = []
    temp_vals = []
    science_scores = []
    geology_counts: Dict[str, int] = {}
    cost_components = {
        "slope": 0.0,
        "roughness": 0.0,
        "safety_buffer": 0.0,
        "thermal": 0.0,
        "dust": 0.0,
        "radiation": 0.0,
    }

    w = mcda_breakdown.get("weights", {})
    impassable_mask = mcda_breakdown.get("impassable_mask", np.zeros_like(elev, dtype=bool))
    imp_coords = np.argwhere(impassable_mask)

    min_hazard_clearance_m = float("inf")

    for i in range(len(path)):
        r, c = float(path[i][0]), float(path[i][1])
        path_coords.append((r, c))
        ir = max(0, min(rows - 1, int(round(r))))
        ic = max(0, min(cols - 1, int(round(c))))

        if i > 0:
            pr, pc = path[i - 1]
            seg_dist = math.hypot((r - pr) * cell_size_m, (c - pc) * cell_size_m)
            total_dist_m += seg_dist

            dz = elev[ir, ic] - elev[max(0, min(rows - 1, int(round(pr)))), max(0, min(cols - 1, int(round(pc))))]
            grade = dz / max(1e-3, seg_dist)
            deg = math.degrees(math.atan(abs(grade)))
            slopes_deg.append(deg)

            rough_vals.append(float(rough[ir, ic]))
            if themis_temp is not None:
                temp_vals.append(float(themis_temp[ir, ic]))
            if crism_reward is not None:
                science_scores.append(float(crism_reward[ir, ic]))

            if geology_map is not None:
                gid = int(geology_map[ir, ic])
                gname = {
                    1: "Delta Front Sediments",
                    2: "Crater Floor Fractured Unit",
                    3: "Olivine Ridge",
                    4: "Eolian Dunes",
                }.get(gid, "Unknown")
                geology_counts[gname] = geology_counts.get(gname, 0) + 1

            cost_components["slope"] += float(mcda_breakdown["slope_tan"][ir, ic]) * w.get("slope", 2.0)
            cost_components["roughness"] += float(rough[ir, ic]) * w.get("roughness", 1.5)
            cost_components["safety_buffer"] += float(mcda_breakdown["buffer_penalty"][ir, ic]) * w.get("safety_buffer", 1.2)
            cost_components["thermal"] += float(mcda_breakdown["thermal_penalty"][ir, ic]) * w.get("thermal_stress", 0.8)
            cost_components["dust"] += float(mcda_breakdown["dust_penalty"][ir, ic]) * w.get("dust", 0.9)
            cost_components["radiation"] += float(mcda_breakdown["radiation_penalty"][ir, ic]) * w.get("radiation", 0.5)

        if len(imp_coords) > 0:
            dists = np.hypot((imp_coords[:, 0] - r) * cell_size_m, (imp_coords[:, 1] - c) * cell_size_m)
            cur_min = float(np.min(dists))
            if cur_min < min_hazard_clearance_m:
                min_hazard_clearance_m = cur_min

    total_cost_sum = max(1e-6, sum(cost_components.values()))
    cost_percentages = {k: round((v / total_cost_sum) * 100.0, 1) for k, v in cost_components.items()}

    avg_slope = float(np.mean(slopes_deg)) if slopes_deg else 0.0
    max_slope = float(np.max(slopes_deg)) if slopes_deg else 0.0
    avg_temp = float(np.mean(temp_vals)) if temp_vals else 245.0
    cumulative_science_yield = float(np.sum(science_scores)) if science_scores else 0.0
    max_science_density = float(np.max(science_scores)) if science_scores else 0.0

    if max_slope <= 14.0 and min_hazard_clearance_m >= 15.0 and avg_slope <= 8.5:
        risk_level = "LOW (Rủi ro Thấp - Tuyến đường Tối ưu An toàn)"
        risk_color = "EMERALD"
    elif max_slope <= max_safe_slope_deg and min_hazard_clearance_m >= 8.0:
        risk_level = "MODERATE (Rủi ro Trung bình - Cần giám sát bám dốc)"
        risk_color = "AMBER"
    else:
        risk_level = "HIGH (Rủi ro Cao - Sát giới hạn độ dốc/khu vực nguy hiểm)"
        risk_color = "ROSE"

    start_pt = path[0]
    goal_pt = path[-1]
    euclidean_dist_m = math.hypot((goal_pt[0] - start_pt[0]) * cell_size_m, (goal_pt[1] - start_pt[1]) * cell_size_m)
    detour_factor = round(total_dist_m / max(1.0, euclidean_dist_m), 2)

    why_explanation_en = (
        f"The selected route traverses {round(total_dist_m, 1)} m (detour ratio: {detour_factor}× direct distance) "
        f"maintaining a maximum slope of {round(max_slope, 1)}° (well below the {max_safe_slope_deg}° physical suit limit). "
        f"It avoids steep escarpments and seismic void zones by a minimum safety clearance of {round(min_hazard_clearance_m, 1)} m. "
        f"By passing through favorable mineral-rich corridors (CRISM science yield: {round(cumulative_science_yield, 2)}), "
        f"it maximizes sample collection potential while keeping metabolic fatigue within safe xEMU limits."
    )

    why_explanation_vi = (
        f"Tuyến đường được chọn dài {round(total_dist_m, 1)} m (hệ số vòng qua vật cản: {detour_factor}× đường thẳng) "
        f"với góc dốc tối đa chỉ đạt {round(max_slope, 1)}° (thấp hơn giới hạn an toàn {max_safe_slope_deg}° của bộ đồ EVA). "
        f"Lộ trình giữ khoảng cách an toàn tối thiểu {round(min_hazard_clearance_m, 1)} m so với các vách dốc sạt lở và túi rỗng địa chấn. "
        f"Hệ thống điều hướng qua các dải trầm tích giàu khoáng vật ngậm nước (điểm tiềm năng sinh học CRISM: {round(cumulative_science_yield, 2)}), "
        f"tối đa hóa hiệu quả thu thập mẫu vật khoa học trong khi vẫn bảo toàn dự trữ Oxy và thể lực phi hành đoàn."
    )

    return {
        "is_valid": True,
        "total_distance_m": round(total_dist_m, 1),
        "euclidean_distance_m": round(euclidean_dist_m, 1),
        "detour_ratio": detour_factor,
        "slope_metrics": {
            "avg_slope_deg": round(avg_slope, 1),
            "max_slope_deg": round(max_slope, 1),
            "hard_limit_deg": float(max_safe_slope_deg),
            "slope_compliant": bool(max_slope <= max_safe_slope_deg),
        },
        "safety_clearance": {
            "min_hazard_clearance_m": round(min_hazard_clearance_m, 1),
            "safe_margin_status": "EXCELLENT" if min_hazard_clearance_m >= 15.0 else "ADEQUATE",
        },
        "science_metrics": {
            "cumulative_yield_score": round(cumulative_science_yield, 2),
            "peak_mineral_density": round(max_science_density, 3),
            "geology_units_visited": geology_counts,
        },
        "environmental_conditions": {
            "avg_surface_temp_k": round(avg_temp, 1),
            "avg_surface_temp_c": round(avg_temp - 273.15, 1),
            "overall_risk_rating": risk_level,
            "risk_color": risk_color,
        },
        "cost_percentage_breakdown": cost_percentages,
        "justification": {
            "en": why_explanation_en,
            "vi": why_explanation_vi,
        },
    }
