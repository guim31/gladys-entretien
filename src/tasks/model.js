// -----------------------------------------------------------------------------
// The tasks document, as stored in /data/tasks.json:
//
//   { schema: 1, tasks: [{ id, name, template, every, unit, notice_days,
//       last_done, history, created_at, soon_notified_for,
//       overdue_notified_for }] }
//
// A task is due `every` `unit` after `last_done` (a local `YYYY-MM-DD`);
// `history` keeps the last dates it was done, newest first. The two
// `*_notified_for` fields hold the due date a scene event was already sent
// for: a new due date (task done, period changed) re-arms both.
//
// Ids are random, generated here, and become the device external ids: never
// derived from a name. `normalizeDocument` repairs what a hand edit or an
// older version may have left and keeps unknown fields, so a newer file read
// by an older version loses nothing it did not understand.
// -----------------------------------------------------------------------------

import { randomBytes } from 'node:crypto';
import { addPeriod, daysBetween, isDate, UNITS } from './dates.js';

export const SCHEMA_VERSION = 1;

export const LIMITS = Object.freeze({
  tasks: 100,
  name: 40,
  every: 120,
  // Ten years and a bit: the longest period, in days.
  periodDays: 3660,
  notice: 365,
  history: 20,
});

// Suggested tasks of the "Create a task" action. Keys are permanent once
// published (stored in the file, offered in the manifest).
export const TEMPLATES = Object.freeze({
  boiler: {
    every: 1,
    unit: 'years',
    notice: 30,
    name: {
      en: 'Boiler service',
      fr: 'Entretien de la chaudière',
      de: 'Heizungswartung',
      es: 'Revisión de la caldera',
    },
  },
  chimney: {
    every: 1,
    unit: 'years',
    notice: 30,
    name: { en: 'Chimney sweeping', fr: 'Ramonage', de: 'Schornsteinfeger', es: 'Deshollinado' },
  },
  car_inspection: {
    every: 2,
    unit: 'years',
    notice: 30,
    name: {
      en: 'Vehicle inspection',
      fr: 'Contrôle technique',
      de: 'Hauptuntersuchung',
      es: 'ITV del vehículo',
    },
  },
  ventilation_filters: {
    every: 6,
    unit: 'months',
    notice: 14,
    name: {
      en: 'Ventilation filters',
      fr: 'Filtres de VMC',
      de: 'Lüftungsfilter',
      es: 'Filtros de ventilación',
    },
  },
  vacuum_filter: {
    every: 3,
    unit: 'months',
    notice: 7,
    name: {
      en: 'Vacuum cleaner filter',
      fr: "Filtre de l'aspirateur",
      de: 'Staubsaugerfilter',
      es: 'Filtro de la aspiradora',
    },
  },
  descaling: {
    every: 2,
    unit: 'months',
    notice: 7,
    name: { en: 'Descaling', fr: 'Détartrage', de: 'Entkalken', es: 'Descalcificación' },
  },
  smoke_detectors: {
    every: 1,
    unit: 'years',
    notice: 14,
    name: {
      en: 'Smoke detector batteries',
      fr: 'Piles des détecteurs de fumée',
      de: 'Rauchmelder-Batterien',
      es: 'Pilas de los detectores de humo',
    },
  },
  air_conditioning: {
    every: 1,
    unit: 'years',
    notice: 30,
    name: {
      en: 'Air conditioning service',
      fr: 'Entretien de la climatisation',
      de: 'Klimaanlagen-Wartung',
      es: 'Revisión del aire acondicionado',
    },
  },
  hood_filter: {
    every: 3,
    unit: 'months',
    notice: 7,
    name: {
      en: 'Cooker hood filter',
      fr: 'Filtre de la hotte',
      de: 'Dunstabzugsfilter',
      es: 'Filtro de la campana',
    },
  },
  water_filter: {
    every: 1,
    unit: 'months',
    notice: 3,
    name: {
      en: 'Water filter cartridge',
      fr: 'Cartouche filtrante',
      de: 'Wasserfilterkartusche',
      es: 'Cartucho del filtro de agua',
    },
  },
  gutters: {
    every: 1,
    unit: 'years',
    notice: 30,
    name: {
      en: 'Gutter cleaning',
      fr: 'Nettoyage des gouttières',
      de: 'Dachrinnenreinigung',
      es: 'Limpieza de canalones',
    },
  },
  septic_tank: {
    every: 4,
    unit: 'years',
    notice: 60,
    name: {
      en: 'Septic tank emptying',
      fr: 'Vidange de la fosse septique',
      de: 'Klärgrubenentleerung',
      es: 'Vaciado de la fosa séptica',
    },
  },
  fire_extinguisher: {
    every: 1,
    unit: 'years',
    notice: 30,
    name: {
      en: 'Fire extinguisher check',
      fr: "Vérification de l'extincteur",
      de: 'Feuerlöscherprüfung',
      es: 'Revisión del extintor',
    },
  },
});

