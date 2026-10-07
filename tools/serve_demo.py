"""Serve only demo and extension resources on localhost; never personal profiles."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import argparse

ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        parts = unquote(urlsplit(path).path).split('/')
        if len(parts) < 2 or parts[1] not in {'demo', 'extension'} or any(p in {'..', '.'} or '\\' in p or ':' in p for p in parts):
            return str(ROOT / '__not_served__')
        target = ROOT.joinpath(*[p for p in parts if p]).resolve()
        if not target.is_relative_to(ROOT / parts[1]):
            return str(ROOT / '__not_served__')
        return str(target)

    def list_directory(self, path):
        self.send_error(403, 'Directory listing disabled')
        return None


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8088)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'Local demo: http://127.0.0.1:{server.server_port}/demo/v2.html', flush=True)
    server.serve_forever()
