import { GENRES, NAME_MAX, type AdminEvent, type EventInput, type EventPatch, type Genre } from "@chronodle/shared";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ApiError } from "../api";
import { datePreview, EMPTY_FORM, formFromEvent, validateForm, type FormValues } from "../logic/form";
import { slugify } from "../logic/slug";

type Target = AdminEvent | "new";

interface EventFormDialogProps {
  /** "new" to create, an event to edit, null when closed. */
  target: Target | null;
  onClose: () => void;
  onCreate: (input: EventInput) => Promise<unknown>;
  onUpdate: (id: string, patch: EventPatch) => Promise<unknown>;
}

export function EventFormDialog({ target, onClose, onCreate, onUpdate }: EventFormDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (target && !dialog.open) dialog.showModal();
    if (!target && dialog.open) dialog.close();
  }, [target]);

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="event-form-title" onClose={onClose}>
      {target && (
        <EventForm
          key={target === "new" ? "new" : target.id}
          target={target}
          onClose={onClose}
          onCreate={onCreate}
          onUpdate={onUpdate}
        />
      )}
    </dialog>
  );
}

interface EventFormProps extends Omit<EventFormDialogProps, "target"> {
  target: Target;
}

function EventForm({ target, onClose, onCreate, onUpdate }: EventFormProps) {
  const isNew = target === "new";
  const [values, setValues] = useState<FormValues>(() => (target === "new" ? EMPTY_FORM : formFromEvent(target)));
  // While creating, the id follows the name until the user edits the id themselves.
  const [idEdited, setIdEdited] = useState(!isNew);
  const [touched, setTouched] = useState<ReadonlySet<keyof FormValues>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const result = validateForm(values);
  const clientErrors = result.ok ? {} : result.errors;
  const errorFor = (field: keyof FormValues) =>
    serverErrors[field] ?? (submitted || touched.has(field) ? clientErrors[field] : undefined);

  function set<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues((current) => {
      const next = { ...current, [field]: value };
      if (field === "name" && !idEdited) next.id = slugify(String(value));
      return next;
    });
    setServerErrors((errors) => {
      const next = { ...errors };
      delete next[field];
      delete next.form;
      return next;
    });
  }

  const blur = (field: keyof FormValues) => () => setTouched((fields) => new Set(fields).add(field));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!result.ok) return;
    setSaving(true);
    try {
      if (isNew) {
        await onCreate(result.input);
      } else {
        const { id, ...patch } = result.input;
        await onUpdate(id, patch);
      }
      onClose();
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length > 0) setServerErrors(error.fields);
      else setServerErrors({ form: error instanceof Error ? error.message : "Something went wrong. Try again." });
    } finally {
      setSaving(false);
    }
  }

  const preview = datePreview(values.date);
  const inputProps = (field: keyof FormValues) => ({
    id: `field-${field}`,
    onBlur: blur(field),
    "aria-invalid": errorFor(field) ? true : undefined,
  });

  return (
    <form className="form" onSubmit={submit} noValidate>
      <h2 id="event-form-title" className="dialog__title">
        {target === "new" ? "New event" : `Edit “${target.name}”`}
      </h2>

      {(serverErrors.form ?? (submitted ? clientErrors.form : undefined)) && (
        <div className="banner banner--error" role="alert">
          {serverErrors.form ?? clientErrors.form}
        </div>
      )}

      <Field label="Name" field="name" error={errorFor("name")} hint={`${values.name.trim().length}/${NAME_MAX}`}>
        <input
          {...inputProps("name")}
          className="input"
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          autoFocus
        />
      </Field>

      <Field
        label="ID"
        field="id"
        error={errorFor("id")}
        hint={isNew ? "Filled in from the name. It can't be changed after creating." : "IDs can't be changed."}
      >
        <input
          {...inputProps("id")}
          className="input input--mono"
          value={values.id}
          readOnly={!isNew}
          onChange={(e) => {
            setIdEdited(true);
            set("id", e.target.value);
          }}
        />
      </Field>

      <Field
        label="Date"
        field="date"
        error={errorFor("date")}
        hint={preview ? `→ ${preview}` : "YYYY-MM-DD; BC as -0044-03-15"}
      >
        <input
          {...inputProps("date")}
          className="input input--mono"
          value={values.date}
          placeholder="1969-07-20"
          onChange={(e) => set("date", e.target.value)}
        />
      </Field>

      <Field label="Description" field="description" error={errorFor("description")} hint="No years: they give the answer away.">
        <textarea
          {...inputProps("description")}
          className="input"
          rows={3}
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>

      <Field
        label="Wikipedia URL"
        field="wikipedia"
        error={errorFor("wikipedia")}
        hint={
          values.wikipedia ? (
            <a href={values.wikipedia} target="_blank" rel="noreferrer">
              open ↗
            </a>
          ) : (
            "https://en.wikipedia.org/wiki/…"
          )
        }
      >
        <input
          {...inputProps("wikipedia")}
          className="input"
          type="url"
          value={values.wikipedia}
          onChange={(e) => set("wikipedia", e.target.value)}
        />
      </Field>

      <Field label="Genre" field="genre" error={errorFor("genre")}>
        <select
          {...inputProps("genre")}
          className="input"
          value={values.genre}
          onChange={(e) => set("genre", e.target.value as Genre | "")}
        >
          <option value="">None</option>
          {GENRES.map((genre) => (
            <option key={genre} value={genre}>
              {genre}
            </option>
          ))}
        </select>
      </Field>

      <label className="checkbox">
        <input type="checkbox" checked={values.enabled} onChange={(e) => set("enabled", e.target.checked)} />
        Enabled (shown in the game)
      </label>

      <div className="dialog__actions">
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={saving}>
          {saving ? "Saving…" : isNew ? "Create event" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

interface FieldProps {
  label: string;
  field: keyof FormValues;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}

function Field({ label, field, error, hint, children }: FieldProps) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={`field-${field}`}>
        {label}
      </label>
      {children}
      {error ? <div className="field__error">{error}</div> : hint && <div className="field__hint">{hint}</div>}
    </div>
  );
}
