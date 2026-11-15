import json
import os
import sys
import struct
import zlib
import base64

# Ensure UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')

# Dynamically locate directories relative to this file
base_dir = os.path.dirname(os.path.abspath(__file__))
data_dir = os.path.join(base_dir, 'data')

with open(os.path.join(data_dir, 'textures_bundle.json'), 'r', encoding='utf-8') as f:
    textures = json.load(f)

with open(os.path.join(data_dir, 'datasets_meta.json'), 'r', encoding='utf-8') as f:
    meta = json.load(f)

# Pack 16-bit spherical harmonic geoid_n.bin and gravity_delta.bin into in-memory textures payload
# (Does not modify any files in data/)
try:
    WIDTH, HEIGHT = 720, 360
    with open(os.path.join(data_dir, 'geoid_n.bin'), 'rb') as f:
        geoid_n = struct.unpack(f'{WIDTH * HEIGHT}f', f.read())
    with open(os.path.join(data_dir, 'gravity_delta.bin'), 'rb') as f:
        gravity_delta = struct.unpack(f'{WIDTH * HEIGHT}f', f.read())

    min_n, max_n = meta['geoid_n']['min'], meta['geoid_n']['max']
    min_d, max_d = meta['gravity_delta']['min'], meta['gravity_delta']['max']

    rgba_gd = bytearray(WIDTH * HEIGHT * 4)
    for i in range(WIDTH * HEIGHT):
        norm_n = max(0.0, min(1.0, (geoid_n[i] - min_n) / (max_n - min_n)))
        u16_n = int(norm_n * 65535.0 + 0.5)
        norm_d = max(0.0, min(1.0, (gravity_delta[i] - min_d) / (max_d - min_d)))
        u16_d = int(norm_d * 65535.0 + 0.5)
        idx = i * 4
        rgba_gd[idx] = (u16_n >> 8) & 0xFF
        rgba_gd[idx + 1] = u16_n & 0xFF
        rgba_gd[idx + 2] = (u16_d >> 8) & 0xFF
        rgba_gd[idx + 3] = u16_d & 0xFF

    def _encode_png(width, height, rgba_bytes):
        def _chunk(tag, data):
            return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
        raw_data = bytearray()
        row_stride = width * 4
        for y in range(height):
            raw_data.append(0)
            raw_data.extend(rgba_bytes[y * row_stride : (y + 1) * row_stride])
        compressed = zlib.compress(bytes(raw_data), level=9)
        return (
            b'\x89PNG\r\n\x1a\n' +
            _chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)) +
            _chunk(b'IDAT', compressed) +
            _chunk(b'IEND', b'')
        )

    textures['tex_packed_geoid_delta'] = base64.b64encode(_encode_png(WIDTH, HEIGHT, rgba_gd)).decode('ascii')
except Exception as e:
    print(f"Notice: Could not pack geoid/gravity_delta texture: {e}")

with open(os.path.join(data_dir, 'mcs_tracks_summary.json'), 'r', encoding='utf-8') as f:
    mcs_tracks = json.load(f)

with open(os.path.join(data_dir, 'mcs_soundings.json'), 'r', encoding='utf-8') as f:
    mcs_soundings = json.load(f)

