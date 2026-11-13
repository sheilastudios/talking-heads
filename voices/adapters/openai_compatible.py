"""Model adapter for any OpenAI-compatible chat completions endpoint.

Protocol: {"op": "discover"} or {"op": "chat", "request": ..., "effort": ...} on stdin, plus "options" from the lab config.
Replies {"ok": true, "content": ...} or {"ok": false, "error": ...}. The API key is only ever read from the environment.
"""
import json
import os
import sys
import urllib.error
import urllib.request


def call(options, path, body=None):
    base = options.get('base_url', 'https://api.openai.com/v1').rstrip('/')
    headers = {'Content-Type': 'application/json'}
    key = os.environ.get(options.get('api_key_env', 'OPENAI_API_KEY'))
    if key:
        headers['Authorization'] = 'Bearer ' + key
    request = urllib.request.Request(base + path, data=None if body is None else json.dumps(body).encode(), headers=headers)
    with urllib.request.urlopen(request, timeout=options.get('timeout_seconds', 600)) as r:
        return json.load(r)


def discover(options):
    if options.get('models'):
        return dict(ok=True, models=options['models'])
    return dict(ok=True, models=[m['id'] for m in call(options, '/models')['data']])


def chat(options, request, effort):
    body = dict(request)
    if effort and effort != 'default':
        body['reasoning_effort'] = effort
    choice = call(options, '/chat/completions', body)['choices'][0]
    return dict(ok=True, content=choice['message'].get('content') or '', finish_reason=choice.get('finish_reason'))


def main():
    x = json.load(sys.stdin)
    options = x.get('options') or {}
    try:
        reply = discover(options) if x['op'] == 'discover' else chat(options, x['request'], x.get('effort'))
    except urllib.error.HTTPError as e:
        reply = dict(ok=False, error=f'HTTP {e.code}: {e.read()[:300].decode("utf-8", "replace")}')
    except Exception as e:
        reply = dict(ok=False, error=f'{type(e).__name__}: {str(e)[:300]}')
    print(json.dumps(reply, ensure_ascii=False))


if __name__ == '__main__':
    main()
