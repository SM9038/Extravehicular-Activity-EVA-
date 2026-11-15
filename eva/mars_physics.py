"""
Mô hình Sinh lý học & Cơ học Môi trường Sao Hỏa cho Phi hành gia EVA (eva/mars_physics.py).

Thiết lập hệ phương trình toán học liên kết chặt chẽ giữa:
1. Gia tốc trọng trường Sao Hỏa: g_Mars = 3.721 m/s^2 (so với g_Earth = 9.80665 m/s^2).
2. Khí quyển & Bão bụi Sao Hỏa:
   - Mật độ khí quyển cơ sở: rho_0 = 0.020 kg/m^3 (tăng theo độ mù quang học bão bụi tau_dust).
   - Vận tốc gió bão ngược chiều / ngang: v_wind (m/s).
   - Độ mù quang học của bụi: tau_dust in [0.0, 5.0] làm suy giảm tầm nhìn và tăng tải lọc PLSS.
3. Phương trình Vận tốc Thực tế (Modified Tobler-Minetti + Wind/Dust Attenuation):
   v_eff = v_target * exp(-2.8 * |G + 0.05|) * (1 - 0.38 * R) * exp(-0.12 * max(0, tau_dust - 0.5)) / (1 + 0.008 * v_wind)
4. Phương trình Công suất Trao đổi chất Trọng trường Sao Hỏa (Mars-Modified Pandolf-Santee-Minetti):
   P_met(v, G) = P_stand + P_loco(v^2) + P_grade(v, G) + P_wind(v, v_wind, tau_dust)
   Nhân với Hệ số Mệt mỏi Tích lũy khi đi bộ đường dài:
   F(d_cum) = 1.0 + gamma_fatigue * (d_cum / 1000.0)^1.35
5. Phương trình Lưu lượng Oxy Tiêu thụ (VO2 - L/phút):
   VO2(s) = (P_total(s) * 60 / 20200) * (1 + 0.025 * tau_dust)
   (Dựa trên đương lượng nhiệt Oxy chuẩn NASA JSC: 20.2 kJ / L O2 ở RQ = 0.85).
"""

import math
from dataclasses import dataclass
from typing import List, Tuple, Dict, Any, Optional
import numpy as np

G_MARS = 3.721       # m/s^2 (Trọng trường bề mặt Sao Hỏa chuẩn NASA)
G_EARTH = 9.80665    # m/s^2 (Trọng trường Trái Đất)
RHO_MARS_BASE = 0.020  # kg/m^3 (Mật độ khí quyển CO2 bề mặt Sao Hỏa)
O2_ENERGY_EQUIV_J_PER_L = 20200.0  # 20.2 kJ per Liter of O2 consumed (RQ = 0.85)


@dataclass
class MarsEnvironmentParams:
    """Thông số vật lý môi trường Sao Hỏa và bộ đồ vũ trụ xEMU."""
    gravity_m_s2: float = G_MARS          # Gia tốc trọng trường (m/s^2), mặc định Sao Hỏa = 3.721
    astronaut_mass_kg: float = 78.0       # Khối lượng cơ thể phi hành gia (kg)
    suit_mass_kg: float = 82.0            # Khối lượng bộ đồ áp suất EVA + PLSS (kg)
    target_speed_m_s: float = 1.1         # Vận tốc mục tiêu trên địa hình phẳng (m/s)
    wind_speed_m_s: float = 8.0           # Vận tốc gió bão bụi trên bề mặt (m/s, bão mạnh có thể lên 25-35 m/s)
    dust_optical_depth: float = 0.4       # Độ dày quang học bụi khí quyển tau (0.2: quang đãng, >1.5: bão bụi)
    suit_stiffness_factor: float = 1.25   # Hệ số cứng khớp của bộ đồ áp suất EVA (1.0 - 1.6)
    fatigue_coeff: float = 0.12           # Hệ số mệt mỏi tích lũy theo mỗi km đi bộ
    max_safe_vo2_l_min: float = 4.2       # Ngưỡng hấp thụ Oxy tối đa an toàn của phi hành gia (L/phút)


