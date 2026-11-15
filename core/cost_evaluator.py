"""
Unified Terrain Cost Evaluator & Signed-Slope Directional Cost Model (Python)
Matches geospatial/terrain_cost_evaluator.js exactly.
"""

import math
import numpy as np

MARS_RADIUS_M = 3396190.0
MARS_GRAVITY = 3.721
EARTH_GRAVITY = 9.80665
GRAVITY_RATIO = MARS_GRAVITY / EARTH_GRAVITY

SAFETY_CLASSES = {
    'SAFE': 'SAFE',
    'CAUTION': 'CAUTION',
    'UNSAFE': 'UNSAFE',
    'UNKNOWN': 'UNKNOWN',
    'FLAT': 'FLAT'
}

OPTIMIZATION_PROFILES = {
    'min_risk': {
        'name': 'Minimum Risk',
        'weights': {'safety': 4.5, 'slope': 3.0, 'elevation': 1.5, 'distance': 0.8, 'energy': 0.8}
    },
    'balanced': {
        'name': 'Balanced Exploration',
        'weights': {'safety': 2.5, 'slope': 2.0, 'elevation': 2.0, 'distance': 1.5, 'energy': 1.5}
    },
    'min_energy': {
        'name': 'Minimum Energy',
        'weights': {'safety': 2.0, 'slope': 3.5, 'elevation': 2.5, 'distance': 1.0, 'energy': 4.5}
    },
    'min_distance': {
        'name': 'Minimum Distance',
        'weights': {'safety': 1.5, 'slope': 1.0, 'elevation': 0.5, 'distance': 5.0, 'energy': 0.5}
    }
}

def grid_to_geo(r, c, rows=360, cols=720):
    lat = 90.0 - (r / rows) * 180.0
    lon = ((c / cols) * 360.0 + 360.0) % 360.0
    return lat, lon

def geo_to_grid(lat, lon, rows=360, cols=720):
    norm_lon = ((lon % 360) + 360) % 360
    c = (norm_lon / 360.0) * cols
    r = ((90.0 - lat) / 180.0) * rows
    return r, c

def compute_planetary_distance_meters(lat1, lon1, lat2, lon2):
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    dlam = ((dlam + math.pi) % (2.0 * math.pi)) - math.pi
    a = (math.sin(dphi * 0.5) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(dlam * 0.5) ** 2))
    c = 2.0 * math.atan2(math.sqrt(max(0.0, min(1.0, a))), math.sqrt(max(0.0, 1.0 - a)))
    return MARS_RADIUS_M * c

def sample_bilinear_elevation(grid, rows, cols, r, c, no_data=-9999.0):
    if grid is None or len(grid) == 0:
        return 0.0, False
    clr = max(0.0, min(float(rows - 1), float(r)))
    norm_c = float((c % cols + cols) % cols)
    r0 = int(math.floor(clr))
    r1 = min(rows - 1, r0 + 1)
    c0 = int(math.floor(norm_c))
    c1 = (c0 + 1) % cols
    u = norm_c - c0
    v = clr - r0

    z00 = float(grid[r0 * cols + c0])
    z10 = float(grid[r0 * cols + c1])
    z01 = float(grid[r1 * cols + c0])
    z11 = float(grid[r1 * cols + c1])

    if any(math.isnan(z) or math.isinf(z) or z <= no_data + 1.0 for z in (z00, z10, z01, z11)):
        return z00, False

    elev = (1.0 - u) * (1.0 - v) * z00 + u * (1.0 - v) * z10 + (1.0 - u) * v * z01 + u * v * z11
    return elev, True

def sample_bilinear_slope(slope_grid, elev_grid, rows, cols, r, c):
    if slope_grid is not None and len(slope_grid) > 0:
        clr = max(0.0, min(float(rows - 1), float(r)))
        norm_c = float((c % cols + cols) % cols)
        r0 = int(math.floor(clr))
        r1 = min(rows - 1, r0 + 1)
        c0 = int(math.floor(norm_c))
        c1 = (c0 + 1) % cols
        u = norm_c - c0
        v = clr - r0

        s00 = float(slope_grid[r0 * cols + c0])
        s10 = float(slope_grid[r0 * cols + c1])
        s01 = float(slope_grid[r1 * cols + c0])
        s11 = float(slope_grid[r1 * cols + c1])

        if all(math.isfinite(s) for s in (s00, s10, s01, s11)):
            s = (1.0 - u) * (1.0 - v) * s00 + u * (1.0 - v) * s10 + (1.0 - u) * v * s01 + u * v * s11
            return max(0.0, s)

    return 0.0

