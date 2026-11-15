import json
import os

filepath = r'd:\Workfiles\eva\tét\2025073120_DDR.txt'
out_path = r'd:\Workfiles\eva\tét\nasa_mars_explorer\data\mcs_soundings.json'

print("Parsing Mars Climate Sounder (MCS) DDR records...")

soundings = []
current_header = None
current_levels = []

with open(filepath, 'r') as f:
    for line in f:
        line_s = line.strip()
        if not line_s or line_s.startswith('#'):
            continue
        parts = [p.strip() for p in line_s.split(',')]
        
        # Check if this is a profile header row (has 'Jul' date in column 1)
        if len(parts) > 30 and 'Jul' in parts[1]:
            # Save previous profile if complete
            if current_header is not None:
                current_header['levels'] = current_levels
                soundings.append(current_header)
                current_levels = []
                
            try:
                prof_lat = float(parts[12])
                prof_lon = float(parts[13])
                # Normalize longitude to 0..360 East
                if prof_lon < 0:
                    prof_lon += 360.0
                
                surf_lat = float(parts[18])
                surf_lon = float(parts[19])
                if surf_lon < 0:
                    surf_lon += 360.0
                    
                t_surf = float(parts[21])
                dust_col = float(parts[25])
                h2o_col = float(parts[29])
                p_surf = float(parts[33])
                sclk = float(parts[3])
                ls = float(parts[4])
                
                current_header = {
                    'id': len(soundings),
                    'time': parts[2].replace('"', ''),
                    'lat': round(prof_lat, 3),
                    'lon': round(prof_lon, 3),
                    'surf_lat': round(surf_lat, 3),
                    'surf_lon': round(surf_lon, 3),
                    'p_surf': round(p_surf, 1) if p_surf != -9999 else None,
                    'dust_col': round(dust_col, 4) if dust_col != -9999 else None,
                    'h2o_col': round(h2o_col, 4) if h2o_col != -9999 else None,
                    'sclk': sclk,
                    'ls': round(ls, 2)
                }
            except Exception as e:
                current_header = None
        elif len(parts) >= 15 and current_header is not None:
            # Atmospheric layer row: [flag, Pres, T, T_err, Dust, Dust_err, H2Ovap, H2Ovap_err, H2Oice, H2Oice_err, CO2ice, CO2ice_err, Alt, Lat, Lon]
            try:
                pres = float(parts[1])
                temp = float(parts[2])
                dust = float(parts[4])
                alt = float(parts[12])
                if alt != -9999 and temp != -9999 and pres != -9999:
                    current_levels.append({
                        'alt': round(alt, 2),
                        'p': round(pres, 2),
                        't': round(temp, 1),
                        'dust': round(dust, 6) if dust != -9999 else None
                    })
            except Exception:
                pass

if current_header is not None:
    current_header['levels'] = current_levels
    soundings.append(current_header)

print(f"Total parsed soundings: {len(soundings)}")

# Filter and organize:
# Save full soundings (for inspector queries)
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(soundings, f, separators=(',', ':'))

print(f"Saved {out_path} ({os.path.getsize(out_path):,} bytes)")

# Also create a lightweight summary track array for fast client rendering
tracks_summary = []
for s in soundings:
    tracks_summary.append({
        'id': s['id'],
        'lat': s['lat'],
        'lon': s['lon'],
        'p': s['p_surf'],
        'd': s['dust_col'],
        'n_lvl': len(s.get('levels', []))
    })

summary_path = r'd:\Workfiles\eva\tét\nasa_mars_explorer\data\mcs_tracks_summary.json'
with open(summary_path, 'w', encoding='utf-8') as f:
    json.dump(tracks_summary, f, separators=(',', ':'))
print(f"Saved {summary_path} ({os.path.getsize(summary_path):,} bytes)")
