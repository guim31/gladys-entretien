// -----------------------------------------------------------------------------
// Calendar arithmetic of the maintenance tasks, on local dates of Gladys (the
// supervisor injects TZ). Every date is a plain `YYYY-MM-DD` string: no time
// of day and no time zone conversion ever happens on stored values, so a task
// done "on the 14th" stays on the 14th whatever the offset or the daylight
// saving time. The arithmetic runs on UTC midnights, where every day lasts
// 24 hours.
// -----------------------------------------------------------------------------

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export const UNITS = ['days', 'weeks', 'months', 'years'];

const pad = (value) => String(value).padStart(2, '0');
const fromUtc = (date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

function parts(date) {
  const match = DATE.exec(date);
  if (!match) {
    throw new RangeError(`Not a date: ${date}`);
  }
  return match.slice(1).map(Number);
}

const toUtc = (date) => {
  const [year, month, day] = parts(date);
  return Date.UTC(year, month - 1, day);
};

/**
 * The local date at `now` in `timeZone`.
 * @param {number} now milliseconds since the epoch
 * @param {string} [timeZone] IANA name, the system zone when omitted
 * @returns {string} `YYYY-MM-DD`
 */
export function localDate(now, timeZone) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date(now))
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function validDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** A stored date that is still well-formed (a hand-edited file may not be). */
export function isDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) {
    return false;
  }
  const [year, month, day] = parts(value);
  return validDate(year, month, day);
}

/** `YYYY-MM-DD` plus `days` days (negative: before). */
export function addDays(date, days) {
  return fromUtc(new Date(toUtc(date) + days * DAY_MS));
}

/** Whole days from `from` to `to` (negative when `to` is before). */
export const daysBetween = (from, to) => Math.round((toUtc(to) - toUtc(from)) / DAY_MS);

/**
 * `date` plus `every` units. Months and years keep the day of the month, or
 * take the last day of a shorter month: 31 January + 1 month = 28 (or 29)
 * February, 29 February + 1 year = 28 February.
 */
export function addPeriod(date, every, unit) {
  if (unit === 'days' || unit === 'weeks') {
    return addDays(date, unit === 'weeks' ? every * 7 : every);
  }
  if (unit !== 'months' && unit !== 'years') {
    throw new RangeError(`Unknown unit: ${unit}`);
  }
  const [year, month, day] = parts(date);
  const index = month - 1 + (unit === 'years' ? every * 12 : every);
  const targetYear = year + Math.floor(index / 12);
  const targetMonth = index % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return fromUtc(new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay))));
}

/**
 * Parse a date typed in a form or computed by a scene: `2026-03-14`,
 * `14/03/2026`, `14.03.2026`, `14-03-2026`, or `-N` (N days ago).
 * @param {unknown} raw
 * @param {string} today local `YYYY-MM-DD`
 * @returns {string|null} `YYYY-MM-DD`, null when empty
 * @throws {RangeError} when the text is not understood
 */
export function parseDate(raw, today) {
  if (raw === undefined || raw === null) {
    return null;
  }
  const text = String(raw).trim();
  if (text === '') {
    return null;
  }
  const relative = text.match(/^-\s*(\d{1,5})$/);
  if (relative) {
    if (Number(relative[1]) > 36600) {
      throw new RangeError(`Date out of range: ${text}`);
    }
    return addDays(today, -Number(relative[1]));
  }
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let year, month, day;
  if (match) {
    [year, month, day] = match.slice(1).map(Number);
  } else {
    match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (!match) {
      throw new RangeError(`Date not understood: ${text}`);
    }
    [day, month, year] = match.slice(1).map(Number);
  }
  if (year < 1900 || year > 2999 || !validDate(year, month, day)) {
    throw new RangeError(`Date not understood: ${text}`);
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Display of a date in the language: `14/03/2026`, `14.03.2026`, `03/14/2026`. */
export function formatDate(date, language) {
  if (!isDate(date)) {
    return '';
  }
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : language, {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(toUtc(date)));
}
