import { PUZZLE_SIZE } from "@chronodle/shared";
import { Masthead } from "./components/Masthead";
import { Game } from "./Game";
import { useEventBank } from "./hooks/useEventBank";

export default function App() {
  const { bank, retry } = useEventBank();

  if (bank.status === "ready" && bank.events.length >= PUZZLE_SIZE) {
    return <Game bank={bank.events} />;
  }

  return (
    <div className="app">
      <Masthead />
      <main className="status" role={bank.status === "error" ? "alert" : "status"}>
        {bank.status === "loading" && <p>Loading events…</p>}
        {bank.status === "error" && (
          <>
            <p className="status__title">Couldn't load events</p>
            <p>{bank.error}</p>
            <button type="button" className="button button--primary" onClick={retry}>
              Retry
            </button>
          </>
        )}
        {bank.status === "ready" && <p>Not enough events available yet. Check back soon.</p>}
      </main>
    </div>
  );
}
