import type { ReactNode } from "react";

export function Masthead({ action }: { action?: ReactNode }) {
  return (
    <header className="masthead">
      <div>
        <h1 className="masthead__title">Chronodle</h1>
        <p className="masthead__tagline">Put five moments from history in order, earliest first.</p>
      </div>
      {action}
    </header>
  );
}
