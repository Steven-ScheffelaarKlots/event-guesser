export interface DateParts {
  /** Negative for BC (e.g. -44 is 44 BC). */
  year: number;
  month: number;
  day: number;
}

const DATE_PATTERN = /^(-?)(\d{4})-(\d{2})-(\d{2})$/;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(year: number, month: number): number {
  if (month !== 2) return DAYS_IN_MONTH[month - 1];
  // Proleptic Gregorian leap rule on astronomical years, where 1 BC is year 0.
  const y = year < 0 ? year + 1 : year;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return leap ? 29 : 28;
}

export function parseEventDate(date: string): DateParts {
  const match = DATE_PATTERN.exec(date);
  if (!match) {
    throw new Error(`Invalid event date "${date}", expected YYYY-MM-DD or -YYYY-MM-DD`);
  }
  const [, sign, year, month, day] = match;
  const parts = {
    year: Number(year) * (sign ? -1 : 1),
    month: Number(month),
    day: Number(day),
  };
  if (
    parts.year === 0 ||
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.day > daysInMonth(parts.year, parts.month)
  ) {
    throw new Error(`Invalid event date "${date}"`);
  }
  return parts;
}

/** Comparator for event dates: negative if `a` is earlier than `b`. */
export function compareEventDates(a: string, b: string): number {
  const pa = parseEventDate(a);
  const pb = parseEventDate(b);
  return pa.year - pb.year || pa.month - pb.month || pa.day - pb.day;
}

/** Human-readable date, e.g. "20 July 1969" or "15 March 44 BC". */
export function formatEventDate(date: string): string {
  const { year, month, day } = parseEventDate(date);
  const yearLabel = year < 0 ? `${-year} BC` : String(year);
  return `${day} ${MONTHS[month - 1]} ${yearLabel}`;
}
