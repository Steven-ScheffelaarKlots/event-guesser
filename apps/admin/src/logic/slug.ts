import { ID_MAX } from "@chronodle/shared";

/** Kebab-case id suggestion from an event name: "Blücher’s Café" → "bluchers-cafe". */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, ID_MAX)
    .replace(/-+$/, "");
}
