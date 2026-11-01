#!/usr/bin/env python3
"""Double-click launcher backend; no AI or API calls are used to start the server."""
import argparse
import hashlib
import http.server
import pathlib
import re
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = 8080
BASE = 'http://127.0.0.1:8080/'


class AppHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_head(self):
        path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path).lstrip('/') or 'index.html'
        index = (ROOT / 'index.html').read_text(encoding='utf-8')
        allowed = {'index.html', 'favicon.ico'}
        for ref in re.findall(r'(?:src|href)=["\']([^"\']+)', index):
            url = urllib.parse.urlsplit(ref)
            if not url.scheme and not url.netloc and url.path:
                allowed.add(url.path.lstrip('/'))
        relative = pathlib.PurePosixPath(path)
        asset = relative.parts and relative.parts[0] in ('images', 'img', 'assets', 'fonts') and relative.suffix.lower() in ('.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.woff', '.woff2', '.ttf')
        if '..' in relative.parts or any(p.startswith('.') for p in relative.parts) or not (path in allowed or asset):
            self.send_error(404)
            return None
        target = (ROOT / path).resolve()
        if not target.is_relative_to(ROOT) or not target.is_file():
            self.send_error(404)
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404)
        return None


def app_running():
    try:
        # Reuse only a server serving this exact app, never another project.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(BASE, timeout=2) as response:
            body = response.read(2_000_000)
        return hashlib.sha256(body).digest() == hashlib.sha256((ROOT / 'index.html').read_bytes()).digest()
    except (OSError, urllib.error.URLError):
        return False


def launch(open_browser=True):
    if not app_running():
        with socket.socket() as sock:
            if sock.connect_ex(('127.0.0.1', PORT)) == 0:
                raise RuntimeError('8080 포트를 다른 프로그램이 사용 중입니다. 해당 프로그램을 종료하고 다시 실행하세요.')
        with tempfile.NamedTemporaryFile(prefix='lesoul-server-', suffix='.log', delete=False) as log:
            child = subprocess.Popen([sys.executable, str(pathlib.Path(__file__).resolve()), '--serve'],
                                     stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
            log_path = log.name
        for _ in range(30):
            if app_running():
                break
            if child.poll() is not None:
                raise RuntimeError('서버를 시작하지 못했습니다. 기록: ' + log_path)
            time.sleep(0.2)
        else:
            raise RuntimeError('서버 응답을 기다리는 시간이 초과됐습니다. 기록: ' + log_path)
    print('LESOUL 서버 실행 중: ' + BASE, flush=True)
    if open_browser:
        subprocess.run(['/usr/bin/open', BASE + '?v=20261028f#/dashboard'], check=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--serve', action='store_true')
    parser.add_argument('--no-open', action='store_true')
    args = parser.parse_args()
    try:
        if args.serve:
            server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), AppHandler)
            server.serve_forever()
        else:
            launch(not args.no_open)
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print('실행 오류: ' + str(error), file=sys.stderr)
        sys.exit(1)
