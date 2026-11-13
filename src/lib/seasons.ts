// Marin riding seasons. Wet = Nov 1 to Apr 30, Dry = May 1 to Oct 31.
// Boundaries live here so an admin-facing setting can replace them later; leaderboards
// are computed from date ranges, so changing a boundary re-sorts history automatically.
//
// All dates are the ride's LOCAL date as "YYYY-MM-DD..." strings (Strava's
// start_date_local), so plain string comparison works and time zones never shift
// a 6 am ride into the wrong season.

export const WET_START_MONTH = 11; // November
export const DRY_START_MONTH = 5; // May

export type RangeKey = string; // "wet-2026" | "dry-2026" | "year-2026" | "all"

export type DateRange = {
  key: RangeKey;
  label: string;
  /** Inclusive start, "YYYY-MM-DD" (null = open). */
  from: string | null;
  /** Exclusive end, "YYYY-MM-DD" (null = open). */
  to: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const yy = (y: number) => `’${String(y).slice(-2)}`;

export function wetSeason(startYear: number): DateRange {
  return {
    key: `wet-${startYear}`,
    label: `Wet ${yy(startYear)}–${String(startYear + 1).slice(-2)}`,
    from: `${startYear}-${pad(WET_START_MONTH)}-01`,
    to: `${startYear + 1}-${pad(DRY_START_MONTH)}-01`,
  };
}

export function drySeason(year: number): DateRange {
  return {
    key: `dry-${year}`,
    label: `Dry ${yy(year)}`,
    from: `${year}-${pad(DRY_START_MONTH)}-01`,
    to: `${year}-${pad(WET_START_MONTH)}-01`,
  };
}

export function calendarYear(year: number): DateRange {
  return { key: `year-${year}`, label: String(year), from: `${year}-01-01`, to: `${year + 1}-01-01` };
}

export const ALL_TIME: DateRange = { key: "all", label: "All-time", from: null, to: null };

/** The season a local date ("YYYY-MM-DD...") falls in. */
export function seasonOf(dateLocal: string): DateRange {
  const year = Number(dateLocal.slice(0, 4));
  const month = Number(dateLocal.slice(5, 7));
  if (month >= WET_START_MONTH) return wetSeason(year);
  if (month < DRY_START_MONTH) return wetSeason(year - 1);
  return drySeason(year);
}

/** The season before this one. */
export function previousSeason(range: DateRange): DateRange {
  return seasonOf(shiftDays(range.from!, -1));
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function parseRange(key: string | undefined | null, today: string): DateRange {
  if (!key) return seasonOf(today);
  if (key === "all") return ALL_TIME;
  const m = /^(wet|dry|year)-(\d{4})$/.exec(key);
  if (!m) return seasonOf(today);
  const y = Number(m[2]);
  return m[1] === "wet" ? wetSeason(y) : m[1] === "dry" ? drySeason(y) : calendarYear(y);
}

/** The four leaderboard tabs: this season, last season, this year, all-time. */
export function defaultTabs(today: string): DateRange[] {
  const current = seasonOf(today);
  return [current, previousSeason(current), calendarYear(Number(today.slice(0, 4))), ALL_TIME];
}

export function inRange(dateLocal: string, r: DateRange): boolean {
  const d = dateLocal.slice(0, 10);
  return (r.from === null || d >= r.from) && (r.to === null || d < r.to);
}

/** Today's date in Marin, "YYYY-MM-DD". */
export function todayInMarin(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
}
