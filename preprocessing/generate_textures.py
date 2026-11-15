import struct
import zlib
import base64
import json
import math
import os

WIDTH = 720
HEIGHT = 360

data_dir = r'd:\Workfiles\eva\tét\nasa_mars_explorer\data'

def load_grid(name):
    path = os.path.join(data_dir, f'{name}.bin')
    with open(path, 'rb') as f:
        data = struct.unpack(f'{WIDTH * HEIGHT}f', f.read())
    return data

elevation = load_grid('elevation')
radius = load_grid('radius')
slope = load_grid('slope')
gravity_120g = load_grid('gravity_120g')
surface_g = load_grid('surface_g')
geoid_n = load_grid('geoid_n')
gravity_delta = load_grid('gravity_delta')

min_e, max_e = min(elevation), max(elevation)
min_s, max_s = min(slope), max(slope)

print(f"Loaded all grids.")
print(f"  Elevation range: {min_e:.1f} to {max_e:.1f} m")
print(f"  Slope range:     {min_s:.2f}° to {max_s:.2f}°")

def write_png(width, height, rgba_bytes):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    raw_data = bytearray()
    row_stride = width * 4
    for y in range(height):
        raw_data.append(0)
        raw_data.extend(rgba_bytes[y * row_stride : (y + 1) * row_stride])

    compressed = zlib.compress(bytes(raw_data), level=9)
    png = (
        b'\x89PNG\r\n\x1a\n' +
        chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)) +
        chunk(b'IDAT', compressed) +
        chunk(b'IEND', b'')
    )
    return png

# Helper colormaps
def sample_ramp(t, stops):
    t = max(0.0, min(1.0, t))
    for k in range(len(stops) - 1):
        t0, c0 = stops[k]
        t1, c1 = stops[k+1]
        if t <= t1:
            f = (t - t0) / (t1 - t0) if t1 > t0 else 0.0
            r = int(c0[0] + f * (c1[0] - c0[0]) + 0.5)
            g = int(c0[1] + f * (c1[1] - c0[1]) + 0.5)
            b = int(c0[2] + f * (c1[2] - c0[2]) + 0.5)
            return r, g, b
    return stops[-1][1]

# 1. USGS / GMT Official MOLA Hypsometric Colormap (mars_relief.cpt)
cpt_raw = [
    (-9000.0, (104, 38, 103)),
    (-8000.0, (129, 38, 152)),
    (-7000.0, (130, 38, 199)),
    (-6000.0, (76, 38, 211)),
    (-5000.0, (38, 62, 223)),
    (-4000.0, (38, 134, 235)),
    (-3000.0, (38, 230, 170)),
    (-2000.0, (66, 225, 38)),
    (-1000.0, (148, 239, 38)),
    (0.0,     (243, 254, 38)),
    (1000.0,  (254, 188, 63)),
    (2000.0,  (240, 147, 67)),
    (3000.0,  (226, 111, 69)),
    (4000.0,  (212, 81, 72)),
    (5000.0,  (190, 107, 91)),
    (6000.0,  (168, 119, 105)),
    (7000.0,  (177, 130, 116)),
    (8000.0,  (186, 141, 128)),
    (9000.0,  (194, 153, 141)),
    (10000.0, (203, 166, 155)),
    (11000.0, (211, 179, 170)),
    (12000.0, (221, 193, 185)),
    (13000.0, (229, 208, 201)),
    (14000.0, (238, 223, 218)),
    (15000.0, (246, 238, 236)),
    (16000.0, (248, 241, 239)),
    (17000.0, (249, 244, 243)),
    (18000.0, (252, 249, 249)),
    (19000.0, (255, 255, 255)),
    (20000.0, (218, 253, 255)),
    (21000.0, (181, 251, 254)),
    (22000.0, (161, 251, 254))
]

mola_stops = [
    (max(0.0, min(1.0, (z - min_e) / (max_e - min_e))), rgb)
    for z, rgb in cpt_raw
]

rgba_elev = bytearray(WIDTH * HEIGHT * 4)
for i, val in enumerate(elevation):
    norm = (val - min_e) / (max_e - min_e)
    r, g, b = sample_ramp(norm, mola_stops)
    idx = i * 4
    rgba_elev[idx] = r
    rgba_elev[idx+1] = g
    rgba_elev[idx+2] = b
    rgba_elev[idx+3] = 255

