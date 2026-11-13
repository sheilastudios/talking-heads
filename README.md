# Talking Heads

## Watch the demonstration

[![Watch Margo and Sheila play Talking Heads — full 33-minute video](https://sheilastudios.com/demos/talking-heads/cover.svg)](https://sheilastudios.com/demos/talking-heads/index.html)

**[Watch the full video in your browser](https://sheilastudios.com/demos/talking-heads/index.html)** · [Download the MP4](https://github.com/sheilastudios/talking-heads/releases/tag/demo-2026-11-13)

This is the companion-host demonstration, not a recording of the standalone CLI runner. The opening unrelated-game scoreboard is masked. The recording is not covered by the software's MIT license.

Chess where the pieces talk. Two ways to play:

- **The page** (`web/index.html`): you play; the pieces react, advise, grumble and remember. With no model attached it uses scripted lines. Attach a model and the pieces phrase their own lines.
- **The table** (`table/play.mjs`): two models play each other. Each one receives the current board, last move and recent table talk, and writes its move in chess notation. It gets no list of legal moves and no engine hints. The pieces supply scripted reactions between moves; model players can talk to each other and address the pieces. This standalone runner does not yet generate model-written replies from the pieces.

The rules engine (`src/chess-core.js`) and the cast (`src/chess-cast.js`) are plain JavaScript with no dependencies, shared by both.

## Release scope

This is the standalone chess page, rules engine, cast, table runner and provider adapters—not the companion application or its cognitive architecture. The browser page supports optional model-written piece lines; the standalone table currently uses scripted cast reactions. A demonstration recorded in another host is not a reproduction run of this runner.

The cast character named Margo is a chess queen, distinct from any companion player of the same name.

## Requirements

- Node 18 or newer (the table, and the Codex adapter)
- Python 3.9 or newer (the local page server and the API adapters)
- A model connection for model-driven play or voices (none needed for the scripted browser page)

## Connect a model

Every connection is an entry in `voices/adapters.json`. The page server and the table read the same file. No keys are stored there: each adapter reads its key from an environment variable.

| Name | What it uses | Setup |
|---|---|---|
| `openai` | OpenAI API | `OPENAI_API_KEY` |
| `openrouter` | OpenRouter (many models) | `OPENROUTER_API_KEY` |
| `local` | Any local OpenAI-compatible server (Ollama, LM Studio, llama.cpp) | Start the server; change `base_url` and `model` to match |
| `anthropic` | Anthropic API (Claude) | `pip install anthropic`, then `ANTHROPIC_API_KEY` |
| `codex` | Your own signed-in Codex CLI (ChatGPT plan) | Install Codex and run `codex login`. The adapter starts `codex app-server` and never reads your tokens. |

Change `model` and `effort` in an entry to taste, or copy an entry to add another. `default` names the entry the page server uses when you don't pick one.

An adapter is any command that reads one JSON request on stdin and writes one JSON reply on stdout:

```
in:  {"op": "chat", "request": {"model": "...", "messages": [{"role": "system"|"user"|"assistant", "content": "..."}]}, "effort": "low", "options": {...}}
out: {"ok": true, "content": "..."}    or    {"ok": false, "error": "..."}
```

So you can add another provider with a short script in `voices/adapters/`.

## Play on the page

Open `web/index.html` in a browser for scripted voices. For model voices, run:

```bash
python voices/serve.py anthropic
```

Then open http://127.0.0.1:8821/. The server listens on 127.0.0.1 only and accepts same-origin requests only, so other websites can't spend your model usage.

## Run a table game

```bash
node table/play.mjs --white anthropic --black codex --white-name Ada --black-name Brook
```

Each player answers with `{"move": "...", "says": "..."}`.

- **Moves:** the table accepts standard notation (`Nf3`, `exd5`, `O-O`, `e8=Q`) or plain wording (`knight g1 to f3`, `g1f3`).
- **Illegal or unclear moves:** the table says the move back once and asks again. Three in a row end the game without a result.
- **Ending a game:** `resign` concedes; `stop` leaves without a result.

Configured models must be available to your account; change the example model IDs as needed. Provider usage may incur charges.

The transcript goes to `table/games/<id>.md`. Every prompt and reply also goes to `table/games/<id>.jsonl`.

## Tests

```bash
node test/table.test.mjs
```

These cover engine move counts (perft), move matching (notation, captures, castling, promotion) and scripted games. None of them make model calls.

## Credits and rights

A Sheila Studios project: concept by Shel; direction by James Mayo; implementation by Seam; play, review and design contributions by Sheila; en-passant repetition correction by Rowan.

The released standalone code and its accompanying software documentation are licensed under the [MIT License](LICENSE): you may use, modify, redistribute and build on them, including commercially, while retaining the copyright and license notice. See [RIGHTS.md](RIGHTS.md) for the scope of this grant.

The demo video and other game recordings, participant histories, private companion application and unreleased cognitive architecture are not included in that software license. Public viewing of a recording is not permission to reuse it.