landmarks_catalog = [
    {
        "id": "olympus",
        "name": "Olympus Mons",
        "type": "Shield Volcano (Núi lửa khiên)",
        "lat": 18.65,
        "lon": 226.2,
        "desc": "Ngọn núi lửa dạng khiên lớn nhất trong Hệ Mặt Trời (đỉnh cao 21.3 km so với datum, đường kính 600 km). Áp suất khí quyển đỉnh chỉ 90 Pa, dị thường trọng lực kỷ lục +3,121 mGal."
    },
    {
        "id": "ascraeus",
        "name": "Ascraeus Mons",
        "type": "Tharsis Montes Volcano",
        "lat": 11.9,
        "lon": 255.5,
        "desc": "Núi lửa phía bắc trong chuỗi ba siêu núi lửa Tharsis Montes, đỉnh cao 18.2 km, dị thường trọng lực +2,738 mGal."
    },
    {
        "id": "pavonis",
        "name": "Pavonis Mons",
        "type": "Tharsis Montes Volcano (Xích đạo)",
        "lat": 0.8,
        "lon": 247.0,
        "desc": "Núi lửa nằm ngay tại xích đạo Sao Hỏa, đỉnh cao 14.1 km, dị thường trọng lực đạt +1,963 mGal."
    },
    {
        "id": "arsia",
        "name": "Arsia Mons",
        "type": "Tharsis Montes Volcano (Phía Nam)",
        "lat": -8.4,
        "lon": 238.9,
        "desc": "Núi lửa phía nam chuỗi Tharsis với caldera miệng núi lửa rộng hơn 110 km, dị thường đạt +2,103 mGal."
    },
    {
        "id": "valles",
        "name": "Valles Marineris",
        "type": "Canyon System (Đại hẻm vực)",
        "lat": -13.9,
        "lon": 300.8,
        "desc": "Hệ thống đại hẻm vực kiến tạo dài hơn 4,000 km, sâu đến 7 km, vách dốc hiểm trở >25° đe dọa an toàn phi hành gia."
    },
    {
        "id": "hellas",
        "name": "Hellas Planitia",
        "type": "Impact Basin (Lòng chảo va chạm)",
        "lat": -42.4,
        "lon": 70.5,
        "desc": "Lòng chảo va chạm khổng lồ (đáy sâu -7.3 km, áp suất bề mặt cao nhất Sao Hỏa ~1,150 Pa, vượt điểm ba trạng thái của nước)."
    },
    {
        "id": "argyre",
        "name": "Argyre Planitia",
        "type": "Impact Basin (Lòng chảo bán cầu nam)",
        "lat": -49.7,
        "lon": 316.0,
        "desc": "Lòng chảo va chạm khổng lồ ở bán cầu nam (đường kính 800 km, sâu -5.2 km) với dị thường trọng lực âm rõ rệt quanh rìa."
    },
    {
        "id": "isidis",
        "name": "Isidis Planitia",
        "type": "Mascon Basin (Khối tập trung khối lượng)",
        "lat": 12.9,
        "lon": 87.0,
        "desc": "Cấu trúc mascon điển hình: dị thường trọng lực dương +705 mGal giữa vùng lòng chảo trũng, địa hình tương đối bằng phẳng."
    },
    {
        "id": "elysium",
        "name": "Elysium Mons",
        "type": "Shield Volcano (Tỉnh núi lửa Elysium)",
        "lat": 25.0,
        "lon": 147.2,
        "desc": "Núi lửa cô lập cao 12.6 km nổi bật giữa vùng đồng bằng thấp phía bắc, tạo dị thường trọng lực dương +1,331 mGal."
    },
    {
        "id": "jezero",
        "name": "Jezero Crater (Perseverance)",
        "type": "Rover Landing Site (Bãi đáp xe tự hành)",
        "lat": 18.38,
        "lon": 77.58,
        "desc": "Bãi đáp của xe tự hành Perseverance (NASA) bên rìa lòng chảo Isidis, độ dốc thoải, tương đối an toàn cho hoạt động EVA."
    },
    {
        "id": "gale",
        "name": "Gale Crater (Curiosity)",
        "type": "Rover Landing Site (Bãi đáp xe tự hành)",
        "lat": -5.4,
        "lon": 137.8,
        "desc": "Bãi đáp của xe tự hành Curiosity (NASA), đáy hồ tương đối an toàn, sườn núi Mount Sharp có độ dốc tăng dần."
    },
    {
        "id": "north_pole",
        "name": "Planum Boreum (Cực Bắc)",
        "type": "Polar Ice Cap (Mũ băng cực)",
        "lat": 87.5,
        "lon": 0.0,
        "desc": "Mũ băng cực bắc nhiệt độ mùa đông cực đoan (<130 K), tiềm ẩn nguy cơ đóng băng khớp quay và sụt nguồn pin xEMU."
    },
    {
        "id": "south_pole",
        "name": "Planum Australe (Cực Nam)",
        "type": "Polar Ice Cap (Mũ băng cực)",
        "lat": -87.5,
        "lon": 0.0,
        "desc": "Mũ băng vĩnh cửu cực nam, nhiệt độ cực thấp và bóng đêm kéo dài đe dọa hệ thống sinh tồn phi hành gia."
    }
]

soundings_dict = { s['id']: s for s in mcs_soundings }

payload_json = {
    "meta": meta,
    "landmarks": landmarks_catalog,
    "mcs_tracks": mcs_tracks,
    "mcs_soundings": soundings_dict,
    "textures": textures
}

template_file = os.path.join(base_dir, 'template_index.html')
with open(template_file, 'r', encoding='utf-8') as f:
    template = f.read()

payload_str = json.dumps(payload_json, ensure_ascii=False)
full_html = template.replace('__PAYLOAD_DATA_PLACEHOLDER__', payload_str)

out_d = os.path.join(base_dir, 'mars_3d_map.html')
with open(out_d, 'w', encoding='utf-8') as f:
    f.write(full_html)
print(f"Updated {out_d} ({len(full_html.encode('utf-8')):,} bytes)")

out_artifact = r'C:\Users\SEILDA\.gemini\antigravity\brain\4d7edc52-2c63-483c-8199-e666eded49c7\mars_explorer.html'
with open(out_artifact, 'w', encoding='utf-8') as f:
    f.write(full_html)
print(f"Updated {out_artifact} ({len(full_html.encode('utf-8')):,} bytes)")