png_elev = write_png(WIDTH, HEIGHT, rgba_elev)
with open(os.path.join(data_dir, 'tex_elevation.png'), 'wb') as f:
    f.write(png_elev)
print(f"Saved tex_elevation.png ({len(png_elev):,} bytes)")

# 2. Slope Map (0 to 30+ deg)
slope_stops = [
    (0.00, (15, 15, 20)),     # Flat terrain (near black)
    (0.10, (50, 30, 20)),     # 2.5 deg (dark charcoal)
    (0.20, (124, 45, 18)),    # 5.0 deg (dark amber/brown)
    (0.35, (194, 65, 12)),    # 8.75 deg (rust orange)
    (0.50, (234, 88, 12)),    # 12.5 deg (vivid orange)
    (0.70, (245, 158, 11)),   # 17.5 deg (golden amber)
    (0.85, (250, 204, 21)),   # 21.25 deg (bright gold)
    (1.00, (255, 255, 255))   # 25+ deg (cliff white)
]

rgba_slope = bytearray(WIDTH * HEIGHT * 4)
for i, val in enumerate(slope):
    norm = min(1.0, val / 25.0)
    r, g, b = sample_ramp(norm, slope_stops)
    idx = i * 4
    rgba_slope[idx] = r
    rgba_slope[idx+1] = g
    rgba_slope[idx+2] = b
    rgba_slope[idx+3] = 255

png_slope = write_png(WIDTH, HEIGHT, rgba_slope)
with open(os.path.join(data_dir, 'tex_slope.png'), 'wb') as f:
    f.write(png_slope)
print(f"Saved tex_slope.png ({len(png_slope):,} bytes)")

# 3. MRO120G Gravity Anomaly (JPL Classic)
jet_stops = [
    (0.00, (20, 15, 80)),
    (0.12, (15, 60, 200)),
    (0.25, (10, 150, 220)),
    (0.40, (30, 200, 120)),
    (0.55, (220, 220, 30)),
    (0.72, (235, 110, 20)),
    (0.85, (220, 25, 40)),
    (0.95, (180, 40, 190)),
    (1.00, (255, 255, 255))
]
min_dg, max_dg = min(gravity_120g), max(gravity_120g)
rgba_dg = bytearray(WIDTH * HEIGHT * 4)
for i, val in enumerate(gravity_120g):
    norm = (val - min_dg) / (max_dg - min_dg)
    r, g, b = sample_ramp(norm, jet_stops)
    idx = i * 4
    rgba_dg[idx] = r
    rgba_dg[idx+1] = g
    rgba_dg[idx+2] = b
    rgba_dg[idx+3] = 255

png_dg = write_png(WIDTH, HEIGHT, rgba_dg)
with open(os.path.join(data_dir, 'tex_gravity_120g.png'), 'wb') as f:
    f.write(png_dg)
print(f"Saved tex_gravity_120g.png ({len(png_dg):,} bytes)")

# 4. Surface Gravity Acceleration (Viridis)
viridis_stops = [
    (0.00, (68, 1, 84)),
    (0.20, (59, 82, 139)),
    (0.40, (33, 145, 140)),
    (0.60, (94, 201, 98)),
    (0.80, (180, 222, 44)),
    (1.00, (253, 231, 37))
]
min_g, max_g = min(surface_g), max(surface_g)
rgba_g = bytearray(WIDTH * HEIGHT * 4)
for i, val in enumerate(surface_g):
    norm = (val - min_g) / (max_g - min_g)
    r, g, b = sample_ramp(norm, viridis_stops)
    idx = i * 4
    rgba_g[idx] = r
    rgba_g[idx+1] = g
    rgba_g[idx+2] = b
    rgba_g[idx+3] = 255

png_g = write_png(WIDTH, HEIGHT, rgba_g)
with open(os.path.join(data_dir, 'tex_surface_g.png'), 'wb') as f:
    f.write(png_g)
print(f"Saved tex_surface_g.png ({len(png_g):,} bytes)")

