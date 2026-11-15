#!/usr/bin/env python3
"""
NASA Mars Explorer - Full Dataset Preprocessing & Multi-Resolution Pyramid Generator
Discovers, validates, and builds Level-of-Detail (LOD) image pyramids for all 72 NASA Mars tiles.
"""

import os
import sys
import math
import time
import json
import re
import argparse
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')

# Constants
MARS_RADIUS_KM = 3389.5  # IAU volumetric mean radius
MARS_TOTAL_SURFACE_AREA_KM2 = 4.0 * math.pi * (MARS_RADIUS_KM ** 2)  # ~144,371,391 km²
TILE_LAT_SPAN = 30
TILE_LON_SPAN = 30
EXPECTED_ROWS = 6   # [-90, -60, -30, 0, 30, 60]
EXPECTED_COLS = 12  # [0, 30, 60, ..., 330]
EXPECTED_TOTAL_TILES = EXPECTED_ROWS * EXPECTED_COLS  # 72

PATTERN = re.compile(r'^(?:.*_)?N(-?\d{1,2})_(\d{1,3})(?:\.[a-zA-Z0-9]+)?$', re.I)

def parse_tile_filename(filename):
    """
    Parses Mars tile filename using the validated regex N(-?\d{1,2})_(\d{1,3}).
    """
    base_name = os.path.basename(filename)
    m = PATTERN.match(base_name)
    if not m:
        return None
    lat_min = int(m.group(1))
    lon_min = int(m.group(2))
    
    # Validation against valid Mars 30° grid intervals
    if lat_min not in [-90, -60, -30, 0, 30, 60]:
        return None
    if lon_min < 0 or lon_min > 330 or lon_min % 30 != 0:
        return None
        
    lat_max = lat_min + 30
    lon_max = lon_min + 30
    
    # Normalized Equirectangular UV coordinates
    u_min = lon_min / 360.0
    u_max = lon_max / 360.0
    v_min = (90.0 - lat_max) / 180.0
    v_max = (90.0 - lat_min) / 180.0
    
    return {
        "filename": base_name,
        "lat_min": lat_min,
        "lat_max": lat_max,
        "lon_min": lon_min,
        "lon_max": lon_max,
        "u_min": round(u_min, 6),
        "u_max": round(u_max, 6),
        "v_min": round(v_min, 6),
        "v_max": round(v_max, 6),
        "row_idx": (60 - lat_min) // 30,  # 0 to 5 (top to bottom)
        "col_idx": lon_min // 30          # 0 to 11 (left to right)
    }

def calculate_tile_spherical_area(lat_min, lat_max, lon_min, lon_max, radius_km=MARS_RADIUS_KM):
    """
    Computes exact spherical surface area of a bounding box on a sphere:
    A = R^2 * delta_lon_rad * (sin(lat_max_rad) - sin(lat_min_rad))
    """
    delta_lon_rad = math.radians(lon_max - lon_min)
    lat_max_rad = math.radians(lat_max)
    lat_min_rad = math.radians(lat_min)
    area = (radius_km ** 2) * delta_lon_rad * (math.sin(lat_max_rad) - math.sin(lat_min_rad))
    return area

