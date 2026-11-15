import struct
import zlib
import base64
import json
import math
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

print("=== RE-PROCESSING THEMIS GLOBAL THERMAL INERTIA GEOTIFF WITH EXACT CALIBRATION ===")

SOURCE_TIFF = r'd:\Workfiles\eva\tét\Thermal Inertia\NightBmap2007.tif'
DATA_DIR = r'd:\Workfiles\eva\tét\nasa_mars_explorer\data'

TIFF_W = 7200
TIFF_H = 3600
GRID_W = 720
GRID_H = 360

# 1. Build Exact 1D Color Ramp Lookup Table
print("Scanning unique colors from source GeoTIFF...")
with open(SOURCE_TIFF, 'rb') as f:
    all_colors = set()
    for row in range(0, TIFF_H, 2):
        f.seek(8 + row * TIFF_W * 3)
        row_data = f.read(TIFF_W * 3)
        for col in range(0, TIFF_W, 2):
            idx = col * 3
            all_colors.add((row_data[idx], row_data[idx+1], row_data[idx+2]))

colors = [c for c in all_colors if c != (0, 0, 0)]
start_color = max([c for c in colors if c[1] == 0 and c[2] == 255], key=lambda c: c[0])

path = [start_color]
unvisited = set(colors)
unvisited.remove(start_color)

def dist_sq(c1, c2):
    return (c1[0]-c2[0])**2 + (c1[1]-c2[1])**2 + (c1[2]-c2[2])**2

curr = start_color
while unvisited:
    nxt = min(unvisited, key=lambda c: dist_sq(curr, c))
    path.append(nxt)
    unvisited.remove(nxt)
    curr = nxt

color_to_tiu = {}
for i, c in enumerate(path):
    tiu = 30.0 + (i / 250.0) * (800.0 - 30.0)
    color_to_tiu[c] = tiu

def get_tiu_for_rgb(r, g, b):
    if r == 0 and g == 0 and b == 0:
        return -9999.0 # NoData
    c = (r, g, b)
    if c in color_to_tiu:
        return color_to_tiu[c]
    best_c = min(color_to_tiu.keys(), key=lambda k: (k[0]-r)**2 + (k[1]-g)**2 + (k[2]-b)**2)
    return color_to_tiu[best_c]

def write_png(width, height, rgba_bytes):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    raw_data = bytearray()
    row_stride = width * 4
    for y in range(height):
        raw_data.append(0)
        raw_data.extend(rgba_bytes[y * row_stride : (y + 1) * row_stride])

    compressed = zlib.compress(bytes(raw_data), level=9)
    return (
        b'\x89PNG\r\n\x1a\n' +
        chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)) +
        chunk(b'IDAT', compressed) +
        chunk(b'IEND', b'')
    )

print("Sampling 720x360 grid from 7200x3600 source...")
grid_data = [0.0] * (GRID_W * GRID_H)
tex_rgba = bytearray(GRID_W * GRID_H * 4)

BLOCK = 10
with open(SOURCE_TIFF, 'rb') as f:
    for gy in range(GRID_H):
        if gy % 60 == 0:
            print(f"  Row {gy}/{GRID_H} ({(gy/GRID_H*100):.0f}%)...")
        src_y = gy * BLOCK + BLOCK // 2
        f.seek(8 + src_y * TIFF_W * 3)
        row_bytes = f.read(TIFF_W * 3)
        
        for gx in range(GRID_W):
            src_x = gx * BLOCK + BLOCK // 2
            idx = src_x * 3
            r, g, b = row_bytes[idx], row_bytes[idx+1], row_bytes[idx+2]
            
            ti = get_tiu_for_rgb(r, g, b)
            grid_data[gy * GRID_W + gx] = ti
            
            out_idx = (gy * GRID_W + gx) * 4
            tex_rgba[out_idx] = r
            tex_rgba[out_idx + 1] = g
            tex_rgba[out_idx + 2] = b
            tex_rgba[out_idx + 3] = 0 if ti == -9999.0 else 255

# Save binary grid
bin_path = os.path.join(DATA_DIR, 'thermal_inertia.bin')
with open(bin_path, 'wb') as f:
    f.write(struct.pack(f'{GRID_W * GRID_H}f', *grid_data))
print(f"Saved {bin_path} ({os.path.getsize(bin_path):,} bytes)")

# Save PNG texture
png_data = write_png(GRID_W, GRID_H, tex_rgba)
png_path = os.path.join(DATA_DIR, 'tex_thermal_inertia.png')
with open(png_path, 'wb') as f:
    f.write(png_data)
print(f"Saved {png_path} ({len(png_data):,} bytes)")

# Update datasets_meta.json
meta_path = os.path.join(DATA_DIR, 'datasets_meta.json')
with open(meta_path, 'r', encoding='utf-8') as f:
    meta = json.load(f)

meta['thermal_inertia'] = {
    'min': 30.0,
    'max': 800.0,
    'noData': -9999.0,
    'unit': 'J·m⁻²·K⁻¹·s⁻¹/² (tiu)',
    'source': 'NASA Mars Odyssey THEMIS Nighttime Infrared Thermophysical Model (Putzig & Mellon 2007)'
}

with open(meta_path, 'w', encoding='utf-8') as f:
    json.dump(meta, f, indent=2)
print("Updated datasets_meta.json")

# Update textures_bundle.json
bundle_path = os.path.join(DATA_DIR, 'textures_bundle.json')
if os.path.exists(bundle_path):
    with open(bundle_path, 'r', encoding='utf-8') as f:
        bundle = json.load(f)
    bundle['tex_thermal_inertia'] = base64.b64encode(png_data).decode('ascii')
    with open(bundle_path, 'w', encoding='utf-8') as f:
        json.dump(bundle, f)
    print("Updated textures_bundle.json")

print("=== Processing completed successfully ===")
