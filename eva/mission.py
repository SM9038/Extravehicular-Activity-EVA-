"""Mô-đun lập kế hoạch nhiệm vụ đa điểm nghiên cứu khoa học (eva/mission.py)."""

from typing import List, Tuple, Dict, Any, Optional
import numpy as np
from algorithms.astar import astar_search
from algorithms.fmm import fmm_search
from algorithms.dstar_lite import dstar_lite_search
from algorithms.field_dstar import field_dstar_search
from eva.oxygen import estimate_oxygen
from eva.energy import estimate_slope_dependent_eva
from core.config import (
    DEFAULT_CELL_SIZE_M,
    DEFAULT_SPEED_M_S,
    DEFAULT_OXYGEN_RATE_L_MIN,
    MAX_SAFE_OXYGEN_L,
    RETURN_SAFETY_RESERVE_RATIO,
)

Coord = Tuple[int, int]


def run_single_segment(
    algorithm: str,
    cost_map: np.ndarray,
    start: Coord,
    goal: Coord,
    danger: Optional[np.ndarray] = None,
) -> Tuple[Optional[List[Tuple[float, float]]], Dict[str, Any]]:
    algo = algorithm.lower().strip()
    if algo == "astar":
        return astar_search(cost_map, start, goal, return_stats=True)
    if algo == "fmm":
        return fmm_search(cost_map, start, goal, danger=danger, return_stats=True)
    if algo == "dstar_lite":
        return dstar_lite_search(cost_map, start, goal, return_stats=True)
    if algo == "field_dstar":
        return field_dstar_search(cost_map, start, goal, return_stats=True)
    raise ValueError(f"Thuật toán không hợp lệ: {algorithm}")


