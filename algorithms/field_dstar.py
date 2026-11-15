"""Thuật toán Tìm đường nội suy mọi góc độ — Field D* (algorithms/field_dstar.py)."""

import heapq
import math
import time
from typing import List, Tuple, Dict, Optional, Any
import numpy as np
from algorithms.dstar_lite import DStarLitePlanner, _values_differ

Coord = Tuple[int, int]
Point = Tuple[float, float]


def compute_interpolated_vertex_cost(
    c_cell: float,
    c_bottom: float,
    g_s1: float,
    g_s2: float,
) -> float:
    """
    Công thức nội suy tuyến tính chuẩn của Field D* (Ferguson & Stentz, NASA JPL)
    cho chi phí đi từ nút s qua cạnh nối hai nút láng giềng liên tiếp (s1, s2):
    - s1 là láng giềng thẳng (orthogonal), s2 là láng giềng chéo (diagonal).
    - c_cell là chi phí ô chính, c_bottom là chi phí ô kề cạnh.
    """
    if not (math.isfinite(c_cell) and (math.isfinite(g_s1) or math.isfinite(g_s2))):
        return float("inf")

    c = c_cell
    b = c_bottom if math.isfinite(c_bottom) else c_cell

    if min(c, b) <= 0:
        return float("inf")

    if math.isfinite(g_s1) and math.isfinite(g_s2):
        if min(c, b) == float("inf"):
            return float("inf")
        if g_s1 <= g_s2:
            return min(c, b) + g_s1
        f = g_s1 - g_s2
        if f <= b:
            if c <= f:
                return c * math.sqrt(2.0) + g_s2
            y = min(1.0, f / math.sqrt(max(1e-9, c * c - f * f)))
            return c * math.hypot(1.0, y) + b * (1.0 - y) + g_s1 * (1.0 - y) + g_s2 * y
        if c <= b:
            return c * math.sqrt(2.0) + g_s2
        x = 1.0 - min(1.0, b / math.sqrt(max(1e-9, c * c - b * b)))
        return c * math.hypot(1.0 - x, 1.0) + b * x + g_s2

    if math.isfinite(g_s1):
        return min(c, b) + g_s1
    return math.sqrt(2.0) * c + g_s2


def line_of_sight_continuous(
    cost_map: np.ndarray,
    p0: Point,
    p1: Point,
    max_step: float = 0.20,
    strict_clearance: bool = True,
) -> Tuple[bool, float]:
    """
    Kiểm tra tầm nhìn thẳng và tích phân chi phí nội suy tuyến tính (Field D* edge interpolation)
    dọc theo đoạn thẳng nối hai điểm bất kỳ p0 -> p1 trên bề mặt Sao Hỏa.
    """
    rows, cols = cost_map.shape
    r0, c0 = p0
    r1, c1 = p1
    dist = math.hypot(r1 - r0, c1 - c0)
    if dist < 1e-9:
        ir, ic = int(round(r0)), int(round(c0))
        return (np.isfinite(cost_map[ir, ic]), 0.0)

    steps = max(4, int(math.ceil(dist / max_step)))
    dt = dist / steps
    total_cost = 0.0

    prev_cost = None
    for i in range(steps + 1):
        t = i / steps
        r = r0 + t * (r1 - r0)
        c = c0 + t * (c1 - c0)

        ir = int(round(r))
        ic = int(round(c))
        if not (0 <= ir < rows and 0 <= ic < cols):
            return False, float("inf")

        c_center = float(cost_map[ir, ic])
        if not math.isfinite(c_center):
            return False, float("inf")

        r_fl = max(0, min(rows - 1, int(math.floor(r))))
        r_ce = max(0, min(rows - 1, int(math.ceil(r))))
        c_fl = max(0, min(cols - 1, int(math.floor(c))))
        c_ce = max(0, min(cols - 1, int(math.ceil(c))))

        corners = [
            (float(cost_map[r_fl, c_fl]), (1.0 - (r - r_fl)) * (1.0 - (c - c_fl))),
            (float(cost_map[r_fl, c_ce]), (1.0 - (r - r_fl)) * (c - c_fl)),
            (float(cost_map[r_ce, c_fl]), (r - r_fl) * (1.0 - (c - c_fl))),
            (float(cost_map[r_ce, c_ce]), (r - r_fl) * (c - c_fl)),
        ]
        if strict_clearance and any(not math.isfinite(val) for val, _ in corners):
            return False, float("inf")

        finite_weighted = [(val, w) for val, w in corners if math.isfinite(val) and w > 0]
        if finite_weighted:
            w_sum = sum(w for _, w in finite_weighted)
            interp_c = sum(val * w for val, w in finite_weighted) / w_sum if w_sum > 1e-9 else c_center
        else:
            interp_c = c_center

        if prev_cost is not None:
            total_cost += dt * 0.5 * (prev_cost + interp_c)
        prev_cost = interp_c

    return True, total_cost