def scan_and_validate_dataset(source_dir):
    """
    Recursively scans source directory for PNG files and validates all tiles.
    """
    print(f"\n[1/4] Scanning source directory recursively: {source_dir}")
    discovered_files = []
    for root, _, files in os.walk(source_dir):
        for f in files:
            if f.lower().endswith('.png'):
                discovered_files.append(os.path.join(root, f))
                
    print(f"      Total PNG files discovered: {len(discovered_files)}")
    
    parsed_tiles = []
    unparsed_files = []
    grid_map = {}
    duplicates = []
    
    total_bytes = 0
    total_pixels = 0
    
    for fp in sorted(discovered_files):
        fn = os.path.basename(fp)
        file_size = os.path.getsize(fp)
        total_bytes += file_size
        
        meta = parse_tile_filename(fn)
        if not meta:
            unparsed_files.append({"filename": fn, "path": fp, "reason": "Filename did not match N<lat>_<lon> pattern or out of bounds."})
            continue
            
        cell_key = (meta["lat_min"], meta["lon_min"])
        if cell_key in grid_map:
            duplicates.append({"filename": fn, "conflicts_with": grid_map[cell_key]["filename"], "cell": cell_key})
            continue
            
        # Fast header inspection via Pillow
        try:
            with Image.open(fp) as img:
                w, h = img.size
                mode = img.mode
                img_format = img.format
                has_alpha = ('A' in mode)
                bit_depth = 8  # Standard 8-bit per channel
        except Exception as e:
            unparsed_files.append({"filename": fn, "path": fp, "reason": f"Corrupted or unreadable image: {e}"})
            continue
            
        total_pixels += (w * h)
        tile_area = calculate_tile_spherical_area(meta["lat_min"], meta["lat_max"], meta["lon_min"], meta["lon_max"])
        
        entry = {
            **meta,
            "path": fp,
            "file_size_bytes": file_size,
            "width": w,
            "height": h,
            "mode": mode,
            "format": img_format,
            "has_alpha": has_alpha,
            "bit_depth": bit_depth,
            "spherical_area_km2": round(tile_area, 2),
            "spherical_area_pct": round(tile_area / MARS_TOTAL_SURFACE_AREA_KM2 * 100.0, 4)
        }
        
        grid_map[cell_key] = entry
        parsed_tiles.append(entry)
        
    # Check for missing tiles across all 72 expected cells
    missing_cells = []
    for lat in [-90, -60, -30, 0, 30, 60]:
        for lon in [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]:
            if (lat, lon) not in grid_map:
                missing_cells.append({"lat_min": lat, "lat_max": lat + 30, "lon_min": lon, "lon_max": lon + 30})
                
    # Coverage computations
    valid_count = len(parsed_tiles)
    angular_coverage_pct = round((valid_count * (TILE_LAT_SPAN * TILE_LON_SPAN)) / (360.0 * 180.0) * 100.0, 2)
    
    covered_spherical_area_km2 = sum(t["spherical_area_km2"] for t in parsed_tiles)
    spherical_coverage_pct = round((covered_spherical_area_km2 / MARS_TOTAL_SURFACE_AREA_KM2) * 100.0, 2)
    
    # RAM computations
    uncompressed_ram_rgb_gb = round((total_pixels * 3) / (1024 ** 3), 3)
    uncompressed_ram_rgba_gb = round((total_pixels * 4) / (1024 ** 3), 3)
    
    summary = {
        "total_discovered": len(discovered_files),
        "valid_tiles": valid_count,
        "expected_tiles": EXPECTED_TOTAL_TILES,
        "missing_count": len(missing_cells),
        "missing_cells": missing_cells,
        "duplicate_count": len(duplicates),
        "duplicates": duplicates,
        "unparsed_count": len(unparsed_files),
        "unparsed_files": unparsed_files,
        "angular_coverage_pct": angular_coverage_pct,
        "spherical_coverage_pct": spherical_coverage_pct,
        "total_source_bytes": total_bytes,
        "total_source_gb": round(total_bytes / (1024 ** 3), 3),
        "total_uncompressed_pixels": total_pixels,
        "uncompressed_ram_rgb_gb": uncompressed_ram_rgb_gb,
        "uncompressed_ram_rgba_gb": uncompressed_ram_rgba_gb,
        "mars_total_surface_area_km2": round(MARS_TOTAL_SURFACE_AREA_KM2, 2),
        "covered_spherical_area_km2": round(covered_spherical_area_km2, 2)
    }
    
    print("\n[2/4] Dataset Validation Results:")
    print(f"      Valid Tiles: {valid_count} / {EXPECTED_TOTAL_TILES} ({'100% COMPLETE' if valid_count == EXPECTED_TOTAL_TILES else 'PARTIAL'})")
    print(f"      Missing Cells: {len(missing_cells)}")
    print(f"      Duplicates: {len(duplicates)}")
    print(f"      Corrupted/Unparsed: {len(unparsed_files)}")
    print(f"      Angular Coverage: {angular_coverage_pct}%")
    print(f"      Spherical Area Coverage: {spherical_coverage_pct}% ({covered_spherical_area_km2:,.1f} km²)")
    print(f"      Uncompressed Pixels: {total_pixels:,}")
    print(f"      Estimated Uncompressed RAM: {uncompressed_ram_rgb_gb} GB (RGB) / {uncompressed_ram_rgba_gb} GB (RGBA)")
    
    return parsed_tiles, summary, grid_map

