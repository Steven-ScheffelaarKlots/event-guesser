import { z } from "zod";
import { parseEventDate } from "./dates";
import { GENRES } from "./types";

export const ID_MAX = 60;
export const NAME_MAX = 26;
export const DESCRIPTION_MAX = 200;

function isEventDate(value: string): boolean {
  try {
    parseEventDate(value);
    return true;
  } catch {
    return false;
  }
}

// Shared by create and patch. `id` is create-only because ids are fixed after creation.
const fields = {
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(NAME_MAX, `Keep names to ${NAME_MAX} characters or fewer`),
  description: z
    .string()
    .trim()
    .min(1, "Description is required")
    .max(DESCRIPTION_MAX, `Keep descriptions to ${DESCRIPTION_MAX} characters or fewer`)
    .refine((value) => !/\b\d{3,4}\b/.test(value), "Leave years out of the description; they give the answer away"),
  date: z
    .string()
    .trim()
    .refine(isEventDate, "Use a real date as YYYY-MM-DD, or -YYYY-MM-DD for BC"),
  wikipedia: z
    .string()
    .trim()
    .regex(/^https:\/\/en\.wikipedia\.org\/wiki\/\S+$/, "Use an English Wikipedia article URL (https://en.wikipedia.org/wiki/…)"),
  genre: z.enum(GENRES).nullable().optional(),
  enabled: z.boolean(),
};

export const eventInputSchema = z.object({
  id: z
    .string()
    .trim()
    .max(ID_MAX, `Keep ids to ${ID_MAX} characters or fewer`)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens"),
  ...fields,
  enabled: fields.enabled.default(true),
});

export const eventPatchSchema = z
  .object(fields)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Change at least one field");

export type EventInput = z.infer<typeof eventInputSchema>;
export type EventPatch = z.infer<typeof eventPatchSchema>;

/** First message per field, keyed by field path; object-level issues use "form". */
export function issuesToFields(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    result[key] ??= issue.message;
  }
  return result;
}
