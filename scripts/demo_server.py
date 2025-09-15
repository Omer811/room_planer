#!/usr/bin/env python3
import http.server, socketserver, os, sys, urllib.parse, threading, webbrowser, platform, subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PORT = int(os.environ.get('PORT', '8080'))
UPLOAD_DIR = os.path.join(ROOT, 'docs')
AUTO_OPEN = os.environ.get('AUTO_OPEN', '1') == '1'
DEMO_PATH = '/demos/auto-demo.html'

class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # Serve files rooted at project root
        path = urllib.parse.urlparse(path).path
        full = os.path.join(ROOT, path.lstrip('/'))
        if os.path.isdir(full):
            return os.path.join(full, 'index.html')
        return full

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != '/upload':
            self.send_response(404); self.end_headers(); self.wfile.write(b'Not found'); return
        qs = urllib.parse.parse_qs(parsed.query or '')
        name = (qs.get('name') or ['recording.webm'])[0]
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        length = int(self.headers.get('Content-Length', '0'))
        data = self.rfile.read(length)
        out_path = os.path.join(UPLOAD_DIR, os.path.basename(name))
        with open(out_path, 'wb') as f:
            f.write(data)
        print(f"[demo-server] Saved upload to {out_path}")
        # Respond
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'OK')
        # Schedule shutdown after response flush
        threading.Thread(target=shutdown_soon, daemon=True).start()

def open_browser(url):
    try:
        sys_platform = platform.system().lower()
        if sys_platform == 'darwin':
            # Prefer Google Chrome if available
            try:
                subprocess.Popen(['open', '-a', 'Google Chrome', url])
            except Exception:
                webbrowser.open(url)
        else:
            webbrowser.open(url)
    except Exception:
        pass

def shutdown_soon():
    # Give the client a moment to finish and ensure file buffers are flushed
    import time
    time.sleep(1.5)
    print('[demo-server] Upload complete, shutting down.')
    os._exit(0)

def main():
    os.chdir(ROOT)
    httpd = socketserver.TCPServer(('0.0.0.0', PORT), Handler)
    print(f"[demo-server] Serving {ROOT} on http://localhost:{PORT}")
    if AUTO_OPEN:
        url = f"http://localhost:{PORT}{DEMO_PATH}"
        print(f"[demo-server] Opening {url}")
        open_browser(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass

if __name__ == '__main__':
    main()
