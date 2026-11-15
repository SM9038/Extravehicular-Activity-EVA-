#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

#define MAX_DEG 120
#define WIDTH 720
#define HEIGHT 360

// Arrays for spherical harmonic coefficients
double C_mola[MAX_DEG + 1][MAX_DEG + 1], S_mola[MAX_DEG + 1][MAX_DEG + 1];
double C_120g[MAX_DEG + 1][MAX_DEG + 1], S_120g[MAX_DEG + 1][MAX_DEG + 1];
double C_120f[MAX_DEG + 1][MAX_DEG + 1], S_120f[MAX_DEG + 1][MAX_DEG + 1];

// Fully normalized Legendre recurrence coefficients
double a_coeff[MAX_DEG + 1][MAX_DEG + 1];
double b_coeff[MAX_DEG + 1][MAX_DEG + 1];

void precompute_recurrence() {
    for (int n = 2; n <= MAX_DEG; n++) {
        for (int m = 0; m <= n - 2; m++) {
            a_coeff[n][m] = sqrt((double)(2 * n - 1) * (2 * n + 1) / ((n - m) * (n + m)));
            b_coeff[n][m] = sqrt((double)(2 * n + 1) * (n - m - 1) * (n + m - 1) /
                                 ((double)(2 * n - 3) * (n - m) * (n + m)));
        }
    }
}

void compute_legendre(double sin_phi, double Pbar[MAX_DEG + 1][MAX_DEG + 1]) {
    double x = sin_phi;
    double u = sqrt(fmax(0.0, 1.0 - x * x));

    Pbar[0][0] = 1.0;
    Pbar[1][1] = sqrt(3.0) * u;
    for (int m = 2; m <= MAX_DEG; m++) {
        Pbar[m][m] = sqrt((2.0 * m + 1.0) / (2.0 * m)) * u * Pbar[m - 1][m - 1];
    }

    for (int m = 0; m < MAX_DEG; m++) {
        Pbar[m + 1][m] = sqrt(2.0 * m + 3.0) * x * Pbar[m][m];
    }

    for (int m = 0; m <= MAX_DEG - 2; m++) {
        for (int n = m + 2; n <= MAX_DEG; n++) {
            Pbar[n][m] = a_coeff[n][m] * x * Pbar[n - 1][m] - b_coeff[n][m] * Pbar[n - 2][m];
        }
    }
}

// Global raster buffers
float grid_elevation[HEIGHT][WIDTH];
float grid_radius[HEIGHT][WIDTH];
float grid_slope[HEIGHT][WIDTH];
float grid_dg_120g[HEIGHT][WIDTH];
float grid_surf_g[HEIGHT][WIDTH];
float grid_geoid_n[HEIGHT][WIDTH];
float grid_dg_120f[HEIGHT][WIDTH];
float grid_dg_delta[HEIGHT][WIDTH];

int load_sha(const char *path, double C[121][121], double S[121][121], int max_deg, double *R_ref, double *GM) {
    FILE *f = fopen(path, "r");
    if (!f) {
        fprintf(stderr, "Error opening %s\n", path);
        return 0;
    }
    char line[512];
    if (!fgets(line, sizeof(line), f)) {
        fclose(f);
        return 0;
    }
    int deg_file = 0, ord_file = 0, norm = 0;
    sscanf(line, "%lf,%lf,%*f,%d,%d,%d", R_ref, GM, &deg_file, &ord_file, &norm);

    int count = 0;
    while (fgets(line, sizeof(line), f)) {
        int n, m;
        double c_val, s_val;
        if (sscanf(line, "%d,%d,%lf,%lf", &n, &m, &c_val, &s_val) == 4) {
            if (n <= max_deg && m <= max_deg) {
                C[n][m] = c_val;
                S[n][m] = s_val;
                count++;
            }
        }
    }
    fclose(f);
    return count;
}

void save_grid_file(const char *out_dir, const char *name, float buffer[HEIGHT][WIDTH]) {
    char fpath[512];
    snprintf(fpath, sizeof(fpath), "%s/%s.bin", out_dir, name);
    FILE *f = fopen(fpath, "wb");
    if (f) {
        fwrite(buffer, sizeof(float), WIDTH * HEIGHT, f);
        fclose(f);
        printf("Saved %s.bin\n", name);
    }
}

