"""Mô-đun tính toán ma trận chi phí địa hình đa lớp & kiểm soát an toàn góc dốc (core/cost_map.py)."""

import math
from typing import Tuple, Dict, Any, Optional, Sequence
import numpy as np
from core.config import (
    BASE_COST,
    SLOPE_WEIGHT,
    ROUGHNESS_WEIGHT,
    MAX_SAFE_SLOPE_DEG,
    MARS_EQUATORIAL_RADIUS_M,
)


def convert_planetary_deg_to_meters(
    dlat_deg: float,
    dlon_deg: float,
    center_lat_deg: float = 0.0,
    planet_radius_m: float = MARS_EQUATORIAL_RADIUS_M,
) -> Tuple[float, float]:
    """
    Chuyển đổi độ phân giải góc kinh/vĩ độ (degrees/pixel) trên bề mặt hình cầu Sao Hỏa (IAU 2015)
    sang kích thước vật lý thực tế (dy_m, dx_m) tính bằng mét.
    Tuyệt đối không đánh đồng độ kinh/vĩ độ với mét.
    """
    if dlat_deg <= 0 or dlon_deg <= 0:
        raise ValueError("Độ phân giải góc dlat_deg và dlon_deg phải lớn hơn 0.")
    lat_rad = math.radians(max(-89.5, min(89.5, center_lat_deg)))
    dy_m = planet_radius_m * math.radians(dlat_deg)
    dx_m = planet_radius_m * math.radians(dlon_deg) * math.cos(lat_rad)
    return float(dy_m), float(max(1e-3, dx_m))


def compute_slope(
    elevation: np.ndarray,
    cell_size_m: float = 1.0,
    cell_size_y_m: Optional[float] = None,
    cell_size_x_m: Optional[float] = None,
) -> np.ndarray:
    """
    Tính toán đạo hàm độ cao bậc nhất gx = dz/dx, gy = dz/dy và độ dốc không thứ nguyên
    |∇z| = tan(theta) tại từng ô theo kích thước vật lý của ô lưới (m).
    """
    elev = np.asarray(elevation, dtype=np.float64)
    dy = float(cell_size_y_m if cell_size_y_m is not None else cell_size_m)
    dx = float(cell_size_x_m if cell_size_x_m is not None else cell_size_m)
    if dy <= 0 or dx <= 0:
        raise ValueError("cell_size_m (dy, dx) phải lớn hơn 0")
    gy, gx = np.gradient(elev, dy, dx)
    slope = np.hypot(gx, gy)
    return slope


def compute_slope_degrees(
    elevation: np.ndarray,
    cell_size_m: float = 1.0,
    cell_size_y_m: Optional[float] = None,
    cell_size_x_m: Optional[float] = None,
) -> np.ndarray:
    """Tính góc nghiêng địa hình thực tế theta = arctan(|∇z|) theo đơn vị độ (degrees)."""
    slope_tan = compute_slope(
        elevation,
        cell_size_m=cell_size_m,
        cell_size_y_m=cell_size_y_m,
        cell_size_x_m=cell_size_x_m,
    )
    return np.degrees(np.arctan(slope_tan))


def build_cost_map(
    elevation: np.ndarray,
    roughness: np.ndarray,
    danger: np.ndarray,
    cell_size_m: float = 1.0,
    safety_penalty: Optional[np.ndarray] = None,
    max_safe_slope_deg: Optional[float] = None,
    nodata_mask: Optional[np.ndarray] = None,
    cell_size_y_m: Optional[float] = None,
    cell_size_x_m: Optional[float] = None,
) -> np.ndarray:
    """
    Xây dựng ma trận chi phí di chuyển qua mỗi ô:
      cost = 1.0 + 2.0 * slope + 1.5 * roughness (+ safety_penalty nếu có)
    Kiểm soát an toàn khoa học:
    - Phân biệt hình phạt chi phí (cost penalty khi góc dốc <= max_safe_slope_deg)
      với điều kiện cấm cứng (cost = np.inf khi góc dốc > max_safe_slope_deg).
    - Khóa hoàn toàn các ô danger=True, các ô thiếu dữ liệu (nodata_mask=True),
      và các ô có giá trị không hữu hạn (NaN/Inf).
    """
    elev = np.asarray(elevation, dtype=np.float64)
    rough = np.asarray(roughness, dtype=np.float64)
    dng = np.asarray(danger, dtype=bool).copy()

    if elev.shape != rough.shape or elev.shape != dng.shape:
        raise ValueError("Ba ma trận elevation, roughness và danger phải có cùng kích thước.")

    # Xử lý các ô không hữu hạn (NaN/Inf) trong dữ liệu đầu vào
    invalid_mask = ~np.isfinite(elev) | ~np.isfinite(rough)
    if nodata_mask is not None:
        invalid_mask = invalid_mask | np.asarray(nodata_mask, dtype=bool)

    if np.any(invalid_mask):
        elev_clean = elev.copy()
        valid_vals = elev_clean[~invalid_mask]
        fill_val = float(np.median(valid_vals)) if valid_vals.size > 0 else 0.0
        elev_clean[invalid_mask] = fill_val
        dng = dng | invalid_mask
    else:
        elev_clean = elev

    slope = compute_slope(
        elev_clean,
        cell_size_m=cell_size_m,
        cell_size_y_m=cell_size_y_m,
        cell_size_x_m=cell_size_x_m,
    )

    # Kiểm soát ngưỡng góc dốc an toàn tối đa (MAX_SAFE_SLOPE_DEG) nếu được kích hoạt
    if max_safe_slope_deg is not None and max_safe_slope_deg > 0:
        slope_deg = np.degrees(np.arctan(slope))
        steep_prohibited = slope_deg > float(max_safe_slope_deg)
        dng = dng | steep_prohibited

    cost = BASE_COST + SLOPE_WEIGHT * slope + ROUGHNESS_WEIGHT * rough
    if safety_penalty is not None:
        cost = cost + np.asarray(safety_penalty, dtype=np.float64)

    cost = np.clip(cost, 1.0, None)
    cost[dng] = np.inf
    return cost