def build_pyramids(parsed_tiles, output_dir, basemap_res=(6144, 3072), level1_tile_dim=512, level2_tile_dim=1536):
    """
    Builds:
      1. Global basemap mosaic at basemap_res (e.g. 6144x3072)
      2. Level 1 overview tiles at level1_tile_dim (e.g. 512x512)
      3. Level 2 intermediate zoom tiles at level2_tile_dim (e.g. 1536x1536)
    """
    print(f"\n[3/4] Generating Multi-Resolution Image Pyramids in: {output_dir}")
    
    pyramid_dir = os.path.join(output_dir, "pyramid")
    level1_dir = os.path.join(pyramid_dir, "level1")
    level2_dir = os.path.join(pyramid_dir, "level2")
    
    os.makedirs(level1_dir, exist_ok=True)
    os.makedirs(level2_dir, exist_ok=True)
    
    bm_w, bm_h = basemap_res
    cell_bm_w = bm_w // EXPECTED_COLS  # 512 px
    cell_bm_h = bm_h // EXPECTED_ROWS  # 512 px
    
    print(f"      Global Basemap Dimensions: {bm_w} x {bm_h} px (Cell: {cell_bm_w} x {cell_bm_h} px)")
    print(f"      Level 1 Tile Resolution: {level1_tile_dim} x {level1_tile_dim} px")
    print(f"      Level 2 Tile Resolution: {level2_tile_dim} x {level2_tile_dim} px")
    
    global_basemap = Image.new("RGB", (bm_w, bm_h), (8, 12, 22))
    
    t_start = time.time()
    total = len(parsed_tiles)
    
    for i, t in enumerate(parsed_tiles, 1):
        fn = t["filename"]
        base_stem = os.path.splitext(fn)[0]
        fp = t["path"]
        
        t_cell_start = time.time()
        with Image.open(fp) as src_img:
            # Level 1 Overview
            t_l1 = src_img.resize((level1_tile_dim, level1_tile_dim), Image.Resampling.BILINEAR)
            l1_path = os.path.join(level1_dir, f"{base_stem}.jpg")
            t_l1.save(l1_path, "JPEG", quality=88, optimize=True)
            
            # Paste into global basemap
            paste_x = t["col_idx"] * cell_bm_w
            paste_y = t["row_idx"] * cell_bm_h
            if (level1_tile_dim, level1_tile_dim) != (cell_bm_w, cell_bm_h):
                t_bm = t_l1.resize((cell_bm_w, cell_bm_h), Image.Resampling.BILINEAR)
                global_basemap.paste(t_bm, (paste_x, paste_y))
            else:
                global_basemap.paste(t_l1, (paste_x, paste_y))
                
            # Level 2 Intermediate
            t_l2 = src_img.resize((level2_tile_dim, level2_tile_dim), Image.Resampling.BILINEAR)
            l2_path = os.path.join(level2_dir, f"{base_stem}.jpg")
            t_l2.save(l2_path, "JPEG", quality=88, optimize=True)
            
        t["level1_url"] = f"data/pyramid/level1/{base_stem}.jpg"
        t["level2_url"] = f"data/pyramid/level2/{base_stem}.jpg"
        t["fullres_url"] = f"data/processed/pyramids/level_2/{base_stem}.jpg"
        
        elapsed = time.time() - t_start
        rate = i / elapsed if elapsed > 0 else 1
        rem = (total - i) / rate
        if i % 6 == 0 or i == total:
            print(f"      Processed {i:2d}/{total} tiles ({i*100//total}%) | Elapsed: {elapsed:.1f}s | Est. remaining: {rem:.1f}s")
            
    # Save Global Basemap
    basemap_path = os.path.join(pyramid_dir, "global_basemap.jpg")
    print(f"\n      Saving Global Basemap to {basemap_path}...")
    global_basemap.save(basemap_path, "JPEG", quality=90, optimize=True)
    basemap_bytes = os.path.getsize(basemap_path)
    print(f"      Global Basemap saved: {basemap_bytes / (1024*1024):.2f} MB")
    
    return {
        "global_basemap_url": "data/pyramid/global_basemap.jpg",
        "global_basemap_bytes": basemap_bytes,
        "global_basemap_width": bm_w,
        "global_basemap_height": bm_h
    }

