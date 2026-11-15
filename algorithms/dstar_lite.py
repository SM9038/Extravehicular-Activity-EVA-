"""Thuật toán Tìm đường động — D* Lite (algorithms/dstar_lite.py)."""

import heapq
import math
import time
from typing import List, Tuple, Dict, Optional, Any
import numpy as np

Coord = Tuple[int, int]
EPSILON = 1e-6


def _values_differ(a: float, b: float) -> bool:
    if math.isinf(a) and math.isinf(b):
        return False
    if math.isinf(a) != math.isinf(b):
        return True
    return abs(a - b) > EPSILON


class DStarLitePlanner:
    """
    Cài đặt chuẩn thuật toán D* Lite (Koenig & Likhachev):
    - Tìm kiếm ngược từ goal về vị trí hiện tại s_start của phi hành gia.
    - Duy trì hai giá trị ước lượng tại mỗi nút: g(s) và rhs(s).
    - Khi xuất hiện bão bụi hoặc hố sụt mới làm thay đổi cục bộ ma trận chi phí,
      chỉ cập nhật lại các nút bị mất cân bằng (g != rhs) trong hàng đợi ưu tiên.
    """

    def __init__(self, cost_map: np.ndarray, start: Coord, goal: Coord, prevent_corner_cutting: bool = True):
        self.cost_map = np.array(cost_map, dtype=np.float64, copy=True)
        self.rows, self.cols = self.cost_map.shape
        self.s_start: Coord = (int(start[0]), int(start[1]))
        self.s_goal: Coord = (int(goal[0]), int(goal[1]))
        self.s_last: Coord = self.s_start
        self.km: float = 0.0
        self.prevent_corner_cutting = prevent_corner_cutting

        self.g: Dict[Coord, float] = {}
        self.rhs: Dict[Coord, float] = {}
        self.open_heap: List[Tuple[float, float, Coord]] = []
        self.in_queue: Dict[Coord, Tuple[float, float]] = {}
        self.expanded_nodes: int = 0

        self._neighbors = [
            (-1, 0, 1.0),
            (1, 0, 1.0),
            (0, -1, 1.0),
            (0, 1, 1.0),
            (-1, -1, math.sqrt(2.0)),
            (-1, 1, math.sqrt(2.0)),
            (1, -1, math.sqrt(2.0)),
            (1, 1, math.sqrt(2.0)),
        ]

        if self._is_valid_cell(self.s_goal) and np.isfinite(self.cost_map[self.s_goal]):
            self.rhs[self.s_goal] = 0.0
            key = self._calculate_key(self.s_goal)
            heapq.heappush(self.open_heap, (key[0], key[1], self.s_goal))
            self.in_queue[self.s_goal] = key

    def _is_valid_cell(self, s: Coord) -> bool:
        return 0 <= s[0] < self.rows and 0 <= s[1] < self.cols

    def _heuristic(self, a: Coord, b: Coord) -> float:
        return math.hypot(a[0] - b[0], a[1] - b[1])

    def _get_g(self, s: Coord) -> float:
        return self.g.get(s, float("inf"))

    def _get_rhs(self, s: Coord) -> float:
        return self.rhs.get(s, float("inf"))

    def _calculate_key(self, s: Coord) -> Tuple[float, float]:
        m = min(self._get_g(s), self._get_rhs(s))
        return (m + self._heuristic(self.s_start, s) + self.km, m)

    def _get_neighbors(self, s: Coord) -> List[Tuple[Coord, float]]:
        r, c = s
        result = []
        for dr, dc, dist in self._neighbors:
            nr, nc = r + dr, c + dc
            if 0 <= nr < self.rows and 0 <= nc < self.cols:
                result.append(((nr, nc), dist))
        return result

    def _edge_cost(self, u: Coord, v: Coord, dist: float) -> float:
        cu = float(self.cost_map[u])
        cv = float(self.cost_map[v])
        if not math.isfinite(cu) or not math.isfinite(cv):
            return float("inf")
        dr = v[0] - u[0]
        dc = v[1] - u[1]
        if self.prevent_corner_cutting and dr != 0 and dc != 0:
            if not math.isfinite(float(self.cost_map[u[0] + dr, u[1]])) or not math.isfinite(float(self.cost_map[u[0], u[1] + dc])):
                return float("inf")
        return dist * (cu + cv) / 2.0

    def _update_vertex(self, u: Coord) -> None:
        if u != self.s_goal:
            if not math.isfinite(float(self.cost_map[u])):
                self.rhs[u] = float("inf")
            else:
                min_rhs = float("inf")
                for s_prime, dist in self._get_neighbors(u):
                    c_uv = self._edge_cost(u, s_prime, dist)
                    val = c_uv + self._get_g(s_prime)
                    if val < min_rhs:
                        min_rhs = val
                self.rhs[u] = min_rhs

        if u in self.in_queue:
            del self.in_queue[u]

        if _values_differ(self._get_g(u), self._get_rhs(u)):
            k = self._calculate_key(u)
            if math.isfinite(k[0]):
                heapq.heappush(self.open_heap, (k[0], k[1], u))
                self.in_queue[u] = k

    def _top_key(self) -> Tuple[float, float]:
        while self.open_heap:
            k0, k1, u = self.open_heap[0]
            if self.in_queue.get(u) == (k0, k1):
                return (k0, k1)
            heapq.heappop(self.open_heap)
        return (float("inf"), float("inf"))

    def compute_shortest_path(self) -> int:
        """Lan truyền cập nhật trên hàng đợi ưu tiên cho đến khi s_start cân bằng và tối ưu."""
        nodes_processed = 0
        max_expansions = self.rows * self.cols * 16

        while nodes_processed < max_expansions:
            top_k = self._top_key()
            if not math.isfinite(top_k[0]):
                break
            start_k = self._calculate_key(self.s_start)
            if not (
                (top_k[0] < start_k[0] - EPSILON)
                or (abs(top_k[0] - start_k[0]) <= EPSILON and top_k[1] < start_k[1] - EPSILON)
                or _values_differ(self._get_rhs(self.s_start), self._get_g(self.s_start))
            ):
                break

            k0, k1, u = heapq.heappop(self.open_heap)
            if self.in_queue.get(u) != (k0, k1):
                continue
            del self.in_queue[u]

            nodes_processed += 1
            self.expanded_nodes += 1
            k_old = (k0, k1)
            k_new = self._calculate_key(u)

            if (k_old[0] < k_new[0] - EPSILON) or (abs(k_old[0] - k_new[0]) <= EPSILON and k_old[1] < k_new[1] - EPSILON):
                if math.isfinite(k_new[0]):
                    heapq.heappush(self.open_heap, (k_new[0], k_new[1], u))
                    self.in_queue[u] = k_new
            elif self._get_g(u) > self._get_rhs(u) + EPSILON:
                self.g[u] = self._get_rhs(u)
                for s_pred, _ in self._get_neighbors(u):
                    self._update_vertex(s_pred)
            else:
                self.g[u] = float("inf")
                self._update_vertex(u)
                for s_pred, _ in self._get_neighbors(u):
                    self._update_vertex(s_pred)

        return nodes_processed

    def extract_path(self) -> Optional[List[Coord]]:
        """Trích xuất lộ trình từ s_start tới s_goal theo gradient g(s)."""
        if not self._is_valid_cell(self.s_start) or not self._is_valid_cell(self.s_goal):
            return None
        if not math.isfinite(float(self.cost_map[self.s_start])) or not math.isfinite(float(self.cost_map[self.s_goal])):
            return None

        self.compute_shortest_path()
        if not math.isfinite(self._get_g(self.s_start)):
            return None

        path: List[Coord] = [self.s_start]
        curr = self.s_start
        visited = {curr}
        max_steps = self.rows * self.cols * 2

        for _ in range(max_steps):
            if curr == self.s_goal:
                return path
            best_next = None
            best_val = float("inf")
            for s_prime, dist in self._get_neighbors(curr):
                if s_prime in visited:
                    continue
                step_c = self._edge_cost(curr, s_prime, dist)
                val = step_c + self._get_g(s_prime)
                if val < best_val:
                    best_val = val
                    best_next = s_prime
            if best_next is None or not math.isfinite(best_val):
                return None
            curr = best_next
            visited.add(curr)
            path.append(curr)

        return None

    def update_environment(self, updated_cells: Dict[Coord, float], new_start: Optional[Coord] = None) -> Tuple[Optional[List[Coord]], Dict[str, Any]]:
        """
        Tái lập kế hoạch cục bộ khi cảm biến/WebSocket phát hiện bão bụi hoặc hố sụt mới.
        Chỉ cập nhật các nút bị ảnh hưởng thay vì tính lại toàn bộ bản đồ.
        """
        t0 = time.perf_counter()
        if new_start is not None:
            new_start = (int(new_start[0]), int(new_start[1]))
            self.km += self._heuristic(self.s_last, new_start)
            self.s_last = new_start
            self.s_start = new_start

        for cell, new_cost in updated_cells.items():
            r, c = int(cell[0]), int(cell[1])
            if 0 <= r < self.rows and 0 <= c < self.cols:
                self.cost_map[r, c] = new_cost

        for cell in updated_cells:
            r, c = int(cell[0]), int(cell[1])
            if 0 <= r < self.rows and 0 <= c < self.cols:
                self._update_vertex((r, c))
                for nb, _ in self._get_neighbors((r, c)):
                    self._update_vertex(nb)

        replan_nodes = self.compute_shortest_path()
        path = self.extract_path()
        cpu_ms = (time.perf_counter() - t0) * 1000.0
        stats = {
            "path_cost": float(self._get_g(self.s_start)) if path is not None else float("inf"),
            "replan_nodes": replan_nodes,
            "expanded_nodes": self.expanded_nodes,
            "cpu_time_ms": cpu_ms,
        }
        return path, stats


def dstar_lite_search(
    cost_map: np.ndarray,
    start: Coord,
    goal: Coord,
    prevent_corner_cutting: bool = True,
    return_stats: bool = False,
) -> Any:
    """Hàm gói tiện ích chạy D* Lite trên ma trận chi phí cost_map."""
    t0 = time.perf_counter()
    planner = DStarLitePlanner(cost_map, start, goal, prevent_corner_cutting=prevent_corner_cutting)
    path = planner.extract_path()
    cpu_ms = (time.perf_counter() - t0) * 1000.0
    stats = {
        "path_cost": float(planner._get_g(planner.s_start)) if path is not None else float("inf"),
        "expanded_nodes": planner.expanded_nodes,
        "cpu_time_ms": cpu_ms,
    }
    return (path, stats) if return_stats else path