def calculate_signed_slope(z_u, z_v, d_xy, no_data=-9999.0):
    if (z_u is None or z_v is None or d_xy is None or
        not math.isfinite(z_u) or not math.isfinite(z_v) or not math.isfinite(d_xy) or
        z_u <= no_data + 1.0 or z_v <= no_data + 1.0 or d_xy < 0.0):
        return {
            'valid': False,
            'status': 'UNKNOWN',
            'safety_class': 'UNKNOWN',
            'delta_z': float('nan'),
            'horizontal_distance_m': d_xy,
            'slope_ratio': float('nan'),
            'signed_slope_deg': float('nan'),
            'abs_slope_deg': float('nan'),
            'direction': 'UNKNOWN',
            'is_near_flat': False
        }

    delta_z = float(z_v) - float(z_u)
    if d_xy <= 1e-3:
        return {
            'valid': True,
            'status': 'SAFE',
            'safety_class': 'SAFE',
            'delta_z': 0.0,
            'horizontal_distance_m': 0.0,
            'slope_ratio': 0.0,
            'signed_slope_deg': 0.0,
            'abs_slope_deg': 0.0,
            'direction': 'FLAT',
            'is_near_flat': True
        }

    eff_dist = max(0.25, float(d_xy))
    slope_ratio = delta_z / eff_dist
    signed_slope_deg = math.degrees(math.atan(slope_ratio))
    abs_slope_deg = abs(signed_slope_deg)
    direction = 'UPHILL' if signed_slope_deg > 1e-9 else ('DOWNHILL' if signed_slope_deg < -1e-9 else 'FLAT')

    return {
        'valid': True,
        'status': 'SAFE',
        'delta_z': delta_z,
        'horizontal_distance_m': float(d_xy),
        'slope_ratio': slope_ratio,
        'signed_slope_deg': signed_slope_deg,
        'abs_slope_deg': abs_slope_deg,
        'direction': direction,
        'is_near_flat': abs_slope_deg <= 1.0 + 1e-9
    }

def evaluate_directional_slope_cost(signed_slope_deg, max_slope_deg=22.0, theta_ref_ratio=0.4, theta_ref_deg=None, strict_safe_only=False):
    theta_max = max(1.0, float(max_slope_deg)) if (max_slope_deg is not None and math.isfinite(max_slope_deg) and max_slope_deg > 0) else 22.0
    theta_max_up = theta_max
    theta_max_down = 0.75 * theta_max
    theta_ref = float(theta_ref_deg) if (theta_ref_deg is not None and theta_ref_deg > 0) else (theta_ref_ratio * theta_max)
    theta_ref_down = 0.5 * theta_ref

    if signed_slope_deg is None or not math.isfinite(signed_slope_deg):
        return {
            'valid': False,
            'traversable': False,
            'status': 'UNKNOWN',
            'safety_class': 'UNKNOWN',
            'slope_class': 'UNKNOWN',
            'cost_multiplier': float('inf'),
            'signed_slope_deg': float('nan'),
            'theta_max_up': theta_max_up,
            'theta_max_down': theta_max_down,
            'theta_ref': theta_ref
        }

    eps = 1e-9
    theta = float(signed_slope_deg)
    abs_theta = abs(theta)
    is_near_flat = abs_theta <= 1.0 + eps
    direction = 'UPHILL' if theta > eps else ('DOWNHILL' if theta < -eps else 'FLAT')

    if theta >= 0.0:
        if theta <= theta_ref + eps:
            clamped = min(theta, theta_ref)
            cost_mult = 1.0 + (clamped / max(1e-6, theta_ref))
            safety_class = 'SAFE'
            slope_class = 'FLAT' if is_near_flat else 'SAFE'
            status = 'SAFE'
            traversable = True
        elif theta <= theta_max_up + eps:
            denom = max(1e-6, theta_max_up - theta_ref)
            p = max(0.0, min(1.0, (theta - theta_ref) / denom))
            cost_mult = 2.0 + 4.0 * p + 6.0 * (p ** 2)
            safety_class = 'CAUTION'
            slope_class = 'CAUTION'
            status = 'CAUTION'
            traversable = not strict_safe_only
        else:
            cost_mult = float('inf')
            safety_class = 'UNSAFE'
            slope_class = 'UNSAFE'
            status = 'REJECT_EDGE'
            traversable = False
    else:
        if abs_theta <= theta_ref_down + eps:
            clamped_abs = min(abs_theta, theta_ref_down)
            cost_mult = 1.0 - 0.25 * (clamped_abs / max(1e-6, theta_ref_down))
            safety_class = 'SAFE'
            slope_class = 'FLAT' if is_near_flat else 'SAFE'
            status = 'SAFE'
            traversable = True
        elif abs_theta <= theta_max_down + eps:
            denom = max(1e-6, theta_max_down - theta_ref_down)
            q = max(0.0, min(1.0, (abs_theta - theta_ref_down) / denom))
            cost_mult = 0.75 + 5.0 * (q ** 2)
            safety_class = 'CAUTION'
            slope_class = 'CAUTION'
            status = 'CAUTION'
            traversable = not strict_safe_only
        else:
            cost_mult = float('inf')
            safety_class = 'UNSAFE'
            slope_class = 'UNSAFE'
            status = 'REJECT_EDGE'
            traversable = False

    return {
        'valid': True,
        'traversable': traversable,
        'status': status,
        'safety_class': safety_class,
        'slope_class': slope_class,
        'cost_multiplier': cost_mult,
        'signed_slope_deg': theta,
        'abs_slope_deg': abs_theta,
        'direction': direction,
        'is_near_flat': is_near_flat,
        'theta_max_up': theta_max_up,
        'theta_max_down': theta_max_down,
        'theta_ref': theta_ref,
        'theta_ref_down': theta_ref_down
    }