def compute_coupled_speed_and_oxygen_rate(
    grade: float,
    roughness: float,
    cumulative_distance_m: float,
    env: Optional[MarsEnvironmentParams] = None,
) -> Dict[str, float]:
    """
    Tính toán đồng thời vận tốc thực tế v_eff (m/s), công suất trao đổi chất P_total (Watt)
    và lưu lượng Oxy tiêu thụ tức thời VO2 (L/phút) tại một điểm trên quỹ đạo.
    """
    if env is None:
        env = MarsEnvironmentParams()

    g_ratio = env.gravity_m_s2 / G_EARTH
    m_body = max(40.0, env.astronaut_mass_kg)
    m_suit = max(20.0, env.suit_mass_kg)
    m_tot = m_body + m_suit
    rough = float(np.clip(roughness, 0.0, 1.0))
    tau = max(0.0, env.dust_optical_depth)
    v_wind = max(0.0, env.wind_speed_m_s)

    # 1. Vận tốc thực tế (Modified Tobler-Minetti + Suy giảm do bão bụi & gió)
    slope_factor = math.exp(-2.8 * abs(grade + 0.05))
    rough_factor = max(0.35, 1.0 - 0.38 * rough)
    dust_vis_factor = math.exp(-0.12 * max(0.0, tau - 0.5))
    wind_impedance = 1.0 / (1.0 + 0.008 * v_wind)

    v_eff = env.target_speed_m_s * slope_factor * rough_factor * dust_vis_factor * wind_impedance
    v_eff = max(0.20, min(2.20, v_eff))

    # 2. Hệ số cản bề mặt đất đá Sao Hỏa (Regolith terrain factor eta)
    eta = 1.0 + 1.2 * rough

    # 3. Công suất trao đổi chất cơ sở khi đứng giữ thăng bằng dưới trọng trường g_Mars (W)
    p_stand = (
        1.5 * m_body * g_ratio
        + 2.0 * m_tot * ((m_suit / m_body) ** 2) * g_ratio
    )

    # 4. Công suất động năng bước đi (tăng theo bình phương vận tốc v_eff^2 và quán tính khối lượng)
    # Trong trọng trường thấp, trọng lượng giảm theo g_ratio nhưng khối lượng quán tính m_tot không đổi
    gravity_loco_blend = 0.55 * g_ratio + 0.45
    p_loco = eta * env.suit_stiffness_factor * m_tot * gravity_loco_blend * (1.5 * (v_eff ** 2))

    # 5. Công suất thế năng trọng trường khi leo dốc / xuống dốc (Minetti-Santee)
    if grade >= 0.0:
        # Leo dốc: thắng trực tiếp trọng lực Sao Hỏa g_Mars với hiệu suất cơ học đồng tâm ~25%
        p_grade = (m_tot * env.gravity_m_s2 * v_eff * grade) / 0.25
    else:
        # Xuống dốc: cơ bắp hãm phanh lệch tâm (eccentric braking)
        abs_g = abs(grade)
        p_grade = m_tot * env.gravity_m_s2 * v_eff * abs_g * max(0.0, 0.32 * math.exp(-2.5 * abs_g) - 0.12)

    # 6. Công suất thắng lực cản khí quyển bão bụi & giữ thăng bằng trước gió giật Sao Hỏa
    rho_eff = RHO_MARS_BASE * (1.0 + 0.18 * tau)
    cd_area = 0.85  # Hệ số cản khí động * diện tích mặt cắt bộ đồ EVA (m^2)
    rel_v = v_eff + 0.7 * v_wind
    p_aero = (0.5 * rho_eff * cd_area * (rel_v ** 2) * v_eff) / 0.22
    p_wind_stabilize = 0.045 * (v_wind ** 2) * v_eff * eta
    p_wind = p_aero + p_wind_stabilize

    p_met_base = p_stand + p_loco + p_grade + p_wind

    # 7. Hệ số mệt mỏi tích lũy khi di chuyển quãng đường dài F(d_cum)
    dist_km = max(0.0, cumulative_distance_m) / 1000.0
    fatigue_multiplier = 1.0 + env.fatigue_coeff * (dist_km ** 1.35)

    p_total_watts = p_met_base * fatigue_multiplier

    # 8. Quy đổi sang Lưu lượng Oxy tiêu thụ VO2 (L/phút)
    # 1 L O2 = 20,200 J -> Công suất W (J/s) * 60 (s/min) / 20,200
    plss_dust_load = 1.0 + 0.025 * tau
    vo2_l_min = (p_total_watts * 60.0 / O2_ENERGY_EQUIV_J_PER_L) * plss_dust_load

    # Nếu VO2 vượt ngưỡng an toàn tối đa, phi hành gia buộc phải giảm tốc độ (Governor feedback)
    if vo2_l_min > env.max_safe_vo2_l_min and v_eff > 0.25:
        scale_down = math.sqrt(env.max_safe_vo2_l_min / vo2_l_min)
        v_eff = max(0.22, v_eff * scale_down)
        p_loco = eta * env.suit_stiffness_factor * m_tot * gravity_loco_blend * (1.5 * (v_eff ** 2))
        if grade >= 0.0:
            p_grade = (m_tot * env.gravity_m_s2 * v_eff * grade) / 0.25
        p_total_watts = (p_stand + p_loco + p_grade + p_wind) * fatigue_multiplier
        vo2_l_min = (p_total_watts * 60.0 / O2_ENERGY_EQUIV_J_PER_L) * plss_dust_load

    return {
        "effective_speed_m_s": round(v_eff, 3),
        "metabolic_power_watts": round(p_total_watts, 1),
        "oxygen_rate_l_min": round(vo2_l_min, 3),
        "fatigue_multiplier": round(fatigue_multiplier, 3),
        "p_stand_w": round(p_stand, 1),
        "p_loco_w": round(p_loco, 1),
        "p_grade_w": round(p_grade, 1),
        "p_wind_w": round(p_wind, 1),
    }


