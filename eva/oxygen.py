"""Mô-đun Ước tính tiêu thụ Oxy cơ sở (eva/oxygen.py)."""

import math
from typing import Sequence, Tuple, Dict, Any
from core.config import (
    DEFAULT_CELL_SIZE_M,
    DEFAULT_SPEED_M_S,
    DEFAULT_OXYGEN_RATE_L_MIN,
    MAX_SAFE_OXYGEN_L,
    RETURN_SAFETY_RESERVE_RATIO,
)


def compute_path_smoothness(path: Sequence[Tuple[float, float]]) -> Dict[str, float]:
    """
    Tính độ mượt quỹ đạo (dựa trên góc bẻ lái trung bình và tổng góc đổi hướng theo độ)
    để phục vụ đối sánh hiệu năng trên BenchmarkPanel.
    """
    if path is None or len(path) < 3:
        return {"total_turn_deg": 0.0, "avg_turn_deg": 0.0, "smoothness_score": 100.0}

    turn_angles = []
    for i in range(1, len(path) - 1):
        v1r = path[i][0] - path[i - 1][0]
        v1c = path[i][1] - path[i - 1][1]
        v2r = path[i + 1][0] - path[i][0]
        v2c = path[i + 1][1] - path[i][1]
        n1 = math.hypot(v1r, v1c)
        n2 = math.hypot(v2r, v2c)
        if n1 > 1e-6 and n2 > 1e-6:
            cos_theta = max(-1.0, min(1.0, (v1r * v2r + v1c * v2c) / (n1 * n2)))
            angle_deg = math.degrees(math.acos(cos_theta))
            turn_angles.append(angle_deg)

    if not turn_angles:
        return {"total_turn_deg": 0.0, "avg_turn_deg": 0.0, "smoothness_score": 100.0}

    total_turn = float(sum(turn_angles))
    avg_turn = total_turn / len(turn_angles)
    smoothness_score = max(0.0, min(100.0, 100.0 - avg_turn * 1.45))
    return {
        "total_turn_deg": round(total_turn, 2),
        "avg_turn_deg": round(avg_turn, 2),
        "smoothness_score": round(smoothness_score, 1),
    }


def estimate_oxygen(
    path: Sequence[Tuple[float, float]],
    cell_size_m: float = DEFAULT_CELL_SIZE_M,
    speed_m_s: float = DEFAULT_SPEED_M_S,
    oxygen_rate_l_min: float = DEFAULT_OXYGEN_RATE_L_MIN,
    max_oxygen_l: float = MAX_SAFE_OXYGEN_L,
) -> Dict[str, Any]:
    """
    Tính toán quãng đường, thời gian di chuyển và thể tích Oxy tiêu hao theo đúng đặc tả kế hoạch:
    - distance_cells = tổng khoảng cách Euclid giữa các điểm liên tiếp trên path
    - distance_m = distance_cells * cell_size_m
    - time_min = (distance_m / speed_m_s) / 60.0
    - oxygen_l = time_min * oxygen_rate_l_min
    """
    if path is None or len(path) == 0:
        raise ValueError("Path không được rỗng khi ước tính tiêu thụ Oxy.")
    if cell_size_m <= 0 or speed_m_s <= 0 or oxygen_rate_l_min <= 0:
        raise ValueError("Các tham số vật lý (cell_size_m, speed_m_s, oxygen_rate_l_min) phải dương.")

    distance_cells = 0.0
    for i in range(len(path) - 1):
        r0, c0 = path[i]
        r1, c1 = path[i + 1]
        distance_cells += math.hypot(r1 - r0, c1 - c0)

    distance_m = distance_cells * float(cell_size_m)
    time_min = (distance_m / float(speed_m_s)) / 60.0
    oxygen_l = time_min * float(oxygen_rate_l_min)

    remaining_l = max(0.0, max_oxygen_l - oxygen_l)
    oxygen_pct_used = (oxygen_l / max_oxygen_l) * 100.0 if max_oxygen_l > 0 else 0.0
    safe_limit_l = max_oxygen_l * (1.0 - RETURN_SAFETY_RESERVE_RATIO)
    safety_warning = oxygen_l > safe_limit_l

    smoothness = compute_path_smoothness(path)

    return {
        "distance_cells": round(float(distance_cells), 4),
        "distance_m": round(float(distance_m), 2),
        "time_min": round(float(time_min), 2),
        "oxygen_l": round(float(oxygen_l), 2),
        "oxygen_remaining_l": round(float(remaining_l), 2),
        "oxygen_used_pct": round(float(oxygen_pct_used), 1),
        "safety_warning": bool(safety_warning),
        "smoothness_score": smoothness["smoothness_score"],
        "avg_turn_deg": smoothness["avg_turn_deg"],
        "total_turn_deg": smoothness["total_turn_deg"],
    }
