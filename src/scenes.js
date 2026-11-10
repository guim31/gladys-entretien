// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+). The task is a
// device of the integration (`source: "devices"`).
//
// - `mark_done`: the job is done (an NFC tag on the boiler, a button by the
//   vacuum cleaner), today or on a given date: the count starts again;
// - `read_tasks`: what is due soon or overdue as one text, and the counts,
//   for a weekly message or a spoken announcement.
//
// Errors are thrown in the configured language: a scene shows them as is.
// -----------------------------------------------------------------------------

import { formatDate } from './tasks/dates.js';
import { taskStatus } from './tasks/model.js';
import { message, UserError } from './texts.js';

// The `text` output is a string of 1000 characters at most (scene variables).
const TEXT_MAX_LENGTH = 1000;

function joinItems(items) {
  let text = '';
  for (const item of items) {
    const next = text ? `${text}, ${item}` : item;
    if (next.length > TEXT_MAX_LENGTH - 2) {
      return `${text}…`;
    }
    text = next;
  }
  return text;
}

const localize = (hub, fn) => async (fields) => {
  try {
    return await fn(fields ?? {});
  } catch (err) {
    throw err instanceof UserError ? new Error(err.localized(hub.config.language)) : err;
  }
};

export function sceneActions(hub) {
  return {
    mark_done: localize(hub, async (fields) => {
      const { task } = await hub.markDone({
        device: fields.task,
        date: fields.date,
        source: 'scene',
      });
      const status = taskStatus(task, hub.today());
      return {
        task_name: hub.displayName(task),
        last_done: task.last_done,
        next_due: status.due,
        days_left: status.daysLeft,
      };
    }),

    read_tasks: localize(hub, async (fields) => {
      const language = hub.config.language;
      const all = hub.sorted();
      const urgent = all.filter(({ status }) => status.overdue || status.soon);
      const listed = fields.scope === 'all' ? all : urgent;
      const next = all[0];
      return {
        overdue: all.filter(({ status }) => status.overdue).length,
        due_soon: all.filter(({ status }) => status.soon).length,
        next_task: next ? hub.displayName(next.task) : '',
        next_due: next?.status.due ?? '',
        next_days_left: next?.status.daysLeft ?? 0,
        text:
          listed.length === 0
            ? message('readNothing', language)
            : joinItems(
                listed.map(({ task, status }) =>
                  message('readItem', language, {
                    name: hub.displayName(task),
                    date:
                      status.overdue || status.soon
                        ? hub.remaining(status, language)
                        : formatDate(status.due, language),
                  }),
                ),
              ),
      };
    }),
  };
}

export const SCENE_ACTION_KEYS = Object.keys(sceneActions({ config: {} }));
