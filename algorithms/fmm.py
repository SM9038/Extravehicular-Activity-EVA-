"""Phương pháp Tiến bước nhanh — Fast Marching Method / FMM (algorithms/fmm.py)."""

import heapq
import math
import time
from typing import List, Tuple, Optional, Dict, Any
import numpy as np
from core.safety import build_fmm_speed_field, compute_safety_penalty
from algorithms.astar import astar_search

Coord = Tuple[int, int]
Point = Tuple[float, float]


def solve_eikonal_fmm(speed_field: np.ndarray, source: Coord) -> np.ndarray:
    """
    Giải phương trình vi phân truyền sóng Eikonal |∇T| * F = 1 trên lưới 2D
    bằng thuật toán Fast Marching Method (Upwind scheme + Narrow Band Min-Heap).
    Trả về ma trận trường thời gian đến T(r, c) từ nguồn source.
    """
    rows, cols = speed_field.shape
    sr, sc = int(source[0]), int(source[1])

    T = np.full((rows, cols), np.inf, dtype=np.float64)
    state = np.zeros((rows, cols), dtype=np.int8)  # 0: Far, 1: Narrow Band, 2: Frozen

    if not (0 <= sr < rows and 0 <= sc < cols) or speed_field[sr, sc] <= 0:
        return T

    T[sr, sc] = 0.0
    heap: List[Tuple[float, int, int]] = [(0.0, sr, sc)]
    state[sr, sc] = 1

    ortho = [(-1, 0), (1, 0), (0, -1), (0, 1)]

    def update_eikonal_node(r: int, c: int) -> float:
        f_val = float(speed_field[r, c])
        if f_val <= 1e-9:
            return float("inf")
        inv_f = 1.0 / f_val

        t_vert = min(
            T[r - 1, c] if r > 0 else np.inf,
            T[r + 1, c] if r + 1 < rows else np.inf,
        )
        t_horiz = min(
            T[r, c - 1] if c > 0 else np.inf,
            T[r, c + 1] if c + 1 < cols else np.inf,
        )

        a = min(t_vert, t_horiz)
        b = max(t_vert, t_horiz)

        if not math.isfinite(a):
            return float("inf")

        if not math.isfinite(b) or (b - a) >= inv_f:
            return a + inv_f

        disc = 2.0 * (inv_f ** 2) - (b - a) ** 2
        if disc < 0:
            return a + inv_f
        return 0.5 * (a + b + math.sqrt(disc))

    while heap:
        t_val, r, c = heapq.heappop(heap)
        if state[r, c] == 2:
            continue
        state[r, c] = 2

        for dr, dc in ortho:
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and state[nr, nc] != 2 and speed_field[nr, nc] > 1e-9:
                new_t = update_eikonal_node(nr, nc)
                if new_t < T[nr, nc]:
                    T[nr, nc] = new_t
                    state[nr, nc] = 1
                    heapq.heappush(heap, (new_t, nr, nc))

    return T


