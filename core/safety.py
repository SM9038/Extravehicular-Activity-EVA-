"""Mô-đun thiết lập vùng đệm an toàn quanh khu vực nguy hiểm (core/safety.py)."""

import numpy as np
try:
    from scipy.ndimage import distance_transform_edt
except ImportError:
    # Pure-Python/NumPy 2-pass Euclidean distance transform fallback when scipy is not installed
    def distance_transform_edt(input_array: np.ndarray) -> np.ndarray:
        rows, cols = input_array.shape
        dist = np.full((rows, cols), np.inf, dtype=np.float64)
        dist[~input_array] = 0.0
        # Pass 1: top-left to bottom-right
        for r in range(rows):
            for c in range(cols):
                if dist[r, c] > 0:
                    min_d = dist[r, c]
                    if r > 0: min_d = min(min_d, dist[r-1, c] + 1.0)
                    if c > 0: min_d = min(min_d, dist[r, c-1] + 1.0)
                    if r > 0 and c > 0: min_d = min(min_d, dist[r-1, c-1] + 1.41421356)
                    if r > 0 and c + 1 < cols: min_d = min(min_d, dist[r-1, c+1] + 1.41421356)
                    dist[r, c] = min_d
        # Pass 2: bottom-right to top-left
        for r in range(rows - 1, -1, -1):
            for c in range(cols - 1, -1, -1):
                if dist[r, c] > 0:
                    min_d = dist[r, c]
                    if r + 1 < rows: min_d = min(min_d, dist[r+1, c] + 1.0)
                    if c + 1 < cols: min_d = min(min_d, dist[r, c+1] + 1.0)
                    if r + 1 < rows and c + 1 < cols: min_d = min(min_d, dist[r+1, c+1] + 1.41421356)
                    if r + 1 < rows and c > 0: min_d = min(min_d, dist[r+1, c-1] + 1.41421356)
                    dist[r, c] = min_d
        return dist

from core.config import SAFETY_BUFFER_RADIUS_CELLS, SAFETY_WEIGHT


def compute_safety_distance_field(danger: np.ndarray) -> np.ndarray:
    """
    Tính trường khoảng cách Euclid từ mỗi ô an toàn đến ô nguy hiểm (bão bụi, hố sụt, vách đá) gần nhất.
    Các ô nằm trong vùng nguy hiểm có khoảng cách bằng 0.0.
    """
    dng = np.asarray(danger, dtype=bool)
    if not np.any(dng):
        return np.full(dng.shape, np.inf, dtype=np.float64)
    return distance_transform_edt(~dng)


def compute_safety_penalty(
    danger: np.ndarray,
    buffer_radius: float = SAFETY_BUFFER_RADIUS_CELLS,
    weight: float = SAFETY_WEIGHT,
) -> np.ndarray:
    """
    Tạo trường lực đẩy tự nhiên (safety buffer penalty) tăng dần khi tiến gần mép hố sụt hoặc rìa tâm bão bụi.
    Giúp lộ trình duy trì hành lang đệm an toàn thay vì đi sát mép vực.
    """
    dist_field = compute_safety_distance_field(danger)
    penalty = np.zeros_like(dist_field, dtype=np.float64)

    mask = (dist_field > 0) & (dist_field < buffer_radius)
    # Hàm suy giảm bình phương trơn tru khi lại gần vùng cấm
    normalized = (buffer_radius - dist_field[mask]) / buffer_radius
    penalty[mask] = weight * (normalized ** 2) * 3.5
    penalty[np.asarray(danger, dtype=bool)] = np.inf
    return penalty


def build_fmm_speed_field(
    cost_map: np.ndarray,
    danger: np.ndarray,
    buffer_radius: float = SAFETY_BUFFER_RADIUS_CELLS,
) -> np.ndarray:
    """
    Xây dựng trường vận tốc truyền sóng F(x, y) cho phương trình Eikonal |∇T| * F = 1.
    Tốc độ truyền sóng F giảm dần khi tiếp cận mép hố sụt hoặc rìa tâm bão bụi, và F = 0 tại vùng cấm.
    """
    dist_field = compute_safety_distance_field(danger)
    safe_scale = np.ones_like(cost_map, dtype=np.float64)
    near_hazard = (dist_field > 0) & (dist_field < buffer_radius)
    safe_scale[near_hazard] = 0.25 + 0.75 * (dist_field[near_hazard] / buffer_radius) ** 1.5

    speed = np.zeros_like(cost_map, dtype=np.float64)
    valid = np.isfinite(cost_map) & (~np.asarray(danger, dtype=bool))
    speed[valid] = safe_scale[valid] / np.maximum(cost_map[valid], 1e-6)
    return speed
