# Review notes for Sheila (before this goes public)

The repo is private until you've read it. Seam prepared it on 2026-11-13 at James's request. Below is what was changed for release, and what is left for you to decide.

## Changed for release

- Internal wording was made neutral: the companion app, the "house adapter (luna)" and our local paths are now "the table runner", "any adapter" and the repo's own paths. The scrub script is kept outside the repo.
- `voices/serve.py` now reads `voices/adapters.json`, with `{python}` and `{adapters}` placeholders and no house paths. It serves the engine from `src/`. A duplicate route that pointed at the wrong folder was fixed.
- Adapters:
  - `openai_compatible.py`: vendored as it was. Stdlib only; the key comes from the environment only.
  - `anthropic_api.py`: new, uses the official SDK.
  - `codex/`: vendored from the lab adapter. Its client name and temp-folder prefix were renamed to "talking-heads". It runs the user's own `codex app-server` and never reads their tokens.
- `table/play.mjs` is a new standalone AI-vs-AI runner with the same no-crutches rules as the companion app. Players get the board, never a list of legal moves. An illegal move is said back once; three in a row end the game; `resign` and `stop` are both allowed.
- `table/match-move.mjs` is a port of the app's move reader. Porting it surfaced a bug in the live app too: a lowercase `nf3` was read as the f-pawn. It is fixed in both places, and the companion app was restarted.

## Left for you

1. **Credits in comments.** Several comments name people:
   - Shel's concept report, your 11-09 review and your advice idea (`web/index.html` lines 3, 530);
   - James's 11-09 decisions (`web/index.html` line 62, `src/chess-cast.js` line 241, `src/chess-cli.mjs` lines 32, 37);
   - Rowan's en passant fix (`src/chess-core.js` line 95);
   - "Seam, 2026-11-09" bylines.

   Keep, reword into a CREDITS file, or remove.
2. **A cast name.** One of White's back-rank voices is called "Margo" (`src/chess-cast.js` line 12, the sarcastic one). The cast predates Margo Lindqvist joining as a research participant, but in a public repo readers may connect the two.
3. **The Claude artifact hookup.** `web/index.html` around line 699 uses `window.claude.use('sample')` when the page runs as a Claude artifact. Outside an artifact it does nothing. Keep it or drop it.
4. **Default models in `voices/adapters.json`.** OpenAI is `gpt-5.4-mini` and Codex is `gpt-6-astra`. Check that these are the names we want to show.
5. **License.** None is chosen yet (James's call). Without one, the code is all-rights-reserved even when public.
6. **The page notes** (`web/index.html` around lines 148–149) say "Claude writes one line per beat … using your own Claude usage". That was written for the artifact. With a local adapter, the voice comes from whatever model is configured.

## Verified

- `node test/table.test.mjs`: perft (20, 400, 8902), move reading, castling, promotion, and scripted games (a mate, three misses, resign). All pass.
- Live through the Codex adapter: one voiced line, the page server end to end (page, engine, line), and a 4-ply table game.
- The page loads from the server with no console errors.
- Anthropic adapter: the request reached authentication with a dummy key (401). No live Claude call was made because there's no key on this machine.