def estimate_transition_energy(dist_m, dz_m, max_slope_deg, mass_kg=135.0, speed_ms=1.1):
    if dist_m <= 0.0:
        return 0.0
    gradient = max(-0.6, min(0.6, dz_m / dist_m))
    i = gradient
    earth_cost = 280.5 * (i**5) - 58.7 * (i**4) - 218.4 * (i**3) + 43.3 * (i**2) + 9.6 * i + 1.88
    mars_cost = max(1.1, earth_cost * (0.38 + 0.62 * GRAVITY_RATIO))
    return mars_cost * mass_kg * dist_m

def evaluate_terrain_transition(from_r, from_c, to_r, to_c, elev_grid, slope_grid, rows=360, cols=720,
                                 max_safe_slope=22.0, allow_caution=True, weights=None, mass_kg=135.0):
    weights = weights or OPTIMIZATION_PROFILES['min_risk']['weights']
    from_lat, from_lon = grid_to_geo(from_r, from_c, rows, cols)
    to_lat, to_lon = grid_to_geo(to_r, to_c, rows, cols)

    ground_dist_m = compute_planetary_distance_meters(from_lat, from_lon, to_lat, to_lon)
    if ground_dist_m <= 1e-3:
        return {
            'traversable': True,
            'safety_class': 'SAFE',
            'slope_class': 'FLAT',
            'cost': 0.0,
            'cost_multiplier': 1.0,
            'dist_m': 0.0,
            'signed_slope_deg': 0.0
        }

    dc = to_c - from_c
    if dc > cols * 0.5: dc -= cols
    if dc < -cols * 0.5: dc += cols
    dr = to_r - from_r

    grid_dist = math.hypot(dr, dc)
    sample_steps = max(3, min(9, int(math.ceil(grid_dist * 3.0))))

    max_local_slope_deg = 0.0
    sum_local_slope_deg = 0.0
    has_nodata = False

    elev_start, ok1 = sample_bilinear_elevation(elev_grid, rows, cols, from_r, from_c)
    elev_end, ok2 = sample_bilinear_elevation(elev_grid, rows, cols, to_r, to_c)
    if not ok1 or not ok2:
        has_nodata = True

    edge_slope = calculate_signed_slope(elev_start, elev_end, ground_dist_m)
    if not ok1 or not ok2:
        edge_slope['valid'] = False
    edge_dir_eval = evaluate_directional_slope_cost(
        edge_slope['signed_slope_deg'],
        max_safe_slope,
        strict_safe_only=(not allow_caution)
    )

    min_elev = min(elev_start, elev_end)
    max_elev = max(elev_start, elev_end)
    prev_elev = elev_start
    sub_dist = max(0.5, ground_dist_m / max(1, sample_steps))
    any_sub_unsafe = False
    any_sub_caution = False

    for s in range(sample_steps + 1):
        t = s / sample_steps
        r = from_r + t * dr
        c = ((from_c + t * dc) % cols + cols) % cols
        el, ok = sample_bilinear_elevation(elev_grid, rows, cols, r, c)
        if not ok:
            has_nodata = True
        else:
            min_elev = min(min_elev, el)
            max_elev = max(max_elev, el)
            if s > 0:
                sub_sl = calculate_signed_slope(prev_elev, el, sub_dist)
                if sub_sl['valid']:
                    sub_ev = evaluate_directional_slope_cost(
                        sub_sl['signed_slope_deg'],
                        max_safe_slope,
                        strict_safe_only=(not allow_caution)
                    )
                    if sub_ev['safety_class'] == 'UNSAFE':
                        any_sub_unsafe = True
                    elif sub_ev['safety_class'] == 'CAUTION':
                        any_sub_caution = True
            prev_elev = el

        sl = sample_bilinear_slope(slope_grid, elev_grid, rows, cols, r, c)
        max_local_slope_deg = max(max_local_slope_deg, sl)
        sum_local_slope_deg += sl

    elev_change_m = elev_end - elev_start
    elev_variation_m = max(0.0, max_elev - min_elev)
    signed_slope_deg = edge_slope['signed_slope_deg']
    max_slope_deg = max(abs(signed_slope_deg) if math.isfinite(signed_slope_deg) else 0.0, max_local_slope_deg)

    safety_class = edge_dir_eval['safety_class']
    slope_class = edge_dir_eval['slope_class']
    cost_multiplier = edge_dir_eval['cost_multiplier']
    traversable = edge_dir_eval['traversable']
    safety_penalty = 0.0

    if has_nodata:
        safety_class = 'UNKNOWN'
        slope_class = 'UNKNOWN'
        traversable = False
        cost_multiplier = float('inf')
    elif edge_dir_eval['safety_class'] == 'UNSAFE' or any_sub_unsafe or max_local_slope_deg > max_safe_slope + 1e-9:
        safety_class = 'UNSAFE'
        slope_class = 'UNSAFE'
        traversable = False
        cost_multiplier = float('inf')
    elif edge_dir_eval['safety_class'] == 'CAUTION' or any_sub_caution:
        safety_class = 'CAUTION'
        slope_class = 'CAUTION'
        traversable = bool(allow_caution)

    if not traversable:
        return {
            'traversable': False,
            'safety_class': safety_class,
            'slope_class': slope_class,
            'cost': float('inf'),
            'cost_multiplier': float('inf'),
            'dist_m': ground_dist_m,
            'signed_slope_deg': signed_slope_deg,
            'local_slope_deg': max_local_slope_deg,
            'max_slope_deg': max_slope_deg
        }

    energy_j = estimate_transition_energy(ground_dist_m, elev_change_m, max_slope_deg, mass_kg=mass_kg)
    norm_dist = ground_dist_m / 29600.0
    w_dist = weights.get('distance', 1.0)
    w_safety = weights.get('safety', 2.5)

    base_movement_cost = max(1e-4, w_dist * norm_dist + w_safety * safety_penalty)
    total_cost = base_movement_cost * cost_multiplier

    return {
        'traversable': True,
        'safety_class': safety_class,
        'slope_class': slope_class,
        'cost': max(1e-4, total_cost),
        'base_movement_cost': base_movement_cost,
        'cost_multiplier': cost_multiplier,
        'dist_m': ground_dist_m,
        'delta_z': elev_change_m,
        'elev_change_m': elev_change_m,
        'elev_variation_m': elev_variation_m,
        'signed_slope_deg': signed_slope_deg,
        'local_slope_deg': max_local_slope_deg,
        'max_slope_deg': max_slope_deg,
        'energy_j': energy_j,
        'safety_penalty': safety_penalty
    }