int main() {
    printf("--- NASA Mars Explorer Synthesis Engine ---\n");
    precompute_recurrence();

    // 1. Load MOLA GTM090AA
    double r_mola_ref = 3396.0, gm_mola = 1.0;
    memset(C_mola, 0, sizeof(C_mola));
    memset(S_mola, 0, sizeof(S_mola));
    int mola_cnt = load_sha("gtm090aa.txt", C_mola, S_mola, 90, &r_mola_ref, &gm_mola);
    if (!mola_cnt) mola_cnt = load_sha("../gtm090aa.txt", C_mola, S_mola, 90, &r_mola_ref, &gm_mola);
    printf("Loaded MOLA GTM090AA: %d coefficients (R_ref=%.1f km)\n", mola_cnt, r_mola_ref);

    // 2. Load MRO120G
    double r_120g_ref = 3396.0, gm_120g = 42828.3750924;
    memset(C_120g, 0, sizeof(C_120g));
    memset(S_120g, 0, sizeof(S_120g));
    int g120_cnt = load_sha("jgmro_120g_sha.txt", C_120g, S_120g, 120, &r_120g_ref, &gm_120g);
    if (!g120_cnt) g120_cnt = load_sha("../jgmro_120g_sha.txt", C_120g, S_120g, 120, &r_120g_ref, &gm_120g);
    printf("Loaded MRO120G: %d coefficients (GM=%.6f km^3/s^2)\n", g120_cnt, gm_120g);

    // 3. Load MRO120F
    double r_120f_ref = 3396.0, gm_120f = 42828.3756640;
    memset(C_120f, 0, sizeof(C_120f));
    memset(S_120f, 0, sizeof(S_120f));
    int f120_cnt = load_sha("jgmro_120f_sha.txt", C_120f, S_120f, 120, &r_120f_ref, &gm_120f);
    if (!f120_cnt) f120_cnt = load_sha("../jgmro_120f_sha.txt", C_120f, S_120f, 120, &r_120f_ref, &gm_120f);
    printf("Loaded MRO120F: %d coefficients (GM=%.6f km^3/s^2)\n", f120_cnt, gm_120f);

    double g0_120g = (gm_120g / (r_120g_ref * r_120g_ref)) * 1.0e8; // mGal
    double g0_120f = (gm_120f / (r_120f_ref * r_120f_ref)) * 1.0e8; // mGal
    printf("Reference g0: 120G = %.4f mGal, 120F = %.4f mGal\n", g0_120g, g0_120f);

    // Precompute cos(m*lon) and sin(m*lon)
    double (*cos_lon)[MAX_DEG + 1] = malloc(WIDTH * sizeof(*cos_lon));
    double (*sin_lon)[MAX_DEG + 1] = malloc(WIDTH * sizeof(*sin_lon));
    for (int j = 0; j < WIDTH; j++) {
        double lon_deg = (j + 0.5) * 360.0 / WIDTH;
        double lon_rad = lon_deg * M_PI / 180.0;
        for (int m = 0; m <= MAX_DEG; m++) {
            cos_lon[j][m] = cos(m * lon_rad);
            sin_lon[j][m] = sin(m * lon_rad);
        }
    }

    static double Pbar[MAX_DEG + 1][MAX_DEG + 1];

    printf("Synthesizing 720x360 global planetary grids...\n");

    for (int i = 0; i < HEIGHT; i++) {
        double lat_deg = 90.0 - (i + 0.5) * 180.0 / HEIGHT;
        double lat_rad = lat_deg * M_PI / 180.0;
        double sin_phi = sin(lat_rad);

        compute_legendre(sin_phi, Pbar);

        // Precompute A_m and B_m for all fields at this latitude
        double A_mola[91], B_mola[91];
        double A_dg_g[121], B_dg_g[121];
        double A_ar_g[121], B_ar_g[121];
        double A_dg_f[121], B_dg_f[121];

        // MOLA (degree 90)
        for (int m = 0; m <= 90; m++) {
            double sum_c = 0.0, sum_s = 0.0;
            for (int n = m; n <= 90; n++) {
                double p = Pbar[n][m];
                sum_c += p * C_mola[n][m];
                sum_s += p * S_mola[n][m];
            }
            A_mola[m] = sum_c;
            B_mola[m] = sum_s;
        }

        // MRO120G (degree 120)
        for (int m = 0; m <= 120; m++) {
            double sum_c_dg = 0.0, sum_s_dg = 0.0;
            double sum_c_ar = 0.0, sum_s_ar = 0.0;
            for (int n = (m < 2 ? 2 : m); n <= 120; n++) {
                double p = Pbar[n][m];
                double factor_dg = (double)(n - 1) * p;
                sum_c_dg += factor_dg * C_120g[n][m];
                sum_s_dg += factor_dg * S_120g[n][m];

                sum_c_ar += p * C_120g[n][m];
                sum_s_ar += p * S_120g[n][m];
            }
            A_dg_g[m] = sum_c_dg * g0_120g;
            B_dg_g[m] = sum_s_dg * g0_120g;
            A_ar_g[m] = sum_c_ar * (r_120g_ref * 1000.0);
            B_ar_g[m] = sum_s_ar * (r_120g_ref * 1000.0);
        }

        // MRO120F (degree 120)
        for (int m = 0; m <= 120; m++) {
            double sum_c_dg = 0.0, sum_s_dg = 0.0;
            for (int n = (m < 2 ? 2 : m); n <= 120; n++) {
                double p = Pbar[n][m];
                double factor_dg = (double)(n - 1) * p;
                sum_c_dg += factor_dg * C_120f[n][m];
                sum_s_dg += factor_dg * S_120f[n][m];
            }
            A_dg_f[m] = sum_c_dg * g0_120f;
            B_dg_f[m] = sum_s_dg * g0_120f;
        }

        // Evaluate across longitudes
        for (int j = 0; j < WIDTH; j++) {
            double r_val = 0.0;
            for (int m = 0; m <= 90; m++) {
                r_val += A_mola[m] * cos_lon[j][m] + B_mola[m] * sin_lon[j][m];
            }

            double dg_g_val = 0.0;
            double ar_g_val = 0.0;
            for (int m = 0; m <= 120; m++) {
                dg_g_val += A_dg_g[m] * cos_lon[j][m] + B_dg_g[m] * sin_lon[j][m];
                ar_g_val += A_ar_g[m] * cos_lon[j][m] + B_ar_g[m] * sin_lon[j][m];
            }

            double dg_f_val = 0.0;
            for (int m = 0; m <= 120; m++) {
                dg_f_val += A_dg_f[m] * cos_lon[j][m] + B_dg_f[m] * sin_lon[j][m];
            }

            // Areoid reference radius (r_ref = 3396.0 km + geoid undulation N)
            // Topographic elevation h = radius - areoid_datum
            double areoid_datum = 3396000.0 + ar_g_val;
            double elev_val = r_val - areoid_datum;

            grid_radius[i][j] = (float)r_val;
            grid_geoid_n[i][j] = (float)ar_g_val;
            grid_elevation[i][j] = (float)elev_val;
            grid_dg_120g[i][j] = (float)dg_g_val;
            grid_surf_g[i][j] = (float)((g0_120g + dg_g_val) * 1e-5); // m/s^2
            grid_dg_120f[i][j] = (float)dg_f_val;
            grid_dg_delta[i][j] = (float)(dg_g_val - dg_f_val);
        }
    }

    // Compute Terrain Slope (Horn / Fleming Central Differences)
    double dy = (M_PI * 3396000.0) / HEIGHT;
    for (int i = 0; i < HEIGHT; i++) {
        double lat_deg = 90.0 - (i + 0.5) * 180.0 / HEIGHT;
        double lat_rad = lat_deg * M_PI / 180.0;
        double dx = (2.0 * M_PI * 3396000.0 * fmax(0.01, cos(lat_rad))) / WIDTH;

        int i_prev = (i > 0) ? i - 1 : i;
        int i_next = (i < HEIGHT - 1) ? i + 1 : i;

        for (int j = 0; j < WIDTH; j++) {
            int j_prev = (j > 0) ? j - 1 : WIDTH - 1;
            int j_next = (j < WIDTH - 1) ? j + 1 : 0;

            double dh_dx = (grid_elevation[i][j_next] - grid_elevation[i][j_prev]) / (2.0 * dx);
            double dh_dy = (grid_elevation[i_prev][j] - grid_elevation[i_next][j]) / (2.0 * dy);

            double slope_rad = atan(sqrt(dh_dx * dh_dx + dh_dy * dh_dy));
            grid_slope[i][j] = (float)(slope_rad * 180.0 / M_PI);
        }
    }

    // Compute Statistics & Min/Max
    float min_elev = 1e9, max_elev = -1e9;
    float min_rad = 1e9, max_rad = -1e9;
    float min_slope = 1e9, max_slope = -1e9;
    float min_dg_g = 1e9, max_dg_g = -1e9;
    float min_surfg = 1e9, max_surfg = -1e9;
    float min_geoid = 1e9, max_geoid = -1e9;
    float min_delta = 1e9, max_delta = -1e9;

    for (int i = 0; i < HEIGHT; i++) {
        for (int j = 0; j < WIDTH; j++) {
            if (grid_elevation[i][j] < min_elev) min_elev = grid_elevation[i][j];
            if (grid_elevation[i][j] > max_elev) max_elev = grid_elevation[i][j];

            if (grid_radius[i][j] < min_rad) min_rad = grid_radius[i][j];
            if (grid_radius[i][j] > max_rad) max_rad = grid_radius[i][j];

            if (grid_slope[i][j] < min_slope) min_slope = grid_slope[i][j];
            if (grid_slope[i][j] > max_slope) max_slope = grid_slope[i][j];

            if (grid_dg_120g[i][j] < min_dg_g) min_dg_g = grid_dg_120g[i][j];
            if (grid_dg_120g[i][j] > max_dg_g) max_dg_g = grid_dg_120g[i][j];

            if (grid_surf_g[i][j] < min_surfg) min_surfg = grid_surf_g[i][j];
            if (grid_surf_g[i][j] > max_surfg) max_surfg = grid_surf_g[i][j];

            if (grid_geoid_n[i][j] < min_geoid) min_geoid = grid_geoid_n[i][j];
            if (grid_geoid_n[i][j] > max_geoid) max_geoid = grid_geoid_n[i][j];

            if (grid_dg_delta[i][j] < min_delta) min_delta = grid_dg_delta[i][j];
            if (grid_dg_delta[i][j] > max_delta) max_delta = grid_dg_delta[i][j];
        }
    }

    printf("\n=== SYNTHESIS RESULTS ===\n");
    printf("Elevation:       min = %+7.1f m,    max = %+7.1f m\n", min_elev, max_elev);
    printf("Radius:          min = %7.1f m,    max = %7.1f m\n", min_rad, max_rad);
    printf("Slope:           min = %7.2f deg,  max = %7.2f deg\n", min_slope, max_slope);
    printf("Gravity Anomaly: min = %+7.1f mGal, max = %+7.1f mGal\n", min_dg_g, max_dg_g);
    printf("Surface Gravity: min = %7.4f m/s^2, max = %7.4f m/s^2\n", min_surfg, max_surfg);
    printf("Geoid Undul. N:  min = %+7.1f m,    max = %+7.1f m\n", min_geoid, max_geoid);
    printf("Gravity Delta:   min = %+7.1f mGal, max = %+7.1f mGal\n", min_delta, max_delta);

    // Save binary buffers
    const char *out_dir = "data";
    FILE *ftest = fopen("data/test.tmp", "w");
    if (!ftest) out_dir = "nasa_mars_explorer/data";
    else { fclose(ftest); remove("data/test.tmp"); }

    save_grid_file(out_dir, "elevation", grid_elevation);
    save_grid_file(out_dir, "radius", grid_radius);
    save_grid_file(out_dir, "slope", grid_slope);
    save_grid_file(out_dir, "gravity_120g", grid_dg_120g);
    save_grid_file(out_dir, "surface_g", grid_surf_g);
    save_grid_file(out_dir, "geoid_n", grid_geoid_n);
    save_grid_file(out_dir, "gravity_120f", grid_dg_120f);
    save_grid_file(out_dir, "gravity_delta", grid_dg_delta);

    // Write metadata JSON
    char fpath[512];
    snprintf(fpath, sizeof(fpath), "%s/datasets_meta.json", out_dir);
    FILE *fmeta = fopen(fpath, "w");
    if (fmeta) {
        fprintf(fmeta, "{\n");
        fprintf(fmeta, "  \"width\": %d,\n  \"height\": %d,\n", WIDTH, HEIGHT);
        fprintf(fmeta, "  \"elevation\": { \"min\": %.2f, \"max\": %.2f, \"unit\": \"m\" },\n", min_elev, max_elev);
        fprintf(fmeta, "  \"radius\": { \"min\": %.2f, \"max\": %.2f, \"unit\": \"m\" },\n", min_rad, max_rad);
        fprintf(fmeta, "  \"slope\": { \"min\": %.2f, \"max\": %.2f, \"unit\": \"deg\" },\n", min_slope, max_slope);
        fprintf(fmeta, "  \"gravity_120g\": { \"min\": %.2f, \"max\": %.2f, \"unit\": \"mGal\" },\n", min_dg_g, max_dg_g);
        fprintf(fmeta, "  \"surface_g\": { \"min\": %.4f, \"max\": %.4f, \"unit\": \"m/s^2\" },\n", min_surfg, max_surfg);
        fprintf(fmeta, "  \"geoid_n\": { \"min\": %.2f, \"max\": %.2f, \"unit\": \"m\" },\n", min_geoid, max_geoid);
        fprintf(fmeta, "  \"gravity_delta\": { \"min\": %.2f, \"max\": %.2f, \"unit\": \"mGal\" }\n", min_delta, max_delta);
        fprintf(fmeta, "}\n");
        fclose(fmeta);
        printf("Saved datasets_meta.json\n");
    }

    free(cos_lon);
    free(sin_lon);
    return 0;
}