def fmm_search(
    cost_map: np.ndarray,
    start: Coord,
    goal: Coord,
    danger: Optional[np.ndarray] = None,
    buffer_radius: float = 4.0,
    return_stats: bool = False,
) -> Any:
    """
    Tìm lộ trình an toàn bằng Fast Marching Method (FMM / FM²):
    1. Xây dựng trường vận tốc an toàn F(x, y) giảm dần gần mép hố sụt/bão bụi.
    2. Giải phương trình Eikonal |∇T| * F = 1 từ điểm start để thu được trường T(x, y).
    3. Trích xuất quỹ đạo mượt trượt ngược hướng gradient (-∇T) từ goal về start.
    """
    t0 = time.perf_counter()
    rows, cols = cost_map.shape
    sr, sc = int(start[0]), int(start[1])
    gr, gc = int(goal[0]), int(goal[1])

    if not (0 <= sr < rows and 0 <= sc < cols and 0 <= gr < rows and 0 <= gc < cols):
        return (None, {"path_cost": float("inf"), "expanded_nodes": 0, "cpu_time_ms": 0.0}) if return_stats else None

    if not np.isfinite(cost_map[sr, sc]) or not np.isfinite(cost_map[gr, gc]):
        return (None, {"path_cost": float("inf"), "expanded_nodes": 0, "cpu_time_ms": 0.0}) if return_stats else None

    if (sr, sc) == (gr, gc):
        path = [(float(sr), float(sc))]
        stats = {"path_cost": 0.0, "expanded_nodes": 1, "cpu_time_ms": (time.perf_counter() - t0) * 1000.0}
        return (path, stats) if return_stats else path

    if danger is None:
        danger = ~np.isfinite(cost_map)

    speed_field = build_fmm_speed_field(cost_map, danger, buffer_radius=buffer_radius)
    T = solve_eikonal_fmm(speed_field, (sr, sc))
    expanded_nodes = int(np.sum(np.isfinite(T)))

    if not np.isfinite(T[gr, gc]):
        cpu_ms = (time.perf_counter() - t0) * 1000.0
        return (None, {"path_cost": float("inf"), "expanded_nodes": expanded_nodes, "cpu_time_ms": cpu_ms}) if return_stats else None

    # Trích xuất quỹ đạo liên tục bằng Gradient Descent trên trường thời gian đến T
    curr_r, curr_c = float(gr), float(gc)
    path_continuous: List[Point] = [(curr_r, curr_c)]
    step_size = 0.45
    max_iters = rows * cols * 4

    neighbors_8 = [
        (-1, 0), (1, 0), (0, -1), (0, 1),
        (-1, -1), (-1, 1), (1, -1), (1, 1),
    ]

    converged = False
    for _ in range(max_iters):
        if math.hypot(curr_r - sr, curr_c - sc) <= 0.75:
            path_continuous.append((float(sr), float(sc)))
            converged = True
            break

        ir = int(round(curr_r))
        ic = int(round(curr_c))
        ir = max(0, min(rows - 1, ir))
        ic = max(0, min(cols - 1, ic))

        # Tính vector gradient cục bộ từ các ô lân cận hữu hạn
        t_up = T[ir - 1, ic] if ir > 0 and np.isfinite(T[ir - 1, ic]) else T[ir, ic]
        t_down = T[ir + 1, ic] if ir + 1 < rows and np.isfinite(T[ir + 1, ic]) else T[ir, ic]
        t_left = T[ir, ic - 1] if ic > 0 and np.isfinite(T[ir, ic - 1]) else T[ir, ic]
        t_right = T[ir, ic + 1] if ic + 1 < cols and np.isfinite(T[ir, ic + 1]) else T[ir, ic]

        grad_r = (t_down - t_up) * 0.5
        grad_c = (t_right - t_left) * 0.5
        norm = math.hypot(grad_r, grad_c)

        next_r, next_c = curr_r, curr_c
        if norm > 1e-6:
            cand_r = curr_r - step_size * (grad_r / norm)
            cand_c = curr_c - step_size * (grad_c / norm)
            cr = max(0, min(rows - 1, int(round(cand_r))))
            cc = max(0, min(cols - 1, int(round(cand_c))))
            if np.isfinite(cost_map[cr, cc]) and T[cr, cc] <= T[ir, ic] + 1e-3:
                next_r, next_c = cand_r, cand_c
            else:
                norm = 0.0

        if norm <= 1e-6:
            # Fallback trượt theo ô lân cận có T nhỏ nhất
            best_t = T[ir, ic]
            best_nb = None
            for dr, dc in neighbors_8:
                nr, nc = ir + dr, ic + dc
                if 0 <= nr < rows and 0 <= nc < cols and np.isfinite(T[nr, nc]):
                    if dr != 0 and dc != 0:
                        if not np.isfinite(cost_map[ir + dr, ic]) or not np.isfinite(cost_map[ir, ic + dc]):
                            continue
                    if T[nr, nc] < best_t:
                        best_t = T[nr, nc]
                        best_nb = (float(nr), float(nc))
            if best_nb is None:
                break
            next_r, next_c = best_nb

        curr_r, curr_c = next_r, next_c
        if math.hypot(curr_r - path_continuous[-1][0], curr_c - path_continuous[-1][1]) >= 0.25:
            path_continuous.append((curr_r, curr_c))

    if not converged:
        # Đảm bảo hội tụ tuyệt đối bằng A* trên bản đồ chi phí đã cộng trường đệm an toàn FMM
        penalty = compute_safety_penalty(danger, buffer_radius=buffer_radius)
        safe_cost = np.where(np.isfinite(cost_map), cost_map + penalty, np.inf)
        fallback = astar_search(safe_cost, start, goal, prevent_corner_cutting=True, return_stats=False)
        if fallback is None:
            cpu_ms = (time.perf_counter() - t0) * 1000.0
            return (None, {"path_cost": float("inf"), "expanded_nodes": expanded_nodes, "cpu_time_ms": cpu_ms}) if return_stats else None
        path_continuous = [(float(r), float(c)) for r, c in fallback]
    else:
        path_continuous.reverse()

    # Tính tổng chi phí địa hình dọc theo quỹ đạo FMM
    total_cost = 0.0
    for i in range(len(path_continuous) - 1):
        r0, c0 = path_continuous[i]
        r1, c1 = path_continuous[i + 1]
        d = math.hypot(r1 - r0, c1 - c0)
        ir0, ic0 = max(0, min(rows - 1, int(round(r0)))), max(0, min(cols - 1, int(round(c0))))
        ir1, ic1 = max(0, min(rows - 1, int(round(r1)))), max(0, min(cols - 1, int(round(c1))))
        total_cost += d * (float(cost_map[ir0, ic0]) + float(cost_map[ir1, ic1])) * 0.5

    cpu_ms = (time.perf_counter() - t0) * 1000.0
    stats = {
        "path_cost": float(total_cost),
        "expanded_nodes": expanded_nodes,
        "cpu_time_ms": cpu_ms,
    }
    return (path_continuous, stats) if return_stats else path_continuous
