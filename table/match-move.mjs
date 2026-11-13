// Which legal move a player's written move names, or null. Players see the board, never a list of legal moves, and write their
// move themselves; the table checks it here. Accepts the engine's own wording ("knight g1 to f3"), a piece and both squares in any
// form (g1-f3, g1f3, e7e8q), castling (O-O, 0-0-0, castle kingside/queenside) and standard notation (Nf3, Nbd7, exd5, e8=Q).
// Case is ignored only where it can't confuse a bishop (B) with the b-file. A promotion with no piece named becomes a queen.
// `options` are the legal moves as {move, from, to, promo} (the engine's describe() text and squares).
const PIECE_LETTER = {K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight'};
const WORDS = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];

function info(o) {
  if (o.move.startsWith('castle')) return {castle: o.move.includes('kingside') ? 'K' : 'Q'};
  return {piece: o.move.split(' ')[0], frm: o.from, to: o.to, promo: o.promo || null};
}

export function matchMove(text, options) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const raw = text.trim().replace(/[.!?]+$/, '').trim();
  const low = raw.toLowerCase().replace(/[+#]+$/, '').trim();
  for (const o of options) if (o.move.toLowerCase() === low) return o;          // the engine's own wording
  const all = options.map(o => [o, info(o)]);
  const side = /^(o-o-o|0-0-0)\b/.test(low) || (low.includes('castle') && (low.includes('queen') || low.includes('long'))) ? 'Q'
    : /^(o-o|0-0)\b/.test(low) || (low.includes('castle') && (low.includes('king') || low.includes('short'))) ? 'K' : null;
  if (side) {
    const hit = all.filter(([, i]) => i.castle === side);
    return hit.length === 1 ? hit[0][0] : null;
  }
  let promo = null;
  const pm = low.match(/=\s*([qrbn])\b|[1-8]([qrbn])$|\b(queen|rook|bishop|knight)\s*\)?$/);
  if (pm && /[a-h][18]/.test(low))
    promo = {queen: 'q', rook: 'r', bishop: 'b', knight: 'n'}[pm[3]] || pm[1] || pm[2] || (pm[3] || '').slice(0, 1);
  const pick = cands => {
    if (!cands.length) return null;
    if (new Set(cands.map(([c]) => c.promo || null)).size > 1)                     // promotion variants: the one named, else a queen
      cands = cands.filter(([c]) => (c.promo || null) === (promo || 'q'));
    return cands.length === 1 ? cands[0][0] : null;
  };
  const sqs = low.match(/[a-h][1-8]/g) || [];
  if (sqs.length >= 2)                                                             // piece + both squares, in any wording
    return pick(all.filter(([, i]) => !i.castle && i.frm === sqs[0] && i.to === sqs[1]));
  if (sqs.length === 1) {                                                          // standard notation or "knight to f3"
    let to = sqs[0], compact = raw.replace(/ /g, '');
    if ('kqrn'.includes(compact[0])) compact = compact[0].toUpperCase() + compact.slice(1);   // nf3 is a knight, never the f-pawn; b stays a file
    const san = compact.match(/^([KQRBN])?([a-h])?([1-8])?x?([a-h][1-8])/);
    const word = WORDS.find(w => low.startsWith(w)) || null;
    const piece = san && san[1] ? PIECE_LETTER[san[1]] : word || 'pawn';
    let f = san ? san[2] || null : null; const r = san ? san[3] || null : null;
    if (piece === 'pawn' && !f && san && raw.includes('x') && raw.length > 2 && 'abcdefgh'.includes(raw[0])) f = raw[0];
    return pick(all.filter(([, i]) => !i.castle && i.to === to && i.piece === piece && (!f || i.frm[0] === f) && (!r || i.frm[1] === r)));
  }
  return null;
}