def generate_manifest(parsed_tiles, summary, pyramid_meta, output_dir):
    """
    Saves complete dataset manifest to JSON.
    """
    print(f"\n[4/4] Writing Dataset Manifest to: {output_dir}")
    manifest_path = os.path.join(output_dir, "dataset_manifest.json")
    
    # 6x12 Matrix for interactive UI visualizer
    matrix = [[None for _ in range(EXPECTED_COLS)] for _ in range(EXPECTED_ROWS)]
    for t in parsed_tiles:
        r = t["row_idx"]
        c = t["col_idx"]
        matrix[r][c] = {
            "filename": t["filename"],
            "lat_min": t["lat_min"],
            "lat_max": t["lat_max"],
            "lon_min": t["lon_min"],
            "lon_max": t["lon_max"],
            "spherical_area_km2": t["spherical_area_km2"],
            "level1_url": t.get("level1_url"),
            "level2_url": t.get("level2_url"),
            "fullres_url": t.get("fullres_url")
        }
        
    manifest = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "summary": summary,
        "pyramid": pyramid_meta,
        "grid_layout": {
            "rows": EXPECTED_ROWS,
            "cols": EXPECTED_COLS,
            "row_lats": [60, 30, 0, -30, -60, -90],
            "col_lons": [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
        },
        "coverage_matrix": matrix,
        "tiles": parsed_tiles
    }
    
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        
    print(f"      Manifest written successfully: {manifest_path} ({os.path.getsize(manifest_path):,} bytes)")
    return manifest_path

def main():
    parser = argparse.ArgumentParser(description="NASA Mars Explorer - Full Dataset Preprocessor & Pyramid Builder")
    parser.add_argument("--source", default=r"d:\Workfiles\eva\tét\Better Elevation\Cut", help="Directory containing NASA Mars PNG tiles")
    parser.add_argument("--output", default=r"d:\Workfiles\eva\tét\nasa_mars_explorer\data", help="Output directory for pyramids and manifest")
    parser.add_argument("--skip-pyramid", action="store_true", help="Only validate and build manifest without resizing images")
    args = parser.parse_args()
    
    print("=" * 70)
    print(" NASA MARS 2D GLOBAL HIGH-RESOLUTION MAP - DATASET PREPROCESSOR")
    print("=" * 70)
    
    if not os.path.exists(args.source):
        print(f"Error: Source directory does not exist: {args.source}")
        sys.exit(1)
        
    os.makedirs(args.output, exist_ok=True)
    
    parsed_tiles, summary, grid_map = scan_and_validate_dataset(args.source)
    
    if args.skip_pyramid:
        pyramid_meta = {"global_basemap_url": "", "global_basemap_bytes": 0}
    else:
        pyramid_meta = build_pyramids(parsed_tiles, args.output)
        
    manifest_path = generate_manifest(parsed_tiles, summary, pyramid_meta, args.output)
    
    print("\n" + "=" * 70)
    print(" PREPROCESSING & VALIDATION COMPLETE")
    print(f" Manifest: {manifest_path}")
    print("=" * 70)

if __name__ == "__main__":
    main()
