// Tests for the table: move matching, and a scripted game with fake players (no model calls).   node test/table.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { matchMove } from '../table/match-move.mjs';
import { playGame, readReply } from '../table/play.mjs';
const require = createRequire(import.meta.url);
const core = require('../src/chess-core.js');
const opts = st => core.legalMoves(st).map(m => ({move: core.describe(m), from: core.sqName(m.from), to: core.sqName(m.to), promo: m.promo || null}));
const after = moves => { let st = core.startPosition(); for (const [f, t, p] of moves) { const m = core.legalMoves(st).find(m => core.sqName(m.from) === f && core.sqName(m.to) === t && (m.promo || null) === (p || null)); if (!m) throw Error(`not legal: ${f}${t}`); st = core.makeMove(st, m); } return st; };
let n = 0; const ok = (name, f) => { f(); n++; console.log('ok', name); };

// perft: the engine's move counts from the start position (known values 20, 400, 8902)
ok('perft', () => {
  const perft = (st, d) => d === 0 ? 1 : core.legalMoves(st).reduce((s, m) => s + perft(core.makeMove(st, m), d - 1), 0);
  assert.deepEqual([1, 2, 3].map(d => perft(core.startPosition(), d)), [20, 400, 8902]);
});
ok('notation forms', () => {
  const o = opts(core.startPosition()), mv = t => matchMove(t, o)?.move;
  for (const t of ['Nf3', 'nf3', 'knight g1 to f3', 'g1-f3', 'g1f3', 'Ng1f3', 'Nf3+', 'Nf3!']) assert.equal(mv(t), 'knight g1 to f3', t);
  assert.equal(mv('e4'), 'pawn e2 to e4'); assert.equal(mv('e2e4'), 'pawn e2 to e4');
  for (const t of ['Nf4', 'Ke2', 'O-O', '', 'hello', 'Bb5']) assert.equal(mv(t), undefined, t);
});
ok('bishop vs b-file, captures', () => {
  const st = after([['e2', 'e4'], ['d7', 'd5'], ['b1', 'c3'], ['b7', 'b5'], ['f1', 'b5']]);   // Bb5+: black must answer the check
  const o = opts(st);
  assert.equal(matchMove('Bd7', o)?.move, 'bishop c8 to d7');
  assert.equal(matchMove('dxe4', o), null);   // Bb5 is check: the capture doesn't answer it
  assert.equal(matchMove('c6', o)?.move, 'pawn c7 to c6');
  const o2 = opts(after([['e2', 'e4'], ['d7', 'd5']]));
  assert.equal(matchMove('exd5', o2)?.move, 'pawn e4 takes on d5');
  assert.equal(matchMove('e4xd5', o2)?.move, 'pawn e4 takes on d5');
  assert.equal(matchMove('Nc6', o)?.move, 'knight b8 to c6');
});
ok('castling', () => {
  const st = after([['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6'], ['f1', 'c4'], ['g8', 'f6']]);
  for (const t of ['O-O', '0-0', 'castle kingside', 'Castle short']) assert.equal(matchMove(t, opts(st))?.move, 'castle kingside', t);
  assert.equal(matchMove('O-O-O', opts(st)), null);
});
ok('promotion', () => {
  // a white pawn on b7 that can take the rook on a8 or the bishop on c8, each with four promotions
  const o = opts(after([['a2', 'a4'], ['h7', 'h6'], ['a4', 'a5'], ['h6', 'h5'], ['a5', 'a6'], ['h5', 'h4'], ['a6', 'b7'], ['h4', 'h3']]));
  assert.equal(matchMove('bxa8=Q', o)?.promo, 'q');
  assert.equal(matchMove('bxa8', o)?.promo, 'q');
  assert.equal(matchMove('b7a8n', o)?.promo, 'n');
  assert.equal(matchMove('bxc8=N', o)?.to, 'c8');
  assert.equal(matchMove('bxc8=N', o)?.promo, 'n');
  assert.equal(matchMove('b8=Q', o), null);   // the knight on b8 blocks the push
});
ok('readReply', () => {
  assert.deepEqual(readReply('```json\n{"move":"e4","says":null}\n```'), {move: 'e4', says: null});
  assert.equal(readReply('e4'), null);
});

// A scripted game: fool's mate, with one illegal try said back once.
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'th-test-'));
const script = {w: ['f3', 'Ke5', 'g4'], b: ['e5', 'Qh4#']};
const prompts = [];
const call = async (adapter, messages) => {
  const side = adapter === 'fakeW' ? 'w' : 'b'; prompts.push(messages[1].content);
  return {ok: true, content: JSON.stringify({move: script[side].shift(), says: side === 'w' ? null : 'Hello.'})};
};
const r = await playGame({white: 'fakeW', black: 'fakeB', out, call, log: () => {}});
ok('scripted game', () => {
  assert.equal(r.result, 'fakeB wins'); assert.equal(r.end.result, 'b'); assert.equal(r.moves, 4);
  assert.ok(prompts.some(p => p.includes('Your last try, "Ke5", isn\'t a legal move here.')));
  assert.ok(!prompts.some(p => /legal moves:|pawn e2 to e4,/.test(p)), 'no list of moves in any prompt');
  assert.ok(prompts[1].includes('rank 8 at the top'));
  const md = fs.readFileSync(r.file, 'utf8');
  assert.ok(md.includes('Game over:') && md.includes('Qh4#'));
});
const r2 = await playGame({white: 'fakeW', black: 'fakeB', out, call: async () => ({ok: true, content: '{"move":"Zz9","says":null}'}), log: () => {}});
assert.equal(r2.end.result, null); assert.match(r2.end.why, /three times/);
const r3 = await playGame({white: 'fakeW', black: 'fakeB', out, call: async () => ({ok: true, content: '{"move":"resign","says":"Well played."}'}), log: () => {}});
assert.equal(r3.end.result, 'b');
fs.rmSync(out, {recursive: true, force: true});
console.log('ok three misses end the game without a result; ok resign concedes');
console.log(`all ${n + 2} groups passed`);
