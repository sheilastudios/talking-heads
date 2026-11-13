// Asks your own `codex app-server` whether the account is out of usage. This spends no model usage.
// A failed turn does not say why through this transport, so the adapter asks after one fails.
import { Rpc } from './transport.mjs';

// Returns a sentence for the person when the account is limited, otherwise null.
export function limitMessage(result) {
  const limits = result?.rateLimits;
  if (result?.ordinaryUsageAllowed !== false && !limits?.rateLimitReachedType) return null;
  const full = [limits?.primary, limits?.secondary].filter(w => w && w.usedPercent >= 100 && w.resetsAt);
  const reset = full.length ? Math.max(...full.map(w => w.resetsAt)) : null;
  if (!reset) return 'Your Codex usage limit has been reached.';
  const at = new Date(reset * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `Your Codex usage limit has been reached. It resets ${at}.`;
}

// Never throws: if the check itself fails, the caller keeps the original error.
export async function usageLimit({ executable = 'codex', RpcClass = Rpc } = {}) {
  let rpc;
  try {
    rpc = new RpcClass(executable, { timeoutMs: 15000 });
    await rpc.initialize();
    return limitMessage(await rpc.request('account/rateLimits/read'));
  } catch {
    return null;
  } finally {
    try { rpc?.stop(); } catch {}
  }
}
