import {
  eventInputSchema,
  formatEventDate,
  issuesToFields,
  type AdminEvent,
  type EventInput,
  type Genre,
} from "@chronodle/shared";

export interface FormValues {
  id: string;
  name: string;
  description: string;
  date: string;
  wikipedia: string;
  /** "" means no genre. */
  genre: Genre | "";
  enabled: boolean;
}

export const EMPTY_FORM: FormValues = {
  id: "",
  name: "",
  description: "",
  date: "",
  wikipedia: "",
  genre: "",
  enabled: true,
};

export function formFromEvent(event: AdminEvent): FormValues {
  return {
    id: event.id,
    name: event.name,
    description: event.description,
    date: event.date,
    wikipedia: event.wikipedia,
    genre: event.genre ?? "",
    enabled: event.enabled,
  };
}

export type FormResult = { ok: true; input: EventInput } | { ok: false; errors: Record<string, string> };

/** Same rules as the API, so most mistakes are caught before saving. */
export function validateForm(values: FormValues): FormResult {
  const parsed = eventInputSchema.safeParse({ ...values, genre: values.genre || null });
  return parsed.success ? { ok: true, input: parsed.data } : { ok: false, errors: issuesToFields(parsed.error) };
}

/** "20 July 1969" for a valid date, or null while the date is incomplete or invalid. */
export function datePreview(date: string): string | null {
  try {
    return formatEventDate(date.trim());
  } catch {
    return null;
  }
}
