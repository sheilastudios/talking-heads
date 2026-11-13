// Talking Pieces chess core: rules, search, and helpers for model players. One engine for the Talking Pieces page
// (browser global `ChessCore`) and the table runner (Node, through chess-cli.mjs). Seam, 2026-11-09.
// Board: 64 squares, index = row*8 + col, row 0 is rank 8. A piece is {c:'w'|'b', t:'p'|'n'|'b'|'r'|'q'|'k', id?}.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChessCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VAL = {p: 100, n: 320, b: 330, r: 500, q: 900, k: 0};
  const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const RD = [[-1, 0], [1, 0], [0, -1], [0, 1]], BD = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const GLYPH = {k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'};
  const TNAME = {p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king'};
  const PROMOS = ['q', 'r', 'b', 'n'];
  const INF = 1e9, MATE = 100000;
  const sqName = i => 'abcdefgh'[i & 7] + (8 - (i >> 3));
  const inb = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
  const opp = c => c === 'w' ? 'b' : 'w';

  function attacked(b, s, by) { return cheapestAttacker(b, s, by) < Infinity; }
  // Value of the cheapest `by` piece attacking square s (Infinity if none). King counts as 2000.
  function cheapestAttacker(b, s, by) {
    const r = s >> 3, c = s & 7, pr = by === 'w' ? r + 1 : r - 1; let best = Infinity;
    if (pr >= 0 && pr < 8) for (const dc of [-1, 1]) { const cc = c + dc; if (cc < 0 || cc > 7) continue; const p = b[pr * 8 + cc]; if (p && p.c === by && p.t === 'p') return 100; }
    for (const [dr, dc] of KN) { const rr = r + dr, cc = c + dc; if (!inb(rr, cc)) continue; const p = b[rr * 8 + cc]; if (p && p.c === by && p.t === 'n') best = Math.min(best, 320); }
    for (const [dirs, ts] of [[BD, 'bq'], [RD, 'rq']]) for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (inb(rr, cc)) { const p = b[rr * 8 + cc]; if (p) { if (p.c === by && ts.includes(p.t)) best = Math.min(best, VAL[p.t]); break; } rr += dr; cc += dc; }
    }
    for (const [dr, dc] of KG) { const rr = r + dr, cc = c + dc; if (!inb(rr, cc)) continue; const p = b[rr * 8 + cc]; if (p && p.c === by && p.t === 'k') best = Math.min(best, 2000); }
    return best;
  }
  function kingSq(b, c) { for (let i = 0; i < 64; i++) { const p = b[i]; if (p && p.c === c && p.t === 'k') return i; } return -1; }
  function inCheck(st, c) { const k = kingSq(st.b, c); return k >= 0 && attacked(st.b, k, opp(c)); }
  // A piece is in danger if it is attacked and either undefended or attackable by something cheaper.
  function inDanger(b, s, color) { const p = b[s]; const ca = cheapestAttacker(b, s, opp(color)); if (ca === Infinity) return false; return !attacked(b, s, color) || ca < VAL[p.t]; }

  function genPseudo(st, capOnly) {
    const b = st.b, color = st.turn, o = opp(color), out = [];
    for (let i = 0; i < 64; i++) {
      const p = b[i]; if (!p || p.c !== color) continue;
      const r = i >> 3, c = i & 7;
      const add = (to, x) => { const cap = b[to]; if (capOnly && !cap) return; out.push(Object.assign({from: i, to, piece: p, cap}, x)); };
      if (p.t === 'p') {
        const d = color === 'w' ? -1 : 1, start = color === 'w' ? 6 : 1, last = color === 'w' ? 0 : 7, r1 = r + d;
        if (r1 < 0 || r1 > 7) continue;
        const pawnTo = t => { if (r1 === last) for (const pr of PROMOS) add(t, {promo: pr}); else add(t); };
        if (!capOnly && !b[r1 * 8 + c]) {
          pawnTo(r1 * 8 + c);
          if (r === start && !b[(r + 2 * d) * 8 + c]) add((r + 2 * d) * 8 + c, {double: true});
        }
        for (const dc of [-1, 1]) {
          const c1 = c + dc; if (c1 < 0 || c1 > 7) continue; const t = r1 * 8 + c1;
          if (b[t] && b[t].c === o) pawnTo(t);
          else if (t === st.ep && b[r * 8 + c1] && b[r * 8 + c1].t === 'p' && b[r * 8 + c1].c === o) out.push({from: i, to: t, piece: p, cap: b[r * 8 + c1], epCap: r * 8 + c1});
        }
      } else if (p.t === 'n' || p.t === 'k') {
        for (const [dr, dc] of (p.t === 'n' ? KN : KG)) { const rr = r + dr, cc = c + dc; if (!inb(rr, cc)) continue; const t = rr * 8 + cc; if (!b[t] || b[t].c === o) add(t); }
        if (p.t === 'k' && !capOnly) {
          const home = color === 'w' ? 60 : 4;
          if (i === home && !attacked(b, i, o)) {
            const K = color + 'K', Q = color + 'Q';
            if (st.cr[K] && !b[i + 1] && !b[i + 2] && b[i + 3] && b[i + 3].t === 'r' && b[i + 3].c === color && !attacked(b, i + 1, o) && !attacked(b, i + 2, o))
              out.push({from: i, to: i + 2, piece: p, cap: null, castle: 'K'});
            if (st.cr[Q] && !b[i - 1] && !b[i - 2] && !b[i - 3] && b[i - 4] && b[i - 4].t === 'r' && b[i - 4].c === color && !attacked(b, i - 1, o) && !attacked(b, i - 2, o))
              out.push({from: i, to: i - 2, piece: p, cap: null, castle: 'Q'});
          }
        }
      } else {
        const dirs = p.t === 'r' ? RD : p.t === 'b' ? BD : RD.concat(BD);
        for (const [dr, dc] of dirs) {
          let rr = r + dr, cc = c + dc;
          while (inb(rr, cc)) { const t = rr * 8 + cc; if (b[t]) { if (b[t].c === o) add(t); break; } add(t); rr += dr; cc += dc; }
        }
      }
    }
    return out;
  }
  function makeMove(st, m) {
    const b = st.b.slice();
    b[m.to] = m.promo ? Object.assign({}, m.piece, {t: m.promo, promoted: true}) : m.piece;
    b[m.from] = null;
    if (m.epCap != null) b[m.epCap] = null;
    if (m.castle === 'K') { b[m.from + 1] = b[m.from + 3]; b[m.from + 3] = null; }
    if (m.castle === 'Q') { b[m.from - 1] = b[m.from - 4]; b[m.from - 4] = null; }
    const cr = Object.assign({}, st.cr);
    if (m.piece.t === 'k') { cr[m.piece.c + 'K'] = false; cr[m.piece.c + 'Q'] = false; }
    for (const s of [m.from, m.to]) { if (s === 63) cr.wK = false; if (s === 56) cr.wQ = false; if (s === 7) cr.bK = false; if (s === 0) cr.bQ = false; }
    const half = (m.piece.t === 'p' || m.cap) ? 0 : (st.half || 0) + 1;
    return {b, turn: opp(st.turn), cr, ep: m.double ? (m.from + m.to) / 2 : -1, half};
  }
  function legalMoves(st, capOnly) { return genPseudo(st, capOnly).filter(m => !inCheck(makeMove(st, m), st.turn)); }
  function posKey(st) {
    // An en passant target matters only if the side to move can legally take it (Rowan's fix, 11-09).
    const ep = st.ep >= 0 && genPseudo(st, true).some(m => m.epCap != null && !inCheck(makeMove(st, m), st.turn)) ? st.ep : -1;
    return st.b.map(p => p ? (p.c === 'w' ? p.t.toUpperCase() : p.t) : '.').join('') + st.turn + (st.cr.wK ? 'K' : '') + (st.cr.wQ ? 'Q' : '') + (st.cr.bK ? 'k' : '') + (st.cr.bQ ? 'q' : '') + ep;
  }
  function insufficient(b) {
    const minors = [];
    for (let i = 0; i < 64; i++) { const p = b[i]; if (!p || p.t === 'k') continue; if (p.t === 'p' || p.t === 'r' || p.t === 'q') return false; minors.push({t: p.t, shade: ((i >> 3) + (i & 7)) % 2}); }
    if (minors.length <= 1) return true;
    return minors.every(m => m.t === 'b' && m.shade === minors[0].shade);
  }

  // ---- evaluation + search: 2 ply + quiescence; evasions searched in check ----
  function pst(p, i) {
    const r = i >> 3, c = i & 7, center = 7 - (Math.abs(c - 3.5) + Math.abs(r - 3.5));
    switch (p.t) {
      case 'n': return center * 6; case 'b': return center * 4; case 'q': return center * 2;
      case 'p': { const adv = p.c === 'w' ? 6 - r : r - 1; return adv * 8 + (c >= 2 && c <= 5 ? center * 2 : 0); }
      case 'k': { const back = p.c === 'w' ? r === 7 : r === 0; return back ? (c <= 2 || c >= 6 ? 20 : 0) : -15; }
      default: return 0;
    }
  }
  function evaluate(st) { let s = 0; for (let i = 0; i < 64; i++) { const p = st.b[i]; if (!p) continue; const v = VAL[p.t] + pst(p, i); s += p.c === 'w' ? v : -v; } return st.turn === 'w' ? s : -s; }
  const mvv = m => m.cap ? VAL[m.cap.t] * 10 - VAL[m.piece.t] : (m.promo ? VAL[m.promo] : -1e4);
  const order = ms => ms.sort((a, b) => mvv(b) - mvv(a));
  function quiesce(st, alpha, beta, qd) {
    if (inCheck(st, st.turn)) {
      const ms = legalMoves(st);
      if (!ms.length) return -MATE;
      if (qd === 0) return evaluate(st);
      for (const m of order(ms)) { const s = -quiesce(makeMove(st, m), -beta, -alpha, qd - 1); if (s >= beta) return beta; if (s > alpha) alpha = s; }
      return alpha;
    }
    const stand = evaluate(st);
    if (stand >= beta) return beta; if (stand > alpha) alpha = stand; if (qd === 0) return alpha;
    for (const m of order(legalMoves(st, true))) { const s = -quiesce(makeMove(st, m), -beta, -alpha, qd - 1); if (s >= beta) return beta; if (s > alpha) alpha = s; }
    return alpha;
  }
  function negamax(st, depth, alpha, beta) {
    if (depth === 0) return quiesce(st, alpha, beta, 4);
    const ms = legalMoves(st);
    if (!ms.length) return inCheck(st, st.turn) ? -MATE - depth : 0;
    for (const m of order(ms)) { const s = -negamax(makeMove(st, m), depth - 1, -beta, -alpha); if (s >= beta) return beta; if (s > alpha) alpha = s; }
    return alpha;
  }
  // Every legal move for the side to move, scored for that side (higher is better), best first.
  function analyze(st) {
    const list = legalMoves(st).map(m => ({m, s: -negamax(makeMove(st, m), 1, -INF, INF)}));
    list.sort((a, b) => b.s - a.s);
    return {list, best: list.length ? list[0].s : 0};
  }

  // ---- game helpers ----
  function describe(m) {
    if (m.castle) return m.castle === 'K' ? 'castle kingside' : 'castle queenside';
    return `${TNAME[m.piece.t]} ${sqName(m.from)} ${m.cap ? 'takes on' : 'to'} ${sqName(m.to)}${m.promo && m.promo !== 'q' ? ' (make it a ' + TNAME[m.promo] + ')' : m.promo ? ' (becomes a queen)' : ''}`;
  }
  function startPosition() {
    const b = Array(64).fill(null), back = 'rnbqkbnr';
    for (let f = 0; f < 8; f++) {  // ids name the piece for the cast (chess-cast.js): side + B<file> or P<file>
      b[56 + f] = {c: 'w', t: back[f], id: 'wB' + f}; b[48 + f] = {c: 'w', t: 'p', id: 'wP' + f};
      b[f] = {c: 'b', t: back[f], id: 'bB' + f}; b[8 + f] = {c: 'b', t: 'p', id: 'bP' + f};
    }
    return {b, turn: 'w', cr: {wK: true, wQ: true, bK: true, bQ: true}, ep: -1, half: 0};
  }
  // How the game stands for the side to move: null while it goes on, else {result:'w'|'b'|'d', why}.
  function outcome(st, seen) {
    if (!legalMoves(st).length) return inCheck(st, st.turn) ? {result: opp(st.turn), why: 'checkmate'} : {result: 'd', why: 'stalemate'};
    if ((st.half || 0) >= 100) return {result: 'd', why: 'the fifty-move rule'};
    if (seen && (seen[posKey(st)] || 0) >= 3) return {result: 'd', why: 'threefold repetition'};
    if (insufficient(st.b)) return {result: 'd', why: 'insufficient material'};
    return null;
  }
  // Plain-data form for storage: pieces as 'wp', 'bq', ... with '@id' when the piece has one ('wn@wB1').
  function pack(st) { return {b: st.b.map(p => p ? p.c + p.t + (p.id ? '@' + p.id : '') : null), turn: st.turn, cr: st.cr, ep: st.ep, half: st.half || 0}; }
  function unpack(x) {
    return {b: x.b.map(s => { if (!s) return null; const [ct, id] = s.split('@'); return id ? {c: ct[0], t: ct[1], id} : {c: ct[0], t: ct[1]}; }),
      turn: x.turn, cr: Object.assign({}, x.cr), ep: x.ep, half: x.half || 0};
  }
  // A board a reader can follow: White in capitals, files and ranks labelled, rank 8 first.
  function boardText(st) {
    const rows = [];
    for (let r = 0; r < 8; r++) {
      let line = (8 - r) + ' ';
      for (let c = 0; c < 8; c++) { const p = st.b[r * 8 + c]; line += ' ' + (p ? (p.c === 'w' ? p.t.toUpperCase() : p.t) : '.'); }
      rows.push(line);
    }
    rows.push('   a b c d e f g h');
    return rows.join('\n');
  }
  // What a move does, in a few plain words, for someone choosing between moves.
  function note(st, m) {
    const after = makeMove(st, m), bits = [];
    if (!legalMoves(after).length && inCheck(after, after.turn)) return 'checkmate';
    if (m.cap) bits.push(`takes a ${TNAME[m.cap.t]}`);
    if (inCheck(after, after.turn)) bits.push('gives check');
    if (m.promo) bits.push(`makes a ${TNAME[m.promo]}`);
    if (m.castle) bits.push('tucks the king away');
    const moved = after.b[m.to];
    if (moved && moved.t !== 'k' && moved.t !== 'p' && inDanger(after.b, m.to, moved.c)) bits.push('leaves it exposed');
    if (!bits.length) {
      const home = m.piece.c === 'w' ? 7 : 0;
      if ((m.piece.t === 'n' || m.piece.t === 'b') && (m.from >> 3) === home) bits.push('develops');
      else if (m.piece.t === 'p') bits.push('pushes a pawn');
      else bits.push('quiet');
    }
    return bits.join(', ');
  }
  // Three moves for a model player to choose between, each with a character: solid (the engine's choice), sharp (a capture or
  // check that holds up), cheeky (something with flair that is still a real move). Strength widens or narrows the slack.
  const SLACK = {easy: 260, fair: 150, strong: 60};
  function candidates(st, strength) {
    const a = analyze(st), slack = SLACK[strength] || SLACK.fair, picked = [], key = x => x.m.from + ':' + x.m.to + ':' + (x.m.promo || '');
    if (!a.list.length) return [];
    const within = n => a.list.filter(x => a.best - x.s <= n && !picked.some(p => key(p.x) === key(x)));
    const take = (style, pool) => { if (pool.length) picked.push({style, x: pool[0]}); };
    const solidPool = strength === 'easy' ? within(slack / 2) : [a.list[0]];
    take('solid', [solidPool[Math.floor(Math.random() * solidPool.length)]].filter(Boolean));
    take('sharp', within(slack).filter(x => x.m.cap || inCheck(makeMove(st, x.m), opp(st.turn))));
    const flair = within(slack).filter(x => x.m.piece.t === 'q' || x.m.piece.t === 'n' || (x.m.piece.t === 'p' && Math.abs((x.m.to >> 3) - (x.m.from >> 3)) === 2) || x.m.castle);
    take('cheeky', flair.length ? [flair[Math.floor(Math.random() * flair.length)]] : []);
    // No capture/check or no flair move worth offering: fill the slot honestly rather than mislabel a quiet move.
    for (const style of ['sharp', 'cheeky']) if (!picked.some(p => p.style === style)) take('another option', within(slack * 2));
    return picked.map((p, i) => ({id: 'abc'[i], style: p.style, from: p.x.m.from, to: p.x.m.to, promo: p.x.m.promo || null,
      move: describe(p.x.m), note: note(st, p.x.m), loss: a.best - p.x.s}));
  }
  function find(st, from, to, promo) { return legalMoves(st).find(m => m.from === from && m.to === to && (m.promo || null) === (promo || null)) || null; }

  return {VAL, GLYPH, TNAME, PROMOS, MATE, sqName, opp, attacked, cheapestAttacker, kingSq, inCheck, inDanger, genPseudo, makeMove, legalMoves,
    posKey, insufficient, evaluate, analyze, describe, startPosition, outcome, pack, unpack, boardText, note, candidates, find};
});
