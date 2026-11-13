"""Talking Pieces, local mode: serves the chess page and voices pieces through a model adapter.

    python serve.py [adapter-name] [port]      (defaults: adapters.json "default", 8821)

The page calls POST /api/line {prompt} and gets {ok, text}. The adapter is any command that speaks this small
protocol: {"op":"chat","request":{model,messages},"effort","options"} on stdin, {"ok","content"} on stdout (see adapters/).
Listens on 127.0.0.1 only. POSTs must be same-origin JSON, so another website can't spend your model usage.
The game engine stays in the page; the model only phrases lines.
"""
import http.server
import json
import pathlib
import subprocess
import sys
import threading

HERE = pathlib.Path(__file__).resolve().parent
PAGE = HERE.parent / 'web' / 'index.html'
CFG = json.loads((HERE / 'adapters.json').read_text(encoding='utf-8'))
NAME = sys.argv[1] if len(sys.argv) > 1 else CFG['default']
AD = CFG['adapters'][NAME]
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8821
SYSTEM = 'You write single lines of in-character dialogue for pieces in a comedy chess game. Reply with only the line.'
SLOTS = threading.Semaphore(2)  # at most two model calls at once
NO_WINDOW = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
ORIGINS = {f'http://127.0.0.1:{PORT}', f'http://localhost:{PORT}'}


def page():
    # The artifact platform wraps the page in a document skeleton; do the same here so it renders in standards mode.
    body = PAGE.read_text(encoding='utf-8')
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>'
            + body + '</body></html>').encode('utf-8')


def voice(prompt):
    request = {'model': AD['model'], 'messages': [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': prompt}]}
    body = json.dumps({'op': 'chat', 'request': request, 'effort': AD.get('effort', 'low'), 'options': AD.get('options', {})})
    cmd = [sys.executable if part == '{python}' else part.replace('{adapters}', str(HERE / 'adapters')) for part in AD['cmd']]
    if not SLOTS.acquire(blocking=False):
        return {'ok': False, 'error': 'ADAPTER_BUSY'}
    try:
        p = subprocess.run(cmd, input=body, capture_output=True, text=True, encoding='utf-8',
                           timeout=AD.get('timeout_s', 90), creationflags=NO_WINDOW)
    except UnicodeError:
        return {'ok': False, 'error': 'ADAPTER_OUTPUT_UNREADABLE'}
    finally:
        SLOTS.release()
    try:
        reply = json.loads(p.stdout)
    except ValueError:
        return {'ok': False, 'error': 'ADAPTER_OUTPUT_UNREADABLE'}
    if not isinstance(reply, dict):
        return {'ok': False, 'error': 'ADAPTER_OUTPUT_UNREADABLE'}
    if p.returncode and reply.get('ok') is not False:
        return {'ok': False, 'error': 'ADAPTER_FAILED'}
    return reply


class Handler(http.server.BaseHTTPRequestHandler):
    def send(self, code, body, ctype='application/json'):
        data = body if isinstance(body, bytes) else json.dumps(body).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path in ('/', '/index.html'):
            return self.send(200, page(), 'text/html; charset=utf-8')
        if self.path in ('/src/chess-core.js', '/src/chess-cast.js'):  # the shared engine and cast the page loads
            return self.send(200, (HERE.parent / self.path[1:]).read_bytes(), 'text/javascript; charset=utf-8')
        if self.path == '/api/health':
            return self.send(200, {'ok': True, 'adapter': NAME, 'model': AD['model'], 'timeoutMs': AD.get('page_timeout_ms', 30000)})
        self.send(404, {'ok': False, 'error': 'NOT_FOUND'})

    def do_POST(self):
        if self.path != '/api/line':
            return self.send(404, {'ok': False, 'error': 'NOT_FOUND'})
        if self.headers.get('Origin') not in ORIGINS or not self.headers.get('Content-Type', '').startswith('application/json'):
            return self.send(403, {'ok': False, 'error': 'SAME_ORIGIN_JSON_ONLY'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            return self.send(400, {'ok': False, 'error': 'BAD_SIZE'})
        if not 0 < size <= 65536:
            return self.send(413, {'ok': False, 'error': 'BAD_SIZE'})
        try:
            body = self.rfile.read(size)
            request = json.loads(body) if len(body) == size else None
        except ValueError:
            return self.send(400, {'ok': False, 'error': 'BAD_REQUEST'})
        prompt = request.get('prompt') if isinstance(request, dict) else None
        if not isinstance(prompt, str) or not prompt.strip():
            return self.send(400, {'ok': False, 'error': 'BAD_REQUEST'})
        try:
            reply = voice(prompt)
        except subprocess.TimeoutExpired:
            return self.send(504, {'ok': False, 'error': 'ADAPTER_TIMEOUT'})
        except OSError:
            return self.send(502, {'ok': False, 'error': 'ADAPTER_START_FAILED'})
        if reply.get('ok') is True and isinstance(reply.get('content'), str) and reply['content'].strip():
            return self.send(200, {'ok': True, 'text': reply['content']})
        error = str(reply.get('error') or 'ADAPTER_FAILED')[:64]
        status = {'CODEX_USAGE_LIMIT': 429, 'ADAPTER_BUSY': 503}.get(error, 502)
        self.send(status, {'ok': False, 'error': error})

    def do_HEAD(self):
        self.send_response(200 if self.path in ('/', '/index.html', '/src/chess-core.js', '/src/chess-cast.js', '/api/health') else 404)
        self.end_headers()

    def log_message(self, fmt, *args):
        # Log model calls and errors only; args[0] is not always a string (send_error passes an HTTPStatus).
        if args and '/api/line' in str(args[0]) or fmt.startswith('code'):
            sys.stderr.write('%s %s\n' % (self.log_date_time_string(), fmt % args))


if __name__ == '__main__':
    print(f'Talking Pieces local: http://127.0.0.1:{PORT}/  voices: {NAME} ({AD["model"]})', flush=True)
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
