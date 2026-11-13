// Transport through the installed Codex app-server. No OAuth/token extraction.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const fault = (code, kind = 'failed') => Object.assign(new Error(code), { code, kind });
export class Rpc {
  constructor(executable = 'codex', { spawnImpl = spawn, timeoutMs = 240000 } = {}) {
    this.pending = new Map(); this.listeners = new Set(); this.id = 0; this.closed = false;
    // Remove API credential overrides: this adapter must use the existing ChatGPT login.
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (/^(OPENAI_API_KEY|CODEX_API_KEY|OPENAI_BASE_URL|OPENAI_ORG_ID|OPENAI_ORGANIZATION|OPENAI_PROJECT)$/i.test(key)) delete env[key];
    const isolation = Object.entries(narrationConfig()).flatMap(([key, value]) => ['-c', `${key}=${JSON.stringify(value)}`]);
    this.child = spawnImpl(executable, ['app-server', '--listen', 'stdio://', ...isolation],
    { env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    this.finished = new Promise(resolve => this.child.once('close', () => { clearTimeout(this.killTimer); resolve(); }));
    this.child.stderr.resume(); // Never forward unfiltered local config/provider diagnostics.
    this.child.stdin.on('error', () => this.stop(fault('CODEX_PIPE_CLOSED', 'uncertain')));
    this.child.on('error', () => this.stop(fault('CODEX_START_FAILED')));
    this.child.on('exit', () => this.stop(fault('CODEX_EXITED', 'uncertain')));
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', line => {
      let msg; try { msg = JSON.parse(line); } catch { return this.stop(fault('CODEX_BAD_JSON', 'uncertain')); }
      if (msg.method && msg.id !== undefined) {
        // Never approve tool/permission/auth requests in a narration-only transport.
        this.write({ id: msg.id, error: { code: -32601, message: 'This adapter does not execute tools or authorize requests' } });
        return this.stop(fault('CODEX_UNEXPECTED_SERVER_REQUEST', 'uncertain'));
      }
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id); if (!p) return;
        this.pending.delete(msg.id);
        // Error messages can contain credential-bearing URLs or short secrets; never echo them.
        msg.error ? p.reject(Object.assign(fault('CODEX_RPC_REJECTED'), { rpcMethod: p.method, rpcCode: msg.error.code })) : p.resolve(msg.result);
      } else {
        if (msg.method === 'turn/started' && msg.params?.turn?.id && msg.params?.threadId)
          this.activeTurn = { threadId: msg.params.threadId, turnId: msg.params.turn.id };
        if (msg.method === 'turn/completed' && msg.params?.turn?.id === this.activeTurn?.turnId) this.activeTurn = null;
        for (const listener of this.listeners) listener(msg);
      }
    });
    this.timer = setTimeout(() => this.stop(fault('CODEX_TIMEOUT', 'uncertain')), timeoutMs);
  }
  write(message) { if (!this.closed) this.child.stdin.write(JSON.stringify(message) + '\n'); }
  request(method, params = {}) {
    if (this.closed) return Promise.reject(fault('CODEX_CLOSED'));
    const id = ++this.id;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject, method }); this.write({ id, method, params }); });
  }
  stop(error = fault('CODEX_CLOSED')) {
    if (this.closed) return;
    // Best-effort protocol cancellation, then bounded process-tree termination.
    // Neither acknowledgement nor local termination proves the provider was uncharged.
    if (this.activeTurn) this.write({ id: ++this.id, method: 'turn/interrupt', params: this.activeTurn });
    this.closed = true; clearTimeout(this.timer);
    for (const p of this.pending.values()) p.reject(error);
    this.pending.clear();
    for (const listener of this.listeners) listener({ adapterError: error });
    this.listeners.clear(); this.lines?.close(); this.child.stdin.end();
    this.killTimer = setTimeout(() => {
      if (this.child.exitCode !== null || this.child.signalCode !== null) return;
      if (process.platform === 'win32' && this.child.pid) {
        const killer = spawn('taskkill.exe', ['/PID', String(this.child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => this.child.kill());
      } else {
        try { process.kill(-this.child.pid, 'SIGKILL'); } catch { this.child.kill(); }
      }
    }, 500);
  }
  async initialize() {
    await this.request('initialize', { clientInfo: { name: 'talking_heads_adapter', title: 'Talking Heads adapter', version: '0.1.0' }, capabilities: { experimentalApi: true } });
    this.write({ method: 'initialized', params: {} });
  }
}

export function narrationConfig(config = {}) {
  if (config.model_providers?.openai) throw fault('CODEX_PROVIDER_OVERRIDE_UNSUPPORTED');
  const overrides = {
    'model_provider': 'openai', 'forced_login_method': 'chatgpt',
    'project_doc_max_bytes': 0, 'web_search': 'disabled',
    'features.hooks': false, 'features.shell_tool': false, 'features.apply_patch_freeform': false,
    'features.code_mode': false, 'features.multi_agent': false, 'features.multi_agent_v2': false,
    'features.apps': false, 'features.plugins': false, 'features.image_generation': false,
    'features.imagegenext': false, 'features.memories': false, 'features.memory_tool': false,
    'features.skip_host_skill_discovery': true, 'features.skill_search': false,
    'agents.enabled': false, 'include_apps_instructions': false,
    'include_collaboration_mode_instructions': false,
  };
  const segment = name => /^[A-Za-z0-9_-]+$/.test(name) ? name : JSON.stringify(name);
  for (const name of Object.keys(config.mcp_servers ?? {})) overrides[`mcp_servers.${segment(name)}.enabled`] = false;
  for (const name of Object.keys(config.plugins ?? {})) overrides[`plugins.${segment(name)}.enabled`] = false;
  return overrides;
}

export function translate(body) {
  if (!body || typeof body.model !== 'string' || !body.model.trim() || !Array.isArray(body.messages) || body.messages.length < 2)
    throw fault('CODEX_BAD_REQUEST');
  if (Object.keys(body).some(k => !['model', 'messages', 'max_completion_tokens'].includes(k))) throw fault('CODEX_UNSUPPORTED_SETTING');
  const [system, ...messages] = body.messages;
  if (!system || system.role !== 'system' || typeof system.content !== 'string' || !system.content.trim()) throw fault('CODEX_SYSTEM_REQUIRED');
  if (messages.at(-1)?.role !== 'user') throw fault('CODEX_LAST_USER_REQUIRED');
  for (const m of [system, ...messages]) if (!m || Array.isArray(m) || Object.keys(m).some(k => !['role', 'content'].includes(k)) ||
    !['system', 'user', 'assistant'].includes(m.role) || (m !== system && m.role === 'system') || typeof m.content !== 'string') throw fault('CODEX_UNSUPPORTED_MESSAGE');
  return {
    baseInstructions: system.content,
    history: messages.slice(0, -1).map(m => ({ type: 'message', role: m.role, content: [{ type: m.role === 'assistant' ? 'output_text' : 'input_text', text: m.content }] })),
    input: [{ type: 'text', text: messages.at(-1).content, text_elements: [] }],
    limitations: ['Codex harness, not raw Chat Completions', 'max_completion_tokens is not enforced by this transport; retained only as source metadata', 'Adapter never retries; built-in provider retry behavior remains Codex-owned'],
  };
}

export async function discover({ executable, RpcClass = Rpc } = {}) {
  const rpc = new RpcClass(executable);
  try {
    await rpc.initialize();
    const account = await rpc.request('account/read', { refreshToken: false });
    const models = await rpc.request('model/list', {});
    return { authType: account.account?.type ?? null, models: (models.data ?? []).map(m => ({ id: m.id, model: m.model, isDefault: m.isDefault, supportedReasoningEfforts: m.supportedReasoningEfforts })) };
  } finally { rpc.stop(); }
}

export function codexTransport(options = {}) {
  return invocationTransport(translate, options);
}

// Internal integration point: callers own translation/validation; RPC isolation is shared.
// Never accept a translator, schema override or process option from an HTTP request.
export function invocationTransport(translateRequest, { executable, effort = 'medium', timeoutMs = 240000, RpcClass = Rpc,
  strictFinal = false } = {}) {
  return async (body, { signal } = {}) => {
    const translated = translateRequest(body);
    if (signal?.aborted) throw fault('CODEX_CANCELLED');
    const rpc = new RpcClass(executable, { timeoutMs });
    let cwd, dispatched = false;
    const cancel = () => rpc.stop(fault('CODEX_CANCELLED', 'uncertain'));
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    try {
      await rpc.initialize();
      const account = await rpc.request('account/read', { refreshToken: false });
      if (account.account?.type !== 'chatgpt') throw fault('CODEX_CHATGPT_LOGIN_REQUIRED');
      const loaded = await rpc.request('config/read', { includeLayers: false });
      const config = narrationConfig(loaded.config);
      // Empty temporary working directory, no workspace files or tools supplied.
      cwd = await mkdtemp(path.join(tmpdir(), 'talking-heads-codex-'));
      const startParams = { model: body.model, modelProvider: 'openai', allowProviderModelFallback: false,
        ephemeral: true, baseInstructions: translated.baseInstructions, developerInstructions: '',
        environments: [], runtimeWorkspaceRoots: [], selectedCapabilityRoots: [], dynamicTools: [],
        approvalPolicy: 'never', sandbox: 'read-only', cwd, config };
      const started = await rpc.request('thread/start', startParams);
      if (started.model !== body.model) throw fault('CODEX_MODEL_MISMATCH');
      if (started.modelProvider !== 'openai' || started.approvalPolicy !== 'never' || started.sandbox?.type !== 'readOnly')
        throw fault('CODEX_ISOLATION_MISMATCH');
      if (started.instructionSources?.length) throw fault('CODEX_UNEXPECTED_INSTRUCTIONS');
      const threadId = started.thread.id;
      if (translated.history.length) await rpc.request('thread/inject_items', { threadId, items: translated.history });
      const turnParams = { threadId, input: translated.input, model: body.model, effort, environments: [], runtimeWorkspaceRoots: [] };
      if (translated.outputSchema !== undefined) turnParams.outputSchema = translated.outputSchema;
      const timing = { turnStartSentAt: null, turnStartAcknowledgedAt: null, turnStartedNotificationAt: null, terminalNotificationAt: null };
      let usage = null, turnId = null, terminal = false;
      const early = [];
      let processEvent;
      const final = new Promise((resolve, reject) => {
        const messages = new Map();
        processEvent = (event, receivedAt = new Date().toISOString()) => {
          if (event.adapterError) return reject(event.adapterError);
          const p = event.params;
          if (p?.threadId !== threadId) return;
          if (['item/started', 'item/completed'].includes(event.method) && p.item?.type &&
              !['agentMessage', 'userMessage', 'reasoning'].includes(p.item.type)) {
            const e = fault('CODEX_UNEXPECTED_TOOL_OR_ITEM', 'uncertain'); reject(e); rpc.stop(e); return;
          }
          if (!['thread/tokenUsage/updated', 'item/completed', 'turn/completed', 'turn/started'].includes(event.method)) return;
          if (!turnId) { early.push([event, receivedAt]); return; }
          const eventTurn = ['turn/completed', 'turn/started'].includes(event.method) ? p.turn?.id : p.turnId;
          if (eventTurn !== turnId || terminal) return;
          if (event.method === 'turn/started') timing.turnStartedNotificationAt = receivedAt;
          if (event.method === 'thread/tokenUsage/updated') usage = p.tokenUsage;
          if (event.method === 'item/completed') {
            if (p.item?.type === 'agentMessage') messages.set(p.item.id, p.item);
          }
          if (event.method === 'turn/completed') {
            terminal = true; rpc.activeTurn = null;
            timing.terminalNotificationAt = receivedAt;
            if (p.turn?.status !== 'completed') return reject(fault('CODEX_TURN_NOT_COMPLETED', 'uncertain'));
            const finals = [...messages.values()].filter(m => m.phase === 'final_answer');
            const selected = finals.length ? finals : [...messages.values()].filter(m => m.phase !== 'commentary');
            if (strictFinal && (finals.length !== 1 || typeof finals[0].text !== 'string' || !finals[0].text.length))
              return reject(fault('CODEX_STRUCTURED_FINAL_REQUIRED', 'uncertain'));
            resolve(selected.map(m => m.text).join('\n'));
          }
        };
        rpc.listeners.add(processEvent);
      });
      // Install notification listener before dispatch: tiny turns can finish immediately.
      final.catch(() => {});
      if (signal?.aborted) throw fault('CODEX_CANCELLED');
      dispatched = true;
      timing.turnStartSentAt = new Date().toISOString();
      const ack = await rpc.request('turn/start', turnParams);
      timing.turnStartAcknowledgedAt = new Date().toISOString();
      turnId = ack?.turn?.id;
      if (typeof turnId !== 'string' || !turnId) throw fault('CODEX_TURN_ID_REQUIRED', 'uncertain');
      rpc.activeTurn = { threadId, turnId };
      for (const [event, receivedAt] of early) processEvent(event, receivedAt);
      const content = await final;
      return { outcome: content ? 'content' : 'no_content', content: content || null, refusal: null,
        model: started.model, finish_reason: content ? 'stop' : null, usage: null,
        raw: { backend: 'codex-app-server', auth: 'chatgpt', threadId, turnId, codexUsage: usage,
          nativeCompletion: 'completed', timing,
          translation: translated, startParams, turnParams, max_completion_tokens_enforced: false } };
    } catch (e) {
      if (dispatched) e.kind = 'uncertain';
      throw e;
    } finally {
      signal?.removeEventListener('abort', cancel); rpc.stop();
      await rpc.finished;
      // Only remove our own empty working directory; never recursively erase content.
      if (cwd) await rmdir(cwd).catch(() => {});
    }
  };
}
