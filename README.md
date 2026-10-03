# Chronodle

Put five historical events in chronological order. After each guess, every card
is coloured by how far it is from its correct position:

- **Green**: right spot
- **Yellow**: one spot off
- **Red**: two or more spots off

## Running

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # game-logic unit tests
npm run build   # type-check + production build
```

## Layout

| Path | Responsibility |
| --- | --- |
| `src/data/events.ts` | The event bank: name, description, date, Wikipedia link and optional genre per event. Append entries to add events. |
| `src/game/dates.ts` | Parsing, comparing and formatting `YYYY-MM-DD` dates (BC as `-YYYY`). |
| `src/game/generate.ts` | Picks and shuffles events into a `Puzzle`. Takes an injectable `random` so a seeded/daily source can plug in. `puzzleFromEvents` builds a puzzle from a fixed set. |
| `src/game/evaluate.ts` | Scores a guess (distance → correct/near/far). |
| `src/game/state.ts` | Pure reducer for the guess row, submissions, history and win state. |
| `src/hooks/useGame.ts` | Wires the reducer to React and decides where new puzzles come from. |
| `src/components/` | UI: available events, guess row (drag & drop via `@dnd-kit`), history, win dialog. `dnd.ts` holds drag ids and collision rules. |

The game logic in `src/game/` has no React or DOM dependencies.
