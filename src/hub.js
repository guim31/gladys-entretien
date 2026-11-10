// -----------------------------------------------------------------------------
// The tasks hub: the tasks document in memory, every change to it, and what
// each change sends to Gladys (devices, states, scene events, widget nudges).
//
// Changes are serialized: each one runs alone on a copy of the document, the
// copy is written to /data, and only then does it become the current
// document. A write that fails changes nothing and is reported to the user.
//
// A minute timer follows the date: at local midnight the days left change,
// a task entering its notice fires `task_due_soon`, a task past its due date
// fires `task_overdue` (once per due date each, remembered in the file so a
// restart does not repeat them). States are published only when they change,
// plus a 12-hour heartbeat.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { buildDevice, taskIdOf, taskIds, taskStates } from './devices.js';
import { addPeriod, daysBetween, formatDate, localDate, parseDate, UNITS } from './tasks/dates.js';
import {
  cleanText,
  DEFAULT_NOTICE,
  LIMITS,
  matchKey,
  newId,
  sortedTasks,
  taskStatus,
  TEMPLATES,
  validPeriod,
} from './tasks/model.js';
import { message, UserError } from './texts.js';

const logger = createLogger({ name: 'entretien' });

export const WIDGET_KEY = 'upcoming';

// Scene trigger keys: permanent once published.
export const TRIGGERS = Object.freeze({
  DUE_SOON: 'task_due_soon',
  OVERDUE: 'task_overdue',
});

const TICK_MS = 60_000;
// The answer of a Configuration action stays readable.
const SUMMARY_MAX_LENGTH = 1000;
// The front shows "no recent value" past 48 h: an unchanged value is sent again.
const HEARTBEAT_MS = 12 * 3600_000;

/** An optional whole number of a form: undefined when empty. */
function optionalInteger(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return undefined;
  }
  const number = Number(String(value).trim());
  return Number.isInteger(number) ? number : NaN;
}

const optionalText = (value) =>
  value === undefined || value === null || String(value).trim() === ''
    ? undefined
    : String(value).trim();

