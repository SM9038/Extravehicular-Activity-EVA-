#!/usr/bin/env python3
"""
NASA Mars Explorer - Local Application Server & 2D/3D Desktop Launcher
Supports serving Equirectangular 2D Map tiles directly from Elevation dataset.
"""
import http.server
import socketserver
import webbrowser
import os
import sys
import json
import urllib.parse

PORT = 8080

# Set directory to project root
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)
main_tiles_dir = os.path.abspath(r"D:\Workfiles\eva\tét\Main map\Cut")
os.chdir(project_root)

class MarsExplorerHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS and caching headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def guess_type(self, path):
        if path.endswith('.bin'):
            return 'application/octet-stream'
        if path.endswith('.json'):
            return 'application/json'
        if path.endswith('.png'):
            return 'image/png'
        if path.endswith('.jpg') or path.endswith('.jpeg'):
            return 'image/jpeg'
        if path.endswith('.js'):
            return 'application/javascript'
        if path.endswith('.html'):
            return 'text/html; charset=utf-8'
        return super().guess_type(path)

    def _serve_main_tile(self, filename, is_head=False):
        file_path = os.path.join(main_tiles_dir, filename)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            try:
                fs = os.stat(file_path)
                self.send_response(200)
                self.send_header('Content-Type', 'image/jpeg')
                self.send_header('Content-Length', str(fs.st_size))
                self.end_headers()
                if not is_head:
                    with open(file_path, 'rb') as f:
                        self.copyfile(f, self.wfile)
                return True
            except Exception as e:
                self.send_error(500, f"Error reading main tile: {e}")
                return True
        return False

    def do_HEAD(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path.startswith('/main-tiles/'):
            filename = urllib.parse.unquote(path[len('/main-tiles/'):])
            if self._serve_main_tile(filename, is_head=True):
                return
            else:
                self.send_error(404, f"Main tile not found: {filename}")
                return


        return super().do_HEAD()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Root redirect to 2D Mars Map prototype by default
        if path == '/':
            self.send_response(302)
            self.send_header('Location', '/mars_2d_map.html')
            self.end_headers()
            return

        # API endpoint providing complete dataset manifest
        if path in ('/api/manifest', '/api/dataset-manifest'):
            manifest_file = os.path.join(project_root, 'data', 'dataset_manifest.json')
            if os.path.exists(manifest_file):
                try:
                    with open(manifest_file, 'rb') as f:
                        data = f.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Content-Length', str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                    return
                except Exception as e:
                    self.send_error(500, f"Error reading manifest: {e}")
                    return
            else:
                self.send_error(404, "dataset_manifest.json not found. Run preprocessing/build_tile_pyramids.py first.")
                return



        # API endpoint for Main map manifest
        if path == '/api/main-manifest':
            manifest_file = os.path.join(project_root, 'data', 'main_manifest.json')
            if os.path.exists(manifest_file):
                try:
                    with open(manifest_file, 'rb') as f:
                        data = f.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Content-Length', str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                    return
                except Exception as e:
                    self.send_error(500, f"Error reading main manifest: {e}")
                    return
            else:
                self.send_error(404, "main_manifest.json not found.")
                return

        # Serve from Main map Cut directory if path starts with /main-tiles/
        if path.startswith('/main-tiles/'):
            filename = urllib.parse.unquote(path[len('/main-tiles/'):])
            if self._serve_main_tile(filename, is_head=False):
                return
            else:
                self.send_error(404, f"Main tile not found: {filename}")
                return



        return super().do_GET()

def start_server(entry_page="mars_2d_map.html"):
    port = PORT
    for attempt in range(10):
        try:
            http.server.ThreadingHTTPServer.daemon_threads = True
            with http.server.ThreadingHTTPServer(("", port), MarsExplorerHandler) as httpd:
                url = f"http://localhost:{port}/{entry_page}"
                print("=" * 65)
                print(" NASA INTERACTIVE MARS 2D MAP PROTOTYPE & SCIENTIFIC EXPLORER")
                print("=" * 65)
                print(f" Application running at: {url}")
                print(f" Main dataset mapped to: {main_tiles_dir}")
                print(" Press Ctrl+C in this terminal to stop the application.")
                print("=" * 65)
                webbrowser.open(url)
                httpd.serve_forever()
                break
        except OSError:
            port += 1

if __name__ == '__main__':
    page = "mars_2d_map.html"
    if len(sys.argv) > 1:
        page = sys.argv[1]
    try:
        start_server(page)
    except KeyboardInterrupt:
        print("\nMars Explorer server stopped.")
        sys.exit(0)
