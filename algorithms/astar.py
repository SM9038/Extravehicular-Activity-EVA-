"""Thuật toán A* 8 hướng làm chuẩn đối chiếu (algorithms/astar.py)."""

import heapq
import math
import time
from typing import List, Tuple, Optional, Dict, Any
import numpy as np

Coord = Tuple[int, int]
Point = Tuple[float, float]


def heuristic(p: Point, goal: Point) -> float:
    """Khoảng cách Euclid từ điểm p tới đích goal."""
    return math.hypot(p[0] - goal[0], p[1] - goal[1])


def astar_search(
    cost_map: np.ndarray,
    start: Coord,
    goal: Coord,
    prevent_corner_cutting: bool = True,
    return_stats: bool = False,
) -> Any:
    """
    Tìm đường đi ngắn nhất trên lưới 8 hướng bằng thuật toán A*.
    - Chi phí bước chuyển tiếp: step = distance * (cost[r, c] + cost[nr, nc]) / 2.0
    - Chống cắt góc chéo qua khe hẹp giữa hai ô vật cản (prevent_corner_cutting=True).
    - Trả về danh sách tọa độ [(r, c), ...] hoặc None nếu không tìm được đường đi an toàn.
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
        path = [(sr, sc)]
        stats = {"path_cost": 0.0, "expanded_nodes": 1, "cpu_time_ms": (time.perf_counter() - t0) * 1000.0}
        return (path, stats) if return_stats else path

    neighbors = [
        (-1, 0, 1.0),
        (1, 0, 1.0),
        (0, -1, 1.0),
        (0, 1, 1.0),
        (-1, -1, math.sqrt(2.0)),
        (-1, 1, math.sqrt(2.0)),
        (1, -1, math.sqrt(2.0)),
        (1, 1, math.sqrt(2.0)),
    ]

    open_heap: List[Tuple[float, float, Coord]] = []
    heapq.heappush(open_heap, (heuristic((sr, sc), (gr, gc)), 0.0, (sr, sc)))

    g_score: Dict[Coord, float] = {(sr, sc): 0.0}
    came_from: Dict[Coord, Coord] = {}
    closed = set()
    expanded_nodes = 0

    while open_heap:
        f_val, current_g, current = heapq.heappop(open_heap)
        if current in closed:
            continue
        closed.add(current)
        expanded_nodes += 1

        if current == (gr, gc):
            path: List[Coord] = [current]
            while current in came_from:
                current = came_from[current]
                path.append(current)
            path.reverse()
            cpu_ms = (time.perf_counter() - t0) * 1000.0
            stats = {
                "path_cost": float(g_score[(gr, gc)]),
                "expanded_nodes": expanded_nodes,
                "cpu_time_ms": cpu_ms,
            }
            return (path, stats) if return_stats else path

        r, c = current
        c_curr = float(cost_map[r, c])

        for dr, dc, dist in neighbors:
            nr, nc = r + dr, c + dc
            if not (0 <= nr < rows and 0 <= nc < cols):
                continue
            c_next = float(cost_map[nr, nc])
            if not math.isfinite(c_next):
                continue

            # Điều kiện chống cắt góc chéo qua khe hẹp giữa hai ô vật cản
            if prevent_corner_cutting and dr != 0 and dc != 0:
                if not math.isfinite(float(cost_map[r + dr, c])) or not math.isfinite(float(cost_map[r, c + dc])):
                    continue

            step = dist * (c_curr + c_next) / 2.0
            tentative_g = current_g + step

            if tentative_g < g_score.get((nr, nc), float("inf")):
                g_score[(nr, nc)] = tentative_g
                came_from[(nr, nc)] = current
                f_next = tentative_g + heuristic((nr, nc), (gr, gc))
                heapq.heappush(open_heap, (f_next, tentative_g, (nr, nc)))

    cpu_ms = (time.perf_counter() - t0) * 1000.0
    return (None, {"path_cost": float("inf"), "expanded_nodes": expanded_nodes, "cpu_time_ms": cpu_ms}) if return_stats else None