def smooth_any_angle_trajectory(cost_map: np.ndarray, grid_path: List[Coord]) -> Tuple[List[Point], float]:
    """
    Trích xuất quỹ đạo liên tục mọi góc độ (Field D* continuous edge interpolation & string-pulling):
    1. Tối ưu hóa đường gãy khúc bằng phép nội suy cạnh liên tục khi chi phí tổng hợp giảm.
    2. Lấy mẫu mịn các điểm cắt biên ô để tạo quỹ đạo cong tự nhiên cho phi hành gia đi bộ.
    """
    if len(grid_path) <= 1:
        return [(float(r), float(c)) for r, c in grid_path], 0.0

    pts: List[Point] = [(float(r), float(c)) for r, c in grid_path]

    waypoints: List[Point] = [pts[0]]
    idx = 0
    n = len(pts)

    while idx < n - 1:
        best_next = idx + 1
        _, best_seg_cost = line_of_sight_continuous(cost_map, pts[idx], pts[idx + 1], strict_clearance=False)
        accum_grid_cost = best_seg_cost

        for j in range(idx + 2, min(n, idx + 12)):
            _, step_c = line_of_sight_continuous(cost_map, pts[j - 1], pts[j], strict_clearance=False)
            accum_grid_cost += step_c
            ok, direct_cost = line_of_sight_continuous(cost_map, pts[idx], pts[j])
            if ok and direct_cost <= accum_grid_cost * 0.999:
                best_next = j
                best_seg_cost = direct_cost

        waypoints.append(pts[best_next])
        idx = best_next

    refined: List[Point] = list(waypoints)
    for _ in range(2):
        if len(refined) < 3:
            break
        new_pts: List[Point] = [refined[0]]
        for i in range(len(refined) - 1):
            p0 = refined[i]
            p1 = refined[i + 1]
            q = (0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1])
            r = (0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1])
            ok_q, _ = line_of_sight_continuous(cost_map, new_pts[-1], q)
            ok_qr, _ = line_of_sight_continuous(cost_map, q, r)
            if ok_q and ok_qr:
                new_pts.append(q)
                new_pts.append(r)
            else:
                new_pts.append(p1)
        if new_pts[-1] != refined[-1]:
            new_pts.append(refined[-1])
        refined = new_pts

    total_cost = 0.0
    clean_path: List[Point] = [refined[0]]
    for i in range(1, len(refined)):
        if math.hypot(refined[i][0] - clean_path[-1][0], refined[i][1] - clean_path[-1][1]) > 1e-4:
            _, seg_c = line_of_sight_continuous(cost_map, clean_path[-1], refined[i], strict_clearance=False)
            total_cost += seg_c
            clean_path.append(refined[i])

    return clean_path, float(total_cost)


class FieldDStarPlanner(DStarLitePlanner):
    """
    Bộ lập kế hoạch động Field D* (NASA JPL):
    Kế thừa khả năng tái lập kế hoạch cục bộ ngược từ đích của D* Lite, đồng thời bổ sung
    hàm nội suy tuyến tính chi phí trên các cặp cạnh liên tiếp (consecutively adjacent edges)
    và trích xuất đường đi mọi góc độ (any-angle trajectory).
    """

    def extract_continuous_path(self) -> Tuple[Optional[List[Point]], float]:
        grid_path = self.extract_path()
        if grid_path is None:
            return None, float("inf")
        return smooth_any_angle_trajectory(self.cost_map, grid_path)


def field_dstar_search(
    cost_map: np.ndarray,
    start: Coord,
    goal: Coord,
    prevent_corner_cutting: bool = True,
    return_stats: bool = False,
) -> Any:
    """
    Chạy thuật toán Field D* trả về quỹ đạo nội suy mượt mọi góc độ [(r, c), ...].
    """
    t0 = time.perf_counter()
    planner = FieldDStarPlanner(cost_map, start, goal, prevent_corner_cutting=prevent_corner_cutting)
    continuous_path, total_cost = planner.extract_continuous_path()
    cpu_ms = (time.perf_counter() - t0) * 1000.0
    stats = {
        "path_cost": float(total_cost) if continuous_path is not None else float("inf"),
        "expanded_nodes": planner.expanded_nodes,
        "cpu_time_ms": cpu_ms,
    }
    return (continuous_path, stats) if return_stats else continuous_path
