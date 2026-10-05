import type { HistoricalEvent } from "@chronodle/shared";
import { Board } from "./components/Board";
import { Masthead } from "./components/Masthead";
import { WinDialog } from "./components/WinDialog";
import { useGame } from "./hooks/useGame";

export function Game({ bank }: { bank: readonly HistoricalEvent[] }) {
  const { state, dispatch, newGame } = useGame(bank);

  return (
    <div className="app">
      <Masthead
        action={
          <button type="button" className="button button--ghost" onClick={newGame}>
            New game
          </button>
        }
      />

      <main>
        <Board state={state} dispatch={dispatch} onNewGame={newGame} />
      </main>

      <WinDialog state={state} onNewGame={newGame} />
    </div>
  );
}
