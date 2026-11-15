"""Mô-đun Năng lượng & Sinh lý học phụ thuộc độ dốc thực tế trên Sao Hỏa (eva/energy.py)."""

import math
from typing import Sequence, Tuple, Dict, Any
import numpy as np
from core.config import (
    DEFAULT_CELL_SIZE_M,
    DEFAULT_SPEED_M_S,
    DEFAULT_OXYGEN_RATE_L_MIN,
    DEFAULT_ASTRONAUT_MASS_KG,
    MARS_GRAVITY_M_S2,
    MAX_SAFE_OXYGEN_L,
    RETURN_SAFETY_RESERVE_RATIO,
)
from eva.oxygen import compute_path_smoothness


def estimate_slope_dependent_eva(
    path: Sequence[Tuple[float, float]],
    elevation: np.ndarray,
    roughness: np.ndarray,
    cell_size_m: float = DEFAULT_CELL_SIZE_M,
    base_speed_m_s: float = DEFAULT_SPEED_M_S,
    base_oxygen_rate_l_min: float = DEFAULT_OXYGEN_RATE_L_MIN,
    astronaut_mass_kg: float = DEFAULT_ASTRONAUT_MASS_KG,
    max_oxygen_l: float = MAX_SAFE_OXYGEN_L,
) -> Dict[str, Any]:
    """
    Mô hình sinh lý học nâng cao (Giai đoạn 4):
    - Vận tốc di chuyển thực tế giảm theo hàm Tobler/NASA EVA khi leo dốc hoặc đi qua vùng cát lún.
    - Công suất trao đổi chất (Watts) và lưu lượng thở Oxy (lít/phút) biến thiên theo góc dốc vật lý
      và trọng trường Sao Hỏa (g = 3.721 m/s^2).
    """
    if path is None or len(path) == 0:
        raise ValueError("Path không được rỗng.")

    rows, cols = elevation.shape
    total_dist_cells = 0.0
    total_dist_m = 0.0
    total_time_min = 0.0
    total_oxygen_l = 0.0
    total_energy_kcal = 0.0
    max_slope_deg = 0.0

    elevation_profile = []
    for idx, pt in enumerate(path):
        ir = max(0, min(rows - 1, int(round(pt[0]))))
        ic = max(0, min(cols - 1, int(round(pt[1]))))
        elevation_profile.append(
            {
                "step": idx,
                "r": round(float(pt[0]), 2),
                "c": round(float(pt[1]), 2),
                "elevation_m": round(float(elevation[ir, ic]), 2),
                "cumulative_dist_m": round(total_dist_m, 1),
            }
        )
        if idx < len(path) - 1:
            nxt = path[idx + 1]
            nr = max(0, min(rows - 1, int(round(nxt[0]))))
            nc = max(0, min(cols - 1, int(round(nxt[1]))))

            seg_cells = math.hypot(nxt[0] - pt[0], nxt[1] - pt[1])
            seg_m = seg_cells * cell_size_m
            if seg_m <= 1e-9:
                continue

            dz = float(elevation[nr, nc]) - float(elevation[ir, ic])
            grade = dz / seg_m
            slope_deg = abs(math.degrees(math.atan(grade)))
            max_slope_deg = max(max_slope_deg, slope_deg)

            local_rough = 0.5 * (float(roughness[ir, ic]) + float(roughness[nr, nc]))

            # Vận tốc giảm khi leo dốc hoặc đi vào bề mặt gồ ghề/cát lún
            slope_factor = math.exp(-2.2 * abs(grade + 0.03))
            rough_factor = max(0.45, 1.0 - 0.35 * local_rough)
            seg_speed = max(0.25, base_speed_m_s * slope_factor * rough_factor)

            seg_time_s = seg_m / seg_speed
            seg_time_min = seg_time_s / 60.0

            # Lưu lượng thở Oxy tăng khi leo dốc dương (dz > 0) và trên địa hình cát lún
            uphill_grade = max(0.0, grade)
            downhill_grade = max(0.0, -grade)
            metabolic_multiplier = (
                1.0
                + 3.6 * uphill_grade
                + 0.8 * downhill_grade
                + 0.45 * local_rough
                + 0.002 * max(0.0, astronaut_mass_kg - 110.0) * (MARS_GRAVITY_M_S2 / 9.81)
            )
            seg_o2_rate = base_oxygen_rate_l_min * metabolic_multiplier
            seg_o2_l = seg_time_min * seg_o2_rate

            # 1 lít O2 tiêu thụ tương đương ~4.825 kcal năng lượng trao đổi chất
            seg_kcal = seg_o2_l * 4.825

            total_dist_cells += seg_cells
            total_dist_m += seg_m
            total_time_min += seg_time_min
            total_oxygen_l += seg_o2_l
            total_energy_kcal += seg_kcal

    remaining_l = max(0.0, max_oxygen_l - total_oxygen_l)
    safe_limit_l = max_oxygen_l * (1.0 - RETURN_SAFETY_RESERVE_RATIO)
    safety_warning = total_oxygen_l > safe_limit_l
    smoothness = compute_path_smoothness(path)

    return {
        "distance_cells": round(total_dist_cells, 4),
        "distance_m": round(total_dist_m, 2),
        "time_min": round(total_time_min, 2),
        "oxygen_l": round(total_oxygen_l, 2),
        "energy_kcal": round(total_energy_kcal, 1),
        "oxygen_remaining_l": round(remaining_l, 2),
        "oxygen_used_pct": round((total_oxygen_l / max_oxygen_l) * 100.0, 1) if max_oxygen_l > 0 else 0.0,
        "max_slope_deg": round(max_slope_deg, 2),
        "safety_warning": bool(safety_warning),
        "smoothness_score": smoothness["smoothness_score"],
        "avg_turn_deg": smoothness["avg_turn_deg"],
        "total_turn_deg": smoothness["total_turn_deg"],
        "elevation_profile": elevation_profile,
    }