def plan_multi_waypoint_mission(
    algorithm: str,
    cost_map: np.ndarray,
    elevation: np.ndarray,
    roughness: np.ndarray,
    danger: np.ndarray,
    start: Coord,
    goal: Coord,
    waypoints: Optional[List[Coord]] = None,
    include_return_to_base: bool = False,
    cell_size_m: float = DEFAULT_CELL_SIZE_M,
    speed_m_s: float = DEFAULT_SPEED_M_S,
    oxygen_rate_l_min: float = DEFAULT_OXYGEN_RATE_L_MIN,
    max_oxygen_l: float = MAX_SAFE_OXYGEN_L,
    use_slope_energy_model: bool = False,
) -> Optional[Dict[str, Any]]:
    """
    Tính toán hành trình đi qua chuỗi các trạm khảo sát khoa học:
    start -> waypoint_1 -> waypoint_2 -> ... -> goal (-> start nếu include_return_to_base=True).
    Đồng thời kiểm tra ngưỡng Oxy dự phòng để quay về căn cứ an toàn.
    """
    stops: List[Coord] = [start]
    if waypoints:
        for wp in waypoints:
            stops.append((int(wp[0]), int(wp[1])))
    stops.append(goal)
    if include_return_to_base and stops[-1] != start:
        stops.append(start)

    full_path: List[Tuple[float, float]] = []
    total_path_cost = 0.0
    total_expanded = 0
    total_cpu_ms = 0.0
    legs_summary = []

    for i in range(len(stops) - 1):
        s_pt = stops[i]
        g_pt = stops[i + 1]
        seg_path, seg_stats = run_single_segment(algorithm, cost_map, s_pt, g_pt, danger=danger)
        if seg_path is None:
            return None

        if i == 0:
            full_path.extend([(float(p[0]), float(p[1])) for p in seg_path])
        else:
            full_path.extend([(float(p[0]), float(p[1])) for p in seg_path[1:]])

        total_path_cost += float(seg_stats["path_cost"])
        total_expanded += int(seg_stats["expanded_nodes"])
        total_cpu_ms += float(seg_stats["cpu_time_ms"])

        leg_o2 = estimate_oxygen(seg_path, cell_size_m, speed_m_s, oxygen_rate_l_min, max_oxygen_l)
        legs_summary.append(
            {
                "leg_index": i + 1,
                "from": list(s_pt),
                "to": list(g_pt),
                "distance_m": leg_o2["distance_m"],
                "time_min": leg_o2["time_min"],
                "oxygen_l": leg_o2["oxygen_l"],
                "path_cost": round(float(seg_stats["path_cost"]), 2),
            }
        )

    # Ước tính chi phí quay về căn cứ từ điểm cuối cùng (nếu chưa quay về)
    return_Check_path, _ = run_single_segment("astar", cost_map, stops[-1], start, danger=danger)
    return_oxygen_needed_l = 0.0
    if return_Check_path is not None and stops[-1] != start:
        ret_metrics = estimate_oxygen(return_Check_path, cell_size_m, speed_m_s, oxygen_rate_l_min, max_oxygen_l)
        return_oxygen_needed_l = ret_metrics["oxygen_l"]

    if use_slope_energy_model:
        telemetry = estimate_slope_dependent_eva(
            full_path,
            elevation=elevation,
            roughness=roughness,
            cell_size_m=cell_size_m,
            base_speed_m_s=speed_m_s,
            base_oxygen_rate_l_min=oxygen_rate_l_min,
            max_oxygen_l=max_oxygen_l,
        )
    else:
        telemetry = estimate_oxygen(
            full_path,
            cell_size_m=cell_size_m,
            speed_m_s=speed_m_s,
            oxygen_rate_l_min=oxygen_rate_l_min,
            max_oxygen_l=max_oxygen_l,
        )
        # Bổ sung hồ sơ độ cao cho biểu đồ Telemetry
        rows, cols = elevation.shape
        elev_profile = []
        cum_d = 0.0
        for idx, pt in enumerate(full_path):
            ir = max(0, min(rows - 1, int(round(pt[0]))))
            ic = max(0, min(cols - 1, int(round(pt[1]))))
            if idx > 0:
                import math
                cum_d += math.hypot(pt[0] - full_path[idx - 1][0], pt[1] - full_path[idx - 1][1]) * cell_size_m
            elev_profile.append(
                {
                    "step": idx,
                    "r": round(float(pt[0]), 2),
                    "c": round(float(pt[1]), 2),
                    "elevation_m": round(float(elevation[ir, ic]), 2),
                    "cumulative_dist_m": round(cum_d, 1),
                }
            )
        telemetry["elevation_profile"] = elev_profile
        telemetry["energy_kcal"] = round(telemetry["oxygen_l"] * 4.825, 1)

    total_required_with_return = telemetry["oxygen_l"] + return_oxygen_needed_l
    can_return_safely = total_required_with_return <= max_oxygen_l * (1.0 - RETURN_SAFETY_RESERVE_RATIO)

    return {
        "algorithm": algorithm,
        "path": [[round(float(p[0]), 3), round(float(p[1]), 3)] for p in full_path],
        "path_cost": round(total_path_cost, 3),
        "distance_cells": telemetry["distance_cells"],
        "distance_m": telemetry["distance_m"],
        "time_min": telemetry["time_min"],
        "oxygen_l": telemetry["oxygen_l"],
        "energy_kcal": telemetry.get("energy_kcal", round(telemetry["oxygen_l"] * 4.825, 1)),
        "oxygen_remaining_l": telemetry["oxygen_remaining_l"],
        "oxygen_used_pct": telemetry["oxygen_used_pct"],
        "return_oxygen_needed_l": round(return_oxygen_needed_l, 2),
        "can_return_safely": bool(can_return_safely),
        "safety_warning": bool(telemetry["safety_warning"] or not can_return_safely),
        "smoothness_score": telemetry["smoothness_score"],
        "avg_turn_deg": telemetry["avg_turn_deg"],
        "expanded_nodes": total_expanded,
        "cpu_time_ms": round(total_cpu_ms, 3),
        "legs": legs_summary,
        "elevation_profile": telemetry["elevation_profile"],
    }