export const TEMPLATE_KEYS = Object.keys(TEMPLATES);
export const DEFAULT_NOTICE = 7;

export const newId = () => randomBytes(6).toString('hex');

/** Trimmed, single-spaced, bounded text. */
export function cleanText(value, max) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max).trimEnd() : text;
}

/** Comparison key of a name: case, accents and blanks ignored. */
export const matchKey = (value) =>
  cleanText(value, 1000)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss');

/** A period the integration accepts: 1 to 120 units, ten years at most. */
export function validPeriod(every, unit) {
  if (!Number.isInteger(every) || every < 1 || every > LIMITS.every || !UNITS.includes(unit)) {
    return false;
  }
  return daysBetween('2000-01-01', addPeriod('2000-01-01', every, unit)) <= LIMITS.periodDays;
}

export const emptyDocument = () => ({ schema: SCHEMA_VERSION, tasks: [] });

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const dateOr = (value, fallback) =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback;

function normalizeTask(entry, names, ids, now, today) {
  if (!isObject(entry)) {
    return null;
  }
  let name = cleanText(entry.name, LIMITS.name);
  if (!name) {
    return null;
  }
  // Names are unique (the Configuration actions find a task by its name).
  for (let n = 2; names.has(matchKey(name)); n += 1) {
    name = `${cleanText(entry.name, LIMITS.name - 4)} (${n})`;
  }
  names.add(matchKey(name));
  let id = typeof entry.id === 'string' && /^[a-z0-9]{1,32}$/.test(entry.id) ? entry.id : newId();
  while (ids.has(id)) {
    id = newId();
  }
  ids.add(id);
  const template = TEMPLATE_KEYS.includes(entry.template) ? entry.template : null;
  const fallback = template ? TEMPLATES[template] : { every: 1, unit: 'years' };
  const every = Number(entry.every);
  const [periodEvery, periodUnit] = validPeriod(every, entry.unit)
    ? [every, entry.unit]
    : [fallback.every, fallback.unit];
  const notice = Number(entry.notice_days);
  const history = [
    ...new Set((Array.isArray(entry.history) ? entry.history : []).filter(isDate)),
  ].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const lastDone = isDate(entry.last_done) ? entry.last_done : (history[0] ?? today);
  if (!history.includes(lastDone)) {
    history.unshift(lastDone);
    history.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }
  return {
    ...entry,
    id,
    name,
    template,
    every: periodEvery,
    unit: periodUnit,
    notice_days:
      Number.isInteger(notice) && notice >= 0 && notice <= LIMITS.notice ? notice : DEFAULT_NOTICE,
    last_done: lastDone,
    history: history.slice(0, LIMITS.history),
    created_at: dateOr(entry.created_at, now),
    soon_notified_for: isDate(entry.soon_notified_for) ? entry.soon_notified_for : null,
    overdue_notified_for: isDate(entry.overdue_notified_for) ? entry.overdue_notified_for : null,
  };
}

/**
 * A well-formed document from whatever JSON was read.
 * @param {unknown} raw
 * @param {string} [now] ISO date used for missing creation dates
 * @param {string} [today] local date used for a missing last_done
 * @returns {object} the document
 * @throws {TypeError} when `raw` is not a tasks document at all
 */
export function normalizeDocument(raw, now = new Date().toISOString(), today = now.slice(0, 10)) {
  if (!isObject(raw) || !Array.isArray(raw.tasks)) {
    throw new TypeError('Not a tasks document');
  }
  const names = new Set();
  const ids = new Set();
  const tasks = raw.tasks
    .map((entry) => normalizeTask(entry, names, ids, now, today))
    .filter(Boolean)
    .slice(0, LIMITS.tasks);
  return { ...raw, schema: SCHEMA_VERSION, tasks };
}

/**
 * Where a task stands on `today`.
 * @returns {{ due: string, daysLeft: number, periodDays: number,
 *   overdue: boolean, soon: boolean, life: number }}
 *   `soon`: due within the notice (today included), not overdue yet;
 *   `life`: the part of the period left, 0 to 100 %.
 */
export function taskStatus(task, today) {
  const due = addPeriod(task.last_done, task.every, task.unit);
  const daysLeft = daysBetween(today, due);
  const periodDays = Math.max(1, daysBetween(task.last_done, due));
  return {
    due,
    daysLeft,
    periodDays,
    overdue: daysLeft < 0,
    soon: daysLeft >= 0 && daysLeft <= task.notice_days,
    life: Math.round(100 * Math.min(1, Math.max(0, daysLeft / periodDays))),
  };
}

/** Tasks by next due date, then by name. */
export function sortedTasks(tasks, today) {
  return tasks
    .map((task) => ({ task, status: taskStatus(task, today) }))
    .sort(
      (a, b) =>
        a.status.daysLeft - b.status.daysLeft ||
        a.task.name.localeCompare(b.task.name, 'en', { sensitivity: 'base' }),
    );
}
