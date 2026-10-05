import { PUZZLE_SIZE, type AdminEvent } from "@chronodle/shared";
import { useMemo, useState } from "react";
import { DeleteDialog } from "./components/DeleteDialog";
import { EventFormDialog } from "./components/EventFormDialog";
import { EventTable } from "./components/EventTable";
import { Toolbar } from "./components/Toolbar";
import { DEFAULT_FILTERS, DEFAULT_SORT, filterEvents, nextSort, sortEvents } from "./logic/events";
import { useEvents } from "./useEvents";

export default function App() {
  const { events, status, error, reload, create, update, remove } = useEvents();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [editing, setEditing] = useState<AdminEvent | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminEvent | null>(null);

  const visible = useMemo(() => sortEvents(filterEvents(events, filters), sort), [events, filters, sort]);
  const enabledCount = events.filter((event) => event.enabled).length;

  return (
    <div className="admin">
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Chronodle admin</h1>
          {status === "ready" && (
            <p className="admin__counts">
              {events.length} events · {enabledCount} enabled
            </p>
          )}
        </div>
        <button
          type="button"
          className="button button--primary"
          onClick={() => setEditing("new")}
          disabled={status !== "ready"}
        >
          New event
        </button>
      </header>

      {status === "ready" && enabledCount < PUZZLE_SIZE && (
        <div className="banner banner--warning" role="status">
          The game needs at least {PUZZLE_SIZE} enabled events.
        </div>
      )}

      {status === "error" && (
        <div className="banner banner--error" role="alert">
          <span>{error}</span>
          <button type="button" className="button button--small" onClick={() => void reload()}>
            Retry
          </button>
        </div>
      )}

      {status === "loading" && <p className="muted">Loading events…</p>}

      {status === "ready" && (
        <>
          <Toolbar filters={filters} onChange={setFilters} />
          <EventTable
            events={visible}
            sort={sort}
            onSort={(key) => setSort((current) => nextSort(current, key))}
            onEdit={setEditing}
            onDelete={setDeleting}
            onToggle={(event, enabled) => update(event.id, { enabled })}
          />
        </>
      )}

      <EventFormDialog target={editing} onClose={() => setEditing(null)} onCreate={create} onUpdate={update} />
      <DeleteDialog
        event={deleting}
        onClose={() => setDeleting(null)}
        onDelete={remove}
        onDisable={(event) => update(event.id, { enabled: false })}
      />
    </div>
  );
}