def validate_path_slope_safety(
    path: Sequence[Tuple[float, float]],
    elevation: np.ndarray,
    cell_size_m: float = 10.0,
    max_safe_slope_deg: float = MAX_SAFE_SLOPE_DEG,
    nodata_mask: Optional[np.ndarray] = None,
) -> Dict[str, Any]:
    """
    Kiểm tra độc lập tính hợp lệ vật lý của một lộ trình EVA:
    - Xác định góc dốc cục bộ tại từng ô và góc dốc dọc theo từng đoạn bước đi.
    - Phát hiện mọi vi phạm vượt ngưỡng max_safe_slope_deg hoặc đi vào vùng NODATA.
    """
    if not path or len(path) == 0:
        return {
            "is_safe": False,
            "max_cell_slope_deg": 0.0,
            "max_step_slope_deg": 0.0,
            "threshold_deg": float(max_safe_slope_deg),
            "violations_count": 0,
            "violating_steps": [],
            "nodata_violations": 0,
        }

    elev = np.asarray(elevation, dtype=np.float64)
    rows, cols = elev.shape
    slope_deg_grid = compute_slope_degrees(elev, cell_size_m=max(1e-3, cell_size_m))

    max_cell_deg = 0.0
    max_step_deg = 0.0
    violating_steps = []
    nodata_hits = 0

    for i, pt in enumerate(path):
        ir = max(0, min(rows - 1, int(round(pt[0]))))
        ic = max(0, min(cols - 1, int(round(pt[1]))))
        c_deg = float(slope_deg_grid[ir, ic])
        max_cell_deg = max(max_cell_deg, c_deg)

        if nodata_mask is not None and bool(nodata_mask[ir, ic]):
            nodata_hits += 1

        if c_deg > max_safe_slope_deg:
            violating_steps.append({
                "step": i,
                "cell": [ir, ic],
                "cell_slope_deg": round(c_deg, 2),
                "reason": f"Góc dốc ô {c_deg:.2f}° vượt ngưỡng {max_safe_slope_deg:.1f}°",
            })

        if i < len(path) - 1:
            nxt = path[i + 1]
            nr = max(0, min(rows - 1, int(round(nxt[0]))))
            nc = max(0, min(cols - 1, int(round(nxt[1]))))
            dist_m = math.hypot(nxt[0] - pt[0], nxt[1] - pt[1]) * cell_size_m
            if dist_m > 1e-6:
                dz = abs(float(elev[nr, nc]) - float(elev[ir, ic]))
                step_deg = math.degrees(math.atan(dz / dist_m))
                max_step_deg = max(max_step_deg, step_deg)
                if step_deg > max_safe_slope_deg:
                    violating_steps.append({
                        "step": i,
                        "cell": [nr, nc],
                        "step_slope_deg": round(step_deg, 2),
                        "reason": f"Độ dốc bước chuyển tiếp {step_deg:.2f}° vượt ngưỡng {max_safe_slope_deg:.1f}°",
                    })

    return {
        "is_safe": len(violating_steps) == 0 and nodata_hits == 0,
        "max_cell_slope_deg": round(max_cell_deg, 2),
        "max_step_slope_deg": round(max_step_deg, 2),
        "threshold_deg": float(max_safe_slope_deg),
        "violations_count": len(violating_steps),
        "violating_steps": violating_steps[:10],
        "nodata_violations": nodata_hits,
    }


def generate_mvp_synthetic_terrain(rows: int = 50, cols: int = 50, seed: int = 42) -> Dict[str, np.ndarray]:
    """
    Khởi tạo địa hình lưới giả lập (50x50 ô) cho Giai đoạn 1 (MVP)
    với vùng nguy hiểm cố định danger[20:30, 20:30] = True theo đúng kế hoạch.
    """
    rng = np.random.default_rng(seed)
    r_idx, c_idx = np.meshgrid(np.linspace(0, 1, rows), np.linspace(0, 1, cols), indexing="ij")

    elevation = (
        12.0 * np.sin(2.5 * np.pi * r_idx) * np.cos(2.0 * np.pi * c_idx)
        + 8.0 * np.exp(-((r_idx - 0.35) ** 2 + (c_idx - 0.70) ** 2) / 0.03)
        + 6.0 * np.exp(-((r_idx - 0.75) ** 2 + (c_idx - 0.25) ** 2) / 0.04)
        + 25.0
    )

    roughness = 0.25 + 0.35 * (
        0.5 * (1.0 + np.sin(5.0 * np.pi * r_idx + 1.2) * np.cos(4.0 * np.pi * c_idx))
    ) + 0.08 * rng.random((rows, cols))
    roughness = np.clip(roughness, 0.05, 1.0)

    danger = np.zeros((rows, cols), dtype=bool)
    r_start, r_end = min(20, rows), min(30, rows)
    c_start, c_end = min(20, cols), min(30, cols)
    danger[r_start:r_end, c_start:c_end] = True

    return {
        "elevation": elevation,
        "roughness": roughness,
        "danger": danger,
    }
