import http.server
import mimetypes
import os
import socketserver

# Ensure .js files are served with correct MIME type
mimetypes.add_type('application/javascript', '.js')

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Only set Content-Type for .js files if not already set
        if self.path.endswith('.js'):
            self.send_header('Content-Type', 'application/javascript')
        super().end_headers()


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = int(os.environ.get('SERVER_REQUEST_QUEUE_SIZE', '128'))

if __name__ == '__main__':
    host = os.environ.get('SERVER_HOST', '127.0.0.1')
    port = int(os.environ.get('SERVER_PORT', '8000'))
    try:
        server = ThreadedHTTPServer((host, port), MyHTTPRequestHandler)
    except OSError as exc:
        print(f'Failed to start server on http://{host}:{port}: {exc}')
        print('Tip: set SERVER_PORT to use a different port, e.g. SERVER_PORT=8001')
        raise SystemExit(1) from exc

    print(f'Server running at http://{host}:{port} (threaded, queue={server.request_queue_size})')
    server.serve_forever()