def simulate_mars_eva_trajectory_physics(
    path: List[Tuple[float, float]],
    elevation: np.ndarray,
    roughness: np.ndarray,
    cell_size_m: float = 10.0,
    env: Optional[MarsEnvironmentParams] = None,
    initial_cumulative_dist_m: float = 0.0,
) -> Dict[str, Any]:
    """
    Tích phân toàn bộ lộ trình đi bộ trên Sao Hỏa theo mô hình Vật lý - Sinh lý học kết hợp.
    Trả về hồ sơ chi tiết từng bước (profile), tổng thời gian, tổng Oxy, tổng năng lượng kcal,
    và đường cong quan hệ Vận tốc - Oxy.
    """
    if env is None:
        env = MarsEnvironmentParams()

    if not path or len(path) < 2:
        return {
            "distance_cells": 0.0,
            "distance_m": 0.0,
            "time_min": 0.0,
            "oxygen_l": 0.0,
            "energy_kcal": 0.0,
            "avg_speed_m_s": env.target_speed_m_s,
            "avg_oxygen_rate_l_min": 0.0,
            "peak_oxygen_rate_l_min": 0.0,
            "peak_metabolic_watts": 0.0,
            "final_fatigue_factor": 1.0,
            "profile": [],
        }

    rows, cols = elevation.shape
    cum_dist_m = initial_cumulative_dist_m
    seg_dist_cells = 0.0
    total_time_min = 0.0
    total_oxygen_l = 0.0
    total_energy_joules = 0.0
    peak_vo2 = 0.0
    peak_watts = 0.0
    profile: List[Dict[str, float]] = []

    for i in range(len(path) - 1):
        r0, c0 = path[i]
        r1, c1 = path[i + 1]
        ir0 = int(np.clip(round(r0), 0, rows - 1))
        ic0 = int(np.clip(round(c0), 0, cols - 1))
        ir1 = int(np.clip(round(r1), 0, rows - 1))
        ic1 = int(np.clip(round(c1), 0, cols - 1))

        step_cells = math.hypot(r1 - r0, c1 - c0)
        step_m = step_cells * cell_size_m
        if step_m <= 1e-6:
            continue

        z0 = float(elevation[ir0, ic0])
        z1 = float(elevation[ir1, ic1])
        grade = (z1 - z0) / step_m
        local_rough = 0.5 * (float(roughness[ir0, ic0]) + float(roughness[ir1, ic1]))

        phys = compute_coupled_speed_and_oxygen_rate(
            grade=grade,
            roughness=local_rough,
            cumulative_distance_m=cum_dist_m,
            env=env,
        )

        v_eff = phys["effective_speed_m_s"]
        vo2_rate = phys["oxygen_rate_l_min"]
        watts = phys["metabolic_power_watts"]

        step_time_s = step_m / v_eff
        step_time_min = step_time_s / 60.0
        step_o2_l = step_time_min * vo2_rate

        seg_dist_cells += step_cells
        cum_dist_m += step_m
        total_time_min += step_time_min
        total_oxygen_l += step_o2_l
        total_energy_joules += watts * step_time_s
        peak_vo2 = max(peak_vo2, vo2_rate)
        peak_watts = max(peak_watts, watts)

        profile.append({
            "step": i + 1,
            "dist_m": round(cum_dist_m - initial_cumulative_dist_m, 1),
            "elev_m": round(z1, 2),
            "grade_pct": round(grade * 100.0, 1),
            "speed_m_s": v_eff,
            "vo2_l_min": vo2_rate,
            "power_watts": watts,
            "cum_o2_l": round(total_oxygen_l, 2),
            "fatigue": phys["fatigue_multiplier"],
        })

    total_dist_m = seg_dist_cells * cell_size_m
    avg_speed = (total_dist_m / (total_time_min * 60.0)) if total_time_min > 1e-6 else env.target_speed_m_s
    avg_vo2 = (total_oxygen_l / total_time_min) if total_time_min > 1e-6 else 0.0
    energy_kcal = total_energy_joules / 4184.0

    return {
        "distance_cells": round(seg_dist_cells, 3),
        "distance_m": round(total_dist_m, 2),
        "time_min": round(total_time_min, 2),
        "oxygen_l": round(total_oxygen_l, 2),
        "energy_kcal": round(energy_kcal, 1),
        "avg_speed_m_s": round(avg_speed, 3),
        "avg_oxygen_rate_l_min": round(avg_vo2, 3),
        "peak_oxygen_rate_l_min": round(peak_vo2, 3),
        "peak_metabolic_watts": round(peak_watts, 1),
        "final_fatigue_factor": profile[-1]["fatigue"] if profile else 1.0,
        "profile": profile,
    }
