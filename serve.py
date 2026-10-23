import http.server
import socketserver
import os
import sys

PORT = 8000
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    # Add headers to prevent the browser from caching files during local dev
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    # Handle the _redirects logic for /app
    def do_GET(self):
        if self.path == '/app' or self.path == '/app/':
            self.send_response(302)
            self.send_header('Location', '/dashboard/')
            self.end_headers()
            return
        super().do_GET()

class ReuseServer(socketserver.TCPServer):
    allow_reuse_address = True

if __name__ == "__main__":
    with ReuseServer(("", PORT), Handler) as httpd:
        print("\n" + "="*40)
        print(f"🚀 DateWizza Local Server running!")
        print(f"🌐 Home:      http://localhost:{PORT}/")
        print(f"📅 Dashboard: http://localhost:{PORT}/dashboard/")
        print("="*40)
        print("Press Ctrl+C to stop.\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n👋 Stopped.")
