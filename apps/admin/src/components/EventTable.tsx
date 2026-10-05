import { formatEventDate, type AdminEvent } from "@chronodle/shared";
import { useState } from "react";
import type { Sort, SortKey } from "../logic/events";

interface EventTableProps {
  events: AdminEvent[];
  sort: Sort;
  onSort: (key: SortKey) => void;
  onEdit: (event: AdminEvent) => void;
  onDelete: (event: AdminEvent) => void;
  onToggle: (event: AdminEvent, enabled: boolean) => Promise<unknown>;
}

export function EventTable({ events, sort, onSort, onEdit, onDelete, onToggle }: EventTableProps) {
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  async function toggle(event: AdminEvent) {
    setPending((ids) => new Set(ids).add(event.id));
    setRowErrors((errors) => {
      const next = { ...errors };
      delete next[event.id];
      return next;
    });
    try {
      await onToggle(event, !event.enabled);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't update this event";
      setRowErrors((errors) => ({ ...errors, [event.id]: message }));
    } finally {
      setPending((ids) => {
        const next = new Set(ids);
        next.delete(event.id);
        return next;
      });
    }
  }

  if (events.length === 0) return <p className="empty">No events match these filters.</p>;

  return (
    <div className="table-wrap">
      <table className="events">
        <thead>
          <tr>
            <SortHeader label="Date" sortKey="date" sort={sort} onSort={onSort} />
            <SortHeader label="Name" sortKey="name" sort={sort} onSort={onSort} />
            <SortHeader label="Genre" sortKey="genre" sort={sort} onSort={onSort} />
            <th scope="col">Enabled</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} className={event.enabled ? undefined : "is-disabled"}>
              <td className="events__date">{formatEventDate(event.date)}</td>
              <td>
                <div className="events__name">{event.name}</div>
                <div className="events__desc">{event.description}</div>
              </td>
              <td>{event.genre ?? <span className="muted">—</span>}</td>
              <td>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={event.enabled}
                  disabled={pending.has(event.id)}
                  onChange={() => void toggle(event)}
                  aria-label={`${event.name} enabled`}
                />
                {rowErrors[event.id] && (
                  <div className="row-error" role="alert">
                    {rowErrors[event.id]}
                  </div>
                )}
              </td>
              <td className="events__actions">
                <button type="button" className="button button--small" onClick={() => onEdit(event)}>
                  Edit
                </button>
                <button type="button" className="button button--small button--danger" onClick={() => onDelete(event)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface SortHeaderProps {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
}

function SortHeader({ label, sortKey, sort, onSort }: SortHeaderProps) {
  const active = sort.key === sortKey;
  const ariaSort = active ? (sort.direction === "asc" ? "ascending" : "descending") : "none";
  return (
    <th scope="col" aria-sort={ariaSort}>
      <button type="button" className="sort" onClick={() => onSort(sortKey)}>
        {label}
        {active && <span aria-hidden="true">{sort.direction === "asc" ? " ▲" : " ▼"}</span>}
      </button>
    </th>
  );
}
