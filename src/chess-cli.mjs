// Chess for the table runner and any other host: one JSON op on stdin, one JSON reply on stdout. Rules and search come from chess-core.js,
// the pieces' voices from chess-cast.js.
//   {"op":"new"}                                          -> {ok, game}
//   {"op":"legal", game}                                  -> {ok, moves:[{from,to,promo,move}]}
//   {"op":"play", game, from, to, promo}                  -> {ok, game, move, end, talk}   (refuses an illegal move)
//   {"op":"candidates", game, strength}                   -> {ok, candidates:[{id,style,from,to,promo,move,note}], board, check}
// `game` is {pos, seen, cast}: the packed position, its repetition counts and the cast's memory of the game.
// `end` is null or {result:'w'|'b'|'d', why}. `talk` is what the pieces said about this move: [{id, name, side, piece, text}].
import core from './chess-core.js';
import cast from './chess-cast.js';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const reply = v => process.stdout.write(JSON.stringify(v));
try {
  const x = JSON.parse(input);
  const load = g => ({st: core.unpack(g.pos), seen: Object.assign({}, g.seen), mem: JSON.parse(JSON.stringify(g.cast || {}))});
  if (x.op === 'new') {
    const st = core.startPosition(), seen = {[core.posKey(st)]: 1};
    reply({ok: true, game: {pos: core.pack(st), seen, cast: {}}});
  } else if (x.op === 'legal') {
    const {st} = load(x.game);
    reply({ok: true, moves: core.legalMoves(st).map(m => ({from: m.from, to: m.to, promo: m.promo || null, move: core.describe(m)}))});
  } else if (x.op === 'play') {
    const {st, seen, mem} = load(x.game);
    const m = core.find(st, x.from, x.to, x.promo);
    if (!m) { reply({ok: false, error: 'ILLEGAL_MOVE'}); process.exitCode = 1; }
    else {
      const next = core.makeMove(st, m), k = core.posKey(next);
      seen[k] = (seen[k] || 0) + 1;
      const talk = cast.reactions(st, m, next, mem);
      // roster: who is still on the board, for a model writing the pieces' exchange (talking heads, James 11-09)
      reply({ok: true, game: {pos: core.pack(next), seen, cast: mem}, move: core.describe(m),
        end: core.outcome(next, seen), talk, roster: cast.roster(next)});
    }
  } else if (x.op === 'options') {
    // Free moves (James 11-09): every legal move, no engine hints. Each move's text is unique (it names both squares).
    const {st} = load(x.game);
    reply({ok: true, options: core.legalMoves(st).map(m => ({move: core.describe(m), from: m.from, to: m.to, promo: m.promo || null})),
      board: core.boardText(st), check: core.inCheck(st, st.turn),
      facts: {castling: st.cr, enPassant: st.ep >= 0 ? core.sqName(st.ep) : null,
        halfmovesWithoutPawnMoveOrCapture: st.half || 0, currentPositionOccurrences: x.game.seen[core.posKey(st)] || 0}});
  } else if (x.op === 'candidates') {
    const {st} = load(x.game);
    reply({ok: true, candidates: core.candidates(st, x.strength), board: core.boardText(st), check: core.inCheck(st, st.turn)});
  } else throw Error('UNKNOWN_OPERATION');
} catch (e) {
  reply({ok: false, error: e.message || 'CHESS_FAILED'});
  process.exitCode = 1;
}
