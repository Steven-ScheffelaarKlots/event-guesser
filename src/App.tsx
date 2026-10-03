import { Board } from "./components/Board";
import { WinDialog } from "./components/WinDialog";
import { useGame } from "./hooks/useGame";

export default function App() {
  const { state, dispatch, newGame } = useGame();

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <h1 className="masthead__title">Chronodle</h1>
          <p className="masthead__tagline">Put five moments from history in order, earliest first.</p>
        </div>
        <button type="button" className="button button--ghost" onClick={newGame}>
          New game
        </button>
      </header>

      <main>
        <Board state={state} dispatch={dispatch} onNewGame={newGame} />
      </main>

      <WinDialog state={state} onNewGame={newGame} />
    </div>
  );
}
