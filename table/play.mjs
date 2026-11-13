// Talking Heads table: two models play chess against each other while the pieces talk.
//   node table/play.mjs --white anthropic --black codex [--white-name Ada] [--black-name Brook] [--max-plies 300] [--out table/games]
// Each side is an adapter from voices/adapters.json. Every turn a player gets the board (rank 8 at the top), the last move, what was
// said across the board, and what the pieces said; never a list of legal moves or engine hints. They answer with JSON {"move", "says"}
// and write the move in chess notation. The table checks it against the board; a move that isn't legal (or isn't clear) is said back
// once and they try again. Three in a row ends the game without a result. "resign" concedes; "stop" leaves without a result.
// Writes <out>/<id>.md (readable transcript) and <out>/<id>.jsonl (every prompt, reply and event).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { matchMove } from './match-move.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.dirname(HERE);
const require = createRequire(import.meta.url);
const core = require('../src/chess-core.js'), cast = require('../src/chess-cast.js');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'voices', 'adapters.json'), 'utf8'));
const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

export function args(argv) {
  const a = {}; for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[++i];
  return a;
}

// One call to an adapter: the same small protocol voices/serve.py uses.
export function adapterCall(name, messages) {
  const ad = CFG.adapters[name];
  if (!ad) throw Error(`no adapter "${name}" in voices/adapters.json`);
  const cmd = ad.cmd.map(p => p === '{python}' ? PYTHON : p.replace('{adapters}', path.join(ROOT, 'voices', 'adapters')));
  const body = JSON.stringify({op: 'chat', request: {model: ad.model, messages}, effort: ad.effort || 'low', options: ad.options || {}});
  return new Promise(resolve => {
    const child = spawn(cmd[0], cmd.slice(1), {windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
    let out = '';
    const timer = setTimeout(() => { child.kill(); resolve({ok: false, error: 'ADAPTER_TIMEOUT'}); }, (ad.timeout_s || 180) * 1000);
    child.stdout.on('data', d => out += d);
    child.stderr.resume();
    child.on('error', () => { clearTimeout(timer); resolve({ok: false, error: 'ADAPTER_START_FAILED'}); });
    child.on('close', () => {
      clearTimeout(timer);
      try { resolve(JSON.parse(out)); } catch { resolve({ok: false, error: 'ADAPTER_OUTPUT_UNREADABLE'}); }
    });
    child.stdin.end(body);
  });
}

// The first JSON object in a reply (models sometimes wrap it in prose or a code fence).
export function readReply(text) {
  if (typeof text !== 'string') return null;
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try { const v = JSON.parse(text.slice(s, e + 1)); return v && typeof v === 'object' ? v : null; } catch { return null; }
}

const options = st => core.legalMoves(st).map(m => ({move: core.describe(m), from: core.sqName(m.from), to: core.sqName(m.to), promo: m.promo || null, m}));

export function prompt(t, side) {
  const me = t[side], them = t[side === 'w' ? 'b' : 'w'];
  const colour = side === 'w' ? 'White, the uppercase pieces' : 'Black, the lowercase pieces';
  const heard = t.heard[side].length ? 'Since your last move:\n' + t.heard[side].map(h => `- ${h}`).join('\n') + '\n' : '';
  const last = t.moves.length ? `${them.name}'s last move: ${t.moves.at(-1).said} (${t.moves.at(-1).move}).\n` : '';
  const bad = t.illegal[side] ? `Your last try, "${t.illegal[side]}", isn't a legal move here.\n` : '';
  return `You are playing chess against ${them.name}. You have ${colour}.\n` + last + heard +
    `The board now, rank 8 at the top:\n${core.boardText(t.st)}\n` + (core.inCheck(t.st, t.st.turn) ? 'You are in check.\n' : '') + bad +
    'The pieces have voices of their own and may answer what you say; you can speak to them or not.\n' +
    'Reply with only a JSON object with "move" (your move, in chess notation; "resign" to concede the game, or "stop" to leave it ' +
    `without a result) and "says" (one short line across the board, which ${them.name} hears, or null).`;
}

export async function playGame({white, black, whiteName, blackName, maxPlies = 300, out = path.join(HERE, 'games'), call = adapterCall, log = console.log}) {
  const id = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + `-${white}-vs-${black}`;
  fs.mkdirSync(out, {recursive: true});
  const jsonl = path.join(out, id + '.jsonl'), md = [];
  const rec = v => fs.appendFileSync(jsonl, JSON.stringify({at: new Date().toISOString(), ...v}) + '\n');
  const st0 = core.startPosition();
  const t = {st: st0, seen: {[core.posKey(st0)]: 1}, mem: {}, moves: [], heard: {w: [], b: []}, illegal: {w: null, b: null}, misses: {w: 0, b: 0},
    w: {adapter: white, name: whiteName || white}, b: {adapter: black, name: blackName || black}};
  if (t.w.name === t.b.name) { t.w.name += ' (White)'; t.b.name += ' (Black)'; }
  const line = s => { md.push(s); log(s); };
  line(`# ${t.w.name} (White) vs ${t.b.name} (Black)\n\nAdapters: ${white} (${CFG.adapters[white]?.model}) vs ${black} (${CFG.adapters[black]?.model}). Started ${new Date().toISOString()}.\n`);
  rec({event: 'start', white: t.w, black: t.b});
  let end = null;
  while (!end) {
    const side = t.st.turn, me = t[side], them = t[side === 'w' ? 'b' : 'w'];
    if (t.moves.length >= maxPlies) { end = {result: null, why: `stopped at the ${maxPlies}-ply limit`}; break; }
    const text = prompt(t, side);
    const messages = [{role: 'system', content: 'You are a chess player at a table where the pieces can talk. Reply with only the JSON object asked for.'},
      {role: 'user', content: text}];
    const r = await call(me.adapter, messages);
    rec({event: 'turn', side, prompt: text, reply: r});
    if (!r.ok) {
      t.misses[side]++;
      line(`> ${me.name}'s adapter failed (${r.error}); asking again.`);
      if (t.misses[side] >= 3) { end = {result: null, why: `${me.name}'s adapter failed three times in a row`}; break; }
      continue;
    }
    const v = readReply(r.content) || {move: r.content};
    const says = typeof v.says === 'string' && v.says.trim() ? v.says.trim().slice(0, 300) : null;
    const said = typeof v.move === 'string' ? v.move.trim().slice(0, 60) : '';
    const speak = () => { if (says) { line(`**${me.name}:** "${says}"`); t.heard[side === 'w' ? 'b' : 'w'].push(`${me.name} said: "${says}"`); } };
    if (/^(resign|stop)$/i.test(said)) {
      speak();
      end = said.toLowerCase() === 'resign' ? {result: side === 'w' ? 'b' : 'w', why: `${me.name} resigned`} : {result: null, why: `${me.name} stopped the game`};
      break;
    }
    const opts = options(t.st), pick = matchMove(said, opts);
    if (!pick) {
      t.illegal[side] = said || '(no move)'; t.misses[side]++;
      speak(); line(`> ${me.name}'s move "${said || '(none)'}" isn't a legal move here; asked again.`);
      rec({event: 'illegal', side, said});
      if (t.misses[side] >= 3) { end = {result: null, why: `${me.name} gave no legal move three times in a row`}; break; }
      continue;
    }
    t.illegal[side] = null; t.misses[side] = 0; t.heard[side] = [];
    const m = pick.m, next = core.makeMove(t.st, m), k = core.posKey(next);
    t.seen[k] = (t.seen[k] || 0) + 1;
    const talk = cast.reactions(t.st, m, next, t.mem);
    t.st = next;
    t.moves.push({side, said, move: pick.move});
    const n = Math.ceil(t.moves.length / 2);
    line(`\n**${n}${side === 'w' ? '.' : '...'} ${me.name}:** ${said} (${pick.move})`);
    speak();
    for (const p of talk) {
      line(`*${p.name} (${p.side === 'w' ? 'White' : 'Black'} ${p.piece}):* "${p.text}"`);
      for (const s of ['w', 'b']) t.heard[s].push(`${p.name} (${s === p.side ? 'your' : 'their'} ${p.piece}) said: "${p.text}"`);
    }
    rec({event: 'move', side, said, move: pick.move, talk});
    end = core.outcome(next, t.seen);
  }
  const result = end.result === 'w' ? `${t.w.name} wins` : end.result === 'b' ? `${t.b.name} wins` : end.result === 'd' ? 'draw' : 'no result';
  line(`\n**Game over:** ${result} (${end.why}).`);
  rec({event: 'end', end, result});
  const file = path.join(out, id + '.md');
  fs.writeFileSync(file, md.join('\n') + '\n');
  return {id, end, result, file, jsonl, moves: t.moves.length};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2));
  if (!a.white || !a.black) {
    console.log('usage: node table/play.mjs --white <adapter> --black <adapter> [--white-name N] [--black-name N] [--max-plies 300] [--out dir]');
    console.log('adapters:', Object.keys(CFG.adapters).join(', '));
    process.exit(2);
  }
  playGame({white: a.white, black: a.black, whiteName: a['white-name'], blackName: a['black-name'], maxPlies: +(a['max-plies'] || 300), out: a.out})
    .then(r => console.log(`\n${r.result} — ${r.file}`));
}