# 5. Geoid Undulation (Magma/Plasma)
plasma_stops = [
    (0.00, (13, 8, 135)),
    (0.25, (126, 3, 168)),
    (0.50, (204, 71, 120)),
    (0.75, (248, 149, 64)),
    (1.00, (240, 249, 33))
]
min_n, max_n = min(geoid_n), max(geoid_n)
rgba_n = bytearray(WIDTH * HEIGHT * 4)
for i, val in enumerate(geoid_n):
    norm = (val - min_n) / (max_n - min_n)
    r, g, b = sample_ramp(norm, plasma_stops)
    idx = i * 4
    rgba_n[idx] = r
    rgba_n[idx+1] = g
    rgba_n[idx+2] = b
    rgba_n[idx+3] = 255

png_n = write_png(WIDTH, HEIGHT, rgba_n)
with open(os.path.join(data_dir, 'tex_geoid_n.png'), 'wb') as f:
    f.write(png_n)
print(f"Saved tex_geoid_n.png ({len(png_n):,} bytes)")

# 6. Gravity Delta (MRO120G - MRO120F) Diverging Seismic
seismic_stops = [
    (0.00, (10, 30, 180)),
    (0.35, (120, 170, 240)),
    (0.50, (240, 240, 245)),
    (0.65, (240, 160, 140)),
    (1.00, (190, 20, 20))
]
min_d, max_d = min(gravity_delta), max(gravity_delta)
rgba_delta = bytearray(WIDTH * HEIGHT * 4)
for i, val in enumerate(gravity_delta):
    if val < 0:
        norm = 0.5 - 0.5 * (abs(val) / abs(min_d))
    else:
        norm = 0.5 + 0.5 * (val / max_d)
    r, g, b = sample_ramp(norm, seismic_stops)
    idx = i * 4
    rgba_delta[idx] = r
    rgba_delta[idx+1] = g
    rgba_delta[idx+2] = b
    rgba_delta[idx+3] = 255

png_delta = write_png(WIDTH, HEIGHT, rgba_delta)
with open(os.path.join(data_dir, 'tex_gravity_delta.png'), 'wb') as f:
    f.write(png_delta)
print(f"Saved tex_gravity_delta.png ({len(png_delta):,} bytes)")

# 7. 16-bit Packed Precision Data Texture (R,G = Elevation; B,A = Gravity 120G)
rgba_packed = bytearray(WIDTH * HEIGHT * 4)
for i in range(WIDTH * HEIGHT):
    # Elevation 16-bit
    norm_e = max(0.0, min(1.0, (elevation[i] - min_e) / (max_e - min_e)))
    u16_e = int(norm_e * 65535.0 + 0.5)
    r = (u16_e >> 8) & 0xFF
    g = u16_e & 0xFF

    # Gravity 16-bit
    norm_g = max(0.0, min(1.0, (gravity_120g[i] - min_dg) / (max_dg - min_dg)))
    u16_g = int(norm_g * 65535.0 + 0.5)
    b = (u16_g >> 8) & 0xFF
    a = u16_g & 0xFF

    idx = i * 4
    rgba_packed[idx] = r
    rgba_packed[idx+1] = g
    rgba_packed[idx+2] = b
    rgba_packed[idx+3] = a

png_packed = write_png(WIDTH, HEIGHT, rgba_packed)
with open(os.path.join(data_dir, 'tex_packed_data.png'), 'wb') as f:
    f.write(png_packed)
print(f"Saved tex_packed_data.png ({len(png_packed):,} bytes)")

# Compile a Base64 bundle file for zero-latency instant loading
bundle = {
    "tex_elevation": base64.b64encode(png_elev).decode('ascii'),
    "tex_slope": base64.b64encode(png_slope).decode('ascii'),
    "tex_gravity_120g": base64.b64encode(png_dg).decode('ascii'),
    "tex_surface_g": base64.b64encode(png_g).decode('ascii'),
    "tex_geoid_n": base64.b64encode(png_n).decode('ascii'),
    "tex_gravity_delta": base64.b64encode(png_delta).decode('ascii'),
    "tex_packed_data": base64.b64encode(png_packed).decode('ascii'),
}

bundle_path = os.path.join(data_dir, 'textures_bundle.json')
with open(bundle_path, 'w', encoding='utf-8') as f:
    json.dump(bundle, f)
print(f"Saved textures_bundle.json ({os.path.getsize(bundle_path):,} bytes)")
print("Texture generation complete!")
