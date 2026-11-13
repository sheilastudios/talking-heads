// Model adapter for a locally installed, signed-in Codex CLI. It runs your own `codex app-server`; it never reads or extracts tokens.
// Protocol: {"op": "discover"} or {"op": "chat", "request": ..., "effort": ...} on stdin; one JSON object on stdout.
// Codex requires a non-empty first system message and no later system messages.
import { discover, codexTransport } from './transport.mjs';
import { usageLimit } from './usage_limit.mjs';

let input = '';
let executable = 'codex';
for await (const chunk of process.stdin) input += chunk;
try {
  const x = JSON.parse(input);
  executable = x.options?.executable ?? 'codex';
  if (x.op === 'discover') {
    const d = await discover({ executable });
    process.stdout.write(JSON.stringify({ ok: true, authType: d.authType, models: d.models.map(m => m.model || m.id) }));
  } else if (x.op === 'chat') {
    const invoke = codexTransport({ executable, effort: x.effort, timeoutMs: x.options?.timeout_ms ?? 600000 });
    const r = await invoke(x.request);
    process.stdout.write(JSON.stringify({ ok: r.outcome === 'content', content: r.content, error: r.outcome === 'content' ? undefined : 'NO_CONTENT' }));
  } else throw Error('UNKNOWN_OPERATION');
} catch (e) {
  const limit = e.code === 'CODEX_TURN_NOT_COMPLETED' ? await usageLimit({ executable }) : null;
  process.stdout.write(JSON.stringify(limit ? { ok: false, error: 'CODEX_USAGE_LIMIT', detail: limit, retry: false } : { ok: false, error: e.code || e.message }));
  process.exitCode = 1;
}
