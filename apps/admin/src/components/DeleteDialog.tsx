import type { AdminEvent } from "@chronodle/shared";
import { useEffect, useRef, useState } from "react";

interface DeleteDialogProps {
  event: AdminEvent | null;
  onClose: () => void;
  onDelete: (id: string) => Promise<unknown>;
  onDisable: (event: AdminEvent) => Promise<unknown>;
}

export function DeleteDialog({ event, onClose, onDelete, onDisable }: DeleteDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (event && !dialog.open) dialog.showModal();
    if (!event && dialog.open) dialog.close();
  }, [event]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="dialog dialog--narrow"
      aria-labelledby="delete-title"
      onClose={() => {
        setError(null);
        onClose();
      }}
    >
      {event && (
        <div className="form">
          <h2 id="delete-title" className="dialog__title">
            Delete “{event.name}”?
          </h2>
          <p>This permanently removes the event. Disabling hides it from the game but keeps it here.</p>
          {error && (
            <div className="banner banner--error" role="alert">
              {error}
            </div>
          )}
          <div className="dialog__actions">
            <button type="button" className="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            {event.enabled && (
              <button type="button" className="button" onClick={() => run(() => onDisable(event))} disabled={busy}>
                Disable instead
              </button>
            )}
            <button
              type="button"
              className="button button--danger"
              onClick={() => run(() => onDelete(event.id))}
              disabled={busy}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
