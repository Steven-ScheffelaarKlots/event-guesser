import type { AdminEvent, EventInput, EventPatch } from "@chronodle/shared";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; fields?: Record<string, string> };
}

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      path,
      body === undefined
        ? { method }
        : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
  } catch {
    throw new ApiError(0, "network", "Can't reach the API. Is it running?");
  }
  if (response.status === 204) return undefined as T;

  // Error responses from the dev proxy (API down) are HTML or empty, not JSON.
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (json as ErrorBody | null)?.error;
    const fallback =
      response.status >= 500
        ? `The API isn't responding (HTTP ${response.status}). Is it running?`
        : `The API returned an error (HTTP ${response.status}).`;
    throw new ApiError(response.status, error?.code ?? "unknown", error?.message ?? fallback, error?.fields ?? {});
  }
  return json as T;
}

const eventPath = (id: string) => `/api/admin/events/${encodeURIComponent(id)}`;

export const listEvents = () => request<AdminEvent[]>("/api/admin/events");

export const createEvent = (input: EventInput) => request<AdminEvent>("/api/admin/events", "POST", input);

export const updateEvent = (id: string, patch: EventPatch) => request<AdminEvent>(eventPath(id), "PATCH", patch);

export const deleteEvent = (id: string) => request<void>(eventPath(id), "DELETE");
