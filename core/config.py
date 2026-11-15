"""Cấu hình thông số hệ thống và hằng số vật lý/sinh lý/hành tinh EVA Sao Hỏa."""

DEFAULT_GRID_SIZE = (50, 50)
DEFAULT_CELL_SIZE_M = 10.0          # Mỗi ô lưới mặc định tương ứng 10m x 10m ngoài thực địa
DEFAULT_SPEED_M_S = 1.1             # Tốc độ đi bộ trung bình của phi hành gia (m/s)
DEFAULT_OXYGEN_RATE_L_MIN = 2.8     # Lưu lượng tiêu thụ Oxy cơ sở khi đi bộ EVA (lít/phút)
MAX_SAFE_OXYGEN_L = 480.0           # Dung tích bình Oxy mang theo cho 1 ca EVA tiêu chuẩn (lít)
RETURN_SAFETY_RESERVE_RATIO = 0.20  # Ngưỡng dự phòng an toàn 20% lượng Oxy để quay về căn cứ
MAX_SAFE_SLOPE_DEG = 22.0           # Độ dốc tối đa bộ đồ EVA cho phép leo trực diện (độ), có thể hiệu chỉnh
MARS_GRAVITY_M_S2 = 3.721           # Gia tốc trọng trường bề mặt Sao Hỏa (m/s^2)
MARS_EQUATORIAL_RADIUS_M = 3396190.0  # Bán kính xích đạo Sao Hỏa theo chuẩn IAU 2015 / MOLA (m)
DEFAULT_ASTRONAUT_MASS_KG = 135.0   # Tổng khối lượng phi hành gia + bộ đồ áp suất EVA (kg)
DEFAULT_NODATA_VALUE = -9999.0      # Giá trị chuẩn đánh dấu ô thiếu dữ liệu (NODATA)

# Trọng số hàm chi phí địa hình chuẩn:
# cost = BASE_COST + SLOPE_WEIGHT * slope + ROUGHNESS_WEIGHT * roughness
BASE_COST = 1.0
SLOPE_WEIGHT = 2.0
ROUGHNESS_WEIGHT = 1.5
SAFETY_BUFFER_RADIUS_CELLS = 4.0
SAFETY_WEIGHT = 2.2
