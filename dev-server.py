#!/usr/bin/env python3
"""Local dev server for DateWizza — mimics Cloudflare Workers _redirects + static assets."""
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

REDIRECTS = {
    "/app":   "/dashboard/",
    "/app/":  "/dashboard/",
    "/login": "/login/",
    "/signup": "/login/",
}

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        clean = self.path.split("?", 1)[0].split("#", 1)[0]
        if clean in REDIRECTS:
            self.send_response(302)
            self.send_header("Location", REDIRECTS[clean])
            self.end_headers()
            return
        return super().do_GET()

    def send_error(self, code, message=None, explain=None):
        if code == 404:
            p404 = os.path.join(ROOT, "404.html")
            if os.path.isfile(p404):
                with open(p404, "rb") as f:
                    body = f.read()
                self.send_response(404)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
        super().send_error(code, message, explain)

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))

class ReuseServer(socketserver.TCPServer):
    allow_reuse_address = True

if __name__ == "__main__":
    with ReuseServer(("", PORT), Handler) as httpd:
        print(f"\n🟢  DateWizza dev server → http://localhost:{PORT}")
        print(f"    Landing:    /")
        print(f"    Dashboard:  /dashboard/")
        print(f"    /app        → /dashboard/   (302)")
        print(f"    404 test:   /nope\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n👋 bye")
