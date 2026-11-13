"""Model adapter for the Anthropic Messages API (Claude), through the official SDK: pip install anthropic

Protocol: {"op": "discover"} or {"op": "chat", "request": {model, messages}, "effort": ...} on stdin, plus "options"
from adapters.json. Replies {"ok": true, "content": ...} or {"ok": false, "error": ...}.
Credentials come from the environment only (ANTHROPIC_API_KEY, or an `ant auth login` profile); nothing is read from files here.
System messages in the request become the API's separate system prompt.
"""
import json
import sys

EFFORTS = {'low', 'medium', 'high', 'xhigh', 'max'}


def client(options):
    import anthropic
    kw = {'max_retries': options.get('max_retries', 2), 'timeout': options.get('timeout_seconds', 600)}
    if options.get('base_url'):
        kw['base_url'] = options['base_url']
    return anthropic.Anthropic(**kw)


def discover(options):
    if options.get('models'):
        return dict(ok=True, models=options['models'])
    return dict(ok=True, models=[m.id for m in client(options).models.list()])


def chat(options, request, effort):
    msgs = request.get('messages') or []
    system = '\n\n'.join(m['content'] for m in msgs if m.get('role') == 'system')
    turns = [{'role': m['role'], 'content': m['content']} for m in msgs if m.get('role') in ('user', 'assistant')]
    body = dict(model=request['model'], max_tokens=options.get('max_tokens', 16000), messages=turns)
    if system:
        body['system'] = system
    if effort in EFFORTS:
        body['output_config'] = {'effort': effort}
    if options.get('fallbacks', 'default'):
        # Server-side fallback: if the model declines (stop_reason "refusal"), the API routes the turn on.
        body['betas'] = ['server-side-fallback-2026-07-01']
        body['fallbacks'] = options.get('fallbacks', 'default')
        r = client(options).beta.messages.create(**body)
    else:
        r = client(options).messages.create(**body)
    if r.stop_reason == 'refusal':
        return dict(ok=False, error='MODEL_DECLINED')
    text = ''.join(b.text for b in r.content if b.type == 'text')
    return dict(ok=bool(text.strip()), content=text, finish_reason=r.stop_reason, error=None if text.strip() else 'NO_CONTENT')


def main():
    x = json.load(sys.stdin)
    options = x.get('options') or {}
    try:
        import anthropic
    except ImportError:
        print(json.dumps(dict(ok=False, error='ANTHROPIC_SDK_MISSING: pip install anthropic')))
        return
    try:
        reply = discover(options) if x['op'] == 'discover' else chat(options, x['request'], x.get('effort'))
    except anthropic.APIStatusError as e:
        reply = dict(ok=False, error=f'HTTP {e.status_code}: {str(e.message)[:300]}')
    except anthropic.APIConnectionError:
        reply = dict(ok=False, error='CONNECTION_FAILED')
    except Exception as e:
        reply = dict(ok=False, error=f'{type(e).__name__}: {str(e)[:300]}')
    print(json.dumps(reply, ensure_ascii=False))


if __name__ == '__main__':
    main()
