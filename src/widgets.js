// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.2+): `upcoming`.
//
// The use case: the hall tablet shows what the house needs next (the boiler
// in 12 days, the ventilation filters 3 days late), and a tap on "Done" once
// the job is over starts the count again, without opening anything else.
//
// Budget (8 components): one tile (the tasks due soon or overdue), one status
// list (the next tasks by due date, 3 to 10 rows), one "Done" button (a form:
// the task, and the date, today when empty), and a text when there is
// nothing to show. The tile and the button can be hidden in the settings.
// The figures are values, not bound to device features, so the widget works
// before the devices are added. Forms on widget buttons came with Gladys
// 5.2.0 (#3168).
// -----------------------------------------------------------------------------

import { formatDate } from './tasks/dates.js';
import { WIDGET_KEY } from './hub.js';
import { perLanguage, pick, UserError } from './texts.js';

// Action key of the button: permanent once published.
export const ACTIONS = Object.freeze({ DONE: 'done' });
// Values of the settings.
export const HIDE_OPTIONS = ['tile', 'done'];
export const SCOPE_OPTIONS = ['all', 'soon'];
export const ROWS_OPTIONS = ['3', '5', '8', '10'];
const DEFAULT_ROWS = 5;
// Tasks offered in the select of the form.
const MAX_OPTIONS = 100;

export const TEXT = {
  noTask: {
    en: 'No task yet: create one in the configuration of the integration.',
    fr: "Aucune tâche pour le moment : créez-en une dans la configuration de l'intégration.",
    de: 'Noch keine Aufgabe: Erstelle eine in der Konfiguration der Integration.',
    es: 'Todavía no hay ninguna tarea: cree una en la configuración de la integración.',
  },
  nothingSoon: {
    en: 'Nothing due soon.',
    fr: 'Rien à prévoir prochainement.',
    de: 'Nichts bald fällig.',
    es: 'Nada próximo a vencer.',
  },
  toPlan: { en: 'Due soon', fr: 'À prévoir', de: 'Bald fällig', es: 'Por hacer' },
  done: { en: 'Done', fr: 'Fait', de: 'Erledigt', es: 'Hecho' },
  task: { en: 'Task', fr: 'Tâche', de: 'Aufgabe', es: 'Tarea' },
  date: {
    en: 'Done on (empty: today)',
    fr: 'Fait le (vide : aujourd’hui)',
    de: 'Erledigt am (leer: heute)',
    es: 'Hecho el (vacío: hoy)',
  },
  datePlaceholder: {
    en: 'e.g. 2026-03-14',
    fr: 'ex. 14/03/2026',
    de: 'z. B. 14.03.2026',
    es: 'p. ej. 14/03/2026',
  },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function textOnly(text, language) {
  return {
    ttl_seconds: 600,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

function row(hub, { task, status }, language) {
  const base = { label: fit(hub.displayName(task), 40), value: hub.remaining(status, language) };
  if (status.overdue) {
    return { ...base, icon: 'alert-circle', color: 'danger' };
  }
  if (status.soon) {
    return { ...base, icon: 'clock', color: 'warning' };
  }
  return { ...base, icon: 'check-circle', value: formatDate(status.due, language) };
}

async function get(hub, { settings = {}, language = 'en' }) {
  if (hub.tasks.length === 0) {
    return textOnly(TEXT.noTask, language);
  }
  const hidden = new Set(Array.isArray(settings.hide) ? settings.hide : []);
  const rowsWanted = Number(settings.rows) || DEFAULT_ROWS;
  const all = hub.sorted();
  const urgent = all.filter(({ status }) => status.overdue || status.soon);
  const shown = (settings.scope === 'soon' ? urgent : all).slice(0, rowsWanted);

  const components = [];
  if (!hidden.has('tile')) {
    components.push({
      type: 'value',
      value: urgent.length,
      label: t(TEXT.toPlan, language),
      icon: 'tool',
      ...(urgent.some(({ status }) => status.overdue) ? { color: 'danger' } : {}),
    });
  }
  if (shown.length === 0) {
    components.push({ type: 'text', variant: 'body', text: t(TEXT.nothingSoon, language) });
  } else {
    components.push({ type: 'status', items: shown.map((entry) => row(hub, entry, language)) });
  }
  if (!hidden.has('done')) {
    components.push({
      type: 'button',
      label: t(TEXT.done, language),
      icon: 'check',
      style: 'secondary',
      action: {
        key: ACTIONS.DONE,
        fields: [
          {
            key: 'task',
            type: 'select',
            required: true,
            label: TEXT.task,
            options: all.slice(0, MAX_OPTIONS).map(({ task }) => ({
              value: task.id,
              label: { en: fit(hub.displayName(task), 40) },
            })),
          },
          {
            key: 'date',
            type: 'string',
            required: false,
            label: TEXT.date,
            placeholder: TEXT.datePlaceholder,
          },
        ],
      },
    });
  }
  return { ttl_seconds: 600, components };
}

// The core does not tell the language of the user who tapped: the toast is
// sent in the four languages, an error in the configured one.
async function action(hub, { actionKey, values = {} }) {
  if (actionKey !== ACTIONS.DONE) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  try {
    const { task } = await hub.markDone({
      taskId: String(values.task ?? ''),
      date: values.date,
      source: 'widget',
    });
    const due = hub.sorted().find((entry) => entry.task.id === task.id).status.due;
    return {
      message: perLanguage('done', (language) => ({
        name: hub.displayName(task),
        date: formatDate(due, language),
      })),
    };
  } catch (err) {
    throw err instanceof UserError ? new Error(err.localized(hub.config.language)) : err;
  }
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
