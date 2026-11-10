// -----------------------------------------------------------------------------
// Gladys devices: one per maintenance task.
//
// Identity: the random id the task got at its creation (`task` / `<id>`),
// never its name.
//
// Features (category/type couples of the core table, test/gladys-rules.test.js),
// the same six on every task, so a device never changes structure:
//   - days left until the due date, duration/integer in days (negative once
//     overdue, bounded to ±3660 for the display);
//   - part of the period left, maintenance/life-remaining in percent (100 the
//     day it is done, 0 on the due date), like a filter life;
//   - due soon (within the notice) and overdue, input/binary (1 = yes): two of
//     the same type, so the dashboard shows their names;
//   - last done and next due date, text/text in the configured language.
//
// Published with should_poll: false: the values change on the integration's
// own actions, and with the date on its minute timer (src/hub.js).
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { formatDate } from './tasks/dates.js';
import { LIMITS, taskStatus } from './tasks/model.js';

export const DEVICE_TYPE = 'task';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  DAYS_LEFT: 'days_left',
  LIFE: 'life_remaining',
  DUE_SOON: 'due_soon',
  OVERDUE: 'overdue',
  LAST_DONE: 'last_done',
  NEXT_DUE: 'next_due',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    daysLeft: 'Days left',
    life: 'Period left',
    dueSoon: 'Due soon',
    overdue: 'Overdue',
    lastDone: 'Last done',
    nextDue: 'Next due date',
  },
  fr: {
    daysLeft: 'Jours restants',
    life: 'Période restante',
    dueSoon: 'Bientôt dû',
    overdue: 'En retard',
    lastDone: 'Dernière fois',
    nextDue: 'Prochaine échéance',
  },
  de: {
    daysLeft: 'Verbleibende Tage',
    life: 'Verbleibender Zeitraum',
    dueSoon: 'Bald fällig',
    overdue: 'Überfällig',
    lastDone: 'Zuletzt erledigt',
    nextDue: 'Nächste Fälligkeit',
  },
  es: {
    daysLeft: 'Días restantes',
    life: 'Periodo restante',
    dueSoon: 'Próximo a vencer',
    overdue: 'Atrasado',
    lastDone: 'Última vez',
    nextDue: 'Próximo vencimiento',
  },
};

const SENSOR = { read_only: true, has_feedback: false, keep_history: true };
const BINARY = {
  ...SENSOR,
  category: DEVICE_FEATURE_CATEGORIES.INPUT,
  type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
  min: 0,
  max: 1,
};
const TEXT = {
  ...SENSOR,
  keep_history: false,
  category: DEVICE_FEATURE_CATEGORIES.TEXT,
  type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
  min: 0,
  max: 0,
};

export const taskIds = (gladys, taskId) => gladys.externalIds(DEVICE_TYPE, taskId);

/** The task id behind a device external id, null for anything else. */
export function taskIdOf(gladys, externalId) {
  const prefix = gladys.externalIds(DEVICE_TYPE, '').device;
  return typeof externalId === 'string' && externalId.startsWith(prefix)
    ? externalId.slice(prefix.length) || null
    : null;
}

/** The device of a task, as published to Gladys. */
export function buildDevice(gladys, task, language = 'fr') {
  const ids = taskIds(gladys, task.id);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: task.name,
    external_id: ids.device,
    should_poll: false,
    features: [
      {
        ...SENSOR,
        name: names.daysLeft,
        external_id: ids.feature(FEATURE_KEYS.DAYS_LEFT),
        category: DEVICE_FEATURE_CATEGORIES.DURATION,
        type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
        unit: 'days',
        // Symmetric display bounds: the value is signed (Gladys gauge rule).
        min: -LIMITS.periodDays,
        max: LIMITS.periodDays,
      },
      {
        ...SENSOR,
        name: names.life,
        external_id: ids.feature(FEATURE_KEYS.LIFE),
        category: DEVICE_FEATURE_CATEGORIES.MAINTENANCE,
        type: DEVICE_FEATURE_TYPES.MAINTENANCE.LIFE_REMAINING,
        unit: 'percent',
        min: 0,
        max: 100,
      },
      { ...BINARY, name: names.dueSoon, external_id: ids.feature(FEATURE_KEYS.DUE_SOON) },
      { ...BINARY, name: names.overdue, external_id: ids.feature(FEATURE_KEYS.OVERDUE) },
      { ...TEXT, name: names.lastDone, external_id: ids.feature(FEATURE_KEYS.LAST_DONE) },
      { ...TEXT, name: names.nextDue, external_id: ids.feature(FEATURE_KEYS.NEXT_DUE) },
    ],
  };
}

const clamp = (value, bound) => Math.max(-bound, Math.min(bound, value));

/** The states of a task device on `today`, in the `publishStates` format. */
export function taskStates(gladys, task, today, language = 'fr') {
  const ids = taskIds(gladys, task.id);
  const status = taskStatus(task, today);
  const state = (key, value) => ({ device_feature_external_id: ids.feature(key), state: value });
  // A text state travels as `text`, never empty (the core ignores it then).
  const text = (key, value) => ({ device_feature_external_id: ids.feature(key), text: value });
  return [
    state(FEATURE_KEYS.DAYS_LEFT, clamp(status.daysLeft, LIMITS.periodDays)),
    state(FEATURE_KEYS.LIFE, status.life),
    state(FEATURE_KEYS.DUE_SOON, status.soon ? 1 : 0),
    state(FEATURE_KEYS.OVERDUE, status.overdue ? 1 : 0),
    text(FEATURE_KEYS.LAST_DONE, formatDate(task.last_done, language)),
    text(FEATURE_KEYS.NEXT_DUE, formatDate(status.due, language)),
  ];
}