export class TasksHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {import('./store.js').TaskStore} options.store
   * @param {() => number} [options.now] clock, milliseconds
   * @param {string} [options.timeZone] IANA time zone, TZ of the container by default
   * @param {boolean} [options.timers] run the minute timer (off in the tests)
   */
  constructor({ gladys, store, now = Date.now, timeZone, timers = true }) {
    this.gladys = gladys;
    this.store = store;
    this.now = now;
    this.timeZone = timeZone;
    this.timers = timers;
    this.config = { language: 'fr' };
    this.document = { schema: 1, tasks: [] };
    this.queue = Promise.resolve();
    this.timer = null;
    // Problems logged once, until they are over (key → message).
    this.problems = new Map();
    // False until tasks.json was read: no change may run on an empty
    // document that would then replace the real tasks on disk.
    this.loaded = false;
    // Events sent but not yet recorded in the file (`id:key:due`), the guard
    // against two overlapping ticks, and the date of the last tick.
    this.sentEvents = new Set();
    this.ticking = false;
    this.lastDate = null;
  }

  // --- Quiet logs: one line when a problem starts, one when it ends --------

  problem(key, text) {
    if (!this.problems.has(key)) {
      logger.warn(text);
    } else {
      logger.debug(text);
    }
    this.problems.set(key, text);
  }

  resolved(key) {
    if (this.problems.delete(key)) {
      logger.info(`Back to normal: ${key}`);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    this.config = config;
    const { document, source } = await this.store.load();
    this.document = document;
    this.loaded = true;
    logger.info(
      `${document.tasks.length} task(s) loaded (${source === 'new' ? 'first start' : source})`,
    );
    if (source === 'backup') {
      // Put the restored tasks back in tasks.json at once (the broken file
      // stays as tasks.json.corrupt, the backup is left untouched).
      await this.store.save(document).catch((err) => logger.error(`Cannot write: ${err.message}`));
    }
    if (this.timers && !this.timer) {
      this.timer = setInterval(() => {
        this.tick().catch((err) => this.problem('tick', `Minute check failed: ${err.message}`));
      }, TICK_MS);
      this.timer.unref?.();
    }
    await this.resync(config);
  }

  /** After a (re)connection: send again what Gladys may have lost. */
  async resync(config) {
    this.config = config;
    await this.publishDevices();
    this.gladys.forgetPublishedStates();
    await this.tick();
    await this.gladys.setConnectionStatus(true);
  }

  async reconfigure(config) {
    const languageChanged = config.language !== this.config.language;
    this.config = config;
    if (languageChanged) {
      // Feature names of devices not added yet follow the new language, and
      // the dates of the text features are written in it.
      await this.publishDevices();
      await this.publishStates();
      this.refreshWidget();
    }
  }

  async stop() {
    clearInterval(this.timer);
    this.timer = null;
    await this.queue.catch(() => {});
    await this.store.flush();
  }

  // --- Reading ---------------------------------------------------------------

  today() {
    return localDate(this.now(), this.timeZone);
  }

  get tasks() {
    return this.document.tasks;
  }

  /** The task of a device external id, null when it no longer exists. */
  taskOfDevice(externalId) {
    const id = taskIdOf(this.gladys, externalId);
    return this.tasks.find((task) => task.id === id) ?? null;
  }

  /** The name the user sees: the device name given in Gladys, else the task name. */
  displayName(task) {
    const deviceId = taskIds(this.gladys, task.id).device;
    const device = (this.gladys.devices ?? []).find((entry) => entry.external_id === deviceId);
    return device?.name || task.name;
  }

  /** Tasks whose device was added in Gladys. */
  createdTasks() {
    const created = new Set((this.gladys.devices ?? []).map((device) => device.external_id));
    return this.tasks.filter((task) => created.has(taskIds(this.gladys, task.id).device));
  }

  /** Tasks by due date, each with its status. */
  sorted() {
    return sortedTasks(this.tasks, this.today());
  }

  // --- Publishing ------------------------------------------------------------

  async publishDevices() {
    try {
      await this.gladys.publishDiscoveredDevices(
        this.tasks.map((task) => buildDevice(this.gladys, task, this.config.language)),
      );
      this.resolved('devices');
    } catch (err) {
      // The tasks are saved: the devices follow at the next scan or reconnection.
      this.problem('devices', `Devices not published: ${err.message}`);
    }
  }

  async publishStates(tasks = this.createdTasks()) {
    const today = this.today();
    const states = tasks.flatMap((task) =>
      taskStates(this.gladys, task, today, this.config.language),
    );
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States not published: ${err.message}`);
    }
  }

  /** Publish scene events; resolves with the ones Gladys accepted. */
  async fire(events) {
    const sent = [];
    for (const event of events) {
      try {
        await this.gladys.publishSceneEvent(event.key, event.data);
        sent.push(event);
        this.resolved('scene-event');
      } catch (err) {
        this.problem('scene-event', `Scene event ${event.key} refused: ${err.message}`);
      }
    }
    return sent;
  }

  refreshWidget() {
    try {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    } catch (err) {
      logger.debug(`Widget refresh not sent: ${err.message}`);
    }
  }

  async onDeviceCreated(device) {
    const task = this.taskOfDevice(device?.external_id);
    if (task) {
      this.gladys.forgetPublishedStates(device.external_id);
      await this.publishStates([task]);
    }
    this.refreshWidget();
  }

  onDeviceChanged() {
    this.refreshWidget();
  }

  // --- Changes ---------------------------------------------------------------

  /**
   * Run one change on a copy of the document, write it, then make it current
   * and send its effects. `change(draft, effects)` sets `effects.changed`, and
   * `effects.structure` when tasks were created or deleted; it returns the
   * result of the operation.
   * @param {(draft: object, effects: object) => any} change
   * @param {{ source?: string }} [options] `widget`: the core reloads the widget itself
   */
  mutate(change, { source } = {}) {
    const run = this.queue.then(async () => {
      if (!this.loaded) {
        throw new Error('The tasks are not loaded: see the integration logs');
      }
      const draft = structuredClone(this.document);
      const effects = { structure: false, changed: false };
      const result = change(draft, effects);
      if (!effects.changed) {
        return result;
      }
      try {
        await this.store.save(draft);
      } catch (err) {
        logger.error(`Cannot write the tasks: ${err.message}`);
        throw new UserError('saveFailed');
      }
      this.document = draft;
      if (effects.structure) {
        await this.publishDevices();
      }
      await this.publishStates();
      if (source !== 'widget') {
        this.refreshWidget();
      }
      return result;
    });
    // The next change waits for this one, whatever its outcome.
    this.queue = run.catch(() => {});
    return run;
  }

  /** The task of a draft by device external id, id or name. */
  draftTask(draft, { device, taskId, name }) {
    if (name !== undefined) {
      const task = this.findByName(draft.tasks, name);
      if (!task) {
        throw new UserError('noTaskNamed', { name: cleanText(name, LIMITS.name) });
      }
      return task;
    }
    const id = taskId ?? taskIdOf(this.gladys, device);
    const task = draft.tasks.find((entry) => entry.id === id);
    if (!task) {
      throw new UserError('unknownTask');
    }
    return task;
  }

  /** The task's own name first; the name given in Gladys only when it designates one task. */
  findByName(tasks, name) {
    const wanted = matchKey(name);
    if (!wanted) {
      return null;
    }
    const own = tasks.find((task) => matchKey(task.name) === wanted);
    if (own) {
      return own;
    }
    const byDevice = tasks.filter((task) => matchKey(this.displayName(task)) === wanted);
    return byDevice.length === 1 ? byDevice[0] : null;
  }

  parseDoneDate(raw) {
    const today = this.today();
    let date;
    try {
      date = parseDate(raw, today);
    } catch {
      throw new UserError('badDate', { name: cleanText(String(raw), 20) });
    }
    if (date && date > today) {
      throw new UserError('futureDate');
    }
    return date ?? today;
  }

  /**
   * Create a task, or change the one of the same name. Fields of the
   * "Create a task" action, every one optional: a suggested task gives the
   * name, the period and the notice; the fields typed override it.
   * @returns {Promise<{ task: object, created: boolean }>}
   */
  saveTask(fields = {}) {
    return this.mutate((draft, effects) => {
      const templateKey = optionalText(fields.template);
      const template = templateKey ? TEMPLATES[templateKey] : null;
      if (templateKey && !template) {
        throw new UserError('badTemplate');
      }
      const name = cleanText(
        optionalText(fields.name) ?? template?.name[this.config.language] ?? '',
        LIMITS.name,
      );
      if (!name) {
        throw new UserError('emptyName');
      }
      // Only the task's own name (never a name given in Gladys to another
      // device), or the task made from the same suggestion when no name is typed.
      const existing =
        draft.tasks.find((task) => matchKey(task.name) === matchKey(name)) ??
        (optionalText(fields.name) === undefined && templateKey
          ? (draft.tasks.find((task) => task.template === templateKey) ?? null)
          : null);
      const every = optionalInteger(fields.every);
      const unit = optionalText(fields.unit);
      const notice = optionalInteger(fields.notice_days);
      const lastDone =
        optionalText(fields.last_done) === undefined
          ? undefined
          : this.parseDoneDate(fields.last_done);
      if (unit !== undefined && !UNITS.includes(unit)) {
        throw new UserError('badPeriod');
      }
      const base = existing ?? template ?? null;
      const period = {
        every: every ?? base?.every,
        unit: unit ?? base?.unit,
      };
      if (!validPeriod(period.every, period.unit)) {
        throw new UserError('badPeriod');
      }
      // A notice as long as the period would make the task due soon the day
      // it is done: a typed one is refused, a default one is shortened.
      const periodDays = daysBetween(
        '2000-01-01',
        addPeriod('2000-01-01', period.every, period.unit),
      );
      const noticeDays =
        notice ??
        Math.min(existing?.notice_days ?? template?.notice ?? DEFAULT_NOTICE, periodDays - 1);
      if (
        !Number.isInteger(noticeDays) ||
        noticeDays < 0 ||
        noticeDays > LIMITS.notice ||
        (noticeDays > 0 && noticeDays >= periodDays)
      ) {
        throw new UserError('badNotice');
      }

      if (existing) {
        Object.assign(existing, {
          every: period.every,
          unit: period.unit,
          notice_days: noticeDays,
          ...(template ? { template: templateKey } : {}),
        });
        if (lastDone) {
          // A correction: the date typed becomes the last time.
          existing.last_done = lastDone;
          existing.history = [...new Set([lastDone, ...existing.history])]
            .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
            .slice(0, LIMITS.history);
        }
        effects.changed = true;
        logger.info(`Task "${existing.name}" changed`);
        return { task: existing, created: false };
      }

      if (draft.tasks.length >= LIMITS.tasks) {
        throw new UserError('tooManyTasks', { count: LIMITS.tasks });
      }
      const ids = new Set(draft.tasks.map((task) => task.id));
      let id = newId();
      while (ids.has(id)) {
        id = newId();
      }
      const done = lastDone ?? this.today();
      const task = {
        id,
        name,
        template: template ? templateKey : null,
        every: period.every,
        unit: period.unit,
        notice_days: noticeDays,
        last_done: done,
        history: [done],
        created_at: new Date(this.now()).toISOString(),
        soon_notified_for: null,
        overdue_notified_for: null,
      };
      draft.tasks.push(task);
      Object.assign(effects, { structure: true, changed: true });
      logger.info(`Task "${name}" created (every ${period.every} ${period.unit})`);
      return { task, created: true };
    });
  }

  deleteTask({ name }) {
    return this.mutate((draft, effects) => {
      const task = this.draftTask(draft, { name: name ?? '' });
      draft.tasks.splice(draft.tasks.indexOf(task), 1);
      Object.assign(effects, { structure: true, changed: true });
      logger.info(`Task "${task.name}" deleted`);
      return task;
    });
  }

  /**
   * The task was done on `date` (today when empty): the count starts again
   * from the latest date it was done.
   * @returns {Promise<{ task: object, date: string }>}
   */
  markDone({ device, taskId, name, date, source }) {
    return this.mutate(
      (draft, effects) => {
        const task = this.draftTask(draft, { device, taskId, name });
        const day = this.parseDoneDate(date);
        const history = [...new Set([day, ...task.history])].sort((a, b) =>
          a < b ? 1 : a > b ? -1 : 0,
        );
        task.history = history.slice(0, LIMITS.history);
        task.last_done = history[0];
        effects.changed = true;
        logger.info(`Task "${task.name}" done${source ? ` (${source})` : ''}`);
        return { task, date: day };
      },
      { source },
    );
  }

  /** One line per task, for the "Show the tasks" action. */
  summary(language) {
    if (this.tasks.length === 0) {
      return message('noTasks', language);
    }
    return this.sorted()
      .map(({ task, status }) => {
        const shown = this.displayName(task);
        const name = shown === task.name ? shown : `${shown} (${task.name})`;
        return message('summary', language, {
          name,
          date: `${formatDate(status.due, language)}, ${this.remaining(status, language)}`,
        });
      })
      .reduce((text, line) => {
        if (text.endsWith('…')) {
          return text;
        }
        const next = text ? `${text} · ${line}` : line;
        return next.length > SUMMARY_MAX_LENGTH ? `${text} · …` : next;
      }, '');
  }

  /** `in 12 d`, `today`, `3 d late`. */
  remaining(status, language) {
    if (status.daysLeft === 0) {
      return message('today', language);
    }
    return status.overdue
      ? message('lateDays', language, { count: -status.daysLeft })
      : message('inDays', language, { count: status.daysLeft });
  }

  // --- Minute timer ----------------------------------------------------------

  /**
   * Follow the date: refresh the widget when it changed, fire the tasks that
   * entered their notice or passed their due date, republish the states. An
   * event is remembered as sent only once Gladys accepted it: while Gladys is
   * unreachable, it is tried again every minute.
   */
  async tick() {
    if (!this.loaded || this.ticking) {
      return;
    }
    this.ticking = true;
    try {
      await this.queue;
      const today = this.today();
      if (this.lastDate !== null && this.lastDate !== today) {
        this.refreshWidget();
      }
      this.lastDate = today;
      await this.checkEvents(today);
      await this.publishStates();
    } finally {
      this.ticking = false;
    }
  }

  async checkEvents(today) {
    const pending = [];
    if (this.gladys.connected !== false) {
      for (const task of this.tasks) {
        const status = taskStatus(task, today);
        let key = null;
        if (status.overdue && task.overdue_notified_for !== status.due) {
          key = TRIGGERS.OVERDUE;
        } else if (
          status.soon &&
          task.soon_notified_for !== status.due &&
          task.overdue_notified_for !== status.due
        ) {
          key = TRIGGERS.DUE_SOON;
        }
        if (!key || this.sentEvents.has(`${task.id}:${key}:${status.due}`)) {
          continue; // nothing new, or sent but its record failed: never sent twice
        }
        pending.push({
          taskId: task.id,
          due: status.due,
          key,
          data: {
            task: taskIds(this.gladys, task.id).device,
            task_name: this.displayName(task),
            due: status.due,
            days_left: status.daysLeft,
          },
        });
      }
    }
    const sent = await this.fire(pending);
    for (const { taskId, key, due } of sent) {
      this.sentEvents.add(`${taskId}:${key}:${due}`);
    }
    if (sent.length === 0) {
      return;
    }
    await this.mutate((draft, effects) => {
      for (const { taskId, key, due } of sent) {
        const task = draft.tasks.find((entry) => entry.id === taskId);
        if (!task) {
          continue;
        }
        // Overdue covers "due soon" too: a task never fires it afterwards.
        task.soon_notified_for = due;
        if (key === TRIGGERS.OVERDUE) {
          task.overdue_notified_for = due;
        }
        effects.changed = true;
      }
    })
      .then(() => {
        this.sentEvents.clear();
        this.resolved('save');
      })
      .catch((err) => this.problem('save', `Reminders not recorded: ${err.message}`));
  }
}